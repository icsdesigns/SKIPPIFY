<template>
  <TourScreen title="Macros" active="bolt">
    <article class="sk-card overflow-hidden">
      <header class="sk-card-head">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-400/[0.18]">
          <NavIcon name="bolt" class="h-5 w-5 text-brand-400" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-sm font-bold text-white">Novedades a Tus me gusta</h2>
          <p class="text-[11px] text-slate-400">Última ejecución: ayer</p>
        </div>
        <span class="sk-badge sk-badge-ok">Activa</span>
      </header>

      <div class="grid gap-2 p-4">
        <div v-for="(p, i) in piezas" :key="p.etapa" class="flex items-center gap-3">
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-400 text-[11px] font-bold text-black">{{ i + 1 }}</span>
          <div class="sk-well min-w-0 flex-1 px-3 py-2">
            <p class="sk-eyebrow">{{ p.etapa }}</p>
            <p class="truncate text-sm font-bold text-white">{{ p.valor }}</p>
          </div>
        </div>
      </div>
    </article>
  </TourScreen>
</template>

<script setup>
import TourScreen from './TourScreen.vue'
import NavIcon from '@/components/NavIcon.js'

const piezas = [
  { etapa: 'Origen', valor: 'Playlist de ejemplo' },
  { etapa: 'Acción', valor: 'Copiar las novedades' },
  { etapa: 'Destino', valor: 'Tus me gusta' }
]
</script>
