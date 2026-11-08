/**
 * Imagen del Wrapped: 1080 × 1920 px (formato historias, vertical), dibujada con
 * Canvas 2D y sin dependencias. Sigue SIEMPRE la apariencia de la app (norma 7):
 * lienzo #121212, tarjetas #1F1F1F, verde de marca #1ED760, la misma pila
 * tipográfica, la «S» de BrandMark, iconos de `statIconos.js` y nada de emoji.
 *
 * Todo texto variable se recorta con puntos suspensivos MIDIENDO con
 * `ctx.measureText`: nada se sale de su tarjeta.
 */
import { BRAND_S_PATH, BRAND_S_WIDTH } from '@/lib/brandMark'
import { STAT_ICONOS } from '@/lib/statIconos'

export const WRAPPED_ANCHO = 1080
export const WRAPPED_ALTO = 1920

const FUENTE = 'Montserrat, Gotham, "Segoe UI Variable Display", "Segoe UI", Inter, system-ui, -apple-system, Roboto, "Helvetica Neue", sans-serif'

const C = {
  lienzo: '#121212',
  tarjeta: '#1f1f1f',
  verde: '#1ed760',
  verde200: '#96eab8',
  blanco: '#ffffff',
  gris400: '#b3b3b3',
  gris500: '#9a9a9a',
  gris600: '#7c7c7c',
  teselaVerde: 'rgba(30, 215, 96, 0.22)',
  teselaGris: 'rgba(255, 255, 255, 0.08)'
}

const M = 64 // margen lateral
const CW = WRAPPED_ANCHO - M * 2 // ancho de contenido
const RADIO = 40 // esquinas de tarjeta

function fuente (ctx, peso, px) {
  ctx.font = `${peso} ${px}px ${FUENTE}`
}

function espaciado (ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`
}

function rect (ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/**
 * Recorta `texto` con «…» para que mida como mucho `max` px con la fuente
 * actual del contexto. Búsqueda binaria sobre el nº de caracteres.
 */
export function recortarTexto (ctx, texto, max) {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim()
  if (!t || max <= 0) return ''
  if (ctx.measureText(t).width <= max) return t
  let lo = 0
  let hi = t.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (ctx.measureText(`${t.slice(0, mid).trimEnd()}…`).width <= max) lo = mid
    else hi = mid - 1
  }
  return lo > 0 ? `${t.slice(0, lo).trimEnd()}…` : '…'
}

/** Tamaño de fuente más grande (hasta `maxPx`) con el que `texto` cabe en `max`. */
function ajustarPx (ctx, peso, texto, maxPx, minPx, max) {
  let px = maxPx
  while (px > minPx) {
    fuente(ctx, peso, px)
    if (ctx.measureText(texto).width <= max) return px
    px -= 2
  }
  return minPx
}

function texto (ctx, str, x, y, { peso = 700, px = 30, color = C.blanco, align = 'left', max = 0, ls = 0 } = {}) {
  fuente(ctx, peso, px)
  espaciado(ctx, ls)
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  const salida = max ? recortarTexto(ctx, str, max) : String(str)
  ctx.fillText(salida, x, y)
  espaciado(ctx, 0)
  return salida
}

function icono (ctx, nombre, x, y, size, color, grosor = 2.2) {
  const trazos = STAT_ICONOS[nombre] || []
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 24, size / 24)
  ctx.strokeStyle = color
  ctx.lineWidth = grosor
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const d of trazos) ctx.stroke(new Path2D(d))
  ctx.restore()
}

/** Tesela redondeada con icono, como las de las tarjetas de opción. */
function tesela (ctx, nombre, x, y, size, { fondo = C.teselaVerde, color = C.verde200 } = {}) {
  ctx.fillStyle = fondo
  rect(ctx, x, y, size, size, size * 0.3)
  ctx.fill()
  const ic = size * 0.56
  icono(ctx, nombre, x + (size - ic) / 2, y + (size - ic) / 2, ic, color)
}

function marca (ctx, x, y, size) {
  // Igual que en la app (cabecera y barra lateral): disco verde de marca con la
  // «S» en negro, a 0,55 del diámetro.
  ctx.fillStyle = C.verde
  ctx.beginPath()
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
  ctx.fill()
  const m = size * 0.56
  x += (size - m) / 2
  y += (size - m) / 2
  size = m
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 24, size / 24)
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = BRAND_S_WIDTH
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(new Path2D(BRAND_S_PATH))
  ctx.restore()
}

function tarjeta (ctx, x, y, w, h) {
  ctx.fillStyle = C.tarjeta
  rect(ctx, x, y, w, h, RADIO)
  ctx.fill()
}

function veces (n) {
  return `${n}×`
}

function cabeceraTarjeta (ctx, x, y, nombreIcono, titulo) {
  tesela(ctx, nombreIcono, x + 36, y + 36, 68)
  texto(ctx, titulo, x + 36 + 68 + 24, y + 36 + 46, { peso: 800, px: 38, max: CW - 36 * 2 - 68 - 24 })
}

/** Lista de hasta 3 filas con puesto, texto principal, secundario y recuento. */
function filas (ctx, x, y, w, items, { alto, conSecundario }) {
  items.forEach((it, i) => {
    const fy = y + i * alto
    const cy = fy + alto / 2
    // Puesto: el primero en verde con texto negro, el resto en gris tenue.
    ctx.fillStyle = i === 0 ? C.verde : C.teselaGris
    rect(ctx, x, cy - 30, 60, 60, 18)
    ctx.fill()
    texto(ctx, String(i + 1), x + 30, cy + 11, { peso: 800, px: 32, color: i === 0 ? '#000000' : '#cfcfcf', align: 'center' })

    // Recuento a la derecha; el texto se recorta con lo que sobra.
    fuente(ctx, 800, 34)
    const anchoVeces = ctx.measureText(veces(it.count)).width
    texto(ctx, veces(it.count), x + w, cy + 12, { peso: 800, px: 34, color: C.verde, align: 'right' })

    const tx = x + 60 + 24
    const maxTexto = w - 60 - 24 - anchoVeces - 24
    if (conSecundario) {
      texto(ctx, it.principal, tx, cy - 2, { peso: 700, px: 34, max: maxTexto })
      texto(ctx, it.secundario || 'Artista desconocido', tx, cy + 34, { peso: 500, px: 26, color: C.gris400, max: maxTexto })
    } else {
      texto(ctx, it.principal, tx, cy + 12, { peso: 700, px: 34, max: maxTexto })
    }
  })
}

function sinDatos (ctx, x, y, w, alto) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.30)'
  rect(ctx, x, y, w, alto, 24)
  ctx.fill()
  texto(ctx, 'Aún sin escuchas en este periodo', x + w / 2, y + alto / 2 + 10, { peso: 600, px: 28, color: C.gris500, align: 'center', max: w - 40 })
}

function minitarjeta (ctx, x, y, w, h, nombreIcono, etiqueta, valor, pista) {
  tarjeta(ctx, x, y, w, h)
  const pad = 28
  tesela(ctx, nombreIcono, x + pad, y + 24, 52)
  texto(ctx, etiqueta, x + pad, y + 122, { peso: 700, px: 24, color: C.gris400, ls: 1.2, max: w - pad * 2 })
  const px = ajustarPx(ctx, 800, valor, 58, 30, w - pad * 2)
  texto(ctx, valor, x + pad, y + 180, { peso: 800, px, color: C.blanco, max: w - pad * 2, ls: -1 })
  texto(ctx, pista, x + pad, y + 218, { peso: 500, px: 26, color: C.gris400, max: w - pad * 2 })
}

/**
 * Dibuja el Wrapped en `canvas` (se ajusta a 1080 × 1920). `datos` es el
 * resultado de `calcularWrapped`.
 */
export function dibujarWrapped (canvas, datos) {
  canvas.width = WRAPPED_ANCHO
  canvas.height = WRAPPED_ALTO
  const ctx = canvas.getContext('2d')

  // ── Fondo: lienzo de la app con un resplandor verde muy suave ──────────────
  ctx.fillStyle = C.lienzo
  ctx.fillRect(0, 0, WRAPPED_ANCHO, WRAPPED_ALTO)
  let g = ctx.createRadialGradient(WRAPPED_ANCHO * 0.9, 0, 0, WRAPPED_ANCHO * 0.9, 0, 980)
  g.addColorStop(0, 'rgba(30, 215, 96, 0.20)')
  g.addColorStop(1, 'rgba(30, 215, 96, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, WRAPPED_ANCHO, WRAPPED_ALTO)
  g = ctx.createRadialGradient(0, WRAPPED_ALTO, 0, 0, WRAPPED_ALTO, 1150)
  g.addColorStop(0, 'rgba(30, 215, 96, 0.24)')
  g.addColorStop(1, 'rgba(30, 215, 96, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, WRAPPED_ANCHO, WRAPPED_ALTO)
  g = ctx.createRadialGradient(WRAPPED_ANCHO, WRAPPED_ALTO * 0.64, 0, WRAPPED_ANCHO, WRAPPED_ALTO * 0.64, 800)
  g.addColorStop(0, 'rgba(30, 215, 96, 0.10)')
  g.addColorStop(1, 'rgba(30, 215, 96, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, WRAPPED_ANCHO, WRAPPED_ALTO)

  // ── Cabecera: marca y pastilla «WRAPPED» ──────────────────────────────────
  marca(ctx, M, 70, 76)
  texto(ctx, 'Skippify', M + 76 + 20, 70 + 54, { peso: 800, px: 46, ls: -1.5 })
  fuente(ctx, 700, 24)
  espaciado(ctx, 3)
  const wTxt = ctx.measureText('WRAPPED').width
  espaciado(ctx, 0)
  const pw = wTxt + 56
  ctx.fillStyle = 'rgba(30, 215, 96, 0.16)'
  rect(ctx, WRAPPED_ANCHO - M - pw, 82, pw, 52, 26)
  ctx.fill()
  texto(ctx, 'WRAPPED', WRAPPED_ANCHO - M - pw + 28, 82 + 35, { peso: 700, px: 24, color: C.verde200, ls: 3 })

  // ── Título y periodo ──────────────────────────────────────────────────────
  const pxTitulo = ajustarPx(ctx, 800, datos.titulo, 88, 48, CW)
  texto(ctx, datos.titulo, M, 262, { peso: 800, px: pxTitulo, ls: -pxTitulo * 0.035, max: CW })
  texto(ctx, datos.rango, M, 316, { peso: 600, px: 30, color: C.gris400 })

  // ── Tiempo escuchado ──────────────────────────────────────────────────────
  let y = 368
  const hHero = 250
  tarjeta(ctx, M, y, CW, hHero)
  tesela(ctx, 'reloj', M + 36, y + 36, 112)
  const hx = M + 36 + 112 + 32
  const hMax = CW - (hx - M) - 36
  texto(ctx, 'TIEMPO ESCUCHADO', hx, y + 68, { peso: 700, px: 24, color: C.gris400, ls: 2.4, max: hMax })
  const pxHero = ajustarPx(ctx, 800, datos.tiempo, 112, 44, hMax)
  texto(ctx, datos.tiempo, hx, y + 68 + 24 + pxHero * 0.82, { peso: 800, px: pxHero, color: C.verde, ls: -pxHero * 0.035, max: hMax })
  const detalle = datos.vacio
    ? 'Sin escuchas registradas'
    : `${datos.escuchas} ${datos.escuchas === 1 ? 'escucha' : 'escuchas'} · ${datos.cancionesDistintas} ${datos.cancionesDistintas === 1 ? 'canción distinta' : 'canciones distintas'}`
  texto(ctx, detalle, M + 40, y + hHero - 38, { peso: 600, px: 28, color: C.gris400, max: CW - 80 })
  y += hHero + 24

  // ── Top canciones ─────────────────────────────────────────────────────────
  const altoCan = 104
  const hCan = 36 + 68 + 22 + altoCan * 3 + 18
  tarjeta(ctx, M, y, CW, hCan)
  cabeceraTarjeta(ctx, M, y, 'cancion', 'Top canciones')
  const ry = y + 36 + 68 + 22
  if (datos.canciones.length) {
    filas(ctx, M + 36, ry, CW - 72, datos.canciones.map(c => ({ principal: c.titulo, secundario: c.artista, count: c.count })), { alto: altoCan, conSecundario: true })
  } else {
    sinDatos(ctx, M + 36, ry, CW - 72, altoCan * 3 - 8)
  }
  y += hCan + 24

  // ── Top artistas ──────────────────────────────────────────────────────────
  const altoArt = 84
  const hArt = 36 + 68 + 22 + altoArt * 3 + 18
  tarjeta(ctx, M, y, CW, hArt)
  cabeceraTarjeta(ctx, M, y, 'artista', 'Top artistas')
  const ay = y + 36 + 68 + 22
  if (datos.artistas.length) {
    filas(ctx, M + 36, ay, CW - 72, datos.artistas.map(a => ({ principal: a.nombre, count: a.count })), { alto: altoArt, conSecundario: false })
  } else {
    sinDatos(ctx, M + 36, ay, CW - 72, altoArt * 3 - 8)
  }
  y += hArt + 24

  // ── Hora favorita · mejor racha · variedad ────────────────────────────────
  // Siempre tres: la tercera es la variedad si se conoce y, si no, las canciones distintas.
  // La racha se mide DENTRO del periodo (en «Este año» coincide con la cifra de Estadísticas).
  const minis = [
    { icono: 'reloj', etiqueta: 'HORA FAVORITA', valor: datos.horaFavorita ? datos.horaFavorita.etiqueta : '—', pista: 'Tu hora punta' },
    { icono: 'racha', etiqueta: 'MEJOR RACHA', valor: `${datos.mejorRacha} ${datos.mejorRacha === 1 ? 'día' : 'días'}`, pista: 'En este periodo' },
    (datos.variedad !== null && datos.variedad !== undefined)
      ? { icono: 'variedad', etiqueta: 'VARIEDAD', valor: `${datos.variedad} %`, pista: 'Sin repetir' }
      : { icono: 'cancion', etiqueta: 'CANCIONES', valor: String(datos.cancionesDistintas), pista: 'Distintas' }
  ]
  const hueco = 24
  const wMini = (CW - hueco * (minis.length - 1)) / minis.length
  const hMini = 232
  minis.forEach((m, i) => minitarjeta(ctx, M + i * (wMini + hueco), y, wMini, hMini, m.icono, m.etiqueta, m.valor, m.pista))

  // ── Pie ───────────────────────────────────────────────────────────────────
  texto(ctx, 'Hecho con Skippify', WRAPPED_ANCHO / 2, WRAPPED_ALTO - 46, { peso: 600, px: 26, color: C.gris600, align: 'center' })

  return canvas
}

/** Genera el PNG como Blob (rechaza si el navegador no puede codificarlo). */
export async function generarWrappedPng (datos) {
  const canvas = document.createElement('canvas')
  dibujarWrapped(canvas, datos)
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen'))), 'image/png')
  })
}
