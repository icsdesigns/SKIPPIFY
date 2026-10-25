<template>
  <TourScreen title="Inicio" active="home">
    <NowPlaying :state="ejemplo" />
    <div class="grid grid-cols-2 gap-3">
      <StatTile label="Canciones" :value="214" badge="Semana" :delta="12" glow="from-sky-500/12" />
      <StatTile label="Artistas" :value="63" badge="Semana" :delta="-4" glow="from-teal-500/12" />
    </div>
  </TourScreen>
</template>

<script setup>
import TourScreen from './TourScreen.vue'
import NowPlaying from '@/components/NowPlaying.vue'
import StatTile from '@/components/StatTile.vue'

// Datos de ejemplo: sin `progressSyncedAt` el avance no se extrapola con el
// reloj, así que el esquema queda quieto.
const ejemplo = {
  mode: 'playing',
  track: 'Canción de ejemplo',
  artist: 'Artista de ejemplo',
  album: 'Álbum de ejemplo',
  durationMs: 214000,
  progressPct: 42
}
</script>
