<template>
  <section class="grid grid-cols-2 gap-3">
    <button
      type="button"
      class="sk-card sk-card-hover group relative flex min-w-0 flex-col justify-start overflow-hidden p-4 text-left"
      data-top-cancion
      :aria-label="etiquetaCancion"
      @click="irAEstadisticas"
    >
      <div class="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-sky-500/12 to-transparent opacity-60" />
      <div class="relative">
        <p class="sk-eyebrow leading-snug">Canción de la semana</p>
        <template v-if="cancion">
          <p class="mt-2 line-clamp-3 text-sm font-extrabold leading-snug text-white [overflow-wrap:anywhere]">{{ cancion.track }}</p>
          <p class="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-400 [overflow-wrap:anywhere]">{{ cancion.artist }}</p>
          <p class="mt-2">
            <span class="inline-flex rounded-full bg-sky-400/[0.18] px-2 py-0.5 text-[11px] font-bold tabular-nums text-sky-100">{{ veces(cancion.count) }}</span>
          </p>
        </template>
        <template v-else>
          <p class="mt-2 text-sm font-extrabold leading-snug text-slate-500">Sin datos</p>
          <p class="sk-stat-hint">Escucha música esta semana y aparecerá aquí</p>
        </template>
      </div>
    </button>

    <button
      type="button"
      class="sk-card sk-card-hover group relative flex min-w-0 flex-col justify-start overflow-hidden p-4 text-left"
      data-top-artista
      :aria-label="etiquetaArtista"
      @click="irAEstadisticas"
    >
      <div class="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-teal-500/12 to-transparent opacity-60" />
      <div class="relative">
        <p class="sk-eyebrow leading-snug">Artista de la semana</p>
        <template v-if="artista">
          <p class="mt-2 line-clamp-3 text-sm font-extrabold leading-snug text-white [overflow-wrap:anywhere]">{{ artista.artist }}</p>
          <p class="mt-2">
            <span class="inline-flex rounded-full bg-teal-400/[0.18] px-2 py-0.5 text-[11px] font-bold tabular-nums text-teal-100">{{ veces(artista.count) }}</span>
          </p>
        </template>
        <template v-else>
          <p class="mt-2 text-sm font-extrabold leading-snug text-slate-500">Sin datos</p>
          <p class="sk-stat-hint">Escucha música esta semana y aparecerá aquí</p>
        </template>
      </div>
    </button>
  </section>
</template>

<script setup>
/**
 * Carteles «Canción de la semana» y «Artista de la semana».
 *
 * «Semana» es la misma que usan los demás carteles de Inicio: los últimos 7
 * días (`weekEvents` de useAnalytics). El recuento es el número de escuchas
 * registradas en esa semana. Pulsar cualquiera lleva a la pestaña Estadísticas.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAnalytics } from '@/composables/useAnalytics'
import { cancionTop, artistaTop } from '@/lib/inicioStats'

const router = useRouter()
const { weekEvents } = useAnalytics()

const cancion = computed(() => cancionTop(weekEvents.value))
const artista = computed(() => artistaTop(weekEvents.value))

function veces (n) {
  return n === 1 ? '1 vez' : `${n} veces`
}

const etiquetaCancion = computed(() => cancion.value
  ? `Canción de la semana: ${cancion.value.track}, ${veces(cancion.value.count)}. Abrir estadísticas`
  : 'Canción de la semana: sin datos. Abrir estadísticas')
const etiquetaArtista = computed(() => artista.value
  ? `Artista de la semana: ${artista.value.artist}, ${veces(artista.value.count)}. Abrir estadísticas`
  : 'Artista de la semana: sin datos. Abrir estadísticas')

function irAEstadisticas () {
  router.push('/stats')
}
</script>
