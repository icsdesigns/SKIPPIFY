<template>
  <section class="sk-card overflow-hidden" :data-grupo-panel="grupo.id">
    <button
      type="button"
      class="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
      :aria-expanded="abierto"
      :aria-controls="`grupo-cuerpo-${grupo.id}`"
      :data-grupo="grupo.id"
      @click="$emit('alternar')"
    >
      <span
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors"
        :class="abierto ? 'bg-brand-400 text-black' : 'bg-white/[0.12] text-slate-100'"
      >{{ inicialDe(grupo.nombre) }}</span>
      <span class="min-w-0 flex-1">
        <span class="sk-clamp-2 block text-sm font-bold text-white">{{ grupo.nombre }}</span>
        <span v-if="grupo.aviso" class="block truncate text-[11px] text-sky-300">{{ grupo.aviso }}</span>
        <span v-else-if="grupo.detalle" class="block truncate text-[11px] text-slate-400">{{ grupo.detalle }}</span>
      </span>
      <GrupoIcono
        name="chevron"
        class="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-300"
        :class="abierto ? '-rotate-90' : 'rotate-90'"
      />
    </button>

    <!-- El cuerpo queda siempre en el DOM: es el destino donde LocalHostPanel
         monta el detalle del grupo abierto. Plegado, no se puede enfocar. -->
    <div class="desplegable grid" :class="abierto ? 'abierta' : ''" :inert="!abierto">
      <div class="min-h-0 overflow-hidden">
        <div :id="`grupo-cuerpo-${grupo.id}`" class="border-t border-white/[0.07] pt-3" />
      </div>
    </div>
  </section>
</template>

<script setup>
/**
 * Panel plegable de un grupo. Plegado enseña su nombre y un resumen; abierto,
 * el detalle (ranking, escucha común, invitar y abandonar). Sólo pinta: quién
 * está abierto lo decide quien lo usa.
 */
import GrupoIcono from './GrupoIcono.js'
import { inicialDe } from '@/lib/gruposResumen'

defineProps({
  /** { id, nombre, detalle?, aviso? } */
  grupo: { type: Object, required: true },
  abierto: { type: Boolean, default: false }
})
defineEmits(['alternar'])
</script>

<style scoped>
.desplegable {
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}
.desplegable.abierta { grid-template-rows: 1fr; }
@media (prefers-reduced-motion: reduce) {
  .desplegable { transition: none !important; }
}
</style>
