<template>
  <section class="sk-card sk-card-lit p-5">
    <header class="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 class="sk-title">Escuchas por día</h2>
        <p class="sk-subtitle">Ritmo de la última semana, día a día</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="sk-chip sk-chip-accent">{{ weekTotal }} escuchas</span>
        <span class="sk-chip">7 días</span>
      </div>
    </header>

    <div class="h-56 sm:h-64">
      <Line :data="data" :options="options" />
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
} from 'chart.js'
import { useAnalytics } from '@/composables/useAnalytics'
import {
 CHART_ACCENT,
 CHART_SURFACE,
 accentAreaFill,
 chartScales,
 chartTooltip
} from '@/lib/chartTheme'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

const { chartData } = useAnalytics()

const weekTotal = computed(() => chartData.value.data.reduce((a, b) => a + b, 0))

const data = computed(() => ({
  labels: chartData.value.labels,
  datasets: [{
    label: 'Escuchas',
    data: chartData.value.data,
    borderColor: CHART_ACCENT,
    borderWidth: 2.5,
    // Degradado vertical: el relleno plano aplanaba visualmente los picos.
    backgroundColor: accentAreaFill,
    fill: true,
    tension: 0.38,
    pointRadius: 3,
    pointHoverRadius: 6,
    pointBackgroundColor: CHART_SURFACE,
    pointBorderColor: CHART_ACCENT,
    pointBorderWidth: 2
  }]
}))

const options = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: chartTooltip
  },
  scales: chartScales({ yMaxTicks: 5 })
}
</script>
