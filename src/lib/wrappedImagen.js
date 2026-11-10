/**
 * Imagen del Wrapped mensual: 1080 × 1920 px (formato historias, vertical),
 * dibujada con Canvas 2D y sin dependencias. Sigue SIEMPRE la apariencia de la
 * app (norma 7): lienzo #121212, tarjetas #1F1F1F redondeadas, verde de marca
 * #1ED760, la misma pila tipográfica, la marca de la cabecera (disco verde con
 * la «S» oscura), iconos propios de `statIconos.js` y nada de emoji.
 *
 * Contenido (y nada más): tiempo de escucha, top 3 canciones, top 3 artistas,
 * nº de artistas y de canciones distintas, % de variedad y duración media de la
 * sesión, de los últimos 30 días.
 *
 * Jerarquía, de arriba abajo:
 *   marca · título del mes · TIEMPO DE ESCUCHA (la cifra grande, en verde) ·
 *   Top 3 canciones · Top 3 artistas · rejilla 2 × 2 con las cuatro cifras.
 *
 * Todo texto variable se recorta con «…» MIDIENDO con `ctx.measureText`, y las
 * cifras grandes encogen hasta caber: nada se sale de su tarjeta.
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
  gris300: '#d4d4d4',
  gris400: '#b3b3b3',
  gris500: '#9a9a9a',
  gris600: '#7c7c7c',
  teselaVerde: 'rgba(30, 215, 96, 0.22)',
  teselaGris: 'rgba(255, 255, 255, 0.08)',
  hundido: 'rgba(0, 0, 0, 0.30)'
}

/** Margen lateral y ancho útil. */
export const M = 64
export const CW = WRAPPED_ANCHO - M * 2
/** Esquinas de tarjeta y relleno interior. */
const RADIO = 40
const PAD = 40
/** Separación entre bloques. */
const HUECO = 24

/**
 * Geometría de los bloques (y, alto). Exportada para que las pruebas
 * comprueben que nada se pisa ni baja del pie.
 */
export const BLOQUES = (() => {
  const cab = { y: 72, h: 80 }
  const titulo = { y: 200, h: 170 }
  const tiempo = { y: 392, h: 236 }
  const filaCan = 100
  const filaArt = 80
  const cabTarjeta = 32 + 64 + 18
  const canciones = { y: tiempo.y + tiempo.h + HUECO, h: cabTarjeta + filaCan * 3 + 18, fila: filaCan }
  const artistas = { y: canciones.y + canciones.h + HUECO, h: cabTarjeta + filaArt * 3 + 18, fila: filaArt }
  const celda = 150
  const rejilla = { y: artistas.y + artistas.h + HUECO, h: celda * 2 + HUECO, celda }
  const pie = { y: WRAPPED_ALTO - 44 }
  return { cab, titulo, tiempo, canciones, artistas, rejilla, pie, cabTarjeta }
})()

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
function ajustarPx (ctx, peso, texto, maxPx, minPx, max, ls = 0) {
  let px = maxPx
  while (px > minPx) {
    fuente(ctx, peso, px)
    espaciado(ctx, typeof ls === 'function' ? ls(px) : ls)
    const cabe = ctx.measureText(texto).width <= max
    espaciado(ctx, 0)
    if (cabe) return px
    px -= 2
  }
  return minPx
}

/** Dibuja un texto (recortado a `max` si se da) y devuelve lo que dibujó. */
function texto (ctx, str, x, y, { peso = 700, px = 30, color = C.blanco, align = 'left', max = 0, ls = 0 } = {}) {
  fuente(ctx, peso, px)
  espaciado(ctx, ls)
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  const salida = max ? recortarTexto(ctx, str, max) : String(str)
  ctx.fillText(salida, x, y)
  const ancho = ctx.measureText(salida).width
  espaciado(ctx, 0)
  return { salida, ancho }
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

/** Tesela redondeada con icono, como las de las tarjetas de opción de la app. */
function tesela (ctx, nombre, x, y, size, { fondo = C.teselaVerde, color = C.verde200 } = {}) {
  ctx.fillStyle = fondo
  rect(ctx, x, y, size, size, size * 0.3)
  ctx.fill()
  const ic = size * 0.56
  icono(ctx, nombre, x + (size - ic) / 2, y + (size - ic) / 2, ic, color)
}

/** La marca de la cabecera de la app: disco verde con la «S» en negro. */
function marca (ctx, x, y, size) {
  ctx.fillStyle = C.verde
  ctx.beginPath()
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
  ctx.fill()
  const m = size * 0.56
  ctx.save()
  ctx.translate(x + (size - m) / 2, y + (size - m) / 2)
  ctx.scale(m / 24, m / 24)
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = BRAND_S_WIDTH
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(new Path2D(BRAND_S_PATH))
  ctx.restore()
}

function tarjeta (ctx, x, y, w, h, r = RADIO) {
  ctx.fillStyle = C.tarjeta
  rect(ctx, x, y, w, h, r)
  ctx.fill()
}

/** Pastilla de texto (p. ej. «WRAPPED»), alineada a la derecha en `xDer`. */
function pastilla (ctx, str, xDer, y, { px = 24, ls = 3, fondo = 'rgba(30, 215, 96, 0.16)', color = C.verde200 } = {}) {
  fuente(ctx, 700, px)
  espaciado(ctx, ls)
  const w = ctx.measureText(str).width
  espaciado(ctx, 0)
  const pw = w + 56
  const ph = px + 28
  ctx.fillStyle = fondo
  rect(ctx, xDer - pw, y, pw, ph, ph / 2)
  ctx.fill()
  texto(ctx, str, xDer - pw + 28, y + ph / 2 + px * 0.36, { peso: 700, px, color, ls })
}

/** Cabecera de tarjeta: tesela de icono y título, como en las de la app. */
function cabeceraTarjeta (ctx, x, y, w, nombreIcono, titulo) {
  tesela(ctx, nombreIcono, x + PAD, y + 32, 64)
  texto(ctx, titulo, x + PAD + 64 + 24, y + 32 + 45, { peso: 800, px: 38, max: w - PAD * 2 - 64 - 24, ls: -0.5 })
}

/** Puesto del ranking: cuadrado (canciones) o círculo (artistas). */
function puesto (ctx, n, x, cy, size, redondo) {
  ctx.fillStyle = n === 1 ? C.verde : C.teselaGris
  if (redondo) {
    ctx.beginPath()
    ctx.arc(x + size / 2, cy, size / 2, 0, Math.PI * 2)
  } else {
    rect(ctx, x, cy - size / 2, size, size, size * 0.3)
  }
  ctx.fill()
  texto(ctx, String(n), x + size / 2, cy + size * 0.18, { peso: 800, px: Math.round(size * 0.5), color: n === 1 ? '#000000' : C.gris300, align: 'center' })
}

/**
 * Puesto sin dato (el mes dio para menos de tres): el número apagado y una
 * barra gris en lugar del nombre, para que la tarjeta no quede con un hueco.
 */
function huecoVacio (ctx, n, x, cy, size, redondo, dosLineas) {
  ctx.save()
  ctx.globalAlpha = 0.45
  puesto(ctx, n, x, cy, size, redondo)
  ctx.fillStyle = C.teselaGris
  const tx = x + (redondo ? 58 : 60) + 26
  if (dosLineas) {
    rect(ctx, tx, cy - 26, 260, 20, 10)
    ctx.fill()
    rect(ctx, tx, cy + 12, 160, 16, 8)
  } else {
    rect(ctx, tx, cy - 10, 240, 20, 10)
  }
  ctx.fill()
  ctx.restore()
}

/** Hueco hundido con un mensaje, para listas sin datos. */
function sinDatos (ctx, x, y, w, alto, mensaje) {
  ctx.fillStyle = C.hundido
  rect(ctx, x, y, w, alto, 24)
  ctx.fill()
  texto(ctx, mensaje, x + w / 2, y + alto / 2 + 10, { peso: 600, px: 28, color: C.gris500, align: 'center', max: w - 48 })
}

/** Una de las cuatro cifras de la rejilla inferior. */
function celdaCifra (ctx, x, y, w, h, { icono: nombreIcono, etiqueta, valor, pista, acento }) {
  tarjeta(ctx, x, y, w, h, 32)
  const t = 72
  const ty = y + (h - t) / 2
  tesela(ctx, nombreIcono, x + 28, ty, t)
  const tx = x + 28 + t + 24
  const tMax = w - (tx - x) - 28

  // Etiqueta: encoge un poco antes de recortarse (son palabras fijas).
  const pxEt = ajustarPx(ctx, 700, etiqueta, 22, 18, tMax, 1.6)
  texto(ctx, etiqueta, tx, y + h / 2 - 22, { peso: 700, px: pxEt, color: C.gris400, ls: 1.6, max: tMax })

  const pxVal = ajustarPx(ctx, 800, valor, 60, 34, tMax, -1)
  const v = texto(ctx, valor, tx, y + h / 2 + 46, { peso: 800, px: pxVal, color: acento ? C.verde : C.blanco, ls: -1, max: tMax })
  if (pista) {
    const libre = tMax - v.ancho - 14
    if (libre > 60) texto(ctx, pista, tx + v.ancho + 14, y + h / 2 + 44, { peso: 500, px: 24, color: C.gris500, max: libre })
  }
}

/**
 * Dibuja el Wrapped en `canvas` (se ajusta a 1080 × 1920). `datos` es el
 * resultado de `calcularWrapped`.
 */
export function dibujarWrapped (canvas, datos) {
  canvas.width = WRAPPED_ANCHO
  canvas.height = WRAPPED_ALTO
  const ctx = canvas.getContext('2d')
  const B = BLOQUES

  // ── Fondo: lienzo de la app con un resplandor verde muy suave ──────────────
  ctx.fillStyle = C.lienzo
  ctx.fillRect(0, 0, WRAPPED_ANCHO, WRAPPED_ALTO)
  let g = ctx.createRadialGradient(WRAPPED_ANCHO * 0.88, 120, 0, WRAPPED_ANCHO * 0.88, 120, 900)
  g.addColorStop(0, 'rgba(30, 215, 96, 0.18)')
  g.addColorStop(1, 'rgba(30, 215, 96, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, WRAPPED_ANCHO, WRAPPED_ALTO)
  g = ctx.createRadialGradient(0, WRAPPED_ALTO, 0, 0, WRAPPED_ALTO, 1000)
  g.addColorStop(0, 'rgba(30, 215, 96, 0.14)')
  g.addColorStop(1, 'rgba(30, 215, 96, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, WRAPPED_ANCHO, WRAPPED_ALTO)

  // ── Cabecera: la marca de la app y la pastilla «WRAPPED» ──────────────────
  marca(ctx, M, B.cab.y, 76)
  texto(ctx, 'Skippify', M + 76 + 22, B.cab.y + 53, { peso: 800, px: 44, ls: -1.2 })
  pastilla(ctx, 'WRAPPED', WRAPPED_ANCHO - M, B.cab.y + 12)

  // ── Título: el mes y sus fechas ───────────────────────────────────────────
  const eyebrow = `${datos.rango}${datos.fechas ? ` · ${datos.fechas}` : ''}`.toUpperCase()
  texto(ctx, eyebrow, M, B.titulo.y + 48, { peso: 700, px: 26, color: C.verde200, ls: 2.6, max: CW })
  const pxTitulo = ajustarPx(ctx, 800, datos.titulo, 100, 56, CW, px => -px * 0.035)
  texto(ctx, datos.titulo, M, B.titulo.y + 48 + 22 + pxTitulo * 0.86, { peso: 800, px: pxTitulo, ls: -pxTitulo * 0.035, max: CW })

  // ── Tiempo de escucha: la cifra protagonista ──────────────────────────────
  {
    const { y, h } = B.tiempo
    tarjeta(ctx, M, y, CW, h)
    // Un velo verde desde la izquierda: la tarjeta destacada, como sk-card-lit.
    ctx.save()
    rect(ctx, M, y, CW, h, RADIO)
    ctx.clip()
    const v = ctx.createLinearGradient(M, 0, M + CW, 0)
    v.addColorStop(0, 'rgba(30, 215, 96, 0.16)')
    v.addColorStop(1, 'rgba(30, 215, 96, 0)')
    ctx.fillStyle = v
    ctx.fillRect(M, y, CW, h)
    ctx.restore()

    const t = 120
    tesela(ctx, 'reloj', M + CW - PAD - t, y + (h - t) / 2, t)
    const maxT = CW - PAD * 2 - t - 32
    texto(ctx, 'TIEMPO DE ESCUCHA', M + PAD, y + 70, { peso: 700, px: 26, color: C.gris400, ls: 2.6, max: maxT })
    const pxHero = ajustarPx(ctx, 800, datos.tiempo, 128, 56, maxT, px => -px * 0.03)
    texto(ctx, datos.tiempo, M + PAD, y + h - 46, { peso: 800, px: pxHero, color: C.verde, ls: -pxHero * 0.03, max: maxT })
  }

  // ── Top 3 canciones (título y, debajo, artista) ───────────────────────────
  {
    const { y, h, fila } = B.canciones
    tarjeta(ctx, M, y, CW, h)
    cabeceraTarjeta(ctx, M, y, CW, 'cancion', 'Top 3 canciones')
    const ry = y + B.cabTarjeta
    const x = M + PAD
    const w = CW - PAD * 2
    if (datos.canciones.length) {
      datos.canciones.forEach((c, i) => {
        const cy = ry + i * fila + fila / 2
        puesto(ctx, i + 1, x, cy, 60, false)
        const tx = x + 60 + 26
        const max = w - 60 - 26
        texto(ctx, c.titulo, tx, cy - 4, { peso: 700, px: 34, max })
        texto(ctx, c.artista || 'Artista desconocido', tx, cy + 32, { peso: 500, px: 26, color: C.gris400, max })
      })
      for (let i = datos.canciones.length; i < 3; i++) huecoVacio(ctx, i + 1, x, ry + i * fila + fila / 2, 60, false, true)
    } else {
      sinDatos(ctx, x, ry + 4, w, fila * 3 - 12, 'Aún sin escuchas este mes')
    }
  }

  // ── Top 3 artistas ────────────────────────────────────────────────────────
  {
    const { y, h, fila } = B.artistas
    tarjeta(ctx, M, y, CW, h)
    cabeceraTarjeta(ctx, M, y, CW, 'artista', 'Top 3 artistas')
    const ry = y + B.cabTarjeta
    const x = M + PAD
    const w = CW - PAD * 2
    if (datos.artistas.length) {
      datos.artistas.forEach((a, i) => {
        const cy = ry + i * fila + fila / 2
        // Círculo de 56 centrado en el hueco de 60 del cuadrado de las canciones:
        // así los nombres de ambas listas empiezan en la misma vertical.
        puesto(ctx, i + 1, x + 2, cy, 56, true)
        texto(ctx, a.nombre, x + 60 + 26, cy + 12, { peso: 700, px: 34, max: w - 60 - 26 })
      })
      for (let i = datos.artistas.length; i < 3; i++) huecoVacio(ctx, i + 1, x + 2, ry + i * fila + fila / 2, 56, true, false)
    } else {
      sinDatos(ctx, x, ry + 4, w, fila * 3 - 12, 'Aún sin escuchas este mes')
    }
  }

  // ── Las cuatro cifras ─────────────────────────────────────────────────────
  {
    const { y, celda } = B.rejilla
    const w = (CW - HUECO) / 2
    const sinVariedad = datos.variedad === null || datos.variedad === undefined
    const celdas = [
      { icono: 'artista', etiqueta: 'ARTISTAS', valor: String(datos.artistasDistintos ?? 0), pista: 'distintos' },
      { icono: 'cancion', etiqueta: 'CANCIONES', valor: String(datos.cancionesDistintas ?? 0), pista: 'distintas' },
      sinVariedad
        ? { icono: 'variedad', etiqueta: 'VARIEDAD', valor: '—', pista: 'aún sin datos' }
        : { icono: 'variedad', etiqueta: 'VARIEDAD', valor: `${datos.variedad} %`, pista: 'sin repetir', acento: true },
      datos.sesionMedia
        ? { icono: 'sesion', etiqueta: 'SESIÓN MEDIA', valor: datos.sesionMedia, pista: '' }
        : { icono: 'sesion', etiqueta: 'SESIÓN MEDIA', valor: '—', pista: 'sin sesiones' }
    ]
    celdas.forEach((c, i) => {
      const cx = M + (i % 2) * (w + HUECO)
      const cy = y + Math.floor(i / 2) * (celda + HUECO)
      celdaCifra(ctx, cx, cy, w, celda, c)
    })
  }

  // ── Pie ───────────────────────────────────────────────────────────────────
  texto(ctx, 'Hecho con Skippify', WRAPPED_ANCHO / 2, B.pie.y, { peso: 600, px: 26, color: C.gris600, align: 'center' })

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
