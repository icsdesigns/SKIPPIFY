<template>
  <TourScreen title="Funciones" active="layers">
    <FeaturePanel
      icon-class="bg-brand-400/[0.18]"
      title="Salto de duplicadas"
      subtitle="Cuánto tiempo tiene que pasar para volver a oír la misma canción"
      default-open
    >
      <template #icono>
        <FeatureIcon name="salto" class="h-5 w-5 text-brand-400" />
      </template>
      <template #estado>
        <span class="sk-chip sk-chip-accent">Descubrimiento</span>
      </template>

      <p class="sk-eyebrow">Modo de escucha</p>
      <div class="mt-3 grid grid-cols-3 gap-2">
        <div
          v-for="m in modos"
          :key="m.title"
          class="rounded-xl border p-2.5"
          :class="m.activo ? 'sk-option-active' : 'sk-option'"
        >
          <span
            class="flex h-4 w-4 items-center justify-center rounded-full border"
            :class="m.activo ? 'border-brand-400/60 text-brand-400' : 'border-white/15'"
          ><span v-if="m.activo" class="h-1.5 w-1.5 rounded-full bg-current" /></span>
          <p class="mt-2 text-xs font-bold leading-tight text-white">{{ m.title }}</p>
          <p class="mt-1 text-[10px] leading-snug text-slate-400">{{ m.texto }}</p>
        </div>
      </div>
    </FeaturePanel>

    <FeaturePanel icon-class="bg-sky-400/[0.18]" title="Silenciar anuncios" subtitle="Para cuentas gratuitas">
      <template #icono><FeatureIcon name="silencio" class="h-5 w-5 text-sky-300" /></template>
      <template #estado><span class="sk-chip">Activo</span></template>
    </FeaturePanel>

    <FeaturePanel icon-class="bg-violet-400/[0.18]" title="Temporizador" subtitle="Para dormirte con música">
      <template #icono><FeatureIcon name="luna" class="h-5 w-5 text-violet-300" /></template>
      <template #estado><span class="sk-chip">Apagado</span></template>
    </FeaturePanel>
  </TourScreen>
</template>

<script setup>
import TourScreen from './TourScreen.vue'
import FeaturePanel from '@/components/FeaturePanel.vue'
import FeatureIcon from '@/components/FeatureIcon.vue'

const modos = [
  { title: 'Descubrimiento', texto: 'Nada repetido en un año.', activo: true },
  { title: 'Casual', texto: 'No se salta nada.', activo: false },
  { title: 'Personalizado', texto: 'Tú eliges.', activo: false }
]
</script>
