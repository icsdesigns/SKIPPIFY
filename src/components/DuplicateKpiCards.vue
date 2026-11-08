<template>
  <section class="grid grid-cols-2 gap-3">
    <StatTile
      label="% de variedad"
      :value="valorVariedad"
      :unit="variedad === null ? '' : '%'"
      badge="Mensual"
      :hint="hintVariedad"
      :tone="variedad === null ? 'text-slate-500' : 'text-violet-200'"
      glow="from-violet-500/12"
    />
    <StatTile
      label="Índice de exclusividad"
      :value="valorExclusividad"
      :unit="exclusividad === null ? '' : '%'"
      badge="Mensual"
      :hint="hintExclusividad"
      :tone="exclusividad === null ? 'text-slate-500' : 'text-amber-200'"
      glow="from-amber-500/12"
    />
  </section>
</template>

<script setup>
/**
 * Variedad y exclusividad de los últimos 30 días.
 *
 *  - Variedad: % de canciones iniciadas que no eran duplicadas.
 *      iniciadas = escuchas registradas (30 d) + duplicadas saltadas (30 d)
 *      variedad  = (iniciadas − duplicadas detectadas) / iniciadas
 *  - Exclusividad: % de las duplicadas detectadas que se saltaron.
 *      exclusividad = saltadas / duplicadas detectadas   (y el recuento «X de Y»)
 *
 * Las duplicadas y saltadas las cuenta el motor nativo (useDuplicateStats); las
 * escuchas, el historial (useAnalytics). Sin dato del motor se pinta «—».
 */
import { computed, onMounted } from 'vue'
import StatTile from '@/components/StatTile.vue'
import { useAnalytics } from '@/composables/useAnalytics'
import { useDuplicateStats } from '@/composables/useDuplicateStats'
import { calcularVariedad, calcularExclusividad } from '@/lib/inicioStats'

const { last30Events } = useAnalytics()
const { refresh, monthDuplicates, monthSkipped, hasData } = useDuplicateStats()

const variedad = computed(() => hasData.value
  ? calcularVariedad(last30Events.value.length, monthDuplicates.value, monthSkipped.value)
  : null)
const exclusividad = computed(() => hasData.value
  ? calcularExclusividad(monthDuplicates.value, monthSkipped.value)
  : null)

// Sin dato se pinta «—»: un 0 haría creer que el resultado es nulo cuando lo
// que pasa es que aún no hay con qué calcularlo.
const valorVariedad = computed(() => variedad.value === null ? '—' : variedad.value)
const valorExclusividad = computed(() => exclusividad.value === null ? '—' : exclusividad.value)

const hintVariedad = computed(() => {
  if (!hasData.value) return 'El motor de saltos aún no ha reportado datos'
  if (variedad.value === null) return 'Aún no hay escuchas en los últimos 30 días'
  return 'Canciones no duplicadas escuchadas en el último mes'
})

const hintExclusividad = computed(() => {
  if (!hasData.value) return 'Disponible con el servicio de escucha activo'
  if (exclusividad.value === null) return 'Sin duplicadas en el último mes'
  return `${monthSkipped.value} de ${monthDuplicates.value} duplicadas saltadas`
})

onMounted(refresh)
</script>
