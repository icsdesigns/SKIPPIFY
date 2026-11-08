/**
 * Fábrica de guías interactivas (tutoriales animados de una pestaña).
 *
 * Una guía es el panel que se abre solo la primera vez que se entra en una
 * pestaña, enseña unos pasos con un esquema animado y unas tarjetas de opción
 * compactas, y se queda minimizada en un icono de la cabecera para repasarla.
 * El formato visual lo pone `GuiaInteractiva.vue`; aquí vive el estado.
 *
 * ── Cómo crear una guía nueva (tres pasos) ───────────────────────────────────
 *
 * 1. Define la guía en `src/guias/<nombre>.js` con `crearGuia`:
 *
 *      import { crearGuia } from '@/composables/crearGuia'
 *      import EscenaFunciones from '@/components/guias/EscenaFunciones.vue'
 *
 *      export const guiaFunciones = crearGuia({
 *        id: 'funciones',                     // único; sale en data-tour
 *        clave: 'skippify.funciones-guide.v1', // clave de localStorage propia
 *        ruta: '/features',                   // pestaña donde vive
 *        etiqueta: 'Funciones',               // insignia del panel
 *        ariaLabel: 'Cómo funciona la pestaña Funciones',
 *        pasos: [
 *          {
 *            id: 'modo',                      // único dentro de la guía
 *            titulo: 'Elige un modo',
 *            escena: EscenaFunciones,         // componente con el esquema animado
 *            escenaProps: { paso: 'modo' },   // (opcional) props de la escena
 *            puntos: [                        // cada punto = una tarjeta compacta
 *              { icono: 'ajuste:brujula', titulo: 'Descubrimiento', detalle: 'Una frase.' }
 *            ]
 *          }
 *        ]
 *      })
 *
 *    Iconos de un punto: 'macro:<nombre>' (MacroIcon), 'feature:<nombre>'
 *    (FeatureIcon) o 'ajuste:<nombre>' (AjusteIcon). Nada de emoji. Título:
 *    dos líneas como mucho; detalle: cuatro (norma 6 de NORMAS.md).
 *
 * 2. Añádela a `src/guias/index.js` (lista `GUIAS`). Con eso la cabecera de la
 *    app ya le pone su botón en la pestaña `ruta`, sin tocar App.vue.
 *
 * 3. En la vista de la pestaña, monta el panel y arranca la guía al entrar:
 *
 *      <GuiaInteractiva :guia="guiaFunciones" />
 *      ...
 *      onMounted(() => { if (!tour.state.open) guiaFunciones.autoStart() })
 *
 * La escena (el esquema animado) es un componente Vue normal: pinta con CSS
 * puro, usa la variable `--ciclo` (duración del bucle, 6 s) y debe respetar
 * `prefers-reduced-motion`. Mira `components/guias/EscenaMacros.vue`.
 */
import { reactive, computed } from 'vue'

/** Guías creadas, en orden. La cabecera busca aquí la de la pestaña actual. */
const registro = []

export function guiaDeRuta (ruta) {
  return registro.find((g) => g.ruta === ruta) || null
}

export function todasLasGuias () {
  return registro.slice()
}

/**
 * @param {object} cfg
 * @param {string} cfg.id          Identificador único (data-tour del botón).
 * @param {string} cfg.clave       Clave de localStorage de esta guía.
 * @param {string} cfg.ruta        Ruta de la pestaña donde se enseña el icono.
 * @param {string} cfg.etiqueta    Texto de la insignia del panel.
 * @param {string} cfg.ariaLabel   Nombre accesible del diálogo.
 * @param {string} [cfg.botonLabel] Nombre accesible del botón de la cabecera.
 * @param {Array}  cfg.pasos       Ver ejemplo arriba.
 */
export function crearGuia (cfg) {
  const { id, clave, ruta, etiqueta, ariaLabel, pasos } = cfg
  if (!id || !clave || !Array.isArray(pasos) || !pasos.length) {
    throw new Error('crearGuia: faltan id, clave o pasos')
  }
  const total = pasos.length

  const state = reactive({
    /** Paso actual, base 0. */
    step: 0,
    /** Panel a la vista. */
    open: false,
    /** Ya se ha enseñado alguna vez: no vuelve a abrirse solo. */
    seen: false
  })

  function clamp (n) {
    const i = Number.isFinite(Number(n)) ? Math.trunc(Number(n)) : 0
    return Math.max(0, Math.min(total - 1, i))
  }

  function save () {
    try {
      localStorage.setItem(clave, JSON.stringify({ seen: state.seen, step: state.step }))
    } catch { /* sin almacenamiento: la guía funciona igual, sólo no recuerda */ }
  }

  /** Lee lo guardado. */
  function load () {
    let raw = null
    try { raw = JSON.parse(localStorage.getItem(clave) || 'null') } catch { raw = null }
    if (!raw || typeof raw !== 'object') return
    state.seen = !!raw.seen
    state.step = clamp(raw.step)
  }

  // Se lee al crearla: la pestaña puede ser la primera en montarse (la app se
  // reabre en ella) y entonces nadie habría llamado aún a `load()`.
  load()

  /** Primera vez en la pestaña: abre la guía desde el primer paso. Una sola vez. */
  function autoStart () {
    if (state.seen) return false
    state.seen = true
    state.step = 0
    state.open = true
    save()
    return true
  }

  /** Desde el icono de la cabecera: la abre en el paso en que se dejó. */
  function open () {
    state.seen = true
    state.open = true
    save()
  }

  /** Cerrar sin terminar: se conserva el paso y queda el icono. */
  function minimize () {
    state.open = false
    save()
  }

  /** Último paso: se cierra y la próxima vez empieza desde el principio. */
  function finish () {
    state.open = false
    state.step = 0
    save()
  }

  function goTo (i) {
    state.step = clamp(i)
    save()
  }

  function next () { goTo(state.step + 1) }
  function prev () { goTo(state.step - 1) }

  /** Sólo para pruebas: deja el estado como recién instalado. */
  function reset () {
    state.step = 0
    state.open = false
    state.seen = false
  }

  const guia = {
    id,
    clave,
    ruta: ruta || '',
    etiqueta: etiqueta || '',
    ariaLabel: ariaLabel || `Guía de ${etiqueta || id}`,
    botonLabel: cfg.botonLabel || `Ver la guía de ${etiqueta || id}`,
    pasos,
    total,
    state,
    /** El icono de la cabecera: la guía ya se enseñó y el panel está cerrado. */
    showHeaderIcon: computed(() => state.seen && !state.open),
    load,
    autoStart,
    open,
    minimize,
    finish,
    goTo,
    next,
    prev,
    reset
  }

  registro.push(guia)
  return guia
}
