import { h } from 'vue'

/**
 * Iconos de los grupos de Comunidad: trazo redondeado de 2 px sobre 24, sin
 * relleno, en el mismo idioma que los de las pestañas (NavIcon). Sustituyen a
 * los emoji que había en las fichas y en las opciones de crear o unirse.
 */
const TRAZOS = {
  users: [
    ['circle', { cx: 9, cy: 8, r: 3.5 }],
    ['path', { d: 'M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6' }],
    ['circle', { cx: 17.5, cy: 9, r: 2.5 }],
    ['path', { d: 'M17 14.2c2.6.3 4.5 2.3 4.5 5.3' }]
  ],
  clock: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M12 7v5l3 2' }]
  ],
  disc: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['circle', { cx: 12, cy: 12, r: 2.5 }]
  ],
  medal: [
    ['circle', { cx: 12, cy: 9, r: 5 }],
    ['path', { d: 'M8.5 13.5 6.5 21l5.5-3 5.5 3-2-7.5' }]
  ],
  mic: [
    ['rect', { x: 9, y: 3, width: 6, height: 11, rx: 3 }],
    ['path', { d: 'M5 11a7 7 0 0 0 14 0' }],
    ['path', { d: 'M12 18v3' }]
  ],
  note: [
    ['path', { d: 'M9 18V5l11-2v13' }],
    ['circle', { cx: 6.5, cy: 18, r: 2.5 }],
    ['circle', { cx: 17.5, cy: 16, r: 2.5 }]
  ],
  copy: [
    ['rect', { x: 9, y: 9, width: 11, height: 11, rx: 2 }],
    ['path', { d: 'M5 15V6a2 2 0 0 1 2-2h8' }]
  ],
  share: [
    ['path', { d: 'M12 15V3' }],
    ['path', { d: 'm7 8 5-5 5 5' }],
    ['path', { d: 'M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6' }]
  ],
  refresh: [
    ['path', { d: 'M20 11a8 8 0 0 0-14.5-4' }],
    ['path', { d: 'M4 13a8 8 0 0 0 14.5 4' }],
    ['path', { d: 'M20 4v5h-5' }],
    ['path', { d: 'M4 20v-5h5' }]
  ],
  plus: [['path', { d: 'M12 5v14M5 12h14' }]],
  key: [
    ['circle', { cx: 8, cy: 15, r: 4 }],
    ['path', { d: 'm11 12 9-9' }],
    ['path', { d: 'm16 7 3 3' }]
  ],
  phone: [
    ['rect', { x: 7, y: 2, width: 10, height: 20, rx: 2 }],
    ['path', { d: 'M11 18h2' }]
  ],
  restore: [
    ['path', { d: 'M3 12a9 9 0 1 0 3-6.7L3 8' }],
    ['path', { d: 'M3 3v5h5' }],
    ['path', { d: 'M12 8v4l3 2' }]
  ],
  bolt: [['path', { d: 'M13 2 4.5 13.5H11l-1 8.5L18.5 10.5H12l1-8.5z' }]],
  check: [['path', { d: 'm5 12.5 4.5 4.5L19 7' }]],
  // Raíces del árbol de Comunidad: un servidor central frente a móviles que se
  // hablan entre sí sin nadie en medio.
  server: [
    ['rect', { x: 4, y: 4, width: 16, height: 6.5, rx: 2 }],
    ['rect', { x: 4, y: 13.5, width: 16, height: 6.5, rx: 2 }],
    ['path', { d: 'M8 7.25h.01M8 16.75h.01' }]
  ],
  mesh: [
    ['circle', { cx: 6, cy: 7, r: 2.5 }],
    ['circle', { cx: 18, cy: 7, r: 2.5 }],
    ['circle', { cx: 12, cy: 18, r: 2.5 }],
    ['path', { d: 'M8.5 7h7M7.2 9.2l3.6 6.6M16.8 9.2l-3.6 6.6' }]
  ],
  chevron: [['path', { d: 'm9 6 6 6-6 6' }]]
}

const GrupoIcono = (props) => h(
  'svg',
  {
    xmlns: 'http://www.w3.org/2000/svg',
    class: props.class || 'h-4 w-4',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true'
  },
  (TRAZOS[props.name] || []).map(([tag, attrs]) => h(tag, attrs))
)
GrupoIcono.props = ['name', 'class']

export default GrupoIcono
