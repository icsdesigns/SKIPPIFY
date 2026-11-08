/**
 * Guía animada de la pestaña Macros, en tres pasos: conectar la cuenta, montar
 * una macro de ejemplo (novedades de una playlist → copiar → Tus me gusta) y
 * vincularla al botón de función de los auriculares. Las escenas animadas
 * están en `components/guias/EscenaMacros.vue`.
 *
 * La clave de localStorage es la de siempre: quien ya la completó no la ve de
 * nuevo.
 */
import { crearGuia } from '@/composables/crearGuia'
import EscenaMacros from '@/components/guias/EscenaMacros.vue'

export const MACROS_GUIDE_KEY = 'skippify.macros-guide.v1'

export const guiaMacros = crearGuia({
  id: 'macros',
  clave: MACROS_GUIDE_KEY,
  ruta: '/macros',
  etiqueta: 'Macros',
  ariaLabel: 'Cómo funciona la pestaña Macros',
  botonLabel: 'Ver la guía de Macros',
  pasos: [
    {
      id: 'conectar',
      titulo: 'Conecta tu cuenta de Spotify',
      escena: EscenaMacros,
      escenaProps: { paso: 'conectar' },
      puntos: [
        { icono: 'ajuste:cuenta', titulo: 'Crea una aplicación', detalle: 'En developer.spotify.com, y copia su Client ID.' },
        { icono: 'ajuste:antena', titulo: 'Pégalo y conecta', detalle: 'Pégalo en la pestaña y pulsa Conectar: el acceso lo concedes tú y puedes revocarlo.' },
        { icono: 'ajuste:escudo', titulo: 'Sin cuenta no hay macros', detalle: 'Sin la cuenta conectada no se puede montar ninguna macro.', tono: 'amber' }
      ]
    },
    {
      id: 'macro',
      titulo: 'Monta una macro de ejemplo',
      escena: EscenaMacros,
      escenaProps: { paso: 'macro' },
      puntos: [
        { icono: 'macro:novedades', titulo: 'Origen', detalle: 'Las novedades de una playlist, lo añadido desde la última vez.' },
        { icono: 'macro:copiar', titulo: 'Acción y destino', detalle: 'Acción: copiar. Destino: Tus me gusta.' },
        { icono: 'macro:megusta', titulo: 'El resultado', detalle: 'Cada canción nueva acaba en tus favoritas, sin tocar la playlist original.' }
      ]
    },
    {
      id: 'boton',
      titulo: 'Vincúlala al botón de los auriculares',
      escena: EscenaMacros,
      escenaProps: { paso: 'boton' },
      puntos: [
        { icono: 'feature:auriculares', titulo: 'Elige la macro', detalle: 'En la sección Botón de los auriculares, elige la macro.', tono: 'sky' },
        { icono: 'macro:manual', titulo: 'Mantén pulsado', detalle: 'Mantén pulsado el botón de función y se ejecuta en ese momento, con la app cerrada.', tono: 'sky' },
        { icono: 'ajuste:ayuda', titulo: 'La primera vez', detalle: 'Android te pregunta con qué app abrirlo: Skippify · macro y Siempre.', tono: 'amber' }
      ]
    }
  ]
})

export const MACROS_GUIDE_STEPS = guiaMacros.total
