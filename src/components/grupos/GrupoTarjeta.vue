<template>
  <button
    type="button"
    class="group relative w-full overflow-hidden rounded-card p-4 text-left transition-colors duration-200"
    :class="activo ? 'bg-brand-400/[0.12] ring-1 ring-brand-400/70' : 'bg-white/[0.05] hover:bg-white/[0.09]'"
    :aria-pressed="activo"
    @click="$emit('elegir')"
  >
    <span class="flex items-start justify-between gap-2">
      <span class="min-w-0">
        <span class="sk-clamp-2 block text-sm font-bold text-white">{{ nombre }}</span>
        <span v-if="estado" class="mt-0.5 block text-[11px] text-sky-300">{{ estado }}</span>
      </span>
      <span
        v-if="activo"
        class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-400 text-black"
        aria-label="Grupo abierto"
      >
        <GrupoIcono name="check" class="h-3 w-3" />
      </span>
      <GrupoIcono v-else name="chevron" class="h-4 w-4 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5" />
    </span>

    <span class="mt-3 grid grid-cols-3 gap-2 text-[11px]">
      <span class="min-w-0">
        <span class="flex items-center gap-1 text-slate-500"><GrupoIcono name="users" class="h-3 w-3" />Miembros</span>
        <span class="mt-0.5 block font-mono text-sm font-bold tabular-nums text-white">{{ miembros || '—' }}</span>
      </span>
      <span class="min-w-0">
        <span class="flex items-center gap-1 text-slate-500"><GrupoIcono name="clock" class="h-3 w-3" />Semana</span>
        <span class="mt-0.5 block font-mono text-sm font-bold tabular-nums text-white">{{ minutos ? formatearHorasCorto(minutos) : '—' }}</span>
      </span>
      <span class="min-w-0">
        <span class="flex items-center gap-1 text-slate-500"><GrupoIcono name="disc" class="h-3 w-3" />Temas</span>
        <span class="mt-0.5 block font-mono text-sm font-bold tabular-nums text-white">{{ canciones || '—' }}</span>
      </span>
    </span>

    <span v-if="lider" class="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-400">
      <GrupoIcono name="medal" class="h-3.5 w-3.5 shrink-0 text-brand-400" />
      <span class="min-w-0 truncate">Va primero <span class="font-semibold text-slate-200">{{ lider }}</span></span>
    </span>
  </button>
</template>

<script setup>
import GrupoIcono from './GrupoIcono.js'
import { formatearHorasCorto } from '@/lib/gruposResumen'

defineProps({
  nombre: { type: String, required: true },
  miembros: { type: Number, default: 0 },
  minutos: { type: Number, default: 0 },
  canciones: { type: Number, default: 0 },
  lider: { type: String, default: '' },
  estado: { type: String, default: '' },
  activo: { type: Boolean, default: false }
})
defineEmits(['elegir'])
</script>
