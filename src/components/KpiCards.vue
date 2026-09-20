<template>
  <section class="grid grid-cols-2 gap-3">
    <StatTile
      label="Canciones"
      :value="kpiTracks"
      badge="Semana"
      :delta="kpiTracksChangePct"
      :hint="hintCanciones"
      glow="from-sky-500/12"
    />
    <StatTile
      label="Artistas"
      :value="kpiArtists"
      badge="Semana"
      :delta="kpiArtistsChangePct"
      :hint="hintArtistas"
      glow="from-teal-500/12"
    />
  </section>
</template>

<script setup>
import { computed } from 'vue'
import StatTile from '@/components/StatTile.vue'
import { useAnalytics } from '@/composables/useAnalytics'

const {
  kpiTracks,
  kpiArtists,
  kpiTracksChangePct,
  kpiArtistsChangePct,
  kpiTracksPrevWeek,
  kpiArtistsPrevWeek
} = useAnalytics()

/**
 * La pista da la variación respecto a la semana anterior y, entre paréntesis,
 * el total con el que se compara. Sin semana anterior no hay porcentaje posible
 * y se dice, en vez de fingir un +100 %.
 */
function pista (variacion, previo) {
  if (!previo || variacion === null || variacion === undefined) {
    return 'Aún no hay semana anterior con la que comparar'
  }
  const signo = variacion >= 0 ? '+' : ''
  return `${signo}${variacion} % respecto a la semana anterior (${previo})`
}

const hintCanciones = computed(() => pista(kpiTracksChangePct.value, kpiTracksPrevWeek.value))
const hintArtistas = computed(() => pista(kpiArtistsChangePct.value, kpiArtistsPrevWeek.value))
</script>
