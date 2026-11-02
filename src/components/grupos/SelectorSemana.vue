<template>
  <label class="relative shrink-0">
    <select
      :value="modelValue"
      class="selector-semana cursor-pointer appearance-none rounded-full bg-white/[0.08] py-1.5 pl-3 pr-7 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-white/[0.14] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      @change="$emit('update:modelValue', $event.target.value)"
    >
      <option v-for="s in semanas" :key="s.id" :value="s.id">{{ s.etiqueta }}</option>
    </select>
    <GrupoIcono name="chevron" class="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 rotate-90 text-slate-400" />
  </label>
</template>

<script setup>
import GrupoIcono from './GrupoIcono.js'

defineProps({
  modelValue: { type: String, required: true },
  /** [{ id, etiqueta }] */
  semanas: { type: Array, required: true }
})
defineEmits(['update:modelValue'])
</script>

<style scoped>
/* Las opciones se pintan con el tema del sistema: fondo oscuro explícito. */
.selector-semana option { background: #1f1f1f; color: #fff; }
</style>
