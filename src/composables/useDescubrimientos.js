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

/** null hasta el primer cálculo (la tarjeta no se enseña con un progreso falso). */
const estado = shallowRef(null)
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

    // El cálculo recorre todo el historial: no se hace en pleno arranque (la
    // animación de carga se cortaba) ni una vez por cada escucha que llega en
    // tromba al recoger las del servicio, sino agrupado y con la app ociosa.
    let pendiente = null
    const calcular = () => {
      pendiente = null
      estado.value = estadoDescubrimientos(events.value, Date.now())
    }
    const programar = (espera) => {
      if (pendiente) clearTimeout(pendiente)
      pendiente = setTimeout(() => {
        if (typeof requestIdleCallback === 'function') {
          pendiente = null
          requestIdleCallback(calcular, { timeout: 1500 })
        } else {
          calcular()
        }
      }, espera)
    }
    if (typeof window === 'undefined') {
      watch([firma, hora], calcular, { immediate: true })
    } else {
      programar(1800)
      watch([firma, hora], () => programar(600))
    }
  })
}

export function useDescubrimientos () {
  iniciar()
  return { estado }
}
