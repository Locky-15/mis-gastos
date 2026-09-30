/* ==========================================================
   Mis Gastos — lógica de la interfaz
   ========================================================== */
'use strict';

(() => {
  // ---------- Configuración ----------

  // Categorías de fábrica. El "id" nunca cambia porque es lo que guarda cada movimiento;
  // nombre, emoji, color y "oculta" se personalizan en Ajustes → Categorías.
  const CATEGORIAS_BASE = {
    gasto: [
      { id: 'Comida', nombre: 'Comida', emoji: '🍔', color: '#FF9F0A' },
      { id: 'Transporte', nombre: 'Transporte', emoji: '🚌', color: '#0A84FF' },
      { id: 'Casa', nombre: 'Casa', emoji: '🏠', color: '#BF5AF2' },
      { id: 'Servicios', nombre: 'Servicios', emoji: '💡', color: '#FFD60A' },
      { id: 'Salud', nombre: 'Salud', emoji: '💊', color: '#FF453A' },
      { id: 'Estudios', nombre: 'Estudios', emoji: '📚', color: '#64D2FF' },
      { id: 'Entretenimiento', nombre: 'Entretenimiento', emoji: '🎬', color: '#FF375F' },
      { id: 'Compras', nombre: 'Compras', emoji: '🛍️', color: '#5E5CE6' },
      { id: 'Otros', nombre: 'Otros', emoji: '📦', color: '#98989D' },
    ],
    ingreso: [
      { id: 'Sueldo', nombre: 'Sueldo', emoji: '💼', color: '#30D158' },
      { id: 'Ventas', nombre: 'Ventas', emoji: '🏷️', color: '#0A84FF' },
      { id: 'Regalo', nombre: 'Regalo', emoji: '🎁', color: '#FF9F0A' },
      { id: 'Otros', nombre: 'Otros', emoji: '💰', color: '#98989D' },
    ],
  };

  const EMOJIS_SUGERIDOS = [
    '🍔', '🛒', '☕', '🍺', '🍕', '🚌', '🚕', '⛽', '🚗', '🏠', '💡', '📱', '🌐', '💊', '🏥', '🐶',
    '👶', '📚', '🎓', '🎬', '🎮', '🎵', '✈️', '🏖️', '🛍️', '👕', '💇', '🏋️', '🎁', '💼', '💰', '📦',
  ];
  const COLORES = [
    '#FF453A', '#FF9F0A', '#FFD60A', '#30D158', '#66D4CF', '#64D2FF', '#0A84FF',
    '#5E5CE6', '#BF5AF2', '#FF375F', '#AC8E68', '#98989D',
  ];
  const MAX_NOMBRE_CATEGORIA = 24;

  const FOTO_LADO_MAX = 1200;
  const FOTO_CALIDAD = 0.7;
  const MAX_FOTOS = 10;
  const MAX_CENTAVOS = 99999999999; // $999.999.999,99
  const DIAS_RECORDATORIO = 7; // días sin respaldo antes de mostrar el aviso
  const DIAS_POSPONER = 3;
  const MIN_MOVS_RECORDATORIO = 5;

  const fmtMoneda = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
  const fmtNombreMes = new Intl.DateTimeFormat('es-EC', { month: 'long' });
  const fmtMesCorto = new Intl.DateTimeFormat('es-EC', { month: 'short' });
  const fmtDia = new Intl.DateTimeFormat('es-EC', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtDiaAnio = new Intl.DateTimeFormat('es-EC', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtFechaHora = new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' });

  const $ = (sel, raiz = document) => raiz.querySelector(sel);

  const ICONO_CLIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.2-8.2a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4l7.5-7.5"/></svg>';
  const ICONO_CHEVRON = '<svg class="mov-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
  const ICONO_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';

  // ---------- Estado ----------

  const ahora = new Date();
  const estado = {
    anio: ahora.getFullYear(),
    mes: ahora.getMonth(), // 0-11
    vista: 'lista',
    movimientos: [], // del mes visible
    serie: [], // totales de los últimos 6 meses (el último es el mes visible)
    carga: 0,
    animacion: null,
    filtroTipo: 'todos',
    busqueda: '',
    busquedaGlobal: false,
    busquedaToken: 0,
    listaMostrada: [],
    presupuestos: {}, // { idCategoria: centavos }
    categorias: null, // { gasto: [...], ingreso: [...] } (se asigna al iniciar)
  };

  const form = {
    id: null,
    idPreset: null, // id fijo para un movimiento nuevo (compras de Apple Pay, evita duplicados)
    tipo: 'gasto',
    categoria: null,
    creado: null,
    fotos: [], // { id, url, blob?, existente }
    eliminarFotos: [],
    cargaFotos: Promise.resolve(),
    sesion: 0,
    guardando: false,
    firma: '', // estado al abrir, para avisar si hay cambios sin guardar
  };

  const exportacion = { archivo: null, tipo: null };
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
  const claveMes = (anio, mes) => `${anio}-${dos(mes + 1)}`;
  const diasDelMes = (anio, mes) => new Date(anio, mes + 1, 0).getDate();
  const mesCorto = (anio, mes) => fmtMesCorto.format(new Date(anio, mes, 1)).replace('.', '');
  const nombreMes = (anio, mes) => fmtNombreMes.format(new Date(anio, mes, 1));
  const cuantasFotos = m => m.numFotos || (m.tieneFoto ? 1 : 0);
  const sumar = (lista, fn) => lista.reduce((s, x) => s + fn(x), 0);

  function sumarMeses(anio, mes, delta) {
    const total = anio * 12 + mes + delta;
    return { anio: Math.floor(total / 12), mes: ((total % 12) + 12) % 12 };
  }

  function escapar(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Minúsculas y sin tildes, para buscar "cafe" y encontrar "Café"
  const normalizarTexto = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function nuevoId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  }

  // ---------- Categorías ----------

  const copiarCategorias = c => ({ gasto: c.gasto.map(x => ({ ...x })), ingreso: c.ingreso.map(x => ({ ...x })) });
  estado.categorias = copiarCategorias(CATEGORIAS_BASE);

  const categoriasVisibles = tipo => estado.categorias[tipo].filter(c => !c.oculta);

  function infoCategoria(tipo, id) {
    const lista = estado.categorias[tipo] || estado.categorias.gasto;
    return lista.find(c => c.id === id)
      || { id, nombre: id, emoji: tipo === 'ingreso' ? '💰' : '📦', color: '#98989D', oculta: true };
  }

  const nombreCategoria = (tipo, id) => infoCategoria(tipo, id).nombre;

  /** Primer carácter visible (un emoji puede ocupar varios códigos, p. ej. 🏋️ o banderas). */
  function primerGrafema(texto) {
    const s = String(texto || '').trim();
    if (!s) return '';
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const primero = new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(s)[Symbol.iterator]().next();
      return primero.done ? '' : primero.value.segment;
    }
    return Array.from(s)[0];
  }

  function limpiarCategoria(c, base) {
    const nombre = typeof c.nombre === 'string' && c.nombre.trim()
      ? c.nombre.trim().replace(/\s+/g, ' ').slice(0, MAX_NOMBRE_CATEGORIA)
      : (base ? base.nombre : c.id);
    return {
      id: c.id,
      nombre,
      emoji: primerGrafema(c.emoji) || (base ? base.emoji : '🏷️'),
      color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color.toUpperCase() : (base ? base.color : '#98989D'),
      oculta: !!c.oculta,
    };
  }

  /** Valida lo guardado; las de fábrica nunca desaparecen (solo se pueden ocultar). */
  function normalizarCategorias(guardadas) {
    const res = copiarCategorias(CATEGORIAS_BASE);
    if (!guardadas || typeof guardadas !== 'object') return res;
    for (const tipo of ['gasto', 'ingreso']) {
      if (!Array.isArray(guardadas[tipo])) continue;
      const lista = [];
      const ids = new Set();
      for (const c of guardadas[tipo]) {
        if (!c || typeof c.id !== 'string' || !c.id || c.id.length > 64 || ids.has(c.id)) continue;
        lista.push(limpiarCategoria(c, res[tipo].find(b => b.id === c.id)));
        ids.add(c.id);
      }
      for (const b of res[tipo]) if (!ids.has(b.id)) lista.push({ ...b });
      if (!lista.some(c => !c.oculta)) lista[0].oculta = false;
      res[tipo] = lista;
    }
    return res;
  }

  /** Agrega las categorías de un respaldo que aquí no existen. Devuelve true si hubo cambios. */
  function fusionarCategorias(deArchivo) {
    if (!deArchivo || typeof deArchivo !== 'object') return false;
    const archivo = normalizarCategorias(deArchivo);
    let cambios = false;
    for (const tipo of ['gasto', 'ingreso']) {
      const locales = estado.categorias[tipo];
      for (const c of archivo[tipo]) {
        if (locales.some(l => l.id === c.id)) continue;
        insertarCategoria(tipo, c);
        cambios = true;
      }
    }
    return cambios;
  }

  /** Las nuevas van antes de "Otros" para que "Otros" siga al final. */
  function insertarCategoria(tipo, c) {
    const lista = estado.categorias[tipo];
    const iOtros = lista.findIndex(x => x.id === 'Otros');
    if (iOtros === -1) lista.push(c); else lista.splice(iOtros, 0, c);
  }

  const guardarCategorias = () => DB.guardarAjuste('categorias', estado.categorias);

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

  const centavosATexto = c => (c / 100).toFixed(2).replace('.', ',');

  function etiquetaDia(fechaISO, conAnio) {
    const hoy = hoyISO();
    const ayer = aISO(new Date(Date.now() - 864e5));
    const texto = (conAnio ? fmtDiaAnio : fmtDia).format(deISO(fechaISO));
    if (fechaISO === hoy) return `Hoy · ${texto}`;
    if (fechaISO === ayer) return `Ayer · ${texto}`;
    return texto;
  }

  function tamanoLegible(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  }

  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  // ---------- Carga y render principal ----------

  async function cargarMes() {
    const token = ++estado.carga;
    const inicio = sumarMeses(estado.anio, estado.mes, -5);
    let movs;
    try {
      // Una sola consulta trae el mes visible y los 5 anteriores (para comparaciones y el gráfico)
      movs = await DB.movimientosEntre(
        `${claveMes(inicio.anio, inicio.mes)}-01`,
        `${claveMes(estado.anio, estado.mes)}-31`
      );
    } catch (err) {
      console.error(err);
      toast('No se pudieron leer los datos');
      return;
    }
    if (token !== estado.carga) return; // llegó una carga más nueva

    const serie = [];
    for (let i = 5; i >= 0; i--) {
      const x = sumarMeses(estado.anio, estado.mes, -i);
      serie.push({ ...x, clave: claveMes(x.anio, x.mes), ingresos: 0, gastos: 0 });
    }
    const porClave = new Map(serie.map(s => [s.clave, s]));
    const claveActual = claveMes(estado.anio, estado.mes);
    const actuales = [];
    for (const m of movs) {
      const clave = m.fecha.slice(0, 7);
      const s = porClave.get(clave);
      if (s) {
        if (m.tipo === 'ingreso') s.ingresos += m.centavos; else s.gastos += m.centavos;
      }
      if (clave === claveActual) actuales.push(m);
    }
    actuales.sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || 0) - (a.creado || 0));
    estado.movimientos = actuales;
    estado.serie = serie;
    renderTodo();
  }

  function renderTodo() {
    renderEncabezado();
    renderResumen();
    renderLista();
    renderEstadisticas();
    if (estado.animacion) {
      const c = $('#contenido');
      c.classList.remove('desde-der', 'desde-izq');
      void c.offsetWidth;
      c.classList.add(estado.animacion);
      estado.animacion = null;
      setTimeout(() => c.classList.remove('desde-der', 'desde-izq'), 350);
    }
  }

  function renderEncabezado() {
    $('#titulo-mes').textContent = `${capitalizar(nombreMes(estado.anio, estado.mes))} ${estado.anio}`;
    const hoy = new Date();
    $('#btn-hoy').hidden = hoy.getFullYear() === estado.anio && hoy.getMonth() === estado.mes;
  }

  function textoComparacion(actual, anterior, subirEsBueno, mesAnterior) {
    if (!anterior) return '';
    const pct = Math.round(((actual - anterior) / anterior) * 100);
    if (pct === 0) return `Igual que en ${mesAnterior}`;
    const bueno = (pct > 0) === subirEsBueno;
    return `<span class="${bueno ? 'bueno' : 'malo'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)} %</span> vs. ${mesAnterior}`;
  }

  function claseProgreso(gastado, limite) {
    if (gastado > limite) return 'excedido';
    if (gastado >= limite * 0.85) return 'cerca';
    return '';
  }

  function renderResumen() {
    const ingresos = sumar(estado.movimientos, m => (m.tipo === 'ingreso' ? m.centavos : 0));
    const gastos = sumar(estado.movimientos, m => (m.tipo === 'gasto' ? m.centavos : 0));
    const balance = ingresos - gastos;
    $('#total-ingresos').textContent = dinero(ingresos);
    $('#total-gastos').textContent = dinero(gastos);
    const el = $('#balance');
    el.textContent = dineroConSigno(balance);
    el.classList.toggle('positivo', balance > 0);
    el.classList.toggle('negativo', balance < 0);

    const previo = estado.serie[4];
    const nombrePrevio = previo ? nombreMes(previo.anio, previo.mes) : '';
    $('#comp-ingresos').innerHTML = previo ? textoComparacion(ingresos, previo.ingresos, true, nombrePrevio) : '';
    $('#comp-gastos').innerHTML = previo ? textoComparacion(gastos, previo.gastos, false, nombrePrevio) : '';

    // Presupuesto: solo cuenta los gastos de las categorías que tienen límite
    const limites = Object.entries(estado.presupuestos).filter(([, v]) => v > 0);
    const caja = $('#resumen-presupuesto');
    if (!limites.length) {
      caja.hidden = true;
      return;
    }
    const totalLimite = sumar(limites, ([, v]) => v);
    const conLimite = new Set(limites.map(([k]) => k));
    const gastado = sumar(estado.movimientos, m => (m.tipo === 'gasto' && conLimite.has(m.categoria) ? m.centavos : 0));
    caja.hidden = false;
    $('#rp-valor').textContent = `${dinero(gastado)} de ${dinero(totalLimite)}`;
    const barra = $('#rp-barra');
    barra.style.width = `${Math.min(100, (gastado / totalLimite) * 100).toFixed(1)}%`;
    barra.className = claseProgreso(gastado, totalLimite);
  }

  function htmlVacio(icono, titulo, texto) {
    return `<div class="vacio"><div class="vacio-icono">${icono}</div><h3>${titulo}</h3><p>${texto}</p></div>`;
  }

  // ---------- Lista, búsqueda y filtros ----------

  function hayFiltro() {
    return estado.filtroTipo !== 'todos' || estado.busqueda.trim() !== '';
  }

  function filtrar(lista) {
    const partes = normalizarTexto(estado.busqueda.trim()).split(/\s+/).filter(Boolean);
    return lista.filter(m => {
      if (estado.filtroTipo !== 'todos' && m.tipo !== estado.filtroTipo) return false;
      if (!partes.length) return true;
      const texto = normalizarTexto(`${nombreCategoria(m.tipo, m.categoria)} ${m.descripcion || ''} ${centavosATexto(m.centavos)} ${dinero(m.centavos)}`);
      return partes.every(p => texto.includes(p));
    });
  }

  function renderLista() {
    const global = estado.busquedaGlobal && estado.busqueda.trim() !== '';
    if (global) {
      buscarEnTodo();
      return;
    }
    pintarLista(filtrar(estado.movimientos), false);
  }

  async function buscarEnTodo() {
    const token = ++estado.busquedaToken;
    let todos;
    try {
      todos = await DB.todos();
    } catch (err) {
      console.error(err);
      return;
    }
    if (token !== estado.busquedaToken) return;
    const res = filtrar(todos).sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || 0) - (a.creado || 0));
    pintarLista(res, true);
  }

  function pintarLista(lista, global) {
    estado.listaMostrada = lista;
    const cont = $('#lista');
    const info = $('#info-filtro');

    if (hayFiltro()) {
      const neto = sumar(lista, m => (m.tipo === 'ingreso' ? m.centavos : -m.centavos));
      info.textContent = `${plural(lista.length, 'resultado', 'resultados')}${global ? ' en todos los meses' : ''}`
        + (lista.length ? ` · ${dineroConSigno(neto)}` : '');
      info.hidden = false;
    } else {
      info.hidden = true;
    }

    if (!lista.length) {
      cont.innerHTML = hayFiltro()
        ? htmlVacio('🔍', 'Sin resultados', global ? 'No hay movimientos que coincidan.' : 'Prueba con otra palabra o toca “Todos los meses”.')
        : htmlVacio('🧾', 'Sin movimientos este mes', 'Toca el botón + para registrar un gasto o un ingreso.');
      return;
    }
    const grupos = new Map();
    for (const m of lista) {
      if (!grupos.has(m.fecha)) grupos.set(m.fecha, []);
      grupos.get(m.fecha).push(m);
    }
    const anioActual = String(new Date().getFullYear());
    let html = '';
    for (const [fecha, movs] of grupos) {
      const neto = sumar(movs, m => (m.tipo === 'ingreso' ? m.centavos : -m.centavos));
      const conAnio = global && !fecha.startsWith(anioActual);
      html += `<section class="dia"><h3 class="dia-titulo"><span>${escapar(etiquetaDia(fecha, conAnio))}</span>`
        + `<span>${neto < 0 ? '−' : '+'}${dinero(Math.abs(neto))}</span></h3><div class="lista-grupo">`;
      for (const m of movs) html += htmlMovimiento(m);
      html += '</div></section>';
    }
    cont.innerHTML = html;
  }

  function htmlMovimiento(m) {
    const c = infoCategoria(m.tipo, m.categoria);
    const signo = m.tipo === 'gasto' ? '−' : '+';
    const n = cuantasFotos(m);
    const fotos = n ? `${ICONO_CLIP}${n > 1 ? `<span class="mov-nfotos">${n}</span>` : ''}` : '';
    return `<button type="button" class="mov" data-id="${escapar(m.id)}">`
      + `<span class="mov-icono" style="background:${c.color}33">${escapar(c.emoji)}</span>`
      + '<span class="mov-info">'
      + `<span class="mov-cat">${escapar(c.nombre)}${fotos}</span>`
      + (m.descripcion ? `<span class="mov-desc">${escapar(m.descripcion)}</span>` : '')
      + '</span>'
      + `<span class="mov-monto ${m.tipo}">${signo}${dinero(m.centavos)}</span>`
      + ICONO_CHEVRON
      + '</button>';
  }

  function actualizarControlesBusqueda() {
    const hayTexto = estado.busqueda.trim() !== '';
    $('#buscar-limpiar').hidden = !estado.busqueda;
    const global = $('#buscar-global');
    global.hidden = !hayTexto;
    global.classList.toggle('activo', estado.busquedaGlobal);
    global.textContent = estado.busquedaGlobal ? '✓ Todos los meses' : 'Todos los meses';
    for (const b of $('#filtro-tipo').children) b.classList.toggle('activo', b.dataset.filtro === estado.filtroTipo);
  }

  // ---------- Estadísticas ----------

  function renderEstadisticas() {
    $('#grafico').innerHTML = htmlIndicadores() + htmlCategorias() + htmlSeisMeses();
  }

  function htmlStat(etiqueta, valor, sub) {
    return `<div class="stat"><div class="stat-etq">${etiqueta}</div><div class="stat-valor">${valor}</div>`
      + `<div class="stat-sub">${sub || '&nbsp;'}</div></div>`;
  }

  function htmlIndicadores() {
    const gastos = estado.movimientos.filter(m => m.tipo === 'gasto');
    const totalG = sumar(gastos, m => m.centavos);
    const totalI = sumar(estado.movimientos, m => (m.tipo === 'ingreso' ? m.centavos : 0));
    const hoy = new Date();
    const dias = diasDelMes(estado.anio, estado.mes);
    const esActual = hoy.getFullYear() === estado.anio && hoy.getMonth() === estado.mes;
    const esPasado = estado.anio * 12 + estado.mes < hoy.getFullYear() * 12 + hoy.getMonth();
    const transcurridos = esActual ? hoy.getDate() : esPasado ? dias : 0;

    const promedio = transcurridos ? Math.round(totalG / transcurridos) : null;
    let html = htmlStat('Promedio diario', promedio === null ? '—' : dinero(promedio),
      transcurridos ? `de gasto en ${plural(transcurridos, 'día', 'días')}` : 'mes aún no empieza');

    if (esActual) {
      const proyeccion = transcurridos ? Math.round((totalG / transcurridos) * dias) : 0;
      html += htmlStat('Proyección del mes', dinero(proyeccion), 'de gasto si sigues así');
    } else {
      const conGasto = new Set(gastos.map(m => m.fecha)).size;
      html += htmlStat('Días con gastos', String(conGasto), `de ${dias} días`);
    }

    const mayor = gastos.reduce((a, m) => (!a || m.centavos > a.centavos ? m : a), null);
    const catMayor = mayor ? nombreCategoria('gasto', mayor.categoria) : '';
    html += htmlStat('Mayor gasto', mayor ? dinero(mayor.centavos) : '—',
      mayor ? escapar(mayor.descripcion ? `${catMayor} · ${mayor.descripcion}` : catMayor) : 'sin gastos');

    if (totalI > 0) {
      const tasa = Math.round(((totalI - totalG) / totalI) * 100);
      html += htmlStat('Tasa de ahorro', `<span class="${tasa >= 0 ? 'ingreso' : 'gasto'}">${tasa} %</span>`,
        `${dineroConSigno(totalI - totalG)} ${totalI - totalG >= 0 ? 'ahorrado' : 'de déficit'}`);
    } else {
      html += htmlStat('Tasa de ahorro', '—', 'sin ingresos este mes');
    }
    return `<div class="stats-grid">${html}</div>`;
  }

  function htmlCategorias() {
    const porCategoria = new Map();
    for (const m of estado.movimientos) {
      if (m.tipo !== 'gasto') continue;
      porCategoria.set(m.categoria, (porCategoria.get(m.categoria) || 0) + m.centavos);
    }
    for (const [cat, limite] of Object.entries(estado.presupuestos)) {
      if (limite > 0 && !porCategoria.has(cat)) porCategoria.set(cat, 0);
    }
    const total = sumar([...porCategoria.values()], v => v);
    const titulo = '<div class="tarjeta-titulo"><h3>Gastos por categoría</h3>'
      + '<button type="button" class="texto-btn" data-accion="presupuestos">Presupuestos</button></div>';

    if (!porCategoria.size) {
      return `<div class="grafico-tarjeta">${titulo}`
        + htmlVacio('📊', 'Sin gastos este mes', 'Cuando registres gastos verás aquí cómo se reparten. También puedes fijar un presupuesto por categoría.')
        + '</div>';
    }

    const filas = [...porCategoria]
      .map(([cat, monto]) => ({ cat, monto, info: infoCategoria('gasto', cat), limite: estado.presupuestos[cat] || 0 }))
      .sort((a, b) => b.monto - a.monto || a.info.nombre.localeCompare(b.info.nombre));

    // Gráfico de dona en SVG
    let svg = '';
    if (total > 0) {
      const R = 78;
      const GROSOR = 26;
      const C = 2 * Math.PI * R;
      const conMonto = filas.filter(f => f.monto > 0);
      const hueco = conMonto.length > 1 ? 1.5 : 0;
      let desplazamiento = 0;
      let segmentos = '';
      for (const f of conMonto) {
        const largo = (f.monto / total) * C;
        const visible = Math.max(largo - hueco, 0.8);
        segmentos += `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${f.info.color}" stroke-width="${GROSOR}"`
          + ` stroke-dasharray="${visible.toFixed(2)} ${(C - visible).toFixed(2)}" stroke-dashoffset="${(-desplazamiento).toFixed(2)}"/>`;
        desplazamiento += largo;
      }
      const textoTotal = dinero(total);
      const tamTexto = textoTotal.length > 12 ? 16 : textoTotal.length > 9 ? 19 : 22;
      svg = '<svg class="dona" viewBox="0 0 200 200" role="img" aria-label="Gastos por categoría">'
        + `<g transform="rotate(-90 100 100)"><circle cx="100" cy="100" r="${R}" fill="none" stroke="#2c2c2e" stroke-width="${GROSOR}"/>${segmentos}</g>`
        + '<text x="100" y="92" class="dona-etq">Total gastos</text>'
        + `<text x="100" y="${100 + tamTexto * 0.55}" class="dona-total" font-size="${tamTexto}">${escapar(textoTotal)}</text>`
        + '</svg>';
    }

    const maximo = Math.max(1, ...filas.map(f => f.monto));
    let leyenda = '';
    for (const f of filas) {
      const pct = total ? (f.monto / total) * 100 : 0;
      const pctTexto = !f.monto ? '' : pct < 1 ? '<1 %' : `${Math.round(pct)} %`;
      let ancho;
      let color = f.info.color;
      let detalle = '';
      if (f.limite) {
        const clase = claseProgreso(f.monto, f.limite);
        ancho = Math.min(100, (f.monto / f.limite) * 100);
        if (clase === 'excedido') color = 'var(--rojo)';
        else if (clase === 'cerca') color = '#FF9F0A';
        const resto = f.limite - f.monto;
        detalle = `<span class="cat-detalle ${clase}">Presupuesto ${dinero(f.limite)} · `
          + (resto >= 0 ? `quedan ${dinero(resto)}` : `excedido por ${dinero(-resto)}`) + '</span>';
      } else {
        ancho = (f.monto / maximo) * 100;
      }
      leyenda += '<div class="cat-fila">'
        + `<span class="mov-icono" style="background:${f.info.color}33">${escapar(f.info.emoji)}</span>`
        + `<span class="cat-nombre">${escapar(f.info.nombre)}<span class="cat-pct">${pctTexto}</span></span>`
        + `<span class="cat-monto${f.monto ? '' : ' cat-sin-gasto'}">${dinero(f.monto)}</span>`
        + `<span class="cat-barra"><span style="width:${ancho.toFixed(1)}%;background:${color}"></span></span>`
        + detalle
        + '</div>';
    }
    return `<div class="grafico-tarjeta">${titulo}${svg}<div>${leyenda}</div></div>`;
  }

  function htmlSeisMeses() {
    const serie = estado.serie;
    const maximo = Math.max(0, ...serie.map(s => Math.max(s.ingresos, s.gastos)));
    const titulo = '<div class="tarjeta-titulo"><h3>Últimos 6 meses</h3></div>';
    if (!maximo) {
      return `<div class="grafico-tarjeta">${titulo}<p class="nota-6m">Aún no hay movimientos en estos meses.</p></div>`;
    }
    const ANCHO = 340;
    const BASE = 140;
    const ALTO = 112;
    const IZQ = 6;
    const grupo = (ANCHO - IZQ * 2) / serie.length;
    const barra = 15;
    let barras = '';
    serie.forEach((s, i) => {
      const x0 = IZQ + i * grupo;
      const centro = x0 + grupo / 2;
      const hI = s.ingresos ? Math.max(2, (s.ingresos / maximo) * ALTO) : 0;
      const hG = s.gastos ? Math.max(2, (s.gastos / maximo) * ALTO) : 0;
      const actual = i === serie.length - 1;
      barras += `<g data-anio="${s.anio}" data-mes="${s.mes}">`
        + `<rect x="${x0.toFixed(1)}" y="10" width="${grupo.toFixed(1)}" height="${BASE + 22}" fill="transparent"/>`
        + (hI ? `<rect x="${(centro - barra - 1.5).toFixed(1)}" y="${(BASE - hI).toFixed(1)}" width="${barra}" height="${hI.toFixed(1)}" rx="3" fill="#30D158"/>` : '')
        + (hG ? `<rect x="${(centro + 1.5).toFixed(1)}" y="${(BASE - hG).toFixed(1)}" width="${barra}" height="${hG.toFixed(1)}" rx="3" fill="#FF453A"/>` : '')
        + `<text x="${centro.toFixed(1)}" y="${BASE + 17}" class="etq-mes${actual ? ' actual' : ''}">${escapar(capitalizar(mesCorto(s.anio, s.mes)))}</text>`
        + '</g>';
    });
    const svg = `<svg class="barras-6m" viewBox="0 0 ${ANCHO} ${BASE + 24}" role="img" aria-label="Ingresos y gastos de los últimos 6 meses">`
      + `<line x1="0" x2="${ANCHO}" y1="${BASE - ALTO}" y2="${BASE - ALTO}" class="guia"/>`
      + `<text x="2" y="${BASE - ALTO - 5}" class="etq-valor">${escapar(dinero(maximo))}</text>`
      + `<line x1="0" x2="${ANCHO}" y1="${BASE}" y2="${BASE}" stroke="#48484a" stroke-width="1"/>`
      + barras + '</svg>';

    const conDatos = serie.filter(s => s.ingresos || s.gastos);
    const ahorro = conDatos.length ? Math.round(sumar(conDatos, s => s.ingresos - s.gastos) / conDatos.length) : 0;
    return `<div class="grafico-tarjeta">${titulo}${svg}`
      + '<div class="leyenda-6m"><span style="--c:#30D158">Ingresos</span><span style="--c:#FF453A">Gastos</span></div>'
      + `<p class="nota-6m">Balance promedio: <strong class="${ahorro >= 0 ? 'ingreso' : 'gasto'}">${dineroConSigno(ahorro)}</strong> al mes · toca un mes para verlo</p>`
      + '</div>';
  }

  // ---------- Navegación ----------

  function cambiarMes(delta) {
    const x = sumarMeses(estado.anio, estado.mes, delta);
    estado.animacion = delta > 0 ? 'desde-der' : 'desde-izq';
    return irAMes(x.anio, x.mes);
  }

  function irAMes(anio, mes) {
    estado.anio = anio;
    estado.mes = mes;
    renderEncabezado();
    $('#contenido').scrollTop = 0;
    return cargarMes();
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
    return ['#hoja-form', '#hoja-ajustes', '#hoja-presupuestos', '#hoja-applepay', '#hoja-pegar', '#hoja-ayuda-ap',
      '#hoja-categorias', '#hoja-cat-editar', '#hoja-bloqueo', '#bloqueo', '#visor', '#alerta']
      .some(s => !$(s).hidden);
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
  function toast(mensaje, duracion = 2200) {
    const t = $('#toast');
    t.textContent = mensaje;
    t.classList.add('visible');
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => t.classList.remove('visible'), duracion);
  }

  // ---------- Formulario ----------

  /**
   * mov: movimiento existente a editar (o null para uno nuevo).
   * preset: datos iniciales para uno nuevo { id, tipo, centavos, categoria, descripcion, fecha }.
   */
  function abrirFormulario(mov, preset) {
    limpiarFotosForm();
    const sesion = ++form.sesion;
    const datos = mov || preset || null;
    form.id = mov ? mov.id : null;
    form.idPreset = !mov && preset ? preset.id || null : null;
    form.creado = mov ? mov.creado : null;
    form.categoria = datos ? datos.categoria || null : null;
    form.guardando = false;
    form.cargaFotos = Promise.resolve();

    $('#form-titulo').textContent = mov ? 'Editar movimiento' : 'Nuevo movimiento';
    ponerTipo(datos ? datos.tipo || 'gasto' : 'gasto');
    $('#f-monto').value = datos && datos.centavos ? centavosATexto(datos.centavos) : '';
    ajustarAnchoMonto();
    $('#f-desc').value = datos ? datos.descripcion || '' : '';
    $('#f-fecha').value = datos && datos.fecha ? datos.fecha : hoyISO();
    $('#f-eliminar').hidden = !mov;
    $('#f-duplicar').hidden = !mov;
    $('#f-guardar').disabled = false;
    renderFotosForm();
    $('.hoja-cuerpo', $('#hoja-form')).scrollTop = 0;

    if (mov && cuantasFotos(mov)) {
      form.cargaFotos = DB.imagenesDe(mov.id).then(imagenes => {
        if (sesion !== form.sesion) return;
        const existentes = imagenes.map(im => ({
          id: im.id,
          url: URL.createObjectURL(new Blob([im.datos], { type: im.tipo || 'image/jpeg' })),
          existente: true,
        }));
        form.fotos = existentes.concat(form.fotos);
        renderFotosForm();
      }).catch(console.error);
    }
    form.firma = firmaFormulario();
    mostrar($('#hoja-form'));
  }

  /** Resumen de lo editable del formulario; si cambia, hay cambios sin guardar. */
  function firmaFormulario() {
    return JSON.stringify([
      form.tipo, $('#f-monto').value.trim(), form.categoria, $('#f-desc').value.trim(), $('#f-fecha').value,
      form.fotos.filter(f => !f.existente).length, form.eliminarFotos.length,
    ]);
  }

  function cerrarFormulario() {
    if (document.activeElement) document.activeElement.blur();
    form.sesion++;
    ocultar($('#hoja-form'), limpiarFotosForm);
  }

  /** Cancelar, tocar fuera o deslizar hacia abajo: pregunta si hay cambios sin guardar. */
  async function pedirCerrarFormulario() {
    if (form.guardando || $('#hoja-form').hidden) return;
    if (firmaFormulario() !== form.firma) {
      if (document.activeElement) document.activeElement.blur();
      const descartar = await confirmar({
        titulo: '¿Descartar los cambios?',
        mensaje: 'Lo que escribiste en este movimiento se perderá.',
        aceptar: 'Descartar',
        cancelar: 'Seguir editando',
        destructivo: true,
      });
      if (!descartar) return;
    }
    cerrarFormulario();
  }

  function ponerTipo(tipo) {
    form.tipo = tipo;
    for (const b of $('#f-tipo').children) b.classList.toggle('activo', b.dataset.tipo === tipo);
    const caja = $('#f-monto-caja');
    caja.classList.toggle('gasto', tipo === 'gasto');
    caja.classList.toggle('ingreso', tipo === 'ingreso');
    if (form.categoria && !estado.categorias[tipo].some(c => c.id === form.categoria)) form.categoria = null;
    renderCategoriasForm();
  }

  function htmlChipCategoria(c, activo, claseExtra = '') {
    const estilo = activo ? ` style="border-color:${c.color};background:${c.color}22"` : '';
    return `<button type="button" class="cat-chip${activo ? ' activo' : ''}${claseExtra}" data-cat="${escapar(c.id)}"${estilo}>`
      + `<span class="mov-icono" style="background:${c.color}33">${escapar(c.emoji)}</span>${escapar(c.nombre)}</button>`;
  }

  const claseColumnas = n => (n % 3 !== 0 && n % 4 === 0 ? 'cuatro' : '');

  function renderCategoriasForm() {
    const lista = categoriasVisibles(form.tipo);
    // Al editar un movimiento con una categoría oculta, se sigue mostrando para no perderla
    if (form.categoria && !lista.some(c => c.id === form.categoria)) lista.push(infoCategoria(form.tipo, form.categoria));
    const grid = $('#f-categorias');
    grid.classList.toggle('cuatro', claseColumnas(lista.length) === 'cuatro');
    grid.innerHTML = lista.map(c => htmlChipCategoria(c, c.id === form.categoria)).join('');
  }

  function ajustarAnchoMonto() {
    const input = $('#f-monto');
    const largo = (input.value || input.placeholder).length;
    input.style.width = `${Math.max(3, largo + 0.5)}ch`;
  }

  // ---------- Fotos del formulario ----------

  function limpiarFotosForm() {
    for (const f of form.fotos) URL.revokeObjectURL(f.url);
    form.fotos = [];
    form.eliminarFotos = [];
    renderFotosForm();
  }

  function renderFotosForm() {
    const grid = $('#f-fotos');
    grid.hidden = !form.fotos.length;
    grid.innerHTML = form.fotos.map((f, i) => '<div class="foto-mini">'
      + `<button type="button" class="foto-ver" data-i="${i}" aria-label="Ver foto ${i + 1}"><img src="${escapar(f.url)}" alt=""></button>`
      + `<button type="button" class="foto-borrar" data-i="${i}" aria-label="Quitar foto ${i + 1}">${ICONO_X}</button>`
      + '</div>').join('');
    $('#f-fotos-cuenta').textContent = form.fotos.length ? `${form.fotos.length}/${MAX_FOTOS}` : '';
    const lleno = form.fotos.length >= MAX_FOTOS;
    $('#f-camara-btn').classList.toggle('deshabilitado', lleno);
    $('#f-galeria-btn').classList.toggle('deshabilitado', lleno);
  }

  function quitarFoto(i) {
    const [f] = form.fotos.splice(i, 1);
    if (!f) return;
    if (f.existente) form.eliminarFotos.push(f.id);
    URL.revokeObjectURL(f.url);
    renderFotosForm();
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

  async function alElegirFotos(e) {
    let archivos = Array.from(e.target.files || []);
    e.target.value = ''; // permite volver a elegir los mismos archivos
    if (!archivos.length) return;
    const sesion = form.sesion;
    const espacio = MAX_FOTOS - form.fotos.length;
    if (espacio <= 0) {
      toast(`Máximo ${MAX_FOTOS} fotos por movimiento`);
      return;
    }
    if (archivos.length > espacio) {
      toast(`Solo se agregarán ${plural(espacio, 'foto', 'fotos')} (máximo ${MAX_FOTOS})`, 3000);
      archivos = archivos.slice(0, espacio);
    } else if (archivos.length > 1) {
      toast(`Procesando ${archivos.length} fotos…`);
    }
    let fallidas = 0;
    // Una por una para no agotar la memoria del iPhone
    for (const archivo of archivos) {
      try {
        const blob = await comprimirImagen(archivo);
        if (sesion !== form.sesion) return; // se cerró el formulario mientras tanto
        form.fotos.push({ id: nuevoId(), blob, url: URL.createObjectURL(blob), existente: false });
        renderFotosForm();
      } catch (err) {
        console.error(err);
        fallidas++;
      }
    }
    if (fallidas) {
      alerta('Algunas fotos no se pudieron usar',
        `${plural(fallidas, 'foto no se pudo', 'fotos no se pudieron')} procesar. Intenta tomarlas de nuevo o elegir otras.`);
    }
  }

  function marcarError(sel) {
    const el = $(sel);
    el.classList.remove('error');
    void el.offsetWidth;
    el.classList.add('error');
  }

  function avisoPresupuesto(mov) {
    if (mov.tipo !== 'gasto') return null;
    const limite = estado.presupuestos[mov.categoria];
    if (!limite) return null;
    const gastado = sumar(estado.movimientos, m => (m.tipo === 'gasto' && m.categoria === mov.categoria ? m.centavos : 0));
    const nombre = nombreCategoria('gasto', mov.categoria);
    if (gastado > limite) return `⚠️ Te pasaste ${dinero(gastado - limite)} del presupuesto de ${nombre}`;
    if (gastado >= limite * 0.85) return `Llevas el ${Math.round((gastado / limite) * 100)} % del presupuesto de ${nombre}`;
    return null;
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

    try {
      await form.cargaFotos; // asegura que las fotos existentes ya estén en la lista
      const mov = {
        id: form.id || form.idPreset || nuevoId(),
        tipo: form.tipo,
        centavos,
        categoria: form.categoria,
        descripcion: $('#f-desc').value.trim(),
        fecha,
        numFotos: form.fotos.length,
        creado: form.creado || momento,
        actualizado: momento,
      };
      const nuevas = [];
      let orden = momento;
      for (const f of form.fotos) {
        if (f.existente) continue;
        nuevas.push({ id: f.id, movId: mov.id, orden: orden++, tipo: f.blob.type || 'image/jpeg', datos: await f.blob.arrayBuffer() });
      }
      await DB.guardar(mov, { nuevas, eliminar: form.eliminarFotos });

      cerrarFormulario();
      const [a, m] = fecha.split('-').map(Number);
      await ((a !== estado.anio || m - 1 !== estado.mes) ? irAMes(a, m - 1) : cargarMes());
      const aviso = avisoPresupuesto(mov);
      toast(aviso || (esNuevo ? 'Movimiento guardado' : 'Cambios guardados'), aviso ? 3800 : 2200);
      revisarRecordatorio();
    } catch (err) {
      console.error(err);
      form.guardando = false;
      $('#f-guardar').disabled = false;
      alerta('No se pudo guardar', 'Puede que el almacenamiento del iPhone esté lleno.');
    }
  }

  /** Convierte el movimiento abierto en uno nuevo (misma info, fecha de hoy, sin fotos). */
  function duplicarActual() {
    limpiarFotosForm();
    form.sesion++;
    form.id = null;
    form.idPreset = null;
    form.creado = null;
    form.cargaFotos = Promise.resolve();
    $('#form-titulo').textContent = 'Nuevo (copia)';
    $('#f-fecha').value = hoyISO();
    $('#f-eliminar').hidden = true;
    $('#f-duplicar').hidden = true;
    $('.hoja-cuerpo', $('#hoja-form')).scrollTop = 0;
    form.firma = firmaFormulario();
    toast('Copia lista: revisa y toca Guardar');
  }

  // ---------- Eliminar con "Deshacer" ----------

  const papelera = { mov: null, imagenes: [], timer: null };
  const SEGUNDOS_DESHACER = 6;

  /** Borra al instante y ofrece deshacer durante unos segundos (en vez de preguntar antes). */
  async function eliminarActual() {
    if (!form.id || form.guardando) return;
    const id = form.id;
    form.guardando = true;
    try {
      await form.cargaFotos;
      const mov = await DB.obtener(id);
      const imagenes = await DB.imagenesDe(id); // copia completa para poder restaurarlas
      await DB.eliminar(id);
      cerrarFormulario();
      cargarMes();
      if (mov) ofrecerDeshacer(mov, imagenes);
    } catch (err) {
      console.error(err);
      form.guardando = false;
      alerta('No se pudo eliminar', String(err.message || err));
    }
  }

  function ofrecerDeshacer(mov, imagenes) {
    clearTimeout(papelera.timer);
    papelera.mov = mov;
    papelera.imagenes = imagenes;
    $('#deshacer-texto').textContent = imagenes.length
      ? `Eliminado con ${plural(imagenes.length, 'foto', 'fotos')}`
      : 'Movimiento eliminado';
    mostrar($('#deshacer'));
    papelera.timer = setTimeout(vaciarPapelera, SEGUNDOS_DESHACER * 1000);
  }

  function vaciarPapelera() {
    clearTimeout(papelera.timer);
    papelera.mov = null;
    papelera.imagenes = [];
    const el = $('#deshacer');
    if (!el.hidden) ocultar(el);
  }

  async function deshacerEliminar() {
    const { mov, imagenes } = papelera;
    if (!mov) return;
    vaciarPapelera();
    try {
      await DB.guardar(mov, { nuevas: imagenes, eliminar: [] });
    } catch (err) {
      console.error(err);
      alerta('No se pudo restaurar', String(err.message || err));
      return;
    }
    const [a, m] = mov.fecha.split('-').map(Number);
    await ((a !== estado.anio || m - 1 !== estado.mes) ? irAMes(a, m - 1) : cargarMes());
    toast('Movimiento restaurado');
  }

  // ---------- Visor de fotos (carrusel) ----------

  function abrirVisor(urls, indice = 0) {
    if (!urls.length) return;
    const visor = $('#visor');
    const carrusel = $('#visor-carrusel');
    reiniciarZoom();
    carrusel.innerHTML = urls.map(u => `<div class="visor-slide"><img src="${escapar(u)}" alt="Foto del ticket"></div>`).join('');
    mostrar(visor);
    carrusel.scrollLeft = indice * carrusel.clientWidth;
    requestAnimationFrame(() => {
      carrusel.scrollLeft = indice * carrusel.clientWidth;
      actualizarContadorVisor();
    });
  }

  function actualizarContadorVisor() {
    const carrusel = $('#visor-carrusel');
    const total = carrusel.children.length;
    const i = Math.round(carrusel.scrollLeft / Math.max(1, carrusel.clientWidth));
    $('#visor-contador').textContent = total > 1 ? `${Math.min(total, i + 1)} / ${total}` : '';
    // Si se cambió de foto, la anterior vuelve a su tamaño
    if (zoom.img && zoom.img.parentElement !== carrusel.children[i]) reiniciarZoom();
  }

  function cerrarVisor() {
    ocultar($('#visor'), () => {
      reiniciarZoom();
      $('#visor-carrusel').innerHTML = '';
    });
  }

  // ---------- Zoom del visor: pellizcar, arrastrar y doble toque ----------
  // Se usa transform con origen en la esquina: pantalla = base + t + s · punto_local.

  const ZOOM_MAX = 5;
  const ZOOM_DOBLE = 2.5;
  const zoom = { img: null, s: 1, tx: 0, ty: 0, gesto: null, toque: null, ultimoToque: null, ultimoTouchMs: 0 };

  function reiniciarZoom() {
    if (zoom.img) {
      zoom.img.classList.remove('animando');
      zoom.img.style.transform = '';
    }
    zoom.img = null;
    zoom.s = 1;
    zoom.tx = 0;
    zoom.ty = 0;
    zoom.gesto = null;
    $('#visor').classList.remove('zoom');
  }

  function usarImagen(img) {
    if (zoom.img !== img) {
      reiniciarZoom();
      zoom.img = img;
    }
  }

  function aplicarZoom(animar) {
    const img = zoom.img;
    if (!img) return;
    img.classList.toggle('animando', !!animar);
    img.style.transform = zoom.s === 1 && !zoom.tx && !zoom.ty
      ? ''
      : `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.s})`;
    $('#visor').classList.toggle('zoom', zoom.s > 1);
  }

  /** Mantiene la foto dentro de la pantalla (o centrada si es más chica). */
  function limitarZoom() {
    const img = zoom.img;
    if (!img) return;
    if (zoom.s <= 1.02) {
      zoom.s = 1;
      zoom.tx = 0;
      zoom.ty = 0;
      return;
    }
    zoom.s = Math.min(zoom.s, ZOOM_MAX);
    const slide = img.parentElement;
    const w = img.offsetWidth;
    const h = img.offsetHeight;
    const W = w * zoom.s;
    const H = h * zoom.s;
    const bx = img.offsetLeft;
    const by = img.offsetTop;
    zoom.tx = W > slide.clientWidth
      ? Math.min(-bx, Math.max(slide.clientWidth - W - bx, zoom.tx))
      : (w * (1 - zoom.s)) / 2;
    zoom.ty = H > slide.clientHeight
      ? Math.min(-by, Math.max(slide.clientHeight - H - by, zoom.ty))
      : (h * (1 - zoom.s)) / 2;
  }

  /** Punto de la pantalla → coordenadas relativas a la esquina sin transformar de la foto. */
  function puntoLocal(img, x, y) {
    const r = img.parentElement.getBoundingClientRect();
    return { x: x - r.left - img.offsetLeft, y: y - r.top - img.offsetTop };
  }

  function dobleToque(x, y) {
    const img = zoom.img;
    if (!img) return;
    if (zoom.s > 1) {
      zoom.s = 1;
    } else {
      const p = puntoLocal(img, x, y); // con s = 1 y t = 0, el punto local es directo
      zoom.s = ZOOM_DOBLE;
      zoom.tx = p.x - ZOOM_DOBLE * p.x;
      zoom.ty = p.y - ZOOM_DOBLE * p.y;
    }
    limitarZoom();
    aplicarZoom(true);
  }

  const distancia = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const puntoMedio = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });

  function iniciarPellizco(img, t) {
    const m = puntoMedio(t[0], t[1]);
    const p = puntoLocal(img, m.x, m.y);
    zoom.gesto = {
      tipo: 'pellizco',
      d0: Math.max(1, distancia(t[0], t[1])),
      s0: zoom.s,
      lx: (p.x - zoom.tx) / zoom.s, // punto de la foto que queda bajo los dedos
      ly: (p.y - zoom.ty) / zoom.s,
    };
  }

  function iniciarArrastre(t) {
    zoom.gesto = { tipo: 'arrastre', x0: t.clientX, y0: t.clientY, tx0: zoom.tx, ty0: zoom.ty };
  }

  function alTocarVisor(e) {
    zoom.ultimoTouchMs = Date.now();
    const slide = e.target.closest('.visor-slide');
    if (!slide) return;
    const img = $('img', slide);
    if (!img) return;
    usarImagen(img);
    const t = e.touches;
    if (t.length === 2) {
      e.preventDefault();
      zoom.toque = null;
      iniciarPellizco(img, t);
    } else if (t.length === 1) {
      zoom.toque = { x: t[0].clientX, y: t[0].clientY, t: Date.now() };
      if (zoom.s > 1) iniciarArrastre(t[0]);
      else zoom.gesto = null; // sin zoom: el carrusel se desliza normalmente
    }
  }

  function alMoverVisor(e) {
    const g = zoom.gesto;
    const img = zoom.img;
    if (!g || !img) return;
    const t = e.touches;
    if (g.tipo === 'pellizco' && t.length === 2) {
      e.preventDefault();
      const m = puntoMedio(t[0], t[1]);
      const p = puntoLocal(img, m.x, m.y);
      zoom.s = Math.max(0.8, Math.min(ZOOM_MAX * 1.2, g.s0 * (distancia(t[0], t[1]) / g.d0)));
      zoom.tx = p.x - zoom.s * g.lx;
      zoom.ty = p.y - zoom.s * g.ly;
      aplicarZoom(false);
    } else if (g.tipo === 'arrastre' && t.length === 1) {
      e.preventDefault();
      zoom.tx = g.tx0 + (t[0].clientX - g.x0);
      zoom.ty = g.ty0 + (t[0].clientY - g.y0);
      limitarZoom();
      aplicarZoom(false);
    }
  }

  function alSoltarVisor(e) {
    zoom.ultimoTouchMs = Date.now();
    const g = zoom.gesto;
    if (g && g.tipo === 'pellizco' && e.touches.length < 2) {
      limitarZoom();
      aplicarZoom(true);
      // Si queda un dedo y hay zoom, se sigue arrastrando con él
      if (e.touches.length === 1 && zoom.s > 1) iniciarArrastre(e.touches[0]);
      else zoom.gesto = null;
      return;
    }
    if (e.touches.length === 0) zoom.gesto = null;

    // Doble toque: dos toques cortos y cercanos
    const toque = zoom.toque;
    zoom.toque = null;
    if (!toque || e.changedTouches.length !== 1) return;
    const c = e.changedTouches[0];
    const corto = Date.now() - toque.t < 250 && Math.hypot(c.clientX - toque.x, c.clientY - toque.y) < 12;
    if (!corto) {
      zoom.ultimoToque = null;
      return;
    }
    const previo = zoom.ultimoToque;
    if (previo && Date.now() - previo.t < 320 && Math.hypot(c.clientX - previo.x, c.clientY - previo.y) < 40) {
      zoom.ultimoToque = null;
      e.preventDefault(); // evita el "click" que cerraría el visor
      dobleToque(c.clientX, c.clientY);
    } else {
      zoom.ultimoToque = { x: c.clientX, y: c.clientY, t: Date.now() };
    }
  }

  // ---------- Presupuestos ----------

  function abrirPresupuestos() {
    // Visibles + las ocultas que aún tienen presupuesto (para poder quitárselo)
    const lista = estado.categorias.gasto.filter(c => !c.oculta || estado.presupuestos[c.id]);
    $('#lista-presupuestos').innerHTML = lista.map(c => {
      const v = estado.presupuestos[c.id];
      return '<label class="campo">'
        + `<span class="campo-cat"><span class="mov-icono" style="background:${c.color}33">${escapar(c.emoji)}</span>${escapar(c.nombre)}</span>`
        + '<span class="prefijo">$</span>'
        + `<input class="presupuesto" type="text" inputmode="decimal" enterkeyhint="done" placeholder="Sin límite" data-cat="${escapar(c.id)}" data-nombre="${escapar(c.nombre)}" value="${v ? centavosATexto(v) : ''}">`
        + '</label>';
    }).join('');
    actualizarTotalPresupuestos();
    $('.hoja-cuerpo', $('#hoja-presupuestos')).scrollTop = 0;
    mostrar($('#hoja-presupuestos'));
  }

  function leerPresupuestosForm() {
    const res = {};
    let invalido = null;
    for (const input of document.querySelectorAll('#lista-presupuestos input')) {
      const texto = input.value.trim();
      if (!texto) continue;
      const c = parsearMonto(texto);
      if (!(c > 0) || c > MAX_CENTAVOS) { invalido = invalido || input; continue; }
      res[input.dataset.cat] = c;
    }
    return { res, invalido };
  }

  function actualizarTotalPresupuestos() {
    const { res } = leerPresupuestosForm();
    const total = sumar(Object.values(res), v => v);
    $('#total-presupuestos').textContent = total ? `Total presupuestado: ${dinero(total)} al mes` : '';
  }

  async function guardarPresupuestos(e) {
    e.preventDefault();
    const { res, invalido } = leerPresupuestosForm();
    if (invalido) {
      toast(`Monto no válido en ${invalido.dataset.nombre}`);
      invalido.focus();
      return;
    }
    try {
      await DB.guardarAjuste('presupuestos', res);
    } catch (err) {
      console.error(err);
      alerta('No se pudieron guardar', String(err.message || err));
      return;
    }
    estado.presupuestos = res;
    if (document.activeElement) document.activeElement.blur();
    ocultar($('#hoja-presupuestos'));
    renderTodo();
    toast('Presupuestos guardados');
  }

  // ---------- Compras de Apple Pay (app Atajos + portapapeles) ----------
  // Las web apps no pueden leer los pagos de Wallet. Una automatización de Atajos
  // ("Transacción") copia cada compra al portapapeles con este formato de línea:
  //   MISGASTOS;<importe>;<AAAA-MM-DD HH:mm>;<comercio>
  // y aquí se lee con un toque en el botón de la tarjeta.

  const RE_APPLEPAY = /^\s*MISGASTOS\s*;([^;]*);([^;]*);(.*)$/i;
  const MAX_OMITIDOS = 300;
  const applePay = { cola: [], indice: 0, guardadas: 0, ocupado: false, sugerencias: new Map() };

  const claveComercio = s => normalizarTexto(s).replace(/\s+/g, ' ').trim();

  function parsearFechaAtajo(texto) {
    const s = String(texto).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (m) return { fecha: `${m[1]}-${m[2]}-${m[3]}`, hora: m[4] ? `${dos(m[4])}:${m[5]}` : '' };
    const d = s ? new Date(s) : null;
    if (d && !Number.isNaN(d.getTime())) return { fecha: aISO(d), hora: `${dos(d.getHours())}:${dos(d.getMinutes())}` };
    return { fecha: hoyISO(), hora: '' };
  }

  function leerComprasApplePay(texto) {
    const compras = [];
    const vistos = new Set();
    for (const linea of String(texto).split(/\r?\n/)) {
      const m = linea.match(RE_APPLEPAY);
      if (!m) continue;
      const centavos = parsearMonto(m[1]);
      if (!(centavos > 0) || centavos > MAX_CENTAVOS) continue;
      const { fecha, hora } = parsearFechaAtajo(m[2]);
      const comercio = m[3].trim().slice(0, 120);
      // id estable: la misma compra pegada dos veces no se duplica
      const id = 'ap-' + hashTexto(`${centavos}|${m[2].trim()}|${claveComercio(comercio)}`);
      if (vistos.has(id)) continue;
      vistos.add(id);
      compras.push({ id, centavos, fecha, hora, comercio });
    }
    return compras;
  }

  async function pegarCompraApplePay() {
    let texto = null;
    try {
      // iOS muestra la burbuja "Pegar" para confirmar
      if (navigator.clipboard && navigator.clipboard.readText) texto = await navigator.clipboard.readText();
    } catch (err) {
      texto = null;
    }
    if (texto === null) {
      abrirPegarManual('No se pudo leer el portapapeles. Pega aquí la compra que copió el atajo:');
      return;
    }
    procesarTextoApplePay(texto);
  }

  function abrirPegarManual(mensaje) {
    $('#pegar-mensaje').textContent = mensaje;
    $('#pegar-texto').value = '';
    mostrar($('#hoja-pegar'));
  }

  async function sugerenciasPorComercio() {
    const mapa = new Map();
    const gastos = (await DB.todos())
      .filter(m => m.tipo === 'gasto' && m.descripcion)
      .sort((a, b) => (a.actualizado || 0) - (b.actualizado || 0));
    for (const m of gastos) mapa.set(claveComercio(m.descripcion), m.categoria); // gana la más reciente
    return mapa;
  }

  async function procesarTextoApplePay(texto) {
    const compras = leerComprasApplePay(texto);
    if (!compras.length) {
      abrirPegarManual('No encontré compras de Apple Pay copiadas. Si ya configuraste el atajo, paga y vuelve a tocar el botón de la tarjeta. Si no, mira cómo configurarlo.');
      return;
    }
    try {
      const omitidos = new Set((await DB.leerAjuste('applePayOmitidos')) || []);
      const pendientes = [];
      for (const c of compras) {
        if (omitidos.has(c.id) || await DB.obtener(c.id)) continue;
        pendientes.push(c);
      }
      if (!pendientes.length) {
        if (!$('#hoja-pegar').hidden) ocultar($('#hoja-pegar'));
        toast(compras.length === 1 ? 'Esa compra ya está registrada' : 'Esas compras ya están registradas');
        return;
      }
      applePay.sugerencias = await sugerenciasPorComercio();
      applePay.cola = pendientes;
      applePay.indice = 0;
      applePay.guardadas = 0;
      applePay.ocupado = false;
      mostrarCompraApplePay();
      if (!$('#hoja-pegar').hidden) ocultar($('#hoja-pegar'));
      mostrar($('#hoja-applepay'));
    } catch (err) {
      console.error(err);
      alerta('No se pudo leer la compra', String(err.message || err));
    }
  }

  function sugeridaPara(compra) {
    const id = compra.comercio ? applePay.sugerencias.get(claveComercio(compra.comercio)) : null;
    return id && categoriasVisibles('gasto').some(c => c.id === id) ? id : null;
  }

  function mostrarCompraApplePay() {
    const c = applePay.cola[applePay.indice];
    const total = applePay.cola.length;
    $('#ap-contador').textContent = total > 1 ? `${applePay.indice + 1} de ${total}` : '';
    $('#ap-monto').textContent = dinero(c.centavos);
    $('#ap-comercio').textContent = c.comercio || 'Comercio sin nombre';
    $('#ap-fecha').textContent = capitalizar(etiquetaDia(c.fecha)) + (c.hora ? ` · ${c.hora}` : '');
    const sugerida = sugeridaPara(c);
    const lista = categoriasVisibles('gasto');
    const grid = $('#ap-categorias');
    grid.classList.toggle('cuatro', claseColumnas(lista.length) === 'cuatro');
    grid.innerHTML = lista
      .map(cat => htmlChipCategoria(cat, cat.id === sugerida, cat.id === sugerida ? ' sugerida' : ''))
      .join('');
    $('.hoja-cuerpo', $('#hoja-applepay')).scrollTop = 0;
  }

  async function clasificarCompra(categoria) {
    if (applePay.ocupado) return;
    applePay.ocupado = true;
    const c = applePay.cola[applePay.indice];
    const momento = Date.now();
    try {
      await DB.guardar({
        id: c.id, tipo: 'gasto', centavos: c.centavos, categoria, descripcion: c.comercio,
        fecha: c.fecha, numFotos: 0, creado: momento, actualizado: momento,
      });
      if (c.comercio) applePay.sugerencias.set(claveComercio(c.comercio), categoria);
      applePay.guardadas++;
      siguienteCompra(`Guardado en ${nombreCategoria('gasto', categoria)}`);
    } catch (err) {
      console.error(err);
      alerta('No se pudo guardar', 'Puede que el almacenamiento del iPhone esté lleno.');
    } finally {
      applePay.ocupado = false;
    }
  }

  async function omitirCompra() {
    const c = applePay.cola[applePay.indice];
    try {
      const lista = (await DB.leerAjuste('applePayOmitidos')) || [];
      lista.push(c.id);
      await DB.guardarAjuste('applePayOmitidos', lista.slice(-MAX_OMITIDOS));
    } catch (err) {
      console.error(err);
    }
    siguienteCompra('Compra omitida');
  }

  function siguienteCompra(mensaje) {
    applePay.indice++;
    if (applePay.indice < applePay.cola.length) {
      mostrarCompraApplePay();
      toast(mensaje);
      return;
    }
    cerrarApplePay();
    toast(applePay.guardadas > 1 ? `${applePay.guardadas} compras guardadas` : mensaje);
  }

  function cerrarApplePay() {
    ocultar($('#hoja-applepay'));
    if (!applePay.guardadas) return;
    // Muestra el mes de la última compra guardada
    const ultima = applePay.cola[Math.min(applePay.indice, applePay.cola.length) - 1];
    const [a, m] = ultima.fecha.split('-').map(Number);
    if (a !== estado.anio || m - 1 !== estado.mes) irAMes(a, m - 1); else cargarMes();
    revisarRecordatorio();
  }

  function editarCompraApplePay() {
    const c = applePay.cola[applePay.indice];
    const restantes = applePay.cola.length - applePay.indice - 1;
    cerrarApplePay();
    abrirFormulario(null, {
      id: c.id, tipo: 'gasto', centavos: c.centavos, categoria: sugeridaPara(c), descripcion: c.comercio, fecha: c.fecha,
    });
    if (restantes) {
      const faltan = restantes === 1 ? 'la compra que falta' : `las ${restantes} compras que faltan`;
      toast(`Luego toca la tarjeta otra vez para ${faltan}`, 3800);
    }
  }

  async function copiarCompraPrueba() {
    const d = new Date();
    const linea = `MISGASTOS;$1.00;${aISO(d)} ${dos(d.getHours())}:${dos(d.getMinutes())};Compra de prueba`;
    try {
      await navigator.clipboard.writeText(linea);
      ocultar($('#hoja-ayuda-ap'));
      if (!$('#hoja-pegar').hidden) ocultar($('#hoja-pegar'));
      toast('Compra de prueba copiada: toca la tarjeta 💳 arriba', 3500);
    } catch (err) {
      alerta('No se pudo copiar', linea);
    }
  }

  // ---------- Editor de categorías ----------

  const catEditor = { tipoLista: 'gasto', tipo: 'gasto', id: null, emoji: '🏷️', color: COLORES[0] };
  const esPersonalizada = (tipo, id) => !CATEGORIAS_BASE[tipo].some(b => b.id === id);

  function abrirCategorias() {
    renderListaCategorias();
    $('.hoja-cuerpo', $('#hoja-categorias')).scrollTop = 0;
    mostrar($('#hoja-categorias'));
  }

  function renderListaCategorias() {
    const tipo = catEditor.tipoLista;
    for (const b of $('#cat-tipo').children) b.classList.toggle('activo', b.dataset.tipo === tipo);
    $('#cat-lista').innerHTML = estado.categorias[tipo].map(c =>
      `<button type="button" class="campo fila-nav${c.oculta ? ' cat-oculta' : ''}" data-id="${escapar(c.id)}">`
      + `<span class="campo-cat"><span class="mov-icono" style="background:${c.color}33">${escapar(c.emoji)}</span>${escapar(c.nombre)}</span>`
      + (c.oculta ? '<span class="dato">Oculta</span>' : '')
      + ICONO_CHEVRON
      + '</button>').join('');
  }

  function abrirEditorCategoria(id) {
    const tipo = catEditor.tipoLista;
    const c = id ? estado.categorias[tipo].find(x => x.id === id) : null;
    const usados = new Set(estado.categorias[tipo].map(x => x.color));
    catEditor.tipo = tipo;
    catEditor.id = c ? c.id : null;
    catEditor.emoji = c ? c.emoji : '🏷️';
    catEditor.color = c ? c.color : COLORES.find(x => !usados.has(x)) || COLORES[0];
    $('#ce-titulo').textContent = c ? 'Editar categoría' : 'Nueva categoría';
    $('#ce-nombre').value = c ? c.nombre : '';
    $('#ce-emoji').value = '';
    $('#ce-oculta').checked = !!(c && c.oculta);
    $('#ce-eliminar').hidden = !(c && esPersonalizada(tipo, c.id));
    renderEditorCategoria();
    $('.hoja-cuerpo', $('#hoja-cat-editar')).scrollTop = 0;
    mostrar($('#hoja-cat-editar'));
  }

  function renderVistaCategoria() {
    const icono = $('#ce-icono');
    icono.textContent = catEditor.emoji;
    icono.style.background = `${catEditor.color}33`;
    $('#ce-vista-nombre').textContent = $('#ce-nombre').value.trim() || 'Nueva categoría';
  }

  function renderEditorCategoria() {
    renderVistaCategoria();
    $('#ce-emojis').innerHTML = EMOJIS_SUGERIDOS.map(e =>
      `<button type="button" data-emoji="${e}"${e === catEditor.emoji ? ' class="activo"' : ''}>${e}</button>`).join('');
    $('#ce-colores').innerHTML = COLORES.map(c =>
      `<button type="button" data-color="${c}" style="--c:${c}"${c === catEditor.color ? ' class="activo"' : ''} aria-label="Color ${c}"></button>`).join('');
  }

  async function guardarCategoriaEditada(e) {
    e.preventDefault();
    const { tipo, id } = catEditor;
    const lista = estado.categorias[tipo];
    const nombre = $('#ce-nombre').value.trim().replace(/\s+/g, ' ').slice(0, MAX_NOMBRE_CATEGORIA);
    if (!nombre) {
      toast('Escribe un nombre para la categoría');
      $('#ce-nombre').focus();
      return;
    }
    if (lista.some(c => c.id !== id && normalizarTexto(c.nombre) === normalizarTexto(nombre))) {
      toast('Ya existe una categoría con ese nombre');
      return;
    }
    const oculta = $('#ce-oculta').checked;
    if (oculta && !lista.some(c => c.id !== id && !c.oculta)) {
      toast('Debe quedar al menos una categoría visible');
      return;
    }
    const datos = { nombre, emoji: catEditor.emoji, color: catEditor.color, oculta };
    const respaldo = copiarCategorias(estado.categorias);
    if (id) Object.assign(lista.find(c => c.id === id), datos);
    else insertarCategoria(tipo, { id: `c-${nuevoId().replace(/-/g, '').slice(0, 12)}`, ...datos });
    try {
      await guardarCategorias();
    } catch (err) {
      console.error(err);
      estado.categorias = respaldo;
      alerta('No se pudo guardar', String(err.message || err));
      return;
    }
    if (document.activeElement) document.activeElement.blur();
    ocultar($('#hoja-cat-editar'));
    renderListaCategorias();
    renderTodo();
    toast(id ? 'Categoría actualizada' : 'Categoría creada');
  }

  async function eliminarCategoriaEditada() {
    const { tipo, id } = catEditor;
    if (!id || !esPersonalizada(tipo, id)) return;
    let usos = 0;
    try {
      usos = (await DB.todos()).filter(m => m.tipo === tipo && m.categoria === id).length;
    } catch (err) {
      console.error(err);
      return;
    }
    if (usos) {
      alerta('No se puede eliminar',
        `${usos === 1 ? 'La usa 1 movimiento' : `La usan ${usos} movimientos`}. Puedes ocultarla para que no aparezca al registrar.`);
      return;
    }
    const ok = await confirmar({
      titulo: '¿Eliminar esta categoría?',
      mensaje: 'Ningún movimiento la usa.',
      aceptar: 'Eliminar',
      destructivo: true,
    });
    if (!ok) return;
    estado.categorias[tipo] = estado.categorias[tipo].filter(c => c.id !== id);
    if (!estado.categorias[tipo].some(c => !c.oculta)) estado.categorias[tipo][0].oculta = false;
    try {
      await guardarCategorias();
      if (tipo === 'gasto' && estado.presupuestos[id]) {
        delete estado.presupuestos[id];
        await DB.guardarAjuste('presupuestos', estado.presupuestos);
      }
    } catch (err) {
      console.error(err);
    }
    ocultar($('#hoja-cat-editar'));
    renderListaCategorias();
    renderTodo();
    toast('Categoría eliminada');
  }

  // ---------- Bloqueo con PIN y Face ID ----------
  // No cifra los datos: evita que otra persona vea la app en el iPhone.
  // El PIN se guarda como SHA-256 con sal. Face ID usa WebAuthn: iOS crea una llave de
  // acceso del dispositivo y solo la entrega tras verificar la cara (no hay servidor).

  const ESPERAS = [30000, 60000, 300000, 900000];
  const LARGO_PIN = 4;
  const INTENTOS_ANTES_DE_ESPERAR = 5;
  const seguridad = {
    pinHash: null, sal: null, faceId: false, credId: null, espera: 60000,
    bloqueada: false, ocultoDesde: 0, pausaHasta: 0, disponibleFaceId: false, fallos: 0, hasta: 0,
  };
  const teclado = { valor: '', resolver: null, intervalo: null, sub: '', mostrandoEspera: false };

  const aBase64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const deBase64 = texto => Uint8Array.from(atob(texto), c => c.charCodeAt(0));
  const faceIdListo = () => !!(seguridad.faceId && seguridad.credId && seguridad.disponibleFaceId);
  const enEspera = () => seguridad.hasta > Date.now();

  async function hashPin(pin, sal) {
    const datos = new TextEncoder().encode(`mis-gastos:${sal}:${pin}`);
    return aBase64(await crypto.subtle.digest('SHA-256', datos));
  }

  const pinCorrecto = async pin => !!seguridad.pinHash && (await hashPin(pin, seguridad.sal)) === seguridad.pinHash;

  async function establecerPin(pin) {
    seguridad.sal = aBase64(crypto.getRandomValues(new Uint8Array(16)));
    seguridad.pinHash = await hashPin(pin, seguridad.sal);
  }

  function guardarSeguridad() {
    return DB.guardarAjuste('bloqueo', seguridad.pinHash
      ? { pinHash: seguridad.pinHash, sal: seguridad.sal, faceId: seguridad.faceId, credId: seguridad.credId, espera: seguridad.espera }
      : null);
  }

  function guardarIntentos() {
    return DB.guardarAjuste('bloqueoIntentos', { fallos: seguridad.fallos, hasta: seguridad.hasta }).catch(console.error);
  }

  async function faceIdDisponible() {
    try {
      if (!window.PublicKeyCredential || !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return false;
      return await Promise.race([
        PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(),
        new Promise(r => setTimeout(() => r(false), 1500)),
      ]);
    } catch (err) {
      return false;
    }
  }

  /** Al abrir la app: si hay PIN, se muestra el bloqueo antes que cualquier dato. */
  async function iniciarSeguridad() {
    try {
      const [cfg, intentos] = await Promise.all([DB.leerAjuste('bloqueo'), DB.leerAjuste('bloqueoIntentos')]);
      if (cfg && cfg.pinHash && cfg.sal) {
        seguridad.pinHash = cfg.pinHash;
        seguridad.sal = cfg.sal;
        seguridad.faceId = !!cfg.faceId;
        seguridad.credId = cfg.credId || null;
        seguridad.espera = ESPERAS.includes(cfg.espera) ? cfg.espera : 60000;
      }
      if (intentos) {
        seguridad.fallos = Number(intentos.fallos) || 0;
        seguridad.hasta = Number(intentos.hasta) || 0;
      }
      if (seguridad.pinHash) seguridad.disponibleFaceId = await faceIdDisponible();
    } catch (err) {
      console.error(err);
    }
    if (seguridad.pinHash) bloquear();
    document.documentElement.classList.remove('verificando');
    if (!seguridad.pinHash) {
      faceIdDisponible().then(v => { seguridad.disponibleFaceId = v; renderAjustesBloqueo(); });
    }
    renderAjustesBloqueo();
  }

  function pintarPuntos() {
    [...$('#bloqueo-puntos').children].forEach((p, i) => p.classList.toggle('lleno', i < teclado.valor.length));
  }

  function actualizarEspera() {
    const esperando = enEspera();
    $('#teclado').classList.toggle('en-espera', esperando);
    const sub = $('#bloqueo-sub');
    if (esperando) {
      sub.textContent = `Demasiados intentos. Espera ${Math.ceil((seguridad.hasta - Date.now()) / 1000)} s`;
      sub.classList.add('error');
      teclado.mostrandoEspera = true;
    } else if (teclado.mostrandoEspera) {
      teclado.mostrandoEspera = false;
      sub.textContent = teclado.sub; // al terminar la espera vuelve el texto normal, sin el error
      sub.classList.remove('error');
    }
  }

  /**
   * Muestra el teclado y devuelve el PIN escrito, { faceId: true } o null si se cancela.
   * sub: texto bajo el título (p. ej. el error); base: el texto normal a mostrar tras una espera.
   */
  function leerPin({ titulo, sub, base = sub, error = false, cancelable = false, faceId = false, olvide = false }) {
    $('#bloqueo-titulo').textContent = titulo;
    const subEl = $('#bloqueo-sub');
    teclado.sub = base;
    subEl.textContent = sub;
    subEl.classList.toggle('error', error);
    $('#bloqueo-cancelar').hidden = !cancelable;
    $('#bloqueo-olvide').hidden = !olvide;
    $('#bloqueo-faceid').style.visibility = faceId ? 'visible' : 'hidden';
    teclado.valor = '';
    pintarPuntos();
    if (error) {
      const puntos = $('#bloqueo-puntos');
      puntos.classList.remove('error');
      void puntos.offsetWidth;
      puntos.classList.add('error');
    }
    const el = $('#bloqueo');
    if (el.hidden || !el.classList.contains('abierta')) mostrar(el);
    clearInterval(teclado.intervalo);
    teclado.mostrandoEspera = false;
    actualizarEspera();
    teclado.intervalo = setInterval(actualizarEspera, 500);
    return new Promise(resolve => { teclado.resolver = resolve; });
  }

  function responderTeclado(valor) {
    const r = teclado.resolver;
    teclado.resolver = null;
    if (r) r(valor);
  }

  function cerrarTeclado() {
    if (seguridad.bloqueada) return; // la pantalla de bloqueo no se cierra sin desbloquear
    clearInterval(teclado.intervalo);
    responderTeclado(null);
    teclado.valor = '';
    ocultar($('#bloqueo'));
  }

  function pulsarDigito(d) {
    if (!teclado.resolver || enEspera() || teclado.valor.length >= LARGO_PIN) return;
    teclado.valor += d;
    pintarPuntos();
    if (teclado.valor.length === LARGO_PIN) {
      const valor = teclado.valor;
      setTimeout(() => responderTeclado(valor), 120); // deja ver el último punto
    }
  }

  function borrarDigito() {
    if (!teclado.resolver) return;
    teclado.valor = teclado.valor.slice(0, -1);
    pintarPuntos();
  }

  function verificarFaceId() {
    try {
      return navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: 'public-key', id: deBase64(seguridad.credId), transports: ['internal'] }],
          userVerification: 'required',
          timeout: 60000,
        },
      }).then(c => !!c).catch(err => { console.warn(err); return false; });
    } catch (err) {
      return Promise.resolve(false);
    }
  }

  function pulsarFaceId() {
    if (!teclado.resolver || !faceIdListo()) return;
    // Safari exige que WebAuthn se llame directamente en el toque, sin esperas antes
    verificarFaceId().then(ok => {
      if (ok) {
        responderTeclado({ faceId: true });
        return;
      }
      const sub = $('#bloqueo-sub');
      sub.textContent = 'No se pudo verificar. Usa tu PIN';
      sub.classList.add('error');
    });
  }

  async function registrarFallo() {
    seguridad.fallos++;
    if (seguridad.fallos >= INTENTOS_ANTES_DE_ESPERAR) {
      // 30 s, 60 s, 90 s… cuanto más se insiste
      seguridad.hasta = Date.now() + 30000 * (seguridad.fallos - INTENTOS_ANTES_DE_ESPERAR + 1);
    }
    await guardarIntentos();
    return 'PIN incorrecto';
  }

  async function bloquear() {
    if (seguridad.bloqueada || !seguridad.pinHash) return;
    seguridad.bloqueada = true;
    responderTeclado(null); // cancela cualquier otro uso del teclado (p. ej. cambiar PIN)
    if (document.activeElement) document.activeElement.blur();
    let aviso = '';
    for (;;) {
      const r = await leerPin({
        titulo: 'Mis Gastos', sub: aviso || 'Ingresa tu PIN', base: 'Ingresa tu PIN', error: !!aviso, faceId: faceIdListo(), olvide: true,
      });
      if (r && r.faceId) break;
      if (typeof r !== 'string') continue;
      if (await pinCorrecto(r)) break;
      aviso = await registrarFallo();
    }
    seguridad.bloqueada = false;
    seguridad.fallos = 0;
    seguridad.hasta = 0;
    guardarIntentos();
    cerrarTeclado();
  }

  /** Pide PIN (o Face ID) antes de un cambio de seguridad. Deja el teclado abierto si acierta. */
  async function verificarIdentidad(titulo) {
    let aviso = '';
    for (;;) {
      const r = await leerPin({
        titulo, sub: aviso || 'Ingresa tu PIN actual', base: 'Ingresa tu PIN actual', error: !!aviso, cancelable: true, faceId: faceIdListo(),
      });
      if (r === null) return false;
      if (r.faceId || (typeof r === 'string' && await pinCorrecto(r))) {
        seguridad.fallos = 0;
        seguridad.hasta = 0;
        guardarIntentos();
        return true;
      }
      aviso = await registrarFallo();
    }
  }

  /** Pide un PIN nuevo dos veces. Devuelve el PIN o null si se cancela. */
  async function crearPin() {
    let aviso = '';
    for (;;) {
      const p1 = await leerPin({ titulo: 'Crea un PIN', sub: aviso || `Elige ${LARGO_PIN} números que recuerdes`, error: !!aviso, cancelable: true });
      if (p1 === null) return null;
      const p2 = await leerPin({ titulo: 'Repite el PIN', sub: 'Escríbelo otra vez para confirmar', cancelable: true });
      if (p2 === null) return null;
      if (p1 === p2) return p1;
      aviso = 'Los PIN no coinciden. Empieza de nuevo';
    }
  }

  async function activarBloqueo() {
    if (!(window.crypto && crypto.subtle)) {
      alerta('No disponible', 'El bloqueo necesita abrir la app desde su dirección https.');
      renderAjustesBloqueo();
      return;
    }
    const pin = await crearPin();
    if (!pin) {
      cerrarTeclado();
      renderAjustesBloqueo();
      return;
    }
    try {
      await establecerPin(pin);
      seguridad.faceId = false;
      seguridad.credId = null;
      seguridad.fallos = 0;
      seguridad.hasta = 0;
      await guardarSeguridad();
      guardarIntentos();
    } catch (err) {
      console.error(err);
      seguridad.pinHash = null;
      alerta('No se pudo activar el bloqueo', String(err.message || err));
    }
    cerrarTeclado();
    renderAjustesBloqueo();
    if (seguridad.pinHash) toast(seguridad.disponibleFaceId ? 'Bloqueo activado. Puedes activar Face ID abajo' : 'Bloqueo activado', 3200);
  }

  async function desactivarBloqueo() {
    const ok = await verificarIdentidad('Desactivar bloqueo');
    if (!ok) {
      cerrarTeclado();
      renderAjustesBloqueo();
      return;
    }
    Object.assign(seguridad, { pinHash: null, sal: null, faceId: false, credId: null });
    await guardarSeguridad().catch(console.error);
    cerrarTeclado();
    renderAjustesBloqueo();
    toast('Bloqueo desactivado');
  }

  async function cambiarPin() {
    if (!(await verificarIdentidad('Cambiar PIN'))) {
      cerrarTeclado();
      return;
    }
    const pin = await crearPin();
    if (pin) {
      await establecerPin(pin);
      await guardarSeguridad().catch(console.error);
      toast('PIN cambiado');
    }
    cerrarTeclado();
  }

  function activarFaceId(input) {
    let promesa;
    try {
      // Se llama directo en el toque del interruptor (Safari lo exige)
      promesa = navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'Mis Gastos' },
          user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'Mis Gastos', displayName: 'Mis Gastos' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
          timeout: 60000,
          attestation: 'none',
        },
      });
    } catch (err) {
      promesa = Promise.reject(err);
    }
    promesa.then(async cred => {
      seguridad.credId = aBase64(cred.rawId);
      seguridad.faceId = true;
      await guardarSeguridad();
      renderAjustesBloqueo();
      toast('Face ID activado');
    }).catch(err => {
      console.warn(err);
      input.checked = false;
      if (err && err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
        alerta('No se pudo activar Face ID', 'Revisa que Face ID esté configurado en el iPhone e inténtalo otra vez.');
      }
    });
  }

  async function desactivarFaceId() {
    seguridad.faceId = false;
    seguridad.credId = null;
    await guardarSeguridad().catch(console.error);
    renderAjustesBloqueo();
    toast('Face ID desactivado');
  }

  function renderAjustesBloqueo() {
    const activo = !!seguridad.pinHash;
    $('#bl-activo').checked = activo;
    $('#bl-fila-faceid').hidden = !activo || !seguridad.disponibleFaceId;
    $('#bl-faceid').checked = faceIdListo();
    $('#bl-opciones').hidden = !activo;
    for (const b of $('#bl-espera').children) b.classList.toggle('activo', Number(b.dataset.ms) === seguridad.espera);
    $('#aj-bloqueo-estado').textContent = !activo ? 'Desactivado' : faceIdListo() ? 'Face ID y PIN' : 'PIN';
  }

  /** Oculta los datos al salir de la app y pide el PIN al volver si pasó el tiempo elegido. */
  function alCambiarVisibilidadSeguridad() {
    if (!seguridad.pinHash) return;
    const html = document.documentElement;
    if (document.visibilityState === 'hidden') {
      seguridad.ocultoDesde = Date.now();
      html.classList.add('privado');
      return;
    }
    const ahoraMs = Date.now();
    // Elegir fotos o compartir un archivo también saca a la app del primer plano: no se bloquea por eso
    const pausado = ahoraMs < seguridad.pausaHasta;
    seguridad.pausaHasta = 0;
    if (!pausado && seguridad.ocultoDesde && ahoraMs - seguridad.ocultoDesde >= seguridad.espera) bloquear();
    html.classList.remove('privado');
  }

  // ---------- Recordatorio de respaldo ----------

  async function revisarRecordatorio() {
    const aviso = $('#aviso-respaldo');
    try {
      const total = await DB.contar();
      const ultimo = await DB.leerAjuste('ultimoRespaldo');
      const pospuesto = await DB.leerAjuste('recordatorioPospuesto');
      const ahoraMs = Date.now();
      const dias = ultimo ? Math.floor((ahoraMs - ultimo) / 864e5) : null;
      const toca = total >= MIN_MOVS_RECORDATORIO
        && (dias === null || dias >= DIAS_RECORDATORIO)
        && !(pospuesto && ahoraMs < pospuesto);
      aviso.hidden = !toca;
      if (toca) {
        $('#aviso-respaldo-texto').textContent = dias === null
          ? `Aún no guardas una copia de tus ${total} movimientos.`
          : `Tu último respaldo fue hace ${plural(dias, 'día', 'días')}.`;
      }
    } catch (err) {
      console.error(err);
    }
  }

  // ---------- Respaldo y exportación ----------

  async function abrirAjustes() {
    reiniciarExportacion();
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

  function reiniciarExportacion() {
    exportacion.archivo = null;
    exportacion.tipo = null;
    $('#aj-botones-exportar').hidden = false;
    $('#aj-compartir').hidden = true;
    $('#aj-estado').hidden = true;
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

  const ordenAscendente = (a, b) => a.fecha.localeCompare(b.fecha) || (a.creado || 0) - (b.creado || 0);

  async function crearRespaldo() {
    const movs = (await DB.todos()).sort(ordenAscendente);
    const porMov = new Map();
    for (const im of await DB.todasLasImagenes()) {
      if (!porMov.has(im.movId)) porMov.set(im.movId, []);
      porMov.get(im.movId).push(im);
    }
    const salida = [];
    for (const m of movs) {
      const { numFotos, tieneFoto, ...resto } = m;
      const imagenes = (porMov.get(m.id) || []).sort((a, b) => a.orden - b.orden);
      resto.fotos = [];
      for (const im of imagenes) {
        resto.fotos.push(await blobADataURL(new Blob([im.datos], { type: im.tipo || 'image/jpeg' })));
      }
      salida.push(resto);
    }
    const json = JSON.stringify({
      app: 'mis-gastos',
      formato: 3,
      exportado: new Date().toISOString(),
      nota: 'Montos en centavos de USD. Fotos en base64 (data URL). "categoria" es el id de la categoría.',
      categorias: estado.categorias,
      presupuestos: estado.presupuestos,
      movimientos: salida,
    });
    return {
      archivo: new File([json], `mis-gastos-respaldo-${hoyISO()}.json`, { type: 'application/json' }),
      cantidad: salida.length,
    };
  }

  async function crearCSV() {
    const movs = (await DB.todos()).sort(ordenAscendente);
    const campo = valor => {
      let s = String(valor);
      if (/^[=+\-@]/.test(s) && Number.isNaN(Number(s.replace(',', '.')))) s = `'${s}`; // evita fórmulas en Excel
      return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const filas = [['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto (USD)', 'Fotos'].join(';')];
    for (const m of movs) {
      filas.push([
        m.fecha,
        m.tipo === 'gasto' ? 'Gasto' : 'Ingreso',
        nombreCategoria(m.tipo, m.categoria),
        m.descripcion || '',
        (m.tipo === 'gasto' ? '-' : '') + centavosATexto(m.centavos),
        cuantasFotos(m),
      ].map(campo).join(';'));
    }
    // BOM para que Excel reconozca las tildes
    const contenido = `﻿${filas.join('\r\n')}\r\n`;
    return {
      archivo: new File([contenido], `mis-gastos-${hoyISO()}.csv`, { type: 'text/csv' }),
      cantidad: movs.length,
    };
  }

  async function prepararExportacion(tipo) {
    const btn = tipo === 'json' ? $('#aj-exportar') : $('#aj-csv');
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Preparando…';
    try {
      const { archivo, cantidad } = tipo === 'json' ? await crearRespaldo() : await crearCSV();
      if (!cantidad) {
        alerta('Nada que exportar', 'Todavía no tienes movimientos registrados.');
        return;
      }
      exportacion.archivo = archivo;
      exportacion.tipo = tipo;
      $('#aj-botones-exportar').hidden = true;
      const compartir = $('#aj-compartir');
      compartir.textContent = tipo === 'json' ? 'Guardar respaldo…' : 'Guardar CSV…';
      compartir.hidden = false;
      const estadoEl = $('#aj-estado');
      estadoEl.textContent = tipo === 'json'
        ? `Respaldo listo: ${plural(cantidad, 'movimiento', 'movimientos')} (${tamanoLegible(archivo.size)}). `
          + 'Toca “Guardar respaldo” y elige “Guardar en Archivos” para dejarlo en iCloud Drive o en el iPhone.'
        : `CSV listo: ${plural(cantidad, 'movimiento', 'movimientos')}. Ábrelo con Excel, Numbers o Google Sheets. `
          + 'Ojo: el CSV no incluye fotos y no sirve para restaurar.';
      estadoEl.hidden = false;
    } catch (err) {
      console.error(err);
      alerta('No se pudo exportar', String(err.message || err));
    } finally {
      btn.disabled = false;
      btn.textContent = textoOriginal;
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

  async function compartirExportacion() {
    const archivo = exportacion.archivo;
    if (!archivo) return;
    const datos = { files: [archivo] }; // sin title/text: iOS crearía un .txt extra
    try {
      if (navigator.canShare && navigator.canShare(datos)) {
        await navigator.share(datos);
      } else {
        descargar(archivo);
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return; // el usuario cerró la hoja de compartir
      console.error(err);
      descargar(archivo);
    }
    if (exportacion.tipo === 'json') {
      await DB.guardarAjuste('ultimoRespaldo', Date.now()).catch(console.error);
      $('#aj-ultimo').textContent = fmtFechaHora.format(new Date());
      toast('Respaldo exportado');
      revisarRecordatorio();
    } else {
      toast('CSV exportado');
    }
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

    // Formato 2: "fotos" (lista). Formato 1: "foto" (una sola).
    const origen = Array.isArray(x.fotos) ? x.fotos : typeof x.foto === 'string' ? [x.foto] : [];
    const fotos = [];
    for (const u of origen) {
      if (typeof u !== 'string' || !u.startsWith('data:image/')) continue;
      try { fotos.push(dataURLAFoto(u)); } catch (err) { /* foto dañada: se omite */ }
    }
    return {
      mov: { id, tipo, centavos, categoria, descripcion, fecha, numFotos: fotos.length, creado, actualizado },
      fotos,
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
      alerta('Archivo no válido', 'Elige un archivo de respaldo .json creado por Mis Gastos (el CSV no se puede importar).');
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

    // Presupuestos del respaldo: solo si aquí no hay ninguno configurado
    const presupuestosArchivo = datos && typeof datos.presupuestos === 'object' && datos.presupuestos;
    const importarPresupuestos = presupuestosArchivo && !Object.keys(estado.presupuestos).length
      && Object.keys(presupuestosArchivo).length > 0;

    const ok = await confirmar({
      titulo: 'Importar respaldo',
      mensaje: `El archivo tiene ${plural(items.length, 'movimiento', 'movimientos')}. Los que ya existen en el iPhone no se duplicarán.`,
      aceptar: 'Importar',
    });
    if (!ok) return;

    try {
      const r = await DB.importar(items);
      // Categorías del respaldo (formato 3): si aquí nunca se personalizaron, se adoptan tal cual
      // (útil al restaurar en un iPhone nuevo); si no, solo se agregan las que falten.
      const catArchivo = datos && datos.categorias;
      if (catArchivo && typeof catArchivo === 'object') {
        if ((await DB.leerAjuste('categorias')) === undefined) {
          estado.categorias = normalizarCategorias(catArchivo);
          await guardarCategorias();
        } else if (fusionarCategorias(catArchivo)) {
          await guardarCategorias();
        }
      }
      if (importarPresupuestos) {
        const limpios = {};
        for (const [k, v] of Object.entries(presupuestosArchivo)) {
          const c = Math.round(Number(v));
          if (estado.categorias.gasto.some(cat => cat.id === k) && c > 0 && c <= MAX_CENTAVOS) limpios[k] = c;
        }
        await DB.guardarAjuste('presupuestos', limpios);
        estado.presupuestos = limpios;
      }
      await alerta('Importación completa',
        `Nuevos: ${r.nuevos}\nActualizados: ${r.actualizados}\nYa existían: ${r.omitidos}`);
      $('#aj-total').textContent = String(await DB.contar());
      cargarMes();
      revisarRecordatorio();
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

    // Deslizar a la izquierda/derecha para cambiar de mes
    let toque = null;
    contenido.addEventListener('touchstart', e => {
      toque = e.touches.length === 1 && !e.target.closest('input')
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }
        : null;
    }, { passive: true });
    contenido.addEventListener('touchend', e => {
      if (!toque) return;
      const dx = e.changedTouches[0].clientX - toque.x;
      const dy = e.changedTouches[0].clientY - toque.y;
      const rapido = Date.now() - toque.t < 700;
      toque = null;
      if (rapido && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) cambiarMes(dx < 0 ? 1 : -1);
    }, { passive: true });

    $('#lista').addEventListener('click', e => {
      const b = e.target.closest('.mov');
      if (!b) return;
      const mov = estado.listaMostrada.find(m => m.id === b.dataset.id);
      if (mov) abrirFormulario(mov);
    });

    // Búsqueda y filtros
    let temporizadorBusqueda;
    $('#buscar').addEventListener('input', e => {
      estado.busqueda = e.target.value;
      if (!estado.busqueda.trim()) estado.busquedaGlobal = false;
      actualizarControlesBusqueda();
      clearTimeout(temporizadorBusqueda);
      temporizadorBusqueda = setTimeout(renderLista, 150);
    });
    $('#buscar').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    });
    $('#buscar-limpiar').addEventListener('click', () => {
      $('#buscar').value = '';
      estado.busqueda = '';
      estado.busquedaGlobal = false;
      actualizarControlesBusqueda();
      renderLista();
    });
    $('#buscar-global').addEventListener('click', () => {
      estado.busquedaGlobal = !estado.busquedaGlobal;
      actualizarControlesBusqueda();
      renderLista();
    });
    $('#filtro-tipo').addEventListener('click', e => {
      const b = e.target.closest('button[data-filtro]');
      if (!b) return;
      estado.filtroTipo = b.dataset.filtro;
      actualizarControlesBusqueda();
      renderLista();
    });

    // Estadísticas: presupuestos y barras de meses
    $('#grafico').addEventListener('click', e => {
      if (e.target.closest('[data-accion="presupuestos"]')) {
        abrirPresupuestos();
        return;
      }
      const g = e.target.closest('[data-mes]');
      if (g) {
        const anio = Number(g.dataset.anio);
        const mes = Number(g.dataset.mes);
        if (anio !== estado.anio || mes !== estado.mes) {
          estado.animacion = 'desde-izq';
          irAMes(anio, mes);
        }
      }
    });
    $('#resumen-presupuesto').addEventListener('click', () => {
      cambiarVista('categorias');
      requestAnimationFrame(() => {
        const t = $('#grafico .grafico-tarjeta');
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // Aviso de respaldo
    $('#aviso-respaldo-ir').addEventListener('click', abrirAjustes);
    $('#aviso-respaldo-cerrar').addEventListener('click', async () => {
      $('#aviso-respaldo').hidden = true;
      await DB.guardarAjuste('recordatorioPospuesto', Date.now() + DIAS_POSPONER * 864e5).catch(console.error);
    });

    // Formulario
    const hojaForm = $('#hoja-form');
    hojaForm.addEventListener('click', e => { if (e.target.closest('[data-cerrar]')) pedirCerrarFormulario(); });
    habilitarArrastre(hojaForm, pedirCerrarFormulario);
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
    const soloCerrarTeclado = e => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        e.preventDefault();
        e.target.blur();
      }
    };
    $('#form-mov').addEventListener('keydown', soloCerrarTeclado);
    $('#f-camara').addEventListener('change', alElegirFotos);
    $('#f-galeria').addEventListener('change', alElegirFotos);
    $('#f-fotos').addEventListener('click', e => {
      const borrar = e.target.closest('.foto-borrar');
      if (borrar) {
        quitarFoto(Number(borrar.dataset.i));
        return;
      }
      const ver = e.target.closest('.foto-ver');
      if (ver) abrirVisor(form.fotos.map(f => f.url), Number(ver.dataset.i));
    });
    $('#f-duplicar').addEventListener('click', duplicarActual);
    $('#f-eliminar').addEventListener('click', eliminarActual);
    $('#deshacer-btn').addEventListener('click', deshacerEliminar);

    // Presupuestos
    const hojaPres = $('#hoja-presupuestos');
    const cerrarPres = () => {
      if (document.activeElement) document.activeElement.blur();
      ocultar(hojaPres);
    };
    hojaPres.addEventListener('click', e => { if (e.target.closest('[data-cerrar]')) cerrarPres(); });
    habilitarArrastre(hojaPres, cerrarPres);
    $('#form-presupuestos').addEventListener('submit', guardarPresupuestos);
    $('#form-presupuestos').addEventListener('keydown', soloCerrarTeclado);
    $('#lista-presupuestos').addEventListener('input', actualizarTotalPresupuestos);

    // Respaldo
    const hojaAjustes = $('#hoja-ajustes');
    const cerrarAjustes = () => ocultar(hojaAjustes, reiniciarExportacion);
    hojaAjustes.addEventListener('click', e => { if (e.target.closest('[data-cerrar]')) cerrarAjustes(); });
    habilitarArrastre(hojaAjustes, cerrarAjustes);
    $('#aj-exportar').addEventListener('click', () => prepararExportacion('json'));
    $('#aj-csv').addEventListener('click', () => prepararExportacion('csv'));
    $('#aj-compartir').addEventListener('click', compartirExportacion);
    $('#aj-importar').addEventListener('change', importarArchivo);
    $('#aj-categorias').addEventListener('click', abrirCategorias);
    $('#aj-bloqueo').addEventListener('click', () => {
      renderAjustesBloqueo();
      mostrar($('#hoja-bloqueo'));
    });

    // Categorías
    const hojaCat = $('#hoja-categorias');
    hojaCat.addEventListener('click', e => { if (e.target.closest('[data-cerrar]')) ocultar(hojaCat); });
    habilitarArrastre(hojaCat, () => ocultar(hojaCat));
    $('#cat-tipo').addEventListener('click', e => {
      const b = e.target.closest('button[data-tipo]');
      if (!b) return;
      catEditor.tipoLista = b.dataset.tipo;
      renderListaCategorias();
    });
    $('#cat-lista').addEventListener('click', e => {
      const fila = e.target.closest('[data-id]');
      if (fila) abrirEditorCategoria(fila.dataset.id);
    });
    $('#cat-nueva').addEventListener('click', () => abrirEditorCategoria(null));

    const hojaCE = $('#hoja-cat-editar');
    const cerrarCE = () => {
      if (document.activeElement) document.activeElement.blur();
      ocultar(hojaCE);
    };
    hojaCE.addEventListener('click', e => { if (e.target.closest('[data-cerrar]')) cerrarCE(); });
    habilitarArrastre(hojaCE, cerrarCE);
    $('#form-categoria').addEventListener('submit', guardarCategoriaEditada);
    $('#form-categoria').addEventListener('keydown', soloCerrarTeclado);
    $('#ce-nombre').addEventListener('input', renderVistaCategoria);
    $('#ce-emoji').addEventListener('input', e => {
      const g = primerGrafema(e.target.value);
      if (!g) return;
      catEditor.emoji = g;
      e.target.value = '';
      e.target.blur();
      renderEditorCategoria();
    });
    $('#ce-emojis').addEventListener('click', e => {
      const b = e.target.closest('[data-emoji]');
      if (!b) return;
      catEditor.emoji = b.dataset.emoji;
      renderEditorCategoria();
    });
    $('#ce-colores').addEventListener('click', e => {
      const b = e.target.closest('[data-color]');
      if (!b) return;
      catEditor.color = b.dataset.color;
      renderEditorCategoria();
    });
    $('#ce-eliminar').addEventListener('click', eliminarCategoriaEditada);

    // Bloqueo
    const hojaBl = $('#hoja-bloqueo');
    hojaBl.addEventListener('click', e => { if (e.target.closest('[data-cerrar]')) ocultar(hojaBl); });
    habilitarArrastre(hojaBl, () => ocultar(hojaBl));
    $('#bl-activo').addEventListener('change', e => {
      if (e.target.checked) activarBloqueo(); else desactivarBloqueo();
    });
    $('#bl-faceid').addEventListener('change', e => {
      if (e.target.checked) activarFaceId(e.target); else desactivarFaceId();
    });
    $('#bl-espera').addEventListener('click', e => {
      const b = e.target.closest('button[data-ms]');
      if (!b) return;
      seguridad.espera = Number(b.dataset.ms);
      guardarSeguridad().catch(console.error);
      renderAjustesBloqueo();
    });
    $('#bl-cambiar').addEventListener('click', cambiarPin);
    $('#teclado').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.d) pulsarDigito(b.dataset.d);
      else if (b.id === 'bloqueo-borrar') borrarDigito();
      else if (b.id === 'bloqueo-faceid') pulsarFaceId();
    });
    $('#bloqueo-cancelar').addEventListener('click', () => responderTeclado(null));
    $('#bloqueo-olvide').addEventListener('click', () => alerta('¿Olvidaste el PIN?', faceIdListo()
      ? 'Entra con Face ID y luego cambia el PIN en Ajustes → Bloqueo.'
      : 'Por seguridad no se puede recuperar. La única opción es borrar Mis Gastos de la pantalla de inicio, volver a instalarla y restaurar tu último respaldo.'));
    document.addEventListener('keydown', e => {
      if ($('#bloqueo').hidden || !teclado.resolver) return;
      if (/^\d$/.test(e.key)) pulsarDigito(e.key);
      else if (e.key === 'Backspace') borrarDigito();
    });
    // Elegir fotos, importar o compartir saca a la app del primer plano: no debe bloquearla
    document.addEventListener('click', e => {
      const etiqueta = e.target.closest('label');
      if ((etiqueta && etiqueta.querySelector('input[type="file"]')) || e.target.closest('#aj-compartir')) {
        seguridad.pausaHasta = Date.now() + 10 * 60000;
      }
    }, true);
    document.addEventListener('visibilitychange', alCambiarVisibilidadSeguridad);

    // Apple Pay
    $('#btn-applepay').addEventListener('click', pegarCompraApplePay);
    const hojaAP = $('#hoja-applepay');
    hojaAP.addEventListener('click', e => { if (e.target.closest('[data-cerrar]')) cerrarApplePay(); });
    habilitarArrastre(hojaAP, cerrarApplePay);
    $('#ap-categorias').addEventListener('click', e => {
      const b = e.target.closest('.cat-chip');
      if (b) clasificarCompra(b.dataset.cat);
    });
    $('#ap-editar').addEventListener('click', editarCompraApplePay);
    $('#ap-omitir').addEventListener('click', omitirCompra);

    const hojaPegar = $('#hoja-pegar');
    const cerrarPegar = () => {
      if (document.activeElement) document.activeElement.blur();
      ocultar(hojaPegar);
    };
    hojaPegar.addEventListener('click', e => { if (e.target.closest('[data-cerrar]')) cerrarPegar(); });
    habilitarArrastre(hojaPegar, cerrarPegar);
    $('#pegar-procesar').addEventListener('click', () => {
      if (document.activeElement) document.activeElement.blur();
      procesarTextoApplePay($('#pegar-texto').value);
    });
    $('#pegar-ayuda').addEventListener('click', () => mostrar($('#hoja-ayuda-ap')));

    const hojaAyuda = $('#hoja-ayuda-ap');
    hojaAyuda.addEventListener('click', e => { if (e.target.closest('[data-cerrar]')) ocultar(hojaAyuda); });
    habilitarArrastre(hojaAyuda, () => ocultar(hojaAyuda));
    $('#ayuda-prueba').addEventListener('click', copiarCompraPrueba);

    // Visor
    const carrusel = $('#visor-carrusel');
    carrusel.addEventListener('scroll', actualizarContadorVisor, { passive: true });
    carrusel.addEventListener('touchstart', alTocarVisor, { passive: false });
    carrusel.addEventListener('touchmove', alMoverVisor, { passive: false });
    carrusel.addEventListener('touchend', alSoltarVisor, { passive: false });
    carrusel.addEventListener('touchcancel', () => { zoom.gesto = null; limitarZoom(); aplicarZoom(true); });
    // Tocar fuera de la foto (sin zoom) cierra el visor
    carrusel.addEventListener('click', e => {
      if (!e.target.closest('.visor-slide img') && !$('#visor').classList.contains('zoom')) cerrarVisor();
    });
    // Doble clic con mouse (en el iPhone se usa el doble toque de arriba)
    carrusel.addEventListener('dblclick', e => {
      if (Date.now() - zoom.ultimoTouchMs < 1000) return;
      const img = e.target.closest('.visor-slide img');
      if (!img) return;
      usarImagen(img);
      dobleToque(e.clientX, e.clientY);
    });
    // Evita el zoom de toda la página de Safari mientras se pellizca la foto
    for (const tipo of ['gesturestart', 'gesturechange']) $('#visor').addEventListener(tipo, e => e.preventDefault());
    $('#visor-cerrar').addEventListener('click', cerrarVisor);

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
      revisarRecordatorio();
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
  iniciarSeguridad();
  cambiarVista('lista');
  actualizarControlesBusqueda();
  renderEncabezado();
  Promise.all([DB.leerAjuste('presupuestos'), DB.leerAjuste('categorias')])
    .then(([p, c]) => {
      estado.presupuestos = p && typeof p === 'object' ? p : {};
      estado.categorias = normalizarCategorias(c);
    })
    .catch(console.error)
    .finally(() => {
      cargarMes();
      revisarRecordatorio();
    });
  registrarServiceWorker();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
