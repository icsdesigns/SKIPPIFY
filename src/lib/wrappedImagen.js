/**
 * Imagen del Wrapped mensual: 1080 × 1920 px (formato historias, vertical),
 * dibujada con Canvas 2D y sin dependencias. Sigue SIEMPRE la apariencia de la
 * app (norma 7): lienzo #121212, tarjetas #1F1F1F redondeadas, verde de marca
 * #1ED760 y su gama, la misma pila tipográfica, la marca de la cabecera (disco
 * verde con la «S» oscura), iconos propios de `statIconos.js` y nada de emoji.
 *
 * Contenido (y nada más): tiempo de escucha, top 3 canciones, top 3 artistas,
 * nº de artistas y de canciones distintas, % de variedad y duración media de la
 * sesión, de los últimos 30 días.
 *
 * Jerarquía, de arriba abajo:
 *   marca · título del mes · TIEMPO DE ESCUCHA (cifra protagonista) ·
 *   Top 3 canciones y Top 3 artistas (con barra proporcional a sus escuchas) ·
 *   cuatro cifras en rejilla 2 × 2 (la variedad, con su anillo).
 *
 * ESPACIADO: todo se coloca con las constantes de `REJILLA` (margen exterior,
 * hueco entre paneles, relleno interior, separación entre filas). El contenido
 * de cada panel queda a `relleno` de sus cuatro lados y los paneles a `margen`
 * del borde de la imagen. La geometría está en `DISPOSICION`, y `dibujarWrapped`
 * puede anotar la caja de cada elemento (tercer parámetro) para comprobarlo.
 *
 * Todo texto variable se recorta con «…» MIDIENDO con `ctx.measureText`, y las
 * cifras encogen hasta caber: nada se sale de su panel.
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
  teselaVerde: 'rgba(30, 215, 96, 0.20)',
  teselaGris: 'rgba(255, 255, 255, 0.08)',
  pista: 'rgba(255, 255, 255, 0.08)',
  hundido: 'rgba(0, 0, 0, 0.30)'
}

/** Barras de los tops: el nº 1 en verde pleno y los demás en su gama. */
const VERDES_TOP = ['#1ed760', 'rgba(30, 215, 96, 0.62)', 'rgba(30, 215, 96, 0.38)']

/**
 * Rejilla de espaciado. Única fuente de márgenes y huecos de la imagen.
 *  - margen:   del borde de la imagen al contenido, en los cuatro lados.
 *  - hueco:    entre dos paneles (en vertical y en horizontal).
 *  - relleno:  del borde de un panel a su contenido, en los cuatro lados.
 *  - fila:     entre dos filas de una lista.
 *  - cabecera: entre la cabecera de un panel (icono y rótulo) y su contenido.
 *  - seccion:  entre los bloques sin panel (marca, título, pie) y los paneles.
 */
export const REJILLA = Object.freeze({
  margen: 72,
  hueco: 24,
  relleno: 40,
  fila: 16,
  cabecera: 24,
  seccion: 40,
  radio: 36
})
const { margen: M, hueco: HUECO, relleno: PAD, fila: FILA, cabecera: CAB_HUECO, seccion: SECCION, radio: RADIO } = REJILLA

/** Margen lateral y ancho útil (se exportan también para las pruebas). */
export { M }
export const CW = WRAPPED_ANCHO - M * 2

/** Alto de mayúsculas y cifras respecto al cuerpo de la fuente. */
export const ALTO_CAP = 0.7
const cap = px => px * ALTO_CAP

/** Tamaños fijos de los elementos. */
const T = {
  marca: 64,
  marcaTexto: 40,
  pastilla: 22,
  ceja: 24,
  titulo: 84,
  tesela: 48,
  rotulo: 34,
  rotuloCifra: 26,
  pista: 22,
  heroe: 150,
  puesto: 48,
  cancion: 32,
  artistaSub: 24,
  artista: 32,
  barra: 8,
  pie: 22
}

/** Alto de una fila de canción (título, artista y barra) y de artista. */
const FILA_CANCION = Math.max(T.puesto, cap(T.cancion) + 14 + cap(T.artistaSub) + 18 + T.barra)
const FILA_ARTISTA = Math.max(T.puesto, cap(T.artista) + 16 + T.barra)
const ALTO_LISTA = fila => fila * 3 + FILA * 2

/**
 * Geometría de la imagen, calculada sólo con `REJILLA` y `T`. Cada panel es
 * `{ x, y, w, h }`; las cuatro celdas de cifras van en `celdas`.
 */
export const DISPOSICION = (() => {
  const cab = { x: M, y: M, w: CW, h: T.marca }
  const titulo = { x: M, y: cab.y + cab.h + SECCION, w: CW, h: cap(T.ceja) + 18 + cap(T.titulo) }
  const panel = (y, h) => ({ x: M, y, w: CW, h })
  const tiempo = panel(titulo.y + titulo.h + SECCION, PAD + T.tesela + CAB_HUECO + cap(T.heroe) + PAD)
  const canciones = panel(tiempo.y + tiempo.h + HUECO, PAD + T.tesela + CAB_HUECO + ALTO_LISTA(FILA_CANCION) + PAD)
  const artistas = panel(canciones.y + canciones.h + HUECO, PAD + T.tesela + CAB_HUECO + ALTO_LISTA(FILA_ARTISTA) + PAD)
  // El pie apoya su línea base en el margen inferior; las celdas ocupan lo que queda.
  const pie = { x: M, y: WRAPPED_ALTO - M - cap(T.pie), w: CW, h: cap(T.pie) }
  const yCeldas = artistas.y + artistas.h + HUECO
  const altoCeldas = pie.y - SECCION - yCeldas
  const hc = (altoCeldas - HUECO) / 2
  const wc = (CW - HUECO) / 2
  const celdas = [0, 1, 2, 3].map(i => ({
    x: M + (i % 2) * (wc + HUECO),
    y: yCeldas + Math.floor(i / 2) * (hc + HUECO),
    w: wc,
    h: hc
  }))
  return { cab, titulo, tiempo, canciones, artistas, celdas, pie, filaCancion: FILA_CANCION, filaArtista: FILA_ARTISTA }
})()

/** Paneles con nombre, en orden de dibujo (para las pruebas). */
export const PANELES = [
  ['tiempo', DISPOSICION.tiempo],
  ['canciones', DISPOSICION.canciones],
  ['artistas', DISPOSICION.artistas],
  ...DISPOSICION.celdas.map((c, i) => [['artistasDistintos', 'cancionesDistintas', 'variedad', 'sesion'][i], c])
]

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

/**
 * Pinta la imagen. `registro` (opcional) recibe la caja de cada elemento de
 * contenido: `{ zona, x0, y0, x1, y1 }`, con `zona` = panel o bloque.
 */
function crearLienzo (ctx, registro) {
  const anota = (zona, x0, y0, x1, y1) => { if (registro) registro.push({ zona, x0, y0, x1, y1 }) }

  /** Texto (recortado a `max` si se da). Devuelve lo dibujado y su ancho. */
  function texto (zona, str, x, y, { peso = 700, px = 30, color = C.blanco, align = 'left', max = 0, ls = 0 } = {}) {
    fuente(ctx, peso, px)
    espaciado(ctx, ls)
    ctx.fillStyle = color
    ctx.textAlign = align
    ctx.textBaseline = 'alphabetic'
    const salida = max ? recortarTexto(ctx, str, max) : String(str)
    ctx.fillText(salida, x, y)
    const ancho = ctx.measureText(salida).width
    espaciado(ctx, 0)
    const x0 = align === 'center' ? x - ancho / 2 : (align === 'right' ? x - ancho : x)
    if (salida) anota(zona, x0, y - cap(px), x0 + ancho, y)
    return { salida, ancho }
  }

  function icono (nombre, x, y, size, color, grosor = 2.2) {
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
  function tesela (zona, nombre, x, y, size, { fondo = C.teselaVerde, color = C.verde200 } = {}) {
    ctx.fillStyle = fondo
    rect(ctx, x, y, size, size, size * 0.3)
    ctx.fill()
    const ic = size * 0.58
    icono(nombre, x + (size - ic) / 2, y + (size - ic) / 2, ic, color)
    anota(zona, x, y, x + size, y + size)
  }

  function tarjeta (p) {
    ctx.fillStyle = C.tarjeta
    rect(ctx, p.x, p.y, p.w, p.h, RADIO)
    ctx.fill()
  }

  /**
   * Cabecera de panel: tesela, rótulo y, a la derecha, una pista opcional que
   * explica la escala («según escuchas»). Ocupa `T.tesela` de alto.
   */
  function cabecera (zona, p, nombreIcono, rotulo, { px = T.rotulo, color = C.blanco, pista = '', maxDer = 0 } = {}) {
    const x = p.x + PAD
    const y = p.y + PAD
    tesela(zona, nombreIcono, x, y, T.tesela)
    const der = p.x + p.w - PAD - maxDer
    let anchoPista = 0
    if (pista) {
      const r = texto(zona, pista, der, y + T.tesela / 2 + cap(T.pista) / 2, { peso: 600, px: T.pista, color: C.gris500, align: 'right' })
      anchoPista = r.ancho + 24
    }
    const tx = x + T.tesela + 20
    texto(zona, rotulo, tx, y + T.tesela / 2 + cap(px) / 2, { peso: 800, px, color, max: der - anchoPista - tx, ls: -0.4 })
  }

  /**
   * Cifra con sus unidades más pequeñas («27 h 5 min», «82 %»): los números
   * a `px` y las unidades al 42 %. Encoge hasta caber en `max`. La línea base
   * va en `y`, así que el borde inferior de la cifra es exactamente `y`.
   */
  function cifra (zona, valor, x, y, { px, minPx = 28, max, color = C.blanco, colorUnidad = C.gris400 }) {
    const partes = String(valor).trim().split(/\s+/).map(t => ({ t, num: /^[\d—–-]/.test(t) }))
    const medir = p => {
      const pu = Math.round(p * 0.42)
      let w = 0
      partes.forEach((s, i) => {
        fuente(ctx, s.num ? 800 : 700, s.num ? p : pu)
        espaciado(ctx, s.num ? -p * 0.03 : 0)
        s.w = ctx.measureText(s.t).width
        espaciado(ctx, 0)
        if (i) w += partes[i - 1].num && !s.num ? p * 0.07 : p * 0.2
        w += s.w
      })
      return w
    }
    let p = px
    while (p > minPx && medir(p) > max) p -= 2
    medir(p)
    let cx = x
    partes.forEach((s, i) => {
      if (i) cx += partes[i - 1].num && !s.num ? p * 0.07 : p * 0.2
      const r = texto(zona, s.t, cx, y, s.num
        ? { peso: 800, px: p, color, ls: -p * 0.03, max: Math.max(0, x + max - cx) }
        : { peso: 700, px: Math.round(p * 0.42), color: colorUnidad, max: Math.max(0, x + max - cx) })
      cx += r.ancho
    })
    return cx - x
  }

  /** Puesto del ranking: cuadrado (canciones) o círculo (artistas). */
  function puesto (zona, n, x, y, redondo, apagado = false) {
    const s = T.puesto
    ctx.save()
    if (apagado) ctx.globalAlpha = 0.45
    ctx.fillStyle = n === 1 && !apagado ? C.verde : C.teselaGris
    if (redondo) {
      ctx.beginPath()
      ctx.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2)
    } else {
      rect(ctx, x, y, s, s, s * 0.3)
    }
    ctx.fill()
    const px = 24
    texto(zona, String(n), x + s / 2, y + s / 2 + cap(px) / 2, { peso: 800, px, color: n === 1 && !apagado ? '#000000' : C.gris300, align: 'center' })
    ctx.restore()
    anota(zona, x, y, x + s, y + s)
  }

  /** Barra proporcional: pista gris a todo el ancho y relleno en verde. */
  function barra (zona, x, y, w, fraccion, color) {
    ctx.fillStyle = C.pista
    rect(ctx, x, y, w, T.barra, T.barra / 2)
    ctx.fill()
    const f = Math.max(T.barra, w * Math.max(0, Math.min(1, fraccion)))
    ctx.fillStyle = color
    rect(ctx, x, y, f, T.barra, T.barra / 2)
    ctx.fill()
    anota(zona, x, y, x + w, y + T.barra)
  }

  /** Marcador gris redondeado (puestos sin dato). */
  function marcador (zona, x, y, w, h) {
    ctx.fillStyle = C.teselaGris
    rect(ctx, x, y, w, h, h / 2)
    ctx.fill()
    anota(zona, x, y, x + w, y + h)
  }

  /** Hueco hundido con un mensaje, para listas sin datos. */
  function sinDatos (zona, x, y, w, alto, mensaje) {
    ctx.fillStyle = C.hundido
    rect(ctx, x, y, w, alto, 24)
    ctx.fill()
    anota(zona, x, y, x + w, y + alto)
    texto(zona, mensaje, x + w / 2, y + alto / 2 + cap(28) / 2, { peso: 600, px: 28, color: C.gris500, align: 'center', max: w - 48 })
  }

  /** La marca de la cabecera de la app: disco verde con la «S» en negro. */
  function marca (zona, x, y, size) {
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
    anota(zona, x, y, x + size, y + size)
  }

  /** Pastilla de texto (p. ej. «WRAPPED»), alineada a la derecha en `xDer`. */
  function pastilla (zona, str, xDer, yCentro) {
    const px = T.pastilla
    const ls = 3
    fuente(ctx, 700, px)
    espaciado(ctx, ls)
    const w = ctx.measureText(str).width
    espaciado(ctx, 0)
    const pw = w + 48
    const ph = 48
    const y = yCentro - ph / 2
    ctx.fillStyle = 'rgba(30, 215, 96, 0.16)'
    rect(ctx, xDer - pw, y, pw, ph, ph / 2)
    ctx.fill()
    anota(zona, xDer - pw, y, xDer, y + ph)
    texto(zona, str, xDer - pw / 2, yCentro + cap(px) / 2, { peso: 700, px, color: C.verde200, ls, align: 'center' })
  }

  /** Anillo de porcentaje (variedad). `pct` null pinta sólo la pista. */
  function anillo (zona, cx, cy, r, pct) {
    const g = Math.round(r * 0.24)
    const rm = r - g / 2
    ctx.save()
    ctx.lineWidth = g
    ctx.lineCap = 'round'
    ctx.strokeStyle = C.pista
    ctx.beginPath()
    ctx.arc(cx, cy, rm, 0, Math.PI * 2)
    ctx.stroke()
    if (pct !== null && pct > 0) {
      ctx.strokeStyle = C.verde
      ctx.beginPath()
      ctx.arc(cx, cy, rm, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, pct / 100))
      ctx.stroke()
    }
    ctx.restore()
    anota(zona, cx - r, cy - r, cx + r, cy + r)
  }

  return { ctx, texto, tesela, tarjeta, cabecera, cifra, puesto, barra, marcador, sinDatos, marca, pastilla, anillo }
}

/** Lista de un top: filas con puesto, texto y barra proporcional a las escuchas. */
function dibujarTop (L, zona, p, items, { fila, redondo, linea1, linea2 }) {
  const x = p.x + PAD
  const der = p.x + p.w - PAD
  const ry = p.y + PAD + T.tesela + CAB_HUECO
  const tx = x + T.puesto + 24
  const tw = der - tx
  if (!items.length) {
    L.sinDatos(zona, x, ry, der - x, ALTO_LISTA(fila), 'Aún sin escuchas este mes')
    return
  }
  const maximo = Math.max(1, ...items.map(it => Number(it.count) || 0))
  for (let i = 0; i < 3; i++) {
    const y = ry + i * (fila + FILA)
    const it = items[i]
    const yPuesto = y + (fila - T.puesto) / 2
    const yBarra = y + fila - T.barra
    if (!it) {
      // Puesto sin dato (el mes dio para menos de tres): número apagado y
      // marcadores grises en lugar del texto, para que no quede un hueco.
      L.puesto(zona, i + 1, x, yPuesto, redondo, true)
      L.marcador(zona, tx, y, Math.min(tw, 300), cap(T.cancion))
      L.marcador(zona, tx, yBarra, tw * 0.25, T.barra)
      continue
    }
    L.puesto(zona, i + 1, x, yPuesto, redondo)
    const b1 = y + cap(T.cancion)
    L.texto(zona, linea1(it), tx, b1, { peso: 700, px: T.cancion, max: tw })
    if (linea2) L.texto(zona, linea2(it), tx, b1 + 14 + cap(T.artistaSub), { peso: 500, px: T.artistaSub, color: C.gris400, max: tw })
    L.barra(zona, tx, yBarra, tw, (Number(it.count) || 0) / maximo, VERDES_TOP[i])
  }
}

/** Una de las cuatro cifras de la rejilla inferior. */
function dibujarCelda (L, zona, p, { icono: nombreIcono, rotulo, valor, pista, acento, anillo }) {
  L.tarjeta(p)
  const interior = p.h - PAD * 2
  const conAnillo = anillo !== undefined
  const reservaDer = conAnillo ? interior + 24 : 0
  L.cabecera(zona, p, nombreIcono, rotulo, { px: T.rotuloCifra, color: C.gris300, maxDer: reservaDer })
  const x = p.x + PAD
  const max = p.w - PAD * 2 - reservaDer
  const base = p.y + p.h - PAD
  const pxMax = Math.max(32, Math.min(76, Math.floor((interior - T.tesela - CAB_HUECO) / ALTO_CAP)))
  const ancho = L.cifra(zona, valor, x, base, { px: pxMax, max, color: acento ? C.verde : C.blanco })
  if (pista) {
    const libre = max - ancho - 16
    if (libre > 60) L.texto(zona, pista, x + ancho + 16, base, { peso: 500, px: T.pista, color: C.gris500, max: libre })
  }
  if (conAnillo) L.anillo(zona, p.x + p.w - PAD - interior / 2, p.y + p.h / 2, interior / 2, anillo)
}

/**
 * Dibuja el Wrapped en `canvas` (se ajusta a 1080 × 1920). `datos` es el
 * resultado de `calcularWrapped`. `registro` (opcional, para pruebas) recibe
 * la caja de cada elemento dibujado.
 */
export function dibujarWrapped (canvas, datos, registro = null) {
  canvas.width = WRAPPED_ANCHO
  canvas.height = WRAPPED_ALTO
  const ctx = canvas.getContext('2d')
  const L = crearLienzo(ctx, registro)
  const D = DISPOSICION

  // ── Fondo: lienzo de la app con un resplandor verde muy suave ──────────────
  ctx.fillStyle = C.lienzo
  ctx.fillRect(0, 0, WRAPPED_ANCHO, WRAPPED_ALTO)
  let g = ctx.createRadialGradient(WRAPPED_ANCHO * 0.9, 80, 0, WRAPPED_ANCHO * 0.9, 80, 900)
  g.addColorStop(0, 'rgba(30, 215, 96, 0.20)')
  g.addColorStop(1, 'rgba(30, 215, 96, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, WRAPPED_ANCHO, WRAPPED_ALTO)
  g = ctx.createRadialGradient(0, WRAPPED_ALTO, 0, 0, WRAPPED_ALTO, 1000)
  g.addColorStop(0, 'rgba(30, 215, 96, 0.12)')
  g.addColorStop(1, 'rgba(30, 215, 96, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, WRAPPED_ANCHO, WRAPPED_ALTO)

  // ── Cabecera: la marca de la app y la pastilla «WRAPPED» ──────────────────
  {
    const { x, y, w, h } = D.cab
    L.marca('cab', x, y, T.marca)
    L.texto('cab', 'Skippify', x + T.marca + 20, y + h / 2 + cap(T.marcaTexto) / 2, { peso: 800, px: T.marcaTexto, ls: -1 })
    L.pastilla('cab', 'WRAPPED', x + w, y + h / 2)
  }

  // ── Título: el periodo y sus fechas ───────────────────────────────────────
  {
    const { x, y, w } = D.titulo
    const ceja = `${datos.rango}${datos.fechas ? ` · ${datos.fechas}` : ''}`.toUpperCase()
    L.texto('titulo', ceja, x, y + cap(T.ceja), { peso: 700, px: T.ceja, color: C.verde200, ls: 2.4, max: w })
    const px = ajustarPx(ctx, 800, datos.titulo, T.titulo, 56, w, p => -p * 0.035)
    L.texto('titulo', datos.titulo, x, y + cap(T.ceja) + 18 + cap(T.titulo), { peso: 800, px, ls: -px * 0.035, max: w })
  }

  // ── Tiempo de escucha: la cifra protagonista ──────────────────────────────
  {
    const p = D.tiempo
    L.tarjeta(p)
    // Velo verde desde la izquierda: la tarjeta destacada, como sk-card-lit.
    ctx.save()
    rect(ctx, p.x, p.y, p.w, p.h, RADIO)
    ctx.clip()
    const v = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0)
    v.addColorStop(0, 'rgba(30, 215, 96, 0.18)')
    v.addColorStop(1, 'rgba(30, 215, 96, 0)')
    ctx.fillStyle = v
    ctx.fillRect(p.x, p.y, p.w, p.h)
    ctx.restore()
    L.cabecera('tiempo', p, 'reloj', 'Tiempo de escucha', { pista: 'en 30 días' })
    L.cifra('tiempo', datos.tiempo, p.x + PAD, p.y + p.h - PAD, { px: T.heroe, minPx: 48, max: p.w - PAD * 2, color: C.verde, colorUnidad: C.verde200 })
  }

  // ── Top 3 canciones (título y, debajo, artista) ───────────────────────────
  L.tarjeta(D.canciones)
  L.cabecera('canciones', D.canciones, 'cancion', 'Top 3 canciones', { pista: 'según escuchas' })
  dibujarTop(L, 'canciones', D.canciones, datos.canciones || [], {
    fila: FILA_CANCION,
    redondo: false,
    linea1: c => c.titulo,
    linea2: c => c.artista || 'Artista desconocido'
  })

  // ── Top 3 artistas ────────────────────────────────────────────────────────
  L.tarjeta(D.artistas)
  L.cabecera('artistas', D.artistas, 'artista', 'Top 3 artistas', { pista: 'según escuchas' })
  dibujarTop(L, 'artistas', D.artistas, datos.artistas || [], {
    fila: FILA_ARTISTA,
    redondo: true,
    linea1: a => a.nombre
  })

  // ── Las cuatro cifras ─────────────────────────────────────────────────────
  {
    const sinVariedad = datos.variedad === null || datos.variedad === undefined
    const celdas = [
      { icono: 'artista', rotulo: 'Artistas distintos', valor: String(datos.artistasDistintos ?? 0) },
      { icono: 'cancion', rotulo: 'Canciones distintas', valor: String(datos.cancionesDistintas ?? 0) },
      sinVariedad
        ? { icono: 'variedad', rotulo: 'Variedad', valor: '—', pista: 'aún sin datos', anillo: null }
        : { icono: 'variedad', rotulo: 'Variedad', valor: `${datos.variedad} %`, acento: true, anillo: datos.variedad },
      datos.sesionMedia
        ? { icono: 'sesion', rotulo: 'Sesión media', valor: datos.sesionMedia }
        : { icono: 'sesion', rotulo: 'Sesión media', valor: '—', pista: 'sin sesiones' }
    ]
    celdas.forEach((c, i) => dibujarCelda(L, PANELES[3 + i][0], D.celdas[i], c))
  }

  // ── Pie: su línea base apoya en el margen inferior ────────────────────────
  L.texto('pie', 'Hecho con Skippify', WRAPPED_ANCHO / 2, WRAPPED_ALTO - M, { peso: 600, px: T.pie, color: C.gris600, align: 'center', ls: 1 })

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
