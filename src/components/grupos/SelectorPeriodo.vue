<template>
  <div class="inline-flex shrink-0 rounded-full bg-white/[0.08] p-0.5" role="group" :aria-label="ariaLabel">
    <button
      v-for="p in periodos"
      :key="p.id"
      type="button"
      class="rounded-full px-3.5 py-1.5 text-[11px] font-bold transition-colors"
      :class="p.id === modelValue ? 'bg-brand-400 text-black' : 'text-slate-300 hover:text-white'"
      :aria-pressed="p.id === modelValue"
      :data-periodo="p.id"
      @click="$emit('update:modelValue', p.id)"
    >{{ p.etiqueta }}</button>
  </div>
</template>

<script setup>
/** Selector «Semana / Mes» del resumen del grupo. */
defineProps({
  modelValue: { type: String, required: true },
  /** [{ id, etiqueta }] */
  periodos: { type: Array, required: true },
  ariaLabel: { type: String, default: 'Periodo' }
})
defineEmits(['update:modelValue'])
</script>
