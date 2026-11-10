/**
 * Guía animada de la pestaña Funciones, en seis pasos: cómo decide el salto de
 * duplicadas, los tres modos, la calibración, el silenciamiento de anuncios, el
 * temporizador y cómo se pliegan y despliegan los paneles. Las escenas animadas
 * están en `components/guias/EscenaFunciones.vue`.
 */
import { crearGuia } from '@/composables/crearGuia'
import EscenaFunciones from '@/components/guias/EscenaFunciones.vue'

export const FUNCIONES_GUIDE_KEY = 'skippify.funciones-guide.v1'

export const guiaFunciones = crearGuia({
  id: 'funciones',
  clave: FUNCIONES_GUIDE_KEY,
  ruta: '/features',
  etiqueta: 'Funciones',
  ariaLabel: 'Cómo funciona la pestaña Funciones',
  botonLabel: 'Ver la guía de Funciones',
  pasos: [
    {
      id: 'duplicadas',
      titulo: 'Salto de duplicadas',
      escena: EscenaFunciones,
      escenaProps: { paso: 'duplicadas' },
      puntos: [
        { icono: 'feature:salto', titulo: 'Recuerda lo que oyes', detalle: 'Skippify apunta cuándo oíste cada canción por última vez.' },
        { icono: 'ajuste:reloj', titulo: 'Compara con tu plazo', detalle: 'Si la canción que empieza se oyó hace menos del plazo que elegiste, la salta.' },
        { icono: 'ajuste:play', titulo: 'Sigue con la siguiente', detalle: 'Pasa a la siguiente canción sin que tengas que tocar nada.' }
      ]
    },
    {
      id: 'modos',
      titulo: 'Elige un modo de escucha',
      escena: EscenaFunciones,
      escenaProps: { paso: 'modos' },
      puntos: [
        { icono: 'ajuste:brujula', titulo: 'Descubrimiento', detalle: 'Prioriza música nueva: no repite nada oído en el último año.' },
        { icono: 'ajuste:casual', titulo: 'Casual', detalle: 'Sin filtros: no salta nada por haberlo oído antes.' },
        { icono: 'ajuste:ajustes', titulo: 'Personalizado', detalle: 'Tú pones el plazo, de 1 semana a 6 meses. Es el mismo que ofrece la notificación.' }
      ]
    },
    {
      id: 'calibracion',
      titulo: 'Calibra el salto',
      escena: EscenaFunciones,
      escenaProps: { paso: 'calibracion' },
      puntos: [
        { icono: 'ajuste:calibrar', titulo: 'Una prueba guiada', detalle: 'Úsala si salta canciones que no toca o deja pasar duplicadas.', tono: 'violet' },
        { icono: 'ajuste:umbral', titulo: 'Ajusta el motor contigo', detalle: 'Mide cómo responde tu móvil y afina los parámetros del salto.', tono: 'violet' },
        { icono: 'ajuste:ayuda', titulo: 'También a mano', detalle: 'Si ya sabes qué quieres mover, elige el ajuste manual.', tono: 'violet' }
      ]
    },
    {
      id: 'anuncios',
      titulo: 'Silencia los anuncios',
      escena: EscenaFunciones,
      escenaProps: { paso: 'anuncios' },
      puntos: [
        { icono: 'feature:silencio', titulo: 'Baja el volumen', detalle: 'Mientras dura un anuncio, el volumen baja. Al terminar, vuelve a como estaba.', tono: 'amber' },
        { icono: 'ajuste:etiqueta', titulo: 'Palabras clave', detalle: 'Detecta el anuncio por su título. Puedes añadir tus propias palabras.', tono: 'amber' },
        { icono: 'ajuste:escudo', titulo: 'Solo cuentas gratuitas', detalle: 'En Premium no hay anuncios, así que no hace nada. Es experimental.', tono: 'amber' }
      ]
    },
    {
      id: 'temporizador',
      titulo: 'Temporizador',
      escena: EscenaFunciones,
      escenaProps: { paso: 'temporizador' },
      puntos: [
        { icono: 'ajuste:reloj', titulo: 'Elige cuánto', detalle: 'Un tiempo de la lista o el que escribas en hh:mm. Puedes alargarlo 15 min o cancelarlo.', tono: 'sky' },
        { icono: 'ajuste:pausa', titulo: 'Pausa al acabar la canción', detalle: 'No corta a mitad: deja terminar la que suena cuando se agota el tiempo.', tono: 'sky' },
        { icono: 'ajuste:campana', titulo: 'Sonido de aviso', detalle: 'Opcional: dos notas suaves tras la pausa. Puedes escucharlas antes.', tono: 'sky' }
      ]
    },
    {
      id: 'paneles',
      titulo: 'Paneles plegables',
      escena: EscenaFunciones,
      escenaProps: { paso: 'paneles' },
      puntos: [
        { icono: 'ajuste:ojo', titulo: 'Su estado, de un vistazo', detalle: 'Plegada, cada función enseña su nombre y su estado: el modo, los anuncios o el tiempo que queda.' },
        { icono: 'ajuste:tour', titulo: 'Toca para desplegar', detalle: 'Toca la cabecera para ver todas sus opciones; vuelve a tocarla para plegarla.' },
        { icono: 'ajuste:comprobado', titulo: 'Sólo uno abierto', detalle: 'Al abrir una función se pliega la que tenías abierta, para no perderte.' }
      ]
    }
  ]
})

export const FUNCIONES_GUIDE_STEPS = guiaFunciones.total
