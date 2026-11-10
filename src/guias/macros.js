/**
 * Guía animada de la pestaña Macros, en cuatro pasos que montan una misma macro
 * SUGERIDA —un ejemplo que el usuario puede crear, no algo que ya tenga—:
 * ejecución manual → copiar → Tus me gusta, y después la aplican al botón de
 * función de los auriculares. Lo dicen el título del primer paso, su primer
 * punto y la etiqueta «Macro sugerida» de cada escena. Las escenas animadas están en
 * `components/guias/EscenaMacros.vue`.
 *
 * Clave de localStorage: `.v2`. El contenido cambió por completo (la v1 enseñaba
 * a conectar la cuenta y a montar «novedades de una playlist»), así que quien ya
 * vio la guía antigua la ve una vez más, ahora con el ejemplo nuevo. La cuenta
 * ya no necesita guía: el panel «Vincula tu Spotify» lleva sus propios pasos.
 */
import { crearGuia } from '@/composables/crearGuia'
import EscenaMacros from '@/components/guias/EscenaMacros.vue'

export const MACROS_GUIDE_KEY = 'skippify.macros-guide.v2'

export const guiaMacros = crearGuia({
  id: 'macros',
  clave: MACROS_GUIDE_KEY,
  ruta: '/macros',
  etiqueta: 'Macros',
  ariaLabel: 'Cómo funciona la pestaña Macros',
  botonLabel: 'Ver la guía de Macros',
  pasos: [
    {
      id: 'manual',
      titulo: 'Macro sugerida: ejecución manual',
      escena: EscenaMacros,
      escenaProps: { paso: 'manual' },
      puntos: [
        { icono: 'macro:novedades', titulo: 'Una sugerencia', detalle: 'Es una macro de ejemplo que puedes crear tú. Aún no la tienes configurada.', tono: 'violet' },
        { icono: 'macro:manual', titulo: 'Tú decides cuándo', detalle: 'Actúa sobre la canción que suena, sólo cuando tú lo pides.' },
        { icono: 'ajuste:play', titulo: 'Nunca se lanza sola', detalle: 'Se ejecuta con «Ejecutar» o con el botón de los auriculares.' },
        { icono: 'ajuste:ojo', titulo: 'Pruébala antes', detalle: 'La vista previa te dice qué haría, sin tocar nada.', tono: 'sky' }
      ]
    },
    {
      id: 'copiar',
      titulo: 'Acción: copiar',
      escena: EscenaMacros,
      escenaProps: { paso: 'copiar' },
      puntos: [
        { icono: 'macro:copiar', titulo: 'Copiar', detalle: 'Añade la canción al destino sin quitarla de donde esté.' },
        { icono: 'macro:mover', titulo: 'Sin riesgo', detalle: 'La música sigue sonando: copiar no borra nada de nada.', tono: 'sky' }
      ]
    },
    {
      id: 'megusta',
      titulo: 'Destino: Tus me gusta',
      escena: EscenaMacros,
      escenaProps: { paso: 'megusta' },
      puntos: [
        { icono: 'macro:megusta', titulo: 'Tus me gusta', detalle: 'La canción acaba en tu biblioteca de canciones guardadas.' },
        { icono: 'macro:nueva', titulo: 'O una playlist', detalle: 'También puede ser una playlist tuya o una nueva.', tono: 'sky' },
        { icono: 'macro:guardar', titulo: 'Guárdala', detalle: 'Ponle nombre en el último paso y queda en «Tus macros».' }
      ]
    },
    {
      id: 'boton',
      titulo: 'Aplícala al botón de los auriculares',
      escena: EscenaMacros,
      escenaProps: { paso: 'boton' },
      puntos: [
        { icono: 'feature:auriculares', titulo: 'Elige la macro', detalle: 'En «Botón de los auriculares», marca tu macro.', tono: 'sky' },
        { icono: 'macro:manual', titulo: 'Mantén pulsado', detalle: 'El botón de función la ejecuta, con la app cerrada.', tono: 'sky' },
        { icono: 'ajuste:campana', titulo: 'Aviso sonoro', detalle: 'Actívalo y sonará un tono al ejecutarse: tu seña de que ha ido bien.', tono: 'sky' },
        { icono: 'ajuste:ayuda', titulo: 'La primera vez', detalle: 'Android pregunta con qué app abrirlo: Skippify · macro y Siempre.', tono: 'amber' }
      ]
    }
  ]
})

export const MACROS_GUIDE_STEPS = guiaMacros.total
