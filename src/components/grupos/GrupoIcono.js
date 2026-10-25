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
  chevron: [['path', { d: 'm9 6 6 6-6 6' }]],
  // Cifras de la ficha de cada miembro.
  finish: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'm8 12.5 2.8 2.8L16.5 9.5' }]
  ],
  calendar: [
    ['rect', { x: 3.5, y: 5, width: 17, height: 15.5, rx: 2.5 }],
    ['path', { d: 'M3.5 10h17M8 3v4M16 3v4' }],
    ['path', { d: 'M8 14h2M14 14h2M8 17.5h2' }]
  ],
  sun: [
    ['circle', { cx: 12, cy: 12, r: 4 }],
    ['path', { d: 'M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4' }]
  ],
  sunset: [
    ['path', { d: 'M7 17a5 5 0 0 1 10 0' }],
    ['path', { d: 'M2.5 17h19M5 21h14' }],
    ['path', { d: 'M12 3v5M8.5 6.5 12 3l3.5 3.5' }]
  ],
  moon: [['path', { d: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z' }]],
  stars: [
    ['path', { d: 'M10 3.5 11.6 8l4.4 1.6-4.4 1.6L10 15.6 8.4 11.2 4 9.6 8.4 8z' }],
    ['path', { d: 'M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z' }]
  ],
  timer: [
    ['circle', { cx: 12, cy: 13.5, r: 7.5 }],
    ['path', { d: 'M12 9.5v4l2.5 1.5M9.5 2.5h5M19 6l1.5-1.5' }]
  ],
  shuffle: [
    ['path', { d: 'M3 6.5h3.5c2 0 3.2 1 4.2 2.6l2.6 5.3c.8 1.6 2.2 2.6 4.2 2.6H21' }],
    ['path', { d: 'M3 17h3.5c1.4 0 2.4-.5 3.2-1.4M14 7.9c.8-.9 1.8-1.4 3.2-1.4H21' }],
    ['path', { d: 'm18.5 4 2.5 2.5L18.5 9M18.5 14.5 21 17l-2.5 2.5' }]
  ],
  library: [
    ['path', { d: 'M4 4v16M8.5 4v16' }],
    ['path', { d: 'm13 4.5 3.8-1 3.7 15.6-3.8.9z' }]
  ]
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
