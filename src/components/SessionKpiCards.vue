<template>
  <section class="grid grid-cols-2 gap-3">
    <StatTile
      label="Duración media sesión"
      :value="sessionsYear.averageMinutes"
      unit="min"
      badge="Año"
      glow="from-brand-500/12"
    />
    <StatTile
      label="Número de sesiones"
      :value="sessionsYear.count"
      badge="Año"
      glow="from-indigo-500/12"
    />
  </section>
</template>

<script setup>
import StatTile from '@/components/StatTile.vue'
import { useAnalytics } from '@/composables/useAnalytics'

const { sessionsYear } = useAnalytics()
</script>
