<template>
  <section class="grid grid-cols-2 gap-3">
    <StatTile
      label="Duplicadas iniciadas"
      :value="valorIniciadas"
      badge="Semana"
      :hint="hintIniciadas"
      :tone="hasData ? 'text-violet-200' : 'text-slate-500'"
      glow="from-violet-500/12"
    />
    <StatTile
      label="Duplicadas saltadas"
      :value="valorSaltadas"
      badge="Semana"
      :hint="hintSaltadas"
      :tone="hasData ? 'text-amber-200' : 'text-slate-500'"
      glow="from-amber-500/12"
    />
  </section>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import StatTile from '@/components/StatTile.vue'
import { useDuplicateStats } from '@/composables/useDuplicateStats'

const { refresh, weekDuplicates, weekSkipped, previousWeek, hasData } = useDuplicateStats()

// Sin dato se pinta «—»: un 0 haría creer que esta semana no ha habido ninguna,
// cuando lo que pasa es que el motor de saltos todavía no ha contestado.
const valorIniciadas = computed(() => (hasData.value ? weekDuplicates.value : '—'))
const valorSaltadas = computed(() => (hasData.value ? weekSkipped.value : '—'))

const hintIniciadas = computed(() => {
  if (!hasData.value) return 'El motor de saltos aún no ha reportado datos'
  const previa = previousWeek.value.duplicates
  return previa
    ? `${previa} la semana anterior`
    : 'Canciones que ya habías escuchado dentro del intervalo'
})

const hintSaltadas = computed(() => {
  if (!hasData.value) return 'Disponible con el servicio de escucha activo'
  const vistas = weekDuplicates.value
  if (!vistas) return 'Sin duplicadas que saltar esta semana'
  return `${Math.round((weekSkipped.value * 100) / vistas)} % de las detectadas`
})

onMounted(refresh)
</script>
