# Mis Gastos — reglas del proyecto

PWA personal de registro de gastos e ingresos. La usa una sola persona en un iPhone 14 Pro Max,
instalada desde Safari con "Agregar a pantalla de inicio". Se aloja en GitHub Pages en una
subcarpeta: `https://usuario.github.io/mis-gastos/`. No se publica en la App Store.

## Reglas obligatorias

1. **Cero dependencias externas.** Solo HTML, CSS y JavaScript puro. Nada de frameworks,
   librerías, CDN, fuentes web, analíticas ni ningún recurso que venga de internet.
   Todo archivo que use la app debe estar dentro de esta carpeta.
2. **Debe funcionar 100 % sin conexión** después de la primera apertura.
   - Todo archivo nuevo que use la app se agrega a la lista `ARCHIVOS` de `sw.js`.
   - Estrategia cache-first; no introducir peticiones de red necesarias para funcionar.
3. **Subir la versión del caché en cada cambio.** Cada vez que se modifique CUALQUIER archivo
   (HTML, CSS, JS, manifest, íconos), incrementar `CACHE` en `sw.js`:
   `mis-gastos-v1` → `mis-gastos-v2` → … Sin esto, el iPhone seguirá mostrando la versión vieja.
   El prefijo `mis-gastos-` debe mantenerse (la limpieza de cachés viejas solo borra ese prefijo,
   porque el origen `usuario.github.io` es compartido con otros proyectos).
4. **Rutas relativas siempre** (`./`, `css/…`, `js/…`, `icons/…`). Nunca rutas que empiecen con `/`.
5. **Datos solo en IndexedDB** (base `mis-gastos`), incluidas las fotos. No usar localStorage.
   Si se cambia la estructura, subir `VERSION` en `js/db.js` y migrar en `onupgradeneeded`
   sin perder datos existentes.
6. **Interfaz en español**, moneda USD con formato `es-EC`.
7. **Diseño para iPhone:** tema oscuro estilo iOS, respetar `env(safe-area-inset-*)`,
   inputs con `font-size` mínimo de 16px (evita el zoom de Safari).

## Estructura

- `index.html` — marcado, metas de Apple, manifest, hojas modales.
- `css/styles.css` — estilos (variables de color en `:root`).
- `js/db.js` — capa IndexedDB (`movimientos`, `imagenes`, `ajustes`).
- `js/app.js` — interfaz, formulario, gráfico SVG, compresión de fotos, respaldo.
- `sw.js` — service worker (cache-first, caché versionado).
- `manifest.json` — PWA standalone.
- `icons/` — `icon-180.png` (apple-touch-icon), `icon-512.png`, `splash-1290x2796.png`.

## Modelo de datos (IndexedDB versión 2)

- Movimiento: `{ id, tipo: 'gasto'|'ingreso', centavos (entero), categoria, descripcion,
  fecha 'AAAA-MM-DD', numFotos, creado (ms), actualizado (ms) }`.
  Los montos se guardan en **centavos enteros** para evitar errores de redondeo.
- Fotos: store `imagenes` con `{ id, movId, orden, tipo, datos: ArrayBuffer }` (índice `movId`),
  hasta 10 por movimiento, JPEG de máx. 1200 px de lado y calidad 0.7.
- Ajustes (store `ajustes`, `{ clave, valor }`): `presupuestos` (`{ categoria: centavos }`),
  `ultimoRespaldo` (ms), `recordatorioPospuesto` (ms), `applePayOmitidos` (ids omitidos, máx. 300).
- La v1 tenía una sola foto (store `fotos`, campo `tieneFoto`); `migrar()` en `js/db.js` la
  convierte a v2. **Nunca borrar esa migración**: puede haber datos v1 en el iPhone.
- Respaldo JSON: `{ app: 'mis-gastos', formato: 2, exportado, presupuestos, movimientos: [...] }`,
  cada movimiento con `fotos: [dataURL base64, ...]`. La importación también acepta el formato 1
  (`foto`: una data URL o `null`). Se deduplica por `id` (solo se reemplaza si el del archivo
  tiene `actualizado` más reciente).
- CSV (solo lectura en Excel/Numbers): separador `;`, decimales con coma, con BOM UTF-8.

## Funciones principales

Vista por mes (deslizar o flechas), búsqueda y filtro por tipo (en el mes o en todos los meses),
estadísticas (promedio diario, proyección, mayor gasto, tasa de ahorro, dona por categoría,
barras de 6 meses), presupuestos por categoría con aviso al superarlos, varias fotos por
movimiento con visor en carrusel, duplicar movimiento, recordatorio de respaldo (7 días),
exportar JSON/CSV con la hoja de compartir de iOS e importar respaldo.

## Compras de Apple Pay

Una web app no puede leer los pagos de Wallet. La persona usuaria crea en la app **Atajos** una
automatización "Transacción" que copia al portapapeles una línea por compra:
`MISGASTOS;<importe>;<AAAA-MM-DD HH:mm>;<comercio>` (el comercio va al final porque puede
contener `;`). El botón de tarjeta de la barra superior lee el portapapeles (iOS pide confirmar
"Pegar"), muestra cada compra pendiente y la guarda como gasto con un toque en la categoría.
- id del movimiento: `ap-` + hash de importe, fecha y comercio → la misma compra no se duplica.
- Categoría sugerida: la última usada en un gasto con la misma descripción (= comercio).
- No cambiar el formato de la línea sin actualizar las instrucciones de la hoja `#hoja-ayuda-ap`.

## Probar en local

Los service workers requieren `https` o `localhost`. Servir la carpeta con cualquier servidor
estático en `http://localhost` (idealmente bajo una subruta `/mis-gastos/` para imitar
GitHub Pages) y verificar en modo avión / sin red que la app siga cargando.
