import { h } from 'vue'

/**
 * Iconos de las pestañas, compartidos por la navegación y la guía rápida: la
 * guía enseña cada pestaña con el mismo dibujo que el usuario verá luego en la
 * barra, así que no pueden ir cada uno por su lado.
 *
 * Trazos de cada icono, en dos versiones: contorno para el estado normal y
 * relleno para el activo. Es el recurso que usa Spotify para marcar la pestaña
 * en la que estás sin recurrir al color, de modo que también se distingue en
 * escala de grises.
 */
const ICON_PATHS = {
  home: [['path', { d: 'M4 10.5 12 3.5l8 7V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z' }]],
  bars: [
    ['line', { x1: 4, y1: 20, x2: 20, y2: 20 }],
    ['rect', { x: 6, y: 11, width: 3, height: 6 }],
    ['rect', { x: 11, y: 8, width: 3, height: 9 }],
    ['rect', { x: 16, y: 5, width: 3, height: 12 }]
  ],
  layers: [
    ['path', { d: 'M12 2 2 7l10 5 10-5-10-5z' }],
    ['path', { d: 'M2 17l10 5 10-5' }],
    ['path', { d: 'M2 12l10 5 10-5' }]
  ],
  trophy: [
    ['circle', { cx: 12, cy: 8, r: 4 }],
    ['path', { d: 'M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6' }],
    ['path', { d: 'M2 12h4' }],
    ['path', { d: 'M18 12h4' }]
  ],
  bolt: [['path', { d: 'M13 2 4.5 13.5H11l-1 8.5L18.5 10.5H12l1-8.5z' }]],
  shield: [['path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }]]
}

/** Iconos que quedan bien rellenos al estar activos (silueta cerrada). */
const FILLABLE = new Set(['home', 'trophy', 'bolt', 'shield', 'layers'])

const NavIcon = (props) => {
  const filled = props.active && FILLABLE.has(props.name)
  return h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      class: props.class || 'h-5 w-5',
      viewBox: '0 0 24 24',
      fill: filled ? 'currentColor' : 'none',
      stroke: 'currentColor',
      'stroke-width': filled ? 1.5 : 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true'
    },
    (ICON_PATHS[props.name] || []).map(([tag, attrs]) => h(tag, attrs))
  )
}
NavIcon.props = ['name', 'active', 'class']

export default NavIcon
