/**
 * chartTheme — colores y opciones compartidas de las gráficas.
 *
 * Chart.js pinta en un canvas, así que no hereda nada de Tailwind: cada color
 * hay que dárselo escrito. Estaban repartidos entre `PlaysChart.vue` y
 * `StatsView.vue`, con los mismos valores copiados a mano en los dos sitios —y
 * ya habían empezado a divergir. Aquí viven una sola vez y deben coincidir con
 * las rampas de `tailwind.config.js`.
 */

/** Verde de Spotify, el mismo que `brand-400`. */
export const CHART_ACCENT = '#1ed760'
export const CHART_ACCENT_SOFT = 'rgba(30, 215, 96, 0.55)'
export const CHART_ACCENT_STRONG = 'rgba(30, 215, 96, 0.9)'

/** Superficie elevada (`ink-400`) para el globo de datos. */
const TOOLTIP_BG = 'rgba(42, 42, 42, 0.97)'
/** Gris secundario de Spotify: el que usan los rótulos de los ejes. */
const AXIS = '#b3b3b3'
const GRID = 'rgba(255, 255, 255, 0.08)'

/**
 * Globo de datos. Sin borde de color y con el texto en blanco: sobre el gris
 * oscuro se lee mejor que el verde claro que llevaba antes (2,9:1).
 */
export const chartTooltip = {
  backgroundColor: TOOLTIP_BG,
  borderColor: 'rgba(255, 255, 255, 0.10)',
  borderWidth: 1,
  titleColor: '#ffffff',
  titleFont: { size: 12, weight: '700' },
  bodyColor: '#e4e4e4',
  bodyFont: { size: 12 },
  padding: 10,
  cornerRadius: 8,
  displayColors: false
}

/**
 * Ejes. `maxTicksLimit` y `autoSkip` son lo que impide que en una ventana
 * estrecha los rótulos del eje X se amontonen unos sobre otros.
 */
export function chartScales ({ yMaxTicks = 5 } = {}) {
  return {
    x: {
      ticks: {
        color: AXIS,
        font: { size: 11, weight: '600' },
        autoSkip: true,
        maxRotation: 0,
        minRotation: 0
      },
      grid: { display: false },
      border: { display: false }
    },
    y: {
      min: 0,
      ticks: {
        color: AXIS,
        precision: 0,
        font: { size: 11, weight: '600' },
        maxTicksLimit: yMaxTicks
      },
      grid: { color: GRID },
      border: { display: false }
    }
  }
}

/**
 * Relleno degradado bajo una línea. Se devuelve como función porque Chart.js
 * necesita el área de dibujo, que no existe hasta el primer render.
 */
export function accentAreaFill (ctx) {
  const { chart } = ctx
  if (!chart.chartArea) return 'rgba(30, 215, 96, 0.16)'
  const g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom)
  g.addColorStop(0, 'rgba(30, 215, 96, 0.38)')
  g.addColorStop(1, 'rgba(30, 215, 96, 0)')
  return g
}

/** Verde con la opacidad que se pida: lo usa el mapa de calor por horas. */
export function accentAlpha (alpha) {
  return `rgba(30, 215, 96, ${alpha})`
}

/** Color de fondo de los puntos de una línea: el lienzo, para que «calen». */
export const CHART_SURFACE = '#121212'
