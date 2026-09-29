/* ==========================================================
   Capa de datos (IndexedDB)

   Almacenes (versión 2):
   - movimientos: { id, tipo, centavos, categoria, descripcion, fecha 'AAAA-MM-DD',
                    numFotos, creado, actualizado }   (índice: fecha)
   - imagenes:    { id, movId, orden, tipo 'image/jpeg', datos ArrayBuffer }  (índice: movId)
   - ajustes:     { clave, valor }

   Historial:
   - v1: una sola foto por movimiento en el almacén "fotos" (clave = id del movimiento)
         y el campo "tieneFoto" en el movimiento.
   - v2: varias fotos por movimiento en "imagenes"; "tieneFoto" pasa a "numFotos".
   ========================================================== */
'use strict';

const DB = (() => {
  const NOMBRE = 'mis-gastos';
  const VERSION = 2;
  let conexion = null;

  function migrar(db, tx, anterior) {
    if (anterior < 1) {
      db.createObjectStore('movimientos', { keyPath: 'id' }).createIndex('fecha', 'fecha');
      db.createObjectStore('ajustes', { keyPath: 'clave' });
    }
    if (anterior < 2) {
      const imagenes = db.createObjectStore('imagenes', { keyPath: 'id' });
      imagenes.createIndex('movId', 'movId');

      // Pasa las fotos de v1 al nuevo almacén sin perder ninguna
      if (db.objectStoreNames.contains('fotos')) {
        tx.objectStore('fotos').openCursor().onsuccess = e => {
          const c = e.target.result;
          if (c) {
            const f = c.value;
            imagenes.put({ id: `${f.id}-1`, movId: f.id, orden: 0, tipo: f.tipo || 'image/jpeg', datos: f.datos });
            c.continue();
          } else {
            db.deleteObjectStore('fotos');
          }
        };
      }
      if (anterior >= 1) {
        tx.objectStore('movimientos').openCursor().onsuccess = e => {
          const c = e.target.result;
          if (!c) return;
          const m = c.value;
          if ('tieneFoto' in m) {
            m.numFotos = m.tieneFoto ? 1 : 0;
            delete m.tieneFoto;
            c.update(m);
          }
          c.continue();
        };
      }
    }
  }

  function abrir() {
    if (conexion) return conexion;
    conexion = new Promise((resolve, reject) => {
      const req = indexedDB.open(NOMBRE, VERSION);
      req.onupgradeneeded = e => migrar(req.result, req.transaction, e.oldVersion);
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); conexion = null; };
        db.onclose = () => { conexion = null; };
        resolve(db);
      };
      req.onerror = () => { conexion = null; reject(req.error); };
      req.onblocked = () => console.warn('IndexedDB: actualización bloqueada por otra pestaña abierta');
    });
    return conexion;
  }

  const pedir = req => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const terminar = tx => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transacción cancelada'));
  });

  // Safari a veces pierde la conexión al volver de segundo plano: se reabre y se reintenta una vez.
  async function conReintento(fn) {
    try {
      return await fn(await abrir());
    } catch (err) {
      if (err && (err.name === 'InvalidStateError' || err.name === 'UnknownError')) {
        conexion = null;
        return fn(await abrir());
      }
      throw err;
    }
  }

  /** Borra todas las imágenes de un movimiento y guarda las nuevas (en ese orden). */
  function reemplazarImagenes(store, movId, nuevas) {
    // Se leen las claves primero para no borrar por error las imágenes recién agregadas
    store.index('movId').getAllKeys(IDBKeyRange.only(movId)).onsuccess = e => {
      for (const k of e.target.result) store.delete(k);
      for (const img of nuevas) store.put(img);
    };
  }

  function movimientosEntre(desde, hasta) {
    return conReintento(db => pedir(
      db.transaction('movimientos').objectStore('movimientos')
        .index('fecha').getAll(IDBKeyRange.bound(desde, hasta))
    ));
  }

  function obtener(id) {
    return conReintento(db => pedir(db.transaction('movimientos').objectStore('movimientos').get(id)));
  }

  function todos() {
    return conReintento(db => pedir(db.transaction('movimientos').objectStore('movimientos').getAll()));
  }

  function contar() {
    return conReintento(db => pedir(db.transaction('movimientos').objectStore('movimientos').count()));
  }

  async function imagenesDe(movId) {
    const lista = await conReintento(db => pedir(
      db.transaction('imagenes').objectStore('imagenes').index('movId').getAll(IDBKeyRange.only(movId))
    ));
    return lista.sort((a, b) => a.orden - b.orden);
  }

  function todasLasImagenes() {
    return conReintento(db => pedir(db.transaction('imagenes').objectStore('imagenes').getAll()));
  }

  /**
   * Guarda un movimiento.
   * cambios (opcional): { nuevas: [{ id, movId, orden, tipo, datos }], eliminar: [idImagen] }
   */
  function guardar(mov, cambios) {
    return conReintento(db => {
      const tx = db.transaction(['movimientos', 'imagenes'], 'readwrite');
      tx.objectStore('movimientos').put(mov);
      if (cambios) {
        const si = tx.objectStore('imagenes');
        for (const id of cambios.eliminar || []) si.delete(id);
        for (const img of cambios.nuevas || []) si.put(img);
      }
      return terminar(tx);
    });
  }

  function eliminar(id) {
    return conReintento(db => {
      const tx = db.transaction(['movimientos', 'imagenes'], 'readwrite');
      tx.objectStore('movimientos').delete(id);
      reemplazarImagenes(tx.objectStore('imagenes'), id, []);
      return terminar(tx);
    });
  }

  /**
   * Importa movimientos sin duplicar: se identifican por id.
   * Si ya existe, solo se reemplaza cuando el del respaldo es más reciente (campo "actualizado").
   * items: [{ mov, fotos: [{ tipo, datos }] }]
   */
  function importar(items) {
    return conReintento(db => {
      const res = { nuevos: 0, actualizados: 0, omitidos: 0 };
      const tx = db.transaction(['movimientos', 'imagenes'], 'readwrite');
      const sm = tx.objectStore('movimientos');
      const si = tx.objectStore('imagenes');
      for (const { mov, fotos } of items) {
        const req = sm.get(mov.id);
        req.onsuccess = () => {
          const existente = req.result;
          if (existente && (existente.actualizado || 0) >= (mov.actualizado || 0)) {
            res.omitidos++;
            return;
          }
          if (existente) res.actualizados++; else res.nuevos++;
          sm.put(mov);
          reemplazarImagenes(si, mov.id, fotos.map((f, i) => ({
            id: `${mov.id}-${i + 1}`, movId: mov.id, orden: i, tipo: f.tipo, datos: f.datos,
          })));
        };
      }
      return terminar(tx).then(() => res);
    });
  }

  async function leerAjuste(clave) {
    const fila = await conReintento(db => pedir(db.transaction('ajustes').objectStore('ajustes').get(clave)));
    return fila ? fila.valor : undefined;
  }

  function guardarAjuste(clave, valor) {
    return conReintento(db => {
      const tx = db.transaction('ajustes', 'readwrite');
      tx.objectStore('ajustes').put({ clave, valor });
      return terminar(tx);
    });
  }

  return {
    movimientosEntre, obtener, todos, contar, imagenesDe, todasLasImagenes,
    guardar, eliminar, importar, leerAjuste, guardarAjuste,
  };
})();
