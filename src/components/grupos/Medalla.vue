<template>
  <!-- Posición: medalla para el podio, número para el resto. Las clases
       oro/plata/bronce las usan también las pruebas. -->
  <span
    class="medalla relative flex shrink-0 items-center justify-center rounded-full font-mono font-bold tabular-nums"
    :class="[claseMedalla, TAMANOS[tamano] || TAMANOS.md]"
    :aria-label="sinDatos ? 'Sin posición' : `Puesto ${posicion}`"
  >
    <span class="relative z-[1]">{{ sinDatos ? '·' : posicion }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  posicion: { type: Number, default: 0 },
  sinDatos: { type: Boolean, default: false },
  /** 'sm' (esquina del avatar), 'md' o 'lg' (podio). */
  tamano: { type: String, default: 'md' }
})

const TAMANOS = { sm: 'h-5 w-5 text-[10px]', md: 'h-7 w-7 text-[11px]', lg: 'h-8 w-8 text-xs' }

const claseMedalla = computed(() => {
  if (props.sinDatos) return 'bg-white/[0.06] text-slate-500'
  if (props.posicion === 1) return 'oro text-black'
  if (props.posicion === 2) return 'plata text-black'
  if (props.posicion === 3) return 'bronce text-black'
  return 'bg-white/[0.10] text-slate-300'
})
</script>

<style scoped>
/* Podio: degradados metálicos; el primero lleva un brillo que pasa despacio. */
.oro { background: linear-gradient(135deg, #fde68a, #f59e0b 55%, #fcd34d); }
.plata { background: linear-gradient(135deg, #f1f5f9, #94a3b8 55%, #e2e8f0); }
.bronce { background: linear-gradient(135deg, #fed7aa, #c2410c 60%, #fdba74); }

/* El brillo es una banda que cruza la medalla con transform. Empieza y acaba
   fuera de ella, así que el bucle no deja ver ningún salto al reiniciarse. */
.medalla { overflow: hidden; isolation: isolate; }
.oro::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, 0.75) 50%, transparent 70%);
  transform: translateX(-130%);
  animation: brillo 3.6s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  will-change: transform;
}

@keyframes brillo {
  0% { transform: translateX(-130%); }
  45%, 100% { transform: translateX(130%); }
}

@media (prefers-reduced-motion: reduce) {
  .oro::after { animation: none !important; }
}
</style>
