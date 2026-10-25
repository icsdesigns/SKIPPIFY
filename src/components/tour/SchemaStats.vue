<template>
  <TourScreen title="Estadísticas" active="bars">
    <article class="sk-card sk-card-lit p-4">
      <header class="mb-3 flex items-start justify-between gap-2">
        <h2 class="sk-title">Top canciones</h2>
        <span class="sk-chip">Top 5</span>
      </header>
      <div class="sk-segment mb-3">
        <span
          v-for="(r, i) in rangos"
          :key="r"
          class="sk-segment-item"
          :class="i === 1 ? 'sk-segment-item-active' : ''"
        >{{ r }}</span>
      </div>
      <ul class="space-y-1.5">
        <li v-for="(f, i) in filas" :key="f.name" class="relative overflow-hidden rounded-md bg-white/[0.04]">
          <div class="absolute inset-y-0 left-0 bg-gradient-to-r from-brand-400/[0.22] to-transparent" :style="{ width: `${f.pct}%` }" />
          <div class="relative flex items-center gap-3 px-3 py-2">
            <span
              class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
              :class="i === 0 ? 'bg-brand-400 text-black' : 'bg-white/[0.08] text-slate-300'"
            >{{ i + 1 }}</span>
            <span class="min-w-0 flex-1 truncate text-sm font-semibold text-white">{{ f.name }}</span>
            <span class="shrink-0 font-mono text-sm font-bold tabular-nums text-brand-400">{{ f.count }}</span>
          </div>
        </li>
      </ul>
    </article>
  </TourScreen>
</template>

<script setup>
import TourScreen from './TourScreen.vue'

const rangos = ['Semana', 'Mes', 'Año']
const filas = [
  { name: 'Canción de ejemplo', count: 38, pct: 100 },
  { name: 'Otra canción', count: 27, pct: 71 },
  { name: 'Tercera canción', count: 19, pct: 50 },
  { name: 'Cuarta canción', count: 11, pct: 29 }
]
</script>
