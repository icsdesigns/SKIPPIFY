<template>
  <TourScreen title="Comunidad" active="trophy">
    <div class="sk-card flex items-center gap-1.5 p-1.5">
      <span class="min-w-0 flex-1 rounded-full bg-white px-3 py-1.5 text-center text-xs font-bold text-black">Con servidor</span>
      <span class="min-w-0 flex-1 rounded-full px-3 py-1.5 text-center text-xs font-bold text-slate-300">Sin servidor</span>
    </div>

    <section class="sk-card p-4">
      <header class="flex items-center justify-between gap-2">
        <h2 class="sk-title">Grupo de ejemplo</h2>
        <span class="sk-chip font-mono">K7Q2XM</span>
      </header>
      <ul class="mt-3 space-y-1.5">
        <li v-for="(f, i) in filas" :key="f.name" class="flex items-center gap-3 rounded-md bg-white/[0.04] px-3 py-2">
          <span
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
            :class="i === 0 ? 'bg-brand-400 text-black' : 'bg-white/[0.08] text-slate-300'"
          >{{ i + 1 }}</span>
          <span class="min-w-0 flex-1 truncate text-sm font-semibold text-white">{{ f.name }}</span>
          <span class="shrink-0 font-mono text-sm font-bold tabular-nums text-brand-400">{{ f.horas }} h</span>
        </li>
      </ul>
    </section>
  </TourScreen>
</template>

<script setup>
import TourScreen from './TourScreen.vue'

const filas = [
  { name: 'Ana', horas: 14 },
  { name: 'Tú', horas: 11 },
  { name: 'Luis', horas: 8 }
]
</script>
