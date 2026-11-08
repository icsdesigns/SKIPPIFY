<template>
  <div class="sk-stagger space-y-5">
    <!-- Cuenta de Spotify: registrar escuchas con la API, de cualquier dispositivo. -->
    <SpotifyCuentaPanel />

    <div data-tour="now-playing">
      <NowPlaying :state="nowPlaying" />
    </div>

    <KpiCards />
    <TopSemanaCards />
    <DuplicateKpiCards />
    <PlaysChart />
    <SessionKpiCards />
    <RecentPlays />
  </div>
</template>

<script setup>
import NowPlaying from '@/components/NowPlaying.vue'
import SpotifyCuentaPanel from '@/components/SpotifyCuentaPanel.vue'
import KpiCards from '@/components/KpiCards.vue'
import TopSemanaCards from '@/components/TopSemanaCards.vue'
import DuplicateKpiCards from '@/components/DuplicateKpiCards.vue'
import SessionKpiCards from '@/components/SessionKpiCards.vue'
import PlaysChart from '@/components/PlaysChart.vue'
import RecentPlays from '@/components/RecentPlays.vue'

defineProps({
  nowPlaying: { type: Object, default: () => ({ mode: 'stopped' }) }
})
</script>
