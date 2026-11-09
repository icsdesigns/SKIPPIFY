/**
 * Guía animada de la pestaña Grupos, en cinco pasos: qué es un grupo (cifrado,
 * sin servidor), cómo se crea o se entra (invitación exprés de 1 hora,
 * administrador), el resumen y el ranking (semana o mes), la escucha común
 * contigo, y la privacidad con la app cerrada. Las escenas animadas están en
 * `components/guias/EscenaGrupos.vue`. Sustituye al panel «¿Cómo funciona?».
 */
import { crearGuia } from '@/composables/crearGuia'
import EscenaGrupos from '@/components/guias/EscenaGrupos.vue'

export const GRUPOS_GUIDE_KEY = 'skippify.grupos-guide.v1'

export const guiaGrupos = crearGuia({
  id: 'grupos',
  clave: GRUPOS_GUIDE_KEY,
  ruta: '/comunidad',
  etiqueta: 'Grupos',
  ariaLabel: 'Cómo funcionan los grupos',
  botonLabel: 'Ver la guía de Grupos',
  pasos: [
    {
      id: 'grupo',
      titulo: 'Grupos sin servidor',
      escena: EscenaGrupos,
      escenaProps: { paso: 'grupo' },
      puntos: [
        { icono: 'ajuste:cuenta', titulo: 'Entre amigos', detalle: 'Comparas lo que escucháis con la gente de tu grupo. Puedes estar en hasta 5 grupos.' },
        { icono: 'ajuste:antena', titulo: 'Sin servidor', detalle: 'No hay cuentas ni base de datos: cada móvil guarda una copia del grupo y se sincroniza con los demás.' },
        { icono: 'ajuste:escudo', titulo: 'Todo cifrado', detalle: 'Lo que se comparte viaja cifrado: sólo los miembros del grupo pueden leerlo.' }
      ]
    },
    {
      id: 'unirse',
      titulo: 'Crea un grupo o únete',
      escena: EscenaGrupos,
      escenaProps: { paso: 'unirse' },
      puntos: [
        { icono: 'ajuste:ajustes', titulo: 'Quien crea, administra', detalle: 'El administrador es el único que invita y expulsa, y puede cambiar el nombre del grupo.' },
        { icono: 'ajuste:reloj', titulo: 'Invitación exprés', detalle: 'Un código de 8 caracteres, o un QR, que vale 1 hora. Se comparte con un toque.' },
        { icono: 'ajuste:play', titulo: 'Entras en segundos', detalle: 'Pulsa «Unirme» y escribe el código: entras en cuanto un miembro tenga Skippify en marcha.' }
      ]
    },
    {
      id: 'ranking',
      titulo: 'Resumen y ranking',
      escena: EscenaGrupos,
      escenaProps: { paso: 'ranking' },
      puntos: [
        { icono: 'ajuste:ojo', titulo: 'Semana o mes', detalle: 'Mira la semana en curso o el mes en curso. El resumen suma el tiempo de todo el grupo.' },
        { icono: 'ajuste:registro', titulo: 'Podio y miembros', detalle: 'Los tres que más escuchan, en el podio. Toca a un miembro para abrir sus cifras.' },
        { icono: 'ajuste:umbral', titulo: 'Cifras provisionales', detalle: 'Pueden cambiar cuando los demás abran la app y publiquen sus últimas escuchas.' }
      ]
    },
    {
      id: 'comun',
      titulo: 'Escucha común',
      escena: EscenaGrupos,
      escenaProps: { paso: 'comun' },
      puntos: [
        { icono: 'ajuste:copia', titulo: 'Cuánto os parecéis', detalle: 'En cada miembro ves qué parte de su escucha coincide con la tuya, artista a artista.' },
        { icono: 'ajuste:cuenta', titulo: 'Sólo contigo', detalle: 'El porcentaje siempre es entre tú y esa persona. 100 % es oír lo mismo en la misma proporción.' }
      ]
    },
    {
      id: 'privacidad',
      titulo: 'Privacidad y app cerrada',
      escena: EscenaGrupos,
      escenaProps: { paso: 'privacidad' },
      puntos: [
        { icono: 'ajuste:globo', titulo: 'Relays públicos', detalle: 'Los datos pasan cifrados por relays públicos, que sólo ven direcciones IP, horas y tamaños.' },
        { icono: 'ajuste:campana', titulo: 'Se actualiza con la app cerrada', detalle: 'Tus escuchas se comparten solas en segundo plano. Quien pasa 30 días sin enviar nada sale del grupo.' },
        { icono: 'ajuste:desconexion', titulo: 'Abandonar borra la copia', detalle: 'Al abandonar un grupo se borra su copia de este móvil.' }
      ]
    }
  ]
})

export const GRUPOS_GUIDE_STEPS = guiaGrupos.total
