/**
 * useDescubrimientos — estado de los descubrimientos de artista para Inicio.
 *
 * El cálculo (`estadoDescubrimientos`) recorre TODO el historial, así que no se
 * cuelga del reloj por minuto de useAnalytics: sólo se rehace cuando cambia el
 * historial (nº de escuchas, la más reciente o la más antigua) y, como mucho,
 * una vez por hora para que la ventana de 30 días avance aunque no suene nada.
 * El resultado se comparte entre todos los componentes que lo usen.
 */
import { computed, effectScope, shallowRef, watch } from 'vue'
import { useEventStore } from '@/stores/events'
import { estadoDescubrimientos } from '@/lib/descubrimientos'

const MS_HORA = 3600000

const estado = shallowRef(estadoDescubrimientos([], Date.now()))
const hora = shallowRef(Math.floor(Date.now() / MS_HORA))
let iniciado = false

function iniciar () {
  if (iniciado) return
  iniciado = true
  const { events } = useEventStore()

  if (typeof window !== 'undefined') {
    const tic = () => { hora.value = Math.floor(Date.now() / MS_HORA) }
    setInterval(tic, 5 * 60_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') tic()
    })
  }

  // Ámbito propio y desligado: creado dentro del setup del primer componente,
  // el watch moriría al desmontarlo (al cambiar de pestaña) y la tarjeta
  // dejaría de actualizarse.
  effectScope(true).run(() => {
    // Firma barata del historial: la lista va de más nueva a más antigua.
    const firma = computed(() => {
      const lista = events.value
      const n = lista.length
      return `${n}|${n ? lista[0]?.played_at : ''}|${n ? lista[n - 1]?.played_at : ''}`
    })

    watch([firma, hora], () => {
      estado.value = estadoDescubrimientos(events.value, Date.now())
    }, { immediate: true })
  })
}

export function useDescubrimientos () {
  iniciar()
  return { estado }
}
