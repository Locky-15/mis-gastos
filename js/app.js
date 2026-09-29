/* ==========================================================
   Mis Gastos — lógica de la interfaz
   ========================================================== */
'use strict';

(() => {
  // ---------- Configuración ----------

  const CATEGORIAS = {
    gasto: [
      { id: 'Comida', emoji: '🍔', color: '#FF9F0A' },
      { id: 'Transporte', emoji: '🚌', color: '#0A84FF' },
      { id: 'Casa', emoji: '🏠', color: '#BF5AF2' },
      { id: 'Servicios', emoji: '💡', color: '#FFD60A' },
      { id: 'Salud', emoji: '💊', color: '#FF453A' },
      { id: 'Estudios', emoji: '📚', color: '#64D2FF' },
      { id: 'Entretenimiento', emoji: '🎬', color: '#FF375F' },
      { id: 'Compras', emoji: '🛍️', color: '#5E5CE6' },
      { id: 'Otros', emoji: '📦', color: '#98989D' },
    ],
    ingreso: [
      { id: 'Sueldo', emoji: '💼', color: '#30D158' },
      { id: 'Ventas', emoji: '🏷️', color: '#0A84FF' },
      { id: 'Regalo', emoji: '🎁', color: '#FF9F0A' },
      { id: 'Otros', emoji: '💰', color: '#98989D' },
    ],
  };

  const FOTO_LADO_MAX = 1200;
  const FOTO_CALIDAD = 0.7;
  const MAX_CENTAVOS = 99999999999; // $999.999.999,99

  const fmtMoneda = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
  const fmtNombreMes = new Intl.DateTimeFormat('es-EC', { month: 'long' });
  const fmtDia = new Intl.DateTimeFormat('es-EC', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtFechaHora = new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' });

  const $ = (sel, raiz = document) => raiz.querySelector(sel);

  const ICONO_CLIP = '<svg viewBox="0 0 24 24" aria-label="Con foto"><path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.2-8.2a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4l7.5-7.5"/></svg>';
  const ICONO_CHEVRON = '<svg class="mov-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

  // ---------- Estado ----------

  const ahora = new Date();
  const estado = {
    anio: ahora.getFullYear(),
    mes: ahora.getMonth(), // 0-11
    vista: 'lista',
    movimientos: [],
    carga: 0,
  };

  const form = {
    id: null,
    tipo: 'gasto',
    categoria: null,
    creado: null,
    tieneFotoOriginal: false,
    fotoNueva: undefined, // undefined = sin cambios, null = quitar, Blob = nueva
    fotoURL: null,
    guardando: false,
  };

  let archivoRespaldo = null;
  let recargaPendiente = false;

  // ---------- Utilidades ----------

  const dinero = centavos => fmtMoneda.format(centavos / 100);
  // es-EC escribe "$-80,00"; se prefiere "−$80,00"
  const dineroConSigno = centavos => (centavos < 0 ? '−' : '') + dinero(Math.abs(centavos));
  const capitalizar = s => s.charAt(0).toUpperCase() + s.slice(1);
  const dos = n => String(n).padStart(2, '0');
  const aISO = d => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
  const hoyISO = () => aISO(new Date());
  const deISO = s => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };

  function escapar(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function nuevoId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  }

  function infoCategoria(tipo, id) {
    const lista = CATEGORIAS[tipo] || CATEGORIAS.gasto;
    return lista.find(c => c.id === id) || { id, emoji: tipo === 'ingreso' ? '💰' : '📦', color: '#98989D' };
  }

  /** Convierte lo escrito ("12,50", "12.50", "1.234,56", "$ 8") a centavos. */
  function parsearMonto(texto) {
    const s = String(texto).replace(/[^\d.,]/g, '');
    if (!/\d/.test(s)) return NaN;
    const coma = s.lastIndexOf(',');
    const punto = s.lastIndexOf('.');
    const pos = Math.max(coma, punto);
    let entero = s;
    let decimales = '';
    if (pos !== -1) {
      const despues = s.slice(pos + 1).replace(/[.,]/g, '');
      const unSoloTipo = coma === -1 || punto === -1;
      if (unSoloTipo && despues.length === 3 && s.slice(0, pos).replace(/[.,]/g, '').length > 0) {
        // "1.234" o "1,234": separador de miles
        entero = s.replace(/[.,]/g, '');
      } else {
        entero = s.slice(0, pos).replace(/[.,]/g, '');
        decimales = despues;
      }
    }
    return Math.round(Number(`${entero || '0'}.${decimales || '0'}`) * 100);
  }

  function centavosATexto(c) {
    return (c / 100).toFixed(2).replace('.', ',');
  }

  function etiquetaDia(fechaISO) {
    const hoy = hoyISO();
    const ayer = aISO(new Date(Date.now() - 864e5));
    const texto = fmtDia.format(deISO(fechaISO));
    if (fechaISO === hoy) return `Hoy · ${texto}`;
    if (fechaISO === ayer) return `Ayer · ${texto}`;
    return texto;
  }

  function tamanoLegible(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  }

  // ---------- Carga y render principal ----------

  async function cargarMes() {
    const token = ++estado.carga;
    const mm = dos(estado.mes + 1);
    let movs;
    try {
      movs = await DB.movimientosEntre(`${estado.anio}-${mm}-01`, `${estado.anio}-${mm}-31`);
    } catch (err) {
      console.error(err);
      toast('No se pudieron leer los datos');
      return;
    }
    if (token !== estado.carga) return; // llegó una carga más nueva
    movs.sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || 0) - (a.creado || 0));
    estado.movimientos = movs;
    renderTodo();
  }

  function renderTodo() {
    renderEncabezado();
    renderResumen();
    renderLista();
    renderGrafico();
  }

  function renderEncabezado() {
    const nombre = capitalizar(fmtNombreMes.format(new Date(estado.anio, estado.mes, 1)));
    $('#titulo-mes').textContent = `${nombre} ${estado.anio}`;
    const hoy = new Date();
    $('#btn-hoy').hidden = hoy.getFullYear() === estado.anio && hoy.getMonth() === estado.mes;
  }

  function renderResumen() {
    let ingresos = 0;
    let gastos = 0;
    for (const m of estado.movimientos) {
      if (m.tipo === 'ingreso') ingresos += m.centavos; else gastos += m.centavos;
    }
    const balance = ingresos - gastos;
    $('#total-ingresos').textContent = dinero(ingresos);
    $('#total-gastos').textContent = dinero(gastos);
    const el = $('#balance');
    el.textContent = dineroConSigno(balance);
    el.classList.toggle('positivo', balance > 0);
    el.classList.toggle('negativo', balance < 0);
  }

  function htmlVacio(icono, titulo, texto) {
    return `<div class="vacio"><div class="vacio-icono">${icono}</div><h3>${titulo}</h3><p>${texto}</p></div>`;
  }

  function renderLista() {
    const cont = $('#lista');
    if (!estado.movimientos.length) {
      cont.innerHTML = htmlVacio('🧾', 'Sin movimientos este mes', 'Toca el botón + para registrar un gasto o un ingreso.');
      return;
    }
    const grupos = new Map();
    for (const m of estado.movimientos) {
      if (!grupos.has(m.fecha)) grupos.set(m.fecha, []);
      grupos.get(m.fecha).push(m);
    }
    let html = '';
    for (const [fecha, movs] of grupos) {
      const neto = movs.reduce((s, m) => s + (m.tipo === 'ingreso' ? m.centavos : -m.centavos), 0);
      html += `<section class="dia"><h3 class="dia-titulo"><span>${escapar(etiquetaDia(fecha))}</span>`
        + `<span>${neto < 0 ? '−' : '+'}${dinero(Math.abs(neto))}</span></h3><div class="lista-grupo">`;
      for (const m of movs) html += htmlMovimiento(m);
      html += '</div></section>';
    }
    cont.innerHTML = html;
  }

  function htmlMovimiento(m) {
    const c = infoCategoria(m.tipo, m.categoria);
    const signo = m.tipo === 'gasto' ? '−' : '+';
    return `<button type="button" class="mov" data-id="${escapar(m.id)}">`
      + `<span class="mov-icono" style="background:${c.color}33">${c.emoji}</span>`
      + '<span class="mov-info">'
      + `<span class="mov-cat">${escapar(m.categoria)}${m.tieneFoto ? ICONO_CLIP : ''}</span>`
      + (m.descripcion ? `<span class="mov-desc">${escapar(m.descripcion)}</span>` : '')
      + '</span>'
      + `<span class="mov-monto ${m.tipo}">${signo}${dinero(m.centavos)}</span>`
      + ICONO_CHEVRON
      + '</button>';
  }

  function renderGrafico() {
    const cont = $('#grafico');
    const porCategoria = new Map();
    let total = 0;
    for (const m of estado.movimientos) {
      if (m.tipo !== 'gasto') continue;
      porCategoria.set(m.categoria, (porCategoria.get(m.categoria) || 0) + m.centavos);
      total += m.centavos;
    }
    if (!total) {
      cont.innerHTML = htmlVacio('📊', 'Sin gastos este mes', 'Cuando registres gastos verás aquí cómo se reparten por categoría.');
      return;
    }

    const filas = [...porCategoria]
      .map(([cat, monto]) => ({ cat, monto, info: infoCategoria('gasto', cat) }))
      .sort((a, b) => b.monto - a.monto);

    // Gráfico de dona en SVG
    const R = 78;
    const GROSOR = 26;
    const C = 2 * Math.PI * R;
    const hueco = filas.length > 1 ? 1.5 : 0;
    let desplazamiento = 0;
    let segmentos = '';
    for (const f of filas) {
      const largo = (f.monto / total) * C;
      const visible = Math.max(largo - hueco, 0.8);
      segmentos += `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${f.info.color}" stroke-width="${GROSOR}"`
        + ` stroke-dasharray="${visible.toFixed(2)} ${(C - visible).toFixed(2)}" stroke-dashoffset="${(-desplazamiento).toFixed(2)}"/>`;
      desplazamiento += largo;
    }
    const textoTotal = dinero(total);
    const tamTexto = textoTotal.length > 12 ? 16 : textoTotal.length > 9 ? 19 : 22;
    const svg = `<svg class="dona" viewBox="0 0 200 200" role="img" aria-label="Gastos por categoría">`
      + `<g transform="rotate(-90 100 100)"><circle cx="100" cy="100" r="${R}" fill="none" stroke="#2c2c2e" stroke-width="${GROSOR}"/>${segmentos}</g>`
      + '<text x="100" y="92" class="dona-etq">Total gastos</text>'
      + `<text x="100" y="${100 + tamTexto * 0.55}" class="dona-total" font-size="${tamTexto}">${escapar(textoTotal)}</text>`
      + '</svg>';

    const maximo = filas[0].monto;
    let leyenda = '';
    for (const f of filas) {
      const pct = (f.monto / total) * 100;
      const pctTexto = pct < 1 ? '<1 %' : `${Math.round(pct)} %`;
      leyenda += '<div class="cat-fila">'
        + `<span class="mov-icono" style="background:${f.info.color}33">${f.info.emoji}</span>`
        + `<span class="cat-nombre">${escapar(f.cat)}<span class="cat-pct">${pctTexto}</span></span>`
        + `<span class="cat-monto">${dinero(f.monto)}</span>`
        + `<span class="cat-barra"><span style="width:${((f.monto / maximo) * 100).toFixed(1)}%;background:${f.info.color}"></span></span>`
        + '</div>';
    }
    cont.innerHTML = `<div class="grafico-tarjeta">${svg}<div>${leyenda}</div></div>`;
  }

  function cambiarMes(delta) {
    let mes = estado.mes + delta;
    let anio = estado.anio;
    while (mes < 0) { mes += 12; anio--; }
    while (mes > 11) { mes -= 12; anio++; }
    irAMes(anio, mes);
  }

  function irAMes(anio, mes) {
    estado.anio = anio;
    estado.mes = mes;
    renderEncabezado();
    $('#contenido').scrollTop = 0;
    cargarMes();
  }

  function cambiarVista(vista) {
    estado.vista = vista;
    for (const b of $('#pestanas').children) b.classList.toggle('activo', b.dataset.vista === vista);
    $('#vista-lista').hidden = vista !== 'lista';
    $('#vista-categorias').hidden = vista !== 'categorias';
  }

  // ---------- Hojas, alertas y toast ----------

  function mostrar(el) {
    clearTimeout(el._timer);
    el.hidden = false;
    void el.offsetWidth; // fuerza reflow para que la transición se vea
    el.classList.add('abierta');
  }

  function ocultar(el, alTerminar) {
    clearTimeout(el._timer);
    el.classList.remove('abierta');
    el._timer = setTimeout(() => {
      el.hidden = true;
      if (alTerminar) alTerminar();
      if (recargaPendiente && !hayModalAbierto()) location.reload();
    }, 320);
  }

  function hayModalAbierto() {
    return ['#hoja-form', '#hoja-ajustes', '#visor', '#alerta'].some(s => !$(s).hidden);
  }

  function habilitarArrastre(contenedor, alCerrar) {
    const hoja = $('.hoja', contenedor);
    const zona = $('.hoja-barra', contenedor);
    let inicioY = null;
    let dy = 0;
    zona.addEventListener('touchstart', e => {
      if (e.target.closest('button')) return;
      inicioY = e.touches[0].clientY;
      dy = 0;
      hoja.style.transition = 'none';
    }, { passive: true });
    zona.addEventListener('touchmove', e => {
      if (inicioY === null) return;
      dy = Math.max(0, e.touches[0].clientY - inicioY);
      hoja.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    const fin = () => {
      if (inicioY === null) return;
      inicioY = null;
      hoja.style.transition = '';
      hoja.style.transform = '';
      if (dy > 90) alCerrar();
    };
    zona.addEventListener('touchend', fin);
    zona.addEventListener('touchcancel', fin);
  }

  let resolverAlerta = null;

  function confirmar({ titulo, mensaje = '', aceptar = 'Aceptar', cancelar = 'Cancelar', destructivo = false, soloAceptar = false }) {
    if (resolverAlerta) resolverAlerta(false);
    return new Promise(resolve => {
      const cont = $('#alerta');
      $('#alerta-titulo').textContent = titulo;
      $('#alerta-mensaje').textContent = mensaje;
      const bAceptar = $('#alerta-aceptar');
      const bCancelar = $('#alerta-cancelar');
      bAceptar.textContent = aceptar;
      bAceptar.classList.toggle('destructivo', destructivo);
      bCancelar.textContent = cancelar;
      bCancelar.hidden = soloAceptar;
      resolverAlerta = valor => {
        resolverAlerta = null;
        ocultar(cont);
        resolve(valor);
      };
      mostrar(cont);
    });
  }

  const alerta = (titulo, mensaje) => confirmar({ titulo, mensaje, aceptar: 'OK', soloAceptar: true });

  let temporizadorToast;
  function toast(mensaje) {
    const t = $('#toast');
    t.textContent = mensaje;
    t.classList.add('visible');
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => t.classList.remove('visible'), 2200);
  }

  // ---------- Formulario ----------

  function abrirFormulario(mov) {
    form.id = mov ? mov.id : null;
    form.creado = mov ? mov.creado : null;
    form.categoria = mov ? mov.categoria : null;
    form.tieneFotoOriginal = !!(mov && mov.tieneFoto);
    form.fotoNueva = undefined;
    form.guardando = false;

    $('#form-titulo').textContent = mov ? 'Editar movimiento' : 'Nuevo movimiento';
    ponerTipo(mov ? mov.tipo : 'gasto');
    const monto = $('#f-monto');
    monto.value = mov ? centavosATexto(mov.centavos) : '';
    ajustarAnchoMonto();
    $('#f-desc').value = mov ? mov.descripcion || '' : '';
    $('#f-fecha').value = mov ? mov.fecha : hoyISO();
    $('#f-eliminar').hidden = !mov;
    $('#f-guardar').disabled = false;
    mostrarFoto(null);
    $('.hoja-cuerpo', $('#hoja-form')).scrollTop = 0;

    if (form.tieneFotoOriginal) {
      const idActual = mov.id;
      DB.obtenerFoto(idActual).then(f => {
        if (f && form.id === idActual && form.fotoNueva === undefined) {
          mostrarFoto(new Blob([f.datos], { type: f.tipo || 'image/jpeg' }));
        }
      }).catch(console.error);
    }
    mostrar($('#hoja-form'));
  }

  function cerrarFormulario() {
    document.activeElement && document.activeElement.blur();
    ocultar($('#hoja-form'), () => mostrarFoto(null));
  }

  function ponerTipo(tipo) {
    form.tipo = tipo;
    for (const b of $('#f-tipo').children) b.classList.toggle('activo', b.dataset.tipo === tipo);
    const caja = $('#f-monto-caja');
    caja.classList.toggle('gasto', tipo === 'gasto');
    caja.classList.toggle('ingreso', tipo === 'ingreso');
    if (form.categoria && !CATEGORIAS[tipo].some(c => c.id === form.categoria)) form.categoria = null;
    renderCategoriasForm();
  }

  function renderCategoriasForm() {
    const lista = CATEGORIAS[form.tipo];
    const grid = $('#f-categorias');
    grid.classList.toggle('cuatro', lista.length === 4);
    grid.innerHTML = lista.map(c => {
      const activo = c.id === form.categoria;
      const estilo = activo ? ` style="border-color:${c.color};background:${c.color}22"` : '';
      return `<button type="button" class="cat-chip${activo ? ' activo' : ''}" data-cat="${escapar(c.id)}"${estilo}>`
        + `<span class="mov-icono" style="background:${c.color}33">${c.emoji}</span>${escapar(c.id)}</button>`;
    }).join('');
  }

  function ajustarAnchoMonto() {
    const input = $('#f-monto');
    const largo = (input.value || input.placeholder).length;
    input.style.width = `${Math.max(3, largo + 0.5)}ch`;
  }

  function mostrarFoto(blob) {
    if (form.fotoURL) {
      URL.revokeObjectURL(form.fotoURL);
      form.fotoURL = null;
    }
    const img = $('#f-foto-img');
    if (blob) {
      form.fotoURL = URL.createObjectURL(blob);
      img.src = form.fotoURL;
      $('#f-foto-preview').hidden = false;
    } else {
      img.removeAttribute('src');
      $('#f-foto-preview').hidden = true;
    }
  }

  function cargarImagen(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo abrir la imagen'));
      img.src = url;
    });
  }

  /** Reduce la foto a máx. 1200 px de lado y la guarda como JPEG calidad 0.7. */
  async function comprimirImagen(archivo) {
    const url = URL.createObjectURL(archivo);
    try {
      const img = await cargarImagen(url); // Safari ya aplica la orientación EXIF
      const escala = Math.min(1, FOTO_LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const ancho = Math.max(1, Math.round(img.naturalWidth * escala));
      const alto = Math.max(1, Math.round(img.naturalHeight * escala));
      const canvas = document.createElement('canvas');
      canvas.width = ancho;
      canvas.height = alto;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, ancho, alto);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, ancho, alto);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo comprimir la imagen'))), 'image/jpeg', FOTO_CALIDAD);
      });
      canvas.width = canvas.height = 0; // libera memoria en iOS
      return blob;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function alElegirFoto(e) {
    const archivo = e.target.files && e.target.files[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!archivo) return;
    try {
      const blob = await comprimirImagen(archivo);
      form.fotoNueva = blob;
      mostrarFoto(blob);
    } catch (err) {
      console.error(err);
      alerta('No se pudo usar la foto', 'Intenta tomarla de nuevo o elegir otra imagen.');
    }
  }

  function marcarError(sel) {
    const el = $(sel);
    el.classList.remove('error');
    void el.offsetWidth;
    el.classList.add('error');
  }

  async function guardarFormulario(e) {
    e.preventDefault();
    if (form.guardando) return;

    const centavos = parsearMonto($('#f-monto').value);
    if (!(centavos > 0)) {
      marcarError('#f-monto-caja');
      toast('Escribe un monto mayor a cero');
      return;
    }
    if (centavos > MAX_CENTAVOS) {
      marcarError('#f-monto-caja');
      toast('El monto es demasiado grande');
      return;
    }
    if (!form.categoria) {
      marcarError('#f-categorias');
      toast('Elige una categoría');
      return;
    }

    form.guardando = true;
    $('#f-guardar').disabled = true;
    const esNuevo = !form.id;
    const momento = Date.now();
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test($('#f-fecha').value) ? $('#f-fecha').value : hoyISO();
    const mov = {
      id: form.id || nuevoId(),
      tipo: form.tipo,
      centavos,
      categoria: form.categoria,
      descripcion: $('#f-desc').value.trim(),
      fecha,
      tieneFoto: form.tieneFotoOriginal,
      creado: form.creado || momento,
      actualizado: momento,
    };

    try {
      let foto; // undefined = sin cambios
      if (form.fotoNueva === null) {
        foto = null;
        mov.tieneFoto = false;
      } else if (form.fotoNueva) {
        foto = { tipo: form.fotoNueva.type || 'image/jpeg', datos: await form.fotoNueva.arrayBuffer() };
        mov.tieneFoto = true;
      }
      await DB.guardar(mov, foto);
    } catch (err) {
      console.error(err);
      form.guardando = false;
      $('#f-guardar').disabled = false;
      alerta('No se pudo guardar', 'Puede que el almacenamiento del iPhone esté lleno.');
      return;
    }

    cerrarFormulario();
    toast(esNuevo ? 'Movimiento guardado' : 'Cambios guardados');
    const [a, m] = fecha.split('-').map(Number);
    if (a !== estado.anio || m - 1 !== estado.mes) irAMes(a, m - 1);
    else cargarMes();
  }

  async function eliminarActual() {
    const ok = await confirmar({
      titulo: '¿Eliminar este movimiento?',
      mensaje: 'Esta acción no se puede deshacer.',
      aceptar: 'Eliminar',
      destructivo: true,
    });
    if (!ok || !form.id) return;
    try {
      await DB.eliminar(form.id);
    } catch (err) {
      console.error(err);
      alerta('No se pudo eliminar', String(err.message || err));
      return;
    }
    cerrarFormulario();
    toast('Movimiento eliminado');
    cargarMes();
  }

  // ---------- Visor de fotos ----------

  function abrirVisor(url) {
    if (!url) return;
    const visor = $('#visor');
    visor.classList.remove('zoom');
    $('#visor-img').src = url;
    mostrar(visor);
  }

  function alternarZoom(e) {
    const visor = $('#visor');
    const img = $('#visor-img');
    const scroll = $('#visor-scroll');
    const r = img.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    visor.classList.toggle('zoom');
    if (visor.classList.contains('zoom')) {
      requestAnimationFrame(() => {
        scroll.scrollLeft = px * img.offsetWidth - scroll.clientWidth / 2;
        scroll.scrollTop = py * img.offsetHeight - scroll.clientHeight / 2;
      });
    }
  }

  // ---------- Respaldo ----------

  async function abrirAjustes() {
    archivoRespaldo = null;
    $('#aj-exportar').hidden = false;
    $('#aj-compartir').hidden = true;
    $('#aj-estado').hidden = true;
    mostrar($('#hoja-ajustes'));

    try {
      $('#aj-total').textContent = String(await DB.contar());
      const ultimo = await DB.leerAjuste('ultimoRespaldo');
      $('#aj-ultimo').textContent = ultimo ? fmtFechaHora.format(new Date(ultimo)) : 'Nunca';
    } catch (err) { console.error(err); }

    try {
      if (navigator.storage && navigator.storage.estimate) {
        const { usage } = await navigator.storage.estimate();
        $('#aj-espacio').textContent = tamanoLegible(usage || 0);
      }
    } catch (err) { $('#aj-espacio').textContent = '—'; }

    try {
      const claves = 'caches' in window ? await caches.keys() : [];
      const version = claves.find(k => k.startsWith('mis-gastos-'));
      $('#aj-version').textContent = version ? `Versión ${version.replace('mis-gastos-', '')} · funciona sin conexión` : 'Mis Gastos';
    } catch (err) { /* sin caché disponible */ }
  }

  function blobADataURL(blob) {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(lector.result);
      lector.onerror = () => reject(lector.error);
      lector.readAsDataURL(blob);
    });
  }

  function dataURLAFoto(url) {
    const coma = url.indexOf(',');
    const tipo = url.slice(5, coma).split(';')[0] || 'image/jpeg';
    const binario = atob(url.slice(coma + 1));
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return { tipo, datos: bytes.buffer };
  }

  async function crearRespaldo() {
    const movs = await DB.todos();
    const fotos = new Map((await DB.todasLasFotos()).map(f => [f.id, f]));
    movs.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.creado || 0) - (b.creado || 0));
    const salida = [];
    for (const m of movs) {
      const f = fotos.get(m.id);
      const { tieneFoto, ...resto } = m;
      resto.foto = f ? await blobADataURL(new Blob([f.datos], { type: f.tipo || 'image/jpeg' })) : null;
      salida.push(resto);
    }
    const json = JSON.stringify({
      app: 'mis-gastos',
      formato: 1,
      exportado: new Date().toISOString(),
      nota: 'Montos en centavos de USD. Fotos en base64 (data URL).',
      movimientos: salida,
    });
    return {
      archivo: new File([json], `mis-gastos-respaldo-${hoyISO()}.json`, { type: 'application/json' }),
      cantidad: salida.length,
    };
  }

  async function prepararExportacion() {
    const btn = $('#aj-exportar');
    btn.disabled = true;
    btn.textContent = 'Preparando…';
    try {
      const { archivo, cantidad } = await crearRespaldo();
      if (!cantidad) {
        alerta('Nada que exportar', 'Todavía no tienes movimientos registrados.');
        return;
      }
      archivoRespaldo = archivo;
      btn.hidden = true;
      $('#aj-compartir').hidden = false;
      const estadoEl = $('#aj-estado');
      estadoEl.textContent = `Respaldo listo: ${cantidad} movimiento${cantidad === 1 ? '' : 's'} (${tamanoLegible(archivo.size)}). `
        + 'Toca “Guardar respaldo” y elige “Guardar en Archivos” para dejarlo en iCloud Drive o en el iPhone.';
      estadoEl.hidden = false;
    } catch (err) {
      console.error(err);
      alerta('No se pudo crear el respaldo', String(err.message || err));
    } finally {
      btn.disabled = false;
      btn.textContent = 'Exportar respaldo';
    }
  }

  function descargar(archivo) {
    const url = URL.createObjectURL(archivo);
    const a = document.createElement('a');
    a.href = url;
    a.download = archivo.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function compartirRespaldo() {
    if (!archivoRespaldo) return;
    const datos = { files: [archivoRespaldo] }; // sin title/text: iOS crearía un .txt extra
    try {
      if (navigator.canShare && navigator.canShare(datos)) {
        await navigator.share(datos);
      } else {
        descargar(archivoRespaldo);
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return; // el usuario cerró la hoja de compartir
      console.error(err);
      descargar(archivoRespaldo);
    }
    await DB.guardarAjuste('ultimoRespaldo', Date.now()).catch(console.error);
    $('#aj-ultimo').textContent = fmtFechaHora.format(new Date());
    toast('Respaldo exportado');
  }

  /** Hash simple para dar un id estable a registros importados que no traen id. */
  function hashTexto(s) {
    let h1 = 0x811c9dc5;
    let h2 = 0x1b873593;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619);
      h2 = Math.imul(h2 ^ c, 2246822507);
    }
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  }

  function normalizarImportado(x) {
    if (!x || typeof x !== 'object') return null;
    const tipo = x.tipo === 'ingreso' ? 'ingreso' : x.tipo === 'gasto' ? 'gasto' : null;
    const centavos = Math.round(Number(x.centavos));
    const fecha = typeof x.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.fecha) ? x.fecha : null;
    const categoria = typeof x.categoria === 'string' ? x.categoria.trim().slice(0, 40) : '';
    if (!tipo || !(centavos > 0) || centavos > MAX_CENTAVOS || !fecha || !categoria) return null;
    const descripcion = typeof x.descripcion === 'string' ? x.descripcion.trim().slice(0, 120) : '';
    const id = typeof x.id === 'string' && x.id
      ? x.id.slice(0, 64)
      : 'imp-' + hashTexto([tipo, centavos, fecha, categoria, descripcion].join('|'));
    const creado = Number(x.creado) || Date.parse(fecha) || Date.now();
    const actualizado = Number(x.actualizado) || creado;

    let foto = null;
    if (typeof x.foto === 'string' && x.foto.startsWith('data:image/')) {
      try { foto = dataURLAFoto(x.foto); } catch (err) { foto = null; }
    }
    return {
      mov: { id, tipo, centavos, categoria, descripcion, fecha, tieneFoto: !!foto, creado, actualizado },
      foto,
    };
  }

  async function importarArchivo(e) {
    const archivo = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!archivo) return;

    let datos;
    try {
      datos = JSON.parse(await archivo.text());
    } catch (err) {
      alerta('Archivo no válido', 'Elige un archivo de respaldo .json creado por Mis Gastos.');
      return;
    }
    const lista = Array.isArray(datos) ? datos : datos && datos.movimientos;
    if (!Array.isArray(lista)) {
      alerta('Archivo no válido', 'El archivo no contiene movimientos de Mis Gastos.');
      return;
    }

    const porId = new Map();
    for (const x of lista) {
      const item = normalizarImportado(x);
      if (item) porId.set(item.mov.id, item); // evita duplicados dentro del mismo archivo
    }
    const items = [...porId.values()];
    if (!items.length) {
      alerta('Nada que importar', 'El archivo no tiene movimientos válidos.');
      return;
    }

    const ok = await confirmar({
      titulo: 'Importar respaldo',
      mensaje: `El archivo tiene ${items.length} movimiento${items.length === 1 ? '' : 's'}. Los que ya existen en el iPhone no se duplicarán.`,
      aceptar: 'Importar',
    });
    if (!ok) return;

    try {
      const r = await DB.importar(items);
      await alerta('Importación completa',
        `Nuevos: ${r.nuevos}\nActualizados: ${r.actualizados}\nYa existían: ${r.omitidos}`);
      $('#aj-total').textContent = String(await DB.contar());
      cargarMes();
    } catch (err) {
      console.error(err);
      alerta('No se pudo importar', 'Puede que el almacenamiento del iPhone esté lleno.');
    }
  }

  // ---------- Eventos ----------

  function conectarEventos() {
    $('#btn-anterior').addEventListener('click', () => cambiarMes(-1));
    $('#btn-siguiente').addEventListener('click', () => cambiarMes(1));
    const irAHoy = () => { const h = new Date(); irAMes(h.getFullYear(), h.getMonth()); };
    $('#btn-hoy').addEventListener('click', irAHoy);
    $('#titulo-mes').addEventListener('click', irAHoy);
    $('#btn-ajustes').addEventListener('click', abrirAjustes);
    $('#btn-agregar').addEventListener('click', () => abrirFormulario(null));

    $('#pestanas').addEventListener('click', e => {
      const b = e.target.closest('button[data-vista]');
      if (b) cambiarVista(b.dataset.vista);
    });

    const contenido = $('#contenido');
    contenido.addEventListener('scroll', () => {
      $('#barra').classList.toggle('con-borde', contenido.scrollTop > 4);
    }, { passive: true });

    $('#lista').addEventListener('click', e => {
      const b = e.target.closest('.mov');
      if (!b) return;
      const mov = estado.movimientos.find(m => m.id === b.dataset.id);
      if (mov) abrirFormulario(mov);
    });

    // Formulario
    const hojaForm = $('#hoja-form');
    hojaForm.addEventListener('click', e => { if (e.target.closest('[data-cerrar]')) cerrarFormulario(); });
    habilitarArrastre(hojaForm, cerrarFormulario);
    $('#form-mov').addEventListener('submit', guardarFormulario);
    $('#f-tipo').addEventListener('click', e => {
      const b = e.target.closest('button[data-tipo]');
      if (b) ponerTipo(b.dataset.tipo);
    });
    $('#f-categorias').addEventListener('click', e => {
      const b = e.target.closest('.cat-chip');
      if (!b) return;
      form.categoria = b.dataset.cat;
      renderCategoriasForm();
    });
    $('#f-monto').addEventListener('input', ajustarAnchoMonto);
    // "Enter" en el teclado solo cierra el teclado (no guarda por accidente)
    $('#form-mov').addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        e.preventDefault();
        e.target.blur();
      }
    });
    $('#f-camara').addEventListener('change', alElegirFoto);
    $('#f-galeria').addEventListener('change', alElegirFoto);
    $('#f-foto-ver').addEventListener('click', () => abrirVisor(form.fotoURL));
    $('#f-foto-quitar').addEventListener('click', () => {
      form.fotoNueva = null;
      mostrarFoto(null);
    });
    $('#f-eliminar').addEventListener('click', eliminarActual);

    // Respaldo
    const hojaAjustes = $('#hoja-ajustes');
    const cerrarAjustes = () => ocultar(hojaAjustes, () => { archivoRespaldo = null; });
    hojaAjustes.addEventListener('click', e => { if (e.target.closest('[data-cerrar]')) cerrarAjustes(); });
    habilitarArrastre(hojaAjustes, cerrarAjustes);
    $('#aj-exportar').addEventListener('click', prepararExportacion);
    $('#aj-compartir').addEventListener('click', compartirRespaldo);
    $('#aj-importar').addEventListener('change', importarArchivo);

    // Visor
    $('#visor-img').addEventListener('click', e => { e.stopPropagation(); alternarZoom(e); });
    $('#visor-scroll').addEventListener('click', () => ocultar($('#visor')));
    $('#visor-cerrar').addEventListener('click', () => ocultar($('#visor')));

    // Alerta
    $('#alerta-aceptar').addEventListener('click', () => resolverAlerta && resolverAlerta(true));
    $('#alerta-cancelar').addEventListener('click', () => resolverAlerta && resolverAlerta(false));

    // iOS a veces deja la página desplazada tras cerrar el teclado
    document.addEventListener('focusout', () => {
      setTimeout(() => {
        const a = document.activeElement;
        if (!a || a === document.body) window.scrollTo(0, 0);
      }, 60);
    });

    // Al volver a la app: refresca (puede haber cambiado el día) y busca actualizaciones
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (!hayModalAbierto()) cargarMes();
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {});
      }
    });
  }

  // ---------- Service worker ----------

  function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const habiaControlador = !!navigator.serviceWorker.controller;
    let recargando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Solo recarga cuando es una actualización (no en la primera instalación)
      if (!habiaControlador || recargando) return;
      recargando = true;
      if (hayModalAbierto()) {
        recargaPendiente = true;
      } else {
        location.reload();
      }
    });
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service worker no registrado', err));
  }

  // ---------- Inicio ----------

  conectarEventos();
  cambiarVista('lista');
  renderEncabezado();
  cargarMes();
  registrarServiceWorker();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
