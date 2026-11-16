/**
 * Imagen del Wrapped mensual: 1080 × 1920 px (formato historias, vertical),
 * dibujada con Canvas 2D y sin dependencias. Sigue SIEMPRE la apariencia de la
 * app (norma 7): lienzo #121212, tarjetas #1F1F1F redondeadas, verde de marca
 * #1ED760 y su gama, la misma pila tipográfica, la marca de la cabecera (disco
 * verde con la «S» oscura), iconos propios de `statIconos.js` y nada de emoji.
 *
 * Diseño «A1·2» (cifra protagonista), de arriba abajo:
 *   mes y marca · HORAS DEL MES (cifra gigante, sin minutos) · mejor día ·
 *   gráfica del año (horas por mes; el mes del Wrapped en verde) · panel con
 *   tu canción, tu artista y el descubrimiento del mes · panel 2 × 2 con
 *   artistas, canciones, variedad y sesión media.
 *
 * INSTAGRAM STORIES tapa arriba el perfil y abajo la barra de respuesta: todo
 * el contenido va dentro de `ZONA_SEGURA` (250 px arriba y 340 px abajo libres)
 * y a `REJILLA.margen` de los lados.
 *
 * ESPACIADO: los bloques se apilan con el mismo `REJILLA.hueco`; dentro de cada
 * panel el contenido queda a `relleno` de sus bordes. La geometría está en
 * `DISPOSICION`, y `dibujarWrapped` puede anotar la caja de cada elemento
 * (tercer parámetro) para comprobarlo en las pruebas.
 *
 * Todo texto variable se recorta con «…» MIDIENDO con `ctx.measureText`, y las
 * cifras encogen hasta caber: nada se sale de su panel.
 */
import { BRAND_S_PATH, BRAND_S_WIDTH } from '@/lib/brandMark'
import { STAT_ICONOS } from '@/lib/statIconos'

export const WRAPPED_ANCHO = 1080
export const WRAPPED_ALTO = 1920

/** Lo que tapa Instagram en una historia de 1920 px: perfil arriba, respuesta abajo. */
export const ZONA_SEGURA = Object.freeze({ arriba: 250, abajo: 340 })

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
  tesela: 'rgba(30, 215, 96, 0.18)',
  pastilla: 'rgba(30, 215, 96, 0.14)',
  chip: 'rgba(255, 255, 255, 0.06)',
  barra: 'rgba(255, 255, 255, 0.16)',
  futuro: 'rgba(255, 255, 255, 0.12)',
  filete: 'rgba(255, 255, 255, 0.08)'
}

/**
 * Rejilla de espaciado. Única fuente de márgenes y huecos.
 *  - margen:  de los lados de la imagen al contenido.
 *  - hueco:   entre dos bloques consecutivos (vertical).
 *  - relleno: del borde de un panel a su contenido (horizontal / vertical).
 */
export const REJILLA = Object.freeze({
  margen: 72,
  hueco: 34,
  rellenoX: 30,
  rellenoY: 24,
  radio: 48
})
const { margen: M, hueco: HUECO, rellenoX: PX, rellenoY: PY, radio: RADIO } = REJILLA

/** Margen lateral y ancho útil (se exportan también para las pruebas). */
export { M }
export const CW = WRAPPED_ANCHO - M * 2

/** Alto de mayúsculas y cifras respecto al cuerpo de la fuente. */
export const ALTO_CAP = 0.7
const cap = px => px * ALTO_CAP

/** Tamaños (px de la imagen final). */
const T = {
  ceja: 66, // alto de la fila de mes y marca
  pastilla: 26,
  marca: 54,
  marcaTexto: 30,
  horas: 234, // la cifra protagonista
  horasRotulo: 84,
  horasSub: 30,
  chip: 84, // alto de la pastilla del mejor día
  chipTesela: 54,
  chipTexto: 30,
  anio: 192, // alto de la gráfica (barras + iniciales)
  anioAncho: 0.86, // fracción del ancho útil
  anioMes: 21,
  anioHueco: 15,
  fila: 84, // alto de una fila del panel principal (= su tesela)
  filaHueco: 18,
  filaRotulo: 24,
  filaValor: 36,
  filaDato: 27,
  nuevo: 20,
  celdaTesela: 78,
  celdaCifra: 54,
  celdaRotulo: 21,
  celdaRellenoY: 21
}

/**
 * Geometría, calculada sólo con `REJILLA`, `ZONA_SEGURA` y `T`. Cada bloque
 * es `{ x, y, w, h }`.
 */
function crearDisposicion () {
  const x = M
  const top = ZONA_SEGURA.arriba + 32
  const ceja = { x, y: top, w: CW, h: T.ceja }
  const horas = { x, y: ceja.y + ceja.h + HUECO, w: CW, h: cap(T.horas) }
  const mejorDia = { x, y: horas.y + horas.h + HUECO, w: CW, h: T.chip }
  const anchoAnio = Math.round(CW * T.anioAncho)
  const anio = { x: x + (CW - anchoAnio) / 2, y: mejorDia.y + mejorDia.h + HUECO, w: anchoAnio, h: T.anio }
  const principal = { x, y: anio.y + anio.h + HUECO, w: CW, h: PY * 2 + T.fila * 3 + T.filaHueco * 2 }
  const filas = [0, 1, 2].map(i => ({ x: x + PX, y: principal.y + PY + i * (T.fila + T.filaHueco), w: CW - PX * 2, h: T.fila }))
  const altoCelda = T.celdaRellenoY * 2 + T.celdaTesela
  const cifras = { x, y: principal.y + principal.h + HUECO, w: CW, h: altoCelda * 2 }
  const wc = CW / 2
  const celdas = [0, 1, 2, 3].map(i => ({ x: x + (i % 2) * wc, y: cifras.y + Math.floor(i / 2) * altoCelda, w: wc, h: altoCelda }))
  return { ceja, horas, mejorDia, anio, principal, filas, cifras, celdas }
}

export const DISPOSICION = crearDisposicion()

/** Bloques con nombre, en orden de arriba abajo (para las pruebas). */
export const BLOQUES = [
  ['ceja', DISPOSICION.ceja],
  ['horas', DISPOSICION.horas],
  ['mejorDia', DISPOSICION.mejorDia],
  ['anio', DISPOSICION.anio],
  ['principal', DISPOSICION.principal],
  ['cifras', DISPOSICION.cifras]
]

function fuente (ctx, peso, px) {
  ctx.font = `${peso} ${px}px ${FUENTE}`
}

function espaciado (ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`
}

function rect (ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
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

const MESES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/**
 * Pinta la imagen. `registro` (opcional) recibe la caja de cada elemento de
 * contenido: `{ zona, x0, y0, x1, y1 }`.
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

  function medir (str, peso, px, ls = 0) {
    fuente(ctx, peso, px)
    espaciado(ctx, ls)
    const w = ctx.measureText(String(str)).width
    espaciado(ctx, 0)
    return w
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

  /** Tesela de la app: cuadrado verde translúcido con el icono en verde claro. */
  function tesela (zona, nombre, x, y, size) {
    ctx.fillStyle = C.tesela
    rect(ctx, x, y, size, size, size * 0.32)
    ctx.fill()
    const ic = size * 0.52
    icono(nombre, x + (size - ic) / 2, y + (size - ic) / 2, ic, C.verde200)
    anota(zona, x, y, x + size, y + size)
  }

  function tarjeta (p) {
    ctx.fillStyle = C.tarjeta
    rect(ctx, p.x, p.y, p.w, p.h, RADIO)
    ctx.fill()
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

  /** Pastilla redondeada con texto en mayúsculas espaciadas. Devuelve su ancho. */
  function pastilla (zona, str, x, y, h, { px = T.pastilla, fondo = C.pastilla, color = C.verde200, ls = 3.6, relleno = 30, peso = 800 } = {}) {
    const w = medir(str, peso, px, ls) + relleno * 2
    ctx.fillStyle = fondo
    rect(ctx, x, y, w, h, h / 2)
    ctx.fill()
    anota(zona, x, y, x + w, y + h)
    texto(zona, str, x + w / 2, y + h / 2 + cap(px) / 2, { peso, px, color, ls, align: 'center' })
    return w
  }

  return { ctx, texto, medir, icono, tesela, tarjeta, marca, pastilla }
}

/** Fila del panel principal: tesela, rótulo y valor, y un dato a la derecha. */
function dibujarFila (L, f, { icono, rotulo, valor, dato, nuevo = false, apagado = false }) {
  const zona = 'principal'
  L.tesela(zona, icono, f.x, f.y, T.fila)
  const tx = f.x + T.fila + 30
  const der = f.x + f.w
  const anchoDato = dato ? L.medir(dato, 700, T.filaDato) : 0
  if (dato) L.texto(zona, dato, der, f.y + f.h / 2 + cap(T.filaDato) / 2, { peso: 700, px: T.filaDato, color: C.gris400, align: 'right' })
  const max = der - tx - (dato ? anchoDato + 24 : 0)
  // Rótulo arriba y valor abajo, centrados en vertical respecto a la tesela.
  const bloque = cap(T.filaRotulo) + 14 + cap(T.filaValor)
  const yRot = f.y + (f.h - bloque) / 2 + cap(T.filaRotulo)
  const rot = L.texto(zona, rotulo.toUpperCase(), tx, yRot, { peso: 800, px: T.filaRotulo, color: C.gris500, ls: 3, max })
  if (nuevo) {
    const xN = tx + rot.ancho + 14
    const hN = 34
    if (xN + 110 <= tx + max) L.pastilla(zona, 'NUEVO', xN, yRot - cap(T.filaRotulo) / 2 - hN / 2, hN, { px: T.nuevo, fondo: C.verde, color: '#000000', ls: 2.4, relleno: 12, peso: 900 })
  }
  L.texto(zona, valor, tx, yRot + 14 + cap(T.filaValor), { peso: 800, px: T.filaValor, color: apagado ? C.gris400 : C.blanco, max })
}

/** Celda del panel de cifras: tesela a la izquierda; cifra arriba y rótulo debajo. */
function dibujarCelda (L, c, { icono, valor, unidad = '', rotulo }) {
  const zona = 'cifras'
  const x = c.x + PX
  const y = c.y + T.celdaRellenoY
  L.tesela(zona, icono, x, y, T.celdaTesela)
  const tx = x + T.celdaTesela + 27
  const max = c.x + c.w - PX - tx
  const bloque = cap(T.celdaCifra) + 16 + cap(T.celdaRotulo)
  const base = y + (T.celdaTesela - bloque) / 2 + cap(T.celdaCifra)
  // Cifra y unidad: encogen juntas hasta caber.
  const pu = px => Math.round(px * 0.5)
  let px = T.celdaCifra
  const ancho = p => L.medir(valor, 900, p, -p * 0.02) + (unidad ? 4 + L.medir(unidad, 800, pu(p)) : 0)
  while (px > 26 && ancho(px) > max) px -= 2
  const r = L.texto(zona, valor, tx, base, { peso: 900, px, ls: -px * 0.02, max })
  if (unidad) L.texto(zona, unidad, tx + r.ancho + 4, base, { peso: 800, px: pu(px), color: C.gris300, max: Math.max(0, max - r.ancho - 4) })
  L.texto(zona, rotulo, tx, base + 16 + cap(T.celdaRotulo), { peso: 700, px: T.celdaRotulo, color: C.gris500, ls: 0.6, max })
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

  // ── Fondo: lienzo de la app con un halo verde tras la cifra ───────────────
  ctx.fillStyle = C.lienzo
  ctx.fillRect(0, 0, WRAPPED_ANCHO, WRAPPED_ALTO)
  const g = ctx.createRadialGradient(WRAPPED_ANCHO / 2, D.horas.y + D.horas.h / 2, 0, WRAPPED_ANCHO / 2, D.horas.y + D.horas.h / 2, 760)
  g.addColorStop(0, 'rgba(30, 215, 96, 0.26)')
  g.addColorStop(1, 'rgba(30, 215, 96, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, WRAPPED_ANCHO, WRAPPED_ALTO)

  // ── Mes (pastilla) y marca ───────────────────────────────────────────────
  {
    const c = D.ceja
    const wTexto = L.medir('Skippify', 800, T.marcaTexto, -0.6)
    const xMarca = c.x + c.w - wTexto - 18 - T.marca
    L.marca('ceja', xMarca, c.y + (c.h - T.marca) / 2, T.marca)
    L.texto('ceja', 'Skippify', c.x + c.w, c.y + c.h / 2 + cap(T.marcaTexto) / 2, { peso: 800, px: T.marcaTexto, ls: -0.6, align: 'right' })
    const mes = String(datos.rango || '').toUpperCase()
    const maxMes = xMarca - 40 - c.x
    // La pastilla del mes nunca invade la marca: encoge el texto si hace falta.
    let px = T.pastilla
    while (px > 18 && L.medir(mes, 800, px, 3.6) + 60 > maxMes) px -= 1
    L.pastilla('ceja', recortarTextoCon(L, mes, px, maxMes - 60), c.x, c.y, c.h, { px })
  }

  // ── Horas: la cifra protagonista ─────────────────────────────────────────
  {
    const h = D.horas
    const valor = String(datos.horas ?? '0')
    const base = h.y + h.h
    // «horas» y la línea de debajo van a la derecha de la cifra; la cifra
    // encoge si con ellas no cabe en el ancho útil.
    const anchoLado = Math.max(L.medir('horas', 900, T.horasRotulo, -1), L.medir('de música este mes', 700, T.horasSub))
    const max = h.w - anchoLado - 30
    const px = ajustarPx(ctx, 900, valor, T.horas, 96, max, p => -p * 0.055)
    const r = L.texto('horas', valor, h.x, base, { peso: 900, px, color: C.verde, ls: -px * 0.055, max })
    const lx = h.x + r.ancho + 30
    L.texto('horas', 'de música este mes', lx, base - 9, { peso: 700, px: T.horasSub, color: C.gris300, max: h.x + h.w - lx })
    L.texto('horas', 'horas', lx, base - 9 - cap(T.horasSub) - 18, { peso: 900, px: T.horasRotulo, ls: -1, max: h.x + h.w - lx })
  }

  // ── Mejor día ────────────────────────────────────────────────────────────
  {
    const m = D.mejorDia
    const md = datos.mejorDia
    const etiqueta = 'Tu mejor día:'
    const valor = md ? `${md.texto} · ${md.tiempo}` : 'sin escuchas'
    const pad = 15
    const tx = m.x + pad + T.chipTesela + 18
    const wEt = L.medir(etiqueta, 700, T.chipTexto)
    const wVal = L.medir(valor, 800, T.chipTexto)
    const w = Math.min(m.w, tx - m.x + wEt + 12 + wVal + 30)
    ctx.fillStyle = C.chip
    rect(ctx, m.x, m.y, w, m.h, m.h / 2)
    ctx.fill()
    L.tesela('mejorDia', 'calendario', m.x + pad, m.y + (m.h - T.chipTesela) / 2, T.chipTesela)
    const base = m.y + m.h / 2 + cap(T.chipTexto) / 2
    const e = L.texto('mejorDia', etiqueta, tx, base, { peso: 700, px: T.chipTexto, color: C.gris300 })
    L.texto('mejorDia', valor, tx + e.ancho + 12, base, { peso: 800, px: T.chipTexto, max: m.x + w - 30 - (tx + e.ancho + 12) })
  }

  // ── Gráfica del año: horas por mes ───────────────────────────────────────
  {
    const a = D.anio
    const horas = Array.isArray(datos.anio?.horas) ? datos.anio.horas : Array(12).fill(null)
    const actual = Number.isInteger(datos.anio?.mes) ? datos.anio.mes : -1
    const n = 12
    const wb = (a.w - T.anioHueco * (n - 1)) / n
    const altoBarras = a.h - cap(T.anioMes) - 14
    const maximo = Math.max(0, ...horas.filter(v => Number.isFinite(v)))
    for (let i = 0; i < n; i++) {
      const x = a.x + i * (wb + T.anioHueco)
      const v = horas[i]
      const futuro = !Number.isFinite(v)
      const hb = futuro ? 6 : Math.max(8, maximo > 0 ? Math.round(altoBarras * v / maximo) : 8)
      ctx.fillStyle = i === actual ? C.verde : (futuro ? C.futuro : C.barra)
      rect(ctx, x, a.y + altoBarras - hb, wb, hb, Math.min(9, wb / 2))
      ctx.fill()
      if (registro) registro.push({ zona: 'anio', x0: x, y0: a.y + altoBarras - hb, x1: x + wb, y1: a.y + altoBarras, barra: true, valor: v })
      L.texto('anio', MESES[i], x + wb / 2, a.y + a.h, { peso: 800, px: T.anioMes, color: i === actual ? C.verde200 : C.gris600, align: 'center' })
    }
  }

  // ── Panel principal: canción, artista y descubrimiento ───────────────────
  {
    L.tarjeta(D.principal)
    const can = (datos.canciones || [])[0]
    const art = (datos.artistas || [])[0]
    const desc = datos.descubrimiento
    const veces = n => (n === 1 ? '1 escucha' : `${n} escuchas`)
    dibujarFila(L, D.filas[0], can
      ? { icono: 'cancion', rotulo: 'Tu canción', valor: can.titulo, dato: veces(Number(can.count) || 0) }
      : { icono: 'cancion', rotulo: 'Tu canción', valor: 'Aún sin escuchas', apagado: true })
    dibujarFila(L, D.filas[1], art
      ? { icono: 'artista', rotulo: 'Tu artista', valor: art.nombre, dato: veces(Number(art.count) || 0) }
      : { icono: 'artista', rotulo: 'Tu artista', valor: 'Aún sin escuchas', apagado: true })
    const nuevas = Number(desc?.cancionesNuevas) || 0
    dibujarFila(L, D.filas[2], desc
      ? { icono: 'descubrimiento', rotulo: 'Descubrimiento', valor: String(desc.artista || '').trim() || 'Artista nuevo', dato: nuevas === 1 ? '1 canción' : `${nuevas} canciones`, nuevo: true }
      : { icono: 'descubrimiento', rotulo: 'Descubrimiento', valor: 'Ninguno este mes', apagado: true })
  }

  // ── Panel de cifras 2 × 2 con filetes ────────────────────────────────────
  {
    const p = D.cifras
    L.tarjeta(p)
    ctx.fillStyle = C.filete
    ctx.fillRect(p.x + p.w / 2 - 1, p.y + 18, 2, p.h - 36)
    ctx.fillRect(p.x + 18, p.y + p.h / 2 - 1, p.w - 36, 2)
    const [c0, c1, c2, c3] = D.celdas
    dibujarCelda(L, c0, { icono: 'grupo', valor: String(datos.artistasDistintos ?? 0), rotulo: 'artistas' })
    dibujarCelda(L, c1, { icono: 'disco', valor: String(datos.cancionesDistintas ?? 0), rotulo: 'canciones' })
    const sinVariedad = datos.variedad === null || datos.variedad === undefined
    dibujarCelda(L, c2, sinVariedad
      ? { icono: 'variedad', valor: '—', rotulo: 'variedad' }
      : { icono: 'variedad', valor: String(datos.variedad), unidad: '%', rotulo: 'variedad' })
    const min = Number.isFinite(datos.sesionMediaMin) ? Math.round(datos.sesionMediaMin) : null
    const sesion = min === null
      ? { valor: '—', unidad: '' }
      : (min >= 60 ? { valor: String(Math.round(min / 6) / 10).replace('.', ','), unidad: 'h' } : { valor: String(min), unidad: 'min' })
    dibujarCelda(L, c3, { icono: 'sesion', ...sesion, rotulo: 'sesión media' })
  }

  return canvas
}

/** Recorta con la fuente de la pastilla (800 y espaciado 3,6). */
function recortarTextoCon (L, str, px, max) {
  fuente(L.ctx, 800, px)
  espaciado(L.ctx, 3.6)
  const r = recortarTexto(L.ctx, str, max)
  espaciado(L.ctx, 0)
  return r
}

/**
 * La última imagen generada ({ clave, blob }), compartida por toda la app para
 * no volver a dibujarla si los datos no han cambiado.
 */
export const cacheWrapped = { png: null }

/** Genera el PNG como Blob (rechaza si el navegador no puede codificarlo). */
export async function generarWrappedPng (datos) {
  const canvas = document.createElement('canvas')
  dibujarWrapped(canvas, datos)
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen'))), 'image/png')
  })
}
