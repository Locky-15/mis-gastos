/* ==========================================================
   Capa de datos (IndexedDB)

   Almacenes:
   - movimientos: { id, tipo, centavos, categoria, descripcion, fecha 'AAAA-MM-DD',
                    tieneFoto, creado, actualizado }   (índice: fecha)
   - fotos:       { id (= id del movimiento), tipo 'image/jpeg', datos ArrayBuffer }
   - ajustes:     { clave, valor }
   ========================================================== */
'use strict';

const DB = (() => {
  const NOMBRE = 'mis-gastos';
  const VERSION = 1;
  let conexion = null;

  function abrir() {
    if (conexion) return conexion;
    conexion = new Promise((resolve, reject) => {
      const req = indexedDB.open(NOMBRE, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('movimientos')) {
          db.createObjectStore('movimientos', { keyPath: 'id' }).createIndex('fecha', 'fecha');
        }
        if (!db.objectStoreNames.contains('fotos')) {
          db.createObjectStore('fotos', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('ajustes')) {
          db.createObjectStore('ajustes', { keyPath: 'clave' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); conexion = null; };
        db.onclose = () => { conexion = null; };
        resolve(db);
      };
      req.onerror = () => { conexion = null; reject(req.error); };
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

  function movimientosEntre(desde, hasta) {
    return conReintento(db => pedir(
      db.transaction('movimientos').objectStore('movimientos')
        .index('fecha').getAll(IDBKeyRange.bound(desde, hasta))
    ));
  }

  function todos() {
    return conReintento(db => pedir(db.transaction('movimientos').objectStore('movimientos').getAll()));
  }

  function contar() {
    return conReintento(db => pedir(db.transaction('movimientos').objectStore('movimientos').count()));
  }

  function obtenerFoto(id) {
    return conReintento(db => pedir(db.transaction('fotos').objectStore('fotos').get(id)));
  }

  function todasLasFotos() {
    return conReintento(db => pedir(db.transaction('fotos').objectStore('fotos').getAll()));
  }

  /**
   * Guarda un movimiento.
   * foto: undefined = no tocar la foto, null = borrarla, { tipo, datos } = reemplazarla.
   */
  function guardar(mov, foto) {
    return conReintento(db => {
      const tx = db.transaction(['movimientos', 'fotos'], 'readwrite');
      tx.objectStore('movimientos').put(mov);
      if (foto === null) tx.objectStore('fotos').delete(mov.id);
      else if (foto) tx.objectStore('fotos').put({ id: mov.id, tipo: foto.tipo, datos: foto.datos });
      return terminar(tx);
    });
  }

  function eliminar(id) {
    return conReintento(db => {
      const tx = db.transaction(['movimientos', 'fotos'], 'readwrite');
      tx.objectStore('movimientos').delete(id);
      tx.objectStore('fotos').delete(id);
      return terminar(tx);
    });
  }

  /**
   * Importa movimientos sin duplicar: se identifican por id.
   * Si ya existe, solo se reemplaza cuando el del respaldo es más reciente (campo "actualizado").
   * items: [{ mov, foto: { tipo, datos } | null }]
   */
  function importar(items) {
    return conReintento(db => {
      const res = { nuevos: 0, actualizados: 0, omitidos: 0 };
      const tx = db.transaction(['movimientos', 'fotos'], 'readwrite');
      const sm = tx.objectStore('movimientos');
      const sf = tx.objectStore('fotos');
      for (const { mov, foto } of items) {
        const req = sm.get(mov.id);
        req.onsuccess = () => {
          const existente = req.result;
          if (existente && (existente.actualizado || 0) >= (mov.actualizado || 0)) {
            res.omitidos++;
            return;
          }
          if (existente) res.actualizados++; else res.nuevos++;
          sm.put(mov);
          if (foto) sf.put({ id: mov.id, tipo: foto.tipo, datos: foto.datos });
          else sf.delete(mov.id);
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
    movimientosEntre, todos, contar, obtenerFoto, todasLasFotos,
    guardar, eliminar, importar, leerAjuste, guardarAjuste,
  };
})();
