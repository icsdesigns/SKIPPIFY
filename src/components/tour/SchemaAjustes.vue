<template>
  <TourScreen title="Configuración">
    <section class="sk-card overflow-hidden">
      <header class="sk-card-head">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400/[0.18]">
          <NavIcon name="shield" class="h-5 w-5 text-amber-300" />
        </span>
        <div class="min-w-0">
          <h2 class="text-sm font-bold text-white">Permisos del sistema</h2>
          <p class="text-[11px] text-slate-400">Sin ellos Skippify no detecta lo que suena.</p>
        </div>
      </header>
      <div class="sk-well m-4 divide-y divide-white/[0.06] overflow-hidden">
        <div v-for="p in permisos" :key="p" class="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <span class="text-xs text-slate-300">{{ p }}</span>
          <span class="sk-badge sk-badge-ok uppercase">Concedido</span>
        </div>
      </div>
    </section>

    <section class="sk-card overflow-hidden">
      <header class="sk-card-head">
        <h2 class="text-sm font-bold text-white">Ayuda</h2>
      </header>
      <div class="flex items-center justify-between gap-3 px-5 py-3.5">
        <span class="text-sm font-semibold text-white">Tour de la app</span>
        <span class="sk-btn sk-btn-ghost sk-btn-sm">Ver</span>
      </div>
    </section>
  </TourScreen>
</template>

<script setup>
import TourScreen from './TourScreen.vue'
import NavIcon from '@/components/NavIcon.js'

const permisos = ['Acceso a notificaciones', 'Mostrar notificaciones', 'Sin optimización de batería']
</script>
