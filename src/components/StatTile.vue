<template>
  <article class="sk-card sk-card-hover group overflow-hidden p-4">
    <!-- Tinte propio de cada métrica: da a la rejilla un ritmo de color sin
         llegar a competir con el panel de reproducción. -->
    <div class="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b to-transparent opacity-60" :class="glow" />

    <div class="relative">
      <!-- El rótulo ocupa la fila ENTERA. Compartiéndola con la insignia se
           quedaba en 46 px a dos columnas en un móvil de 320 px, y «DUPLICADAS»
           —que pide 99 px— se partía como «DUPLI / CADAS». La insignia baja a la
           fila de la cifra, donde el hueco sobra porque el número es corto. -->
      <p class="sk-eyebrow leading-snug">{{ label }}</p>

      <div class="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
        <p class="text-[30px] font-extrabold leading-none tracking-tightest" :class="tone">{{ value }}</p>
        <span v-if="unit" class="text-xs font-bold text-slate-400">{{ unit }}</span>

        <span
          v-if="badge"
          class="rounded-full bg-white/[0.08] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-300"
        >{{ badge }}</span>

        <span
          v-if="delta !== null && delta !== undefined"
          class="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
          :class="delta >= 0 ? 'bg-brand-400/[0.18] text-brand-200' : 'bg-rose-500/[0.18] text-rose-200'"
        >{{ delta >= 0 ? '+' : '' }}{{ delta }}%</span>
      </div>

      <p v-if="hint" class="sk-stat-hint">{{ hint }}</p>
    </div>
  </article>
</template>

<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  unit: { type: String, default: '' },
  hint: { type: String, default: '' },
  badge: { type: String, default: '' },
  /** Variación porcentual opcional; se pinta como pastilla verde/roja. */
  delta: { type: Number, default: null },
  tone: { type: String, default: 'text-white' },
  glow: { type: String, default: 'from-brand-400/12' }
})
</script>
