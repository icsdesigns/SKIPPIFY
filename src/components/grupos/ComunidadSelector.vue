<template>
  <div ref="raiz" class="relative" data-selector-grupos>
    <button
      type="button"
      class="sk-card flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-ink-600"
      aria-haspopup="listbox"
      :aria-expanded="abierto"
      aria-label="Elegir grupo"
      @click="abierto = !abierto"
    >
      <span
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
        :class="actual ? 'bg-brand-400 text-black' : 'bg-white/[0.12] text-slate-200'"
      >
        <GrupoIcono v-if="!actual" name="users" class="h-[18px] w-[18px]" />
        <template v-else>{{ inicialDe(actual.nombre) }}</template>
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-bold text-white">{{ actual ? actual.nombre : 'Sin grupos' }}</span>
        <span class="block truncate text-[11px] text-slate-400">{{ actual ? (actual.aviso || actual.detalle) : 'Pulsa para crear uno o unirte a uno' }}</span>
      </span>
      <span class="sk-chip !px-2 !py-0.5 tabular-nums">{{ grupos.length }} / {{ max }}</span>
      <GrupoIcono
        name="chevron"
        class="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300"
        :class="abierto ? '-rotate-90' : 'rotate-90'"
      />
    </button>

    <Transition name="menu">
      <ul
        v-if="abierto"
        class="menu absolute inset-x-0 top-full z-30 mt-2 max-h-[60vh] overflow-y-auto rounded-card bg-ink-600 p-1.5 shadow-lift ring-1 ring-white/[0.08]"
        role="listbox"
        aria-label="Grupos"
      >
        <li v-for="g in grupos" :key="g.id" role="option" :aria-selected="g.id === activoId">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-white/[0.07]"
            :class="g.id === activoId ? 'bg-brand-400/[0.12]' : ''"
            :data-grupo="g.id"
            @click="elegir(g.id)"
          >
            <span
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              :class="g.id === activoId ? 'bg-brand-400 text-black' : 'bg-white/[0.12] text-slate-200'"
            >{{ inicialDe(g.nombre) }}</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[13px] font-bold text-white">{{ g.nombre }}</span>
              <span v-if="g.aviso" class="block truncate text-[10px] text-sky-300">{{ g.aviso }}</span>
              <span v-else-if="g.detalle" class="block truncate text-[10px] text-slate-400">{{ g.detalle }}</span>
            </span>
            <GrupoIcono v-if="g.id === activoId" name="check" class="h-4 w-4 shrink-0 text-brand-400" />
          </button>
        </li>
        <li v-if="grupos.length" class="sk-divider my-1" aria-hidden="true" />
        <li role="option" aria-selected="false">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-[13px] font-bold text-brand-300 transition-colors hover:bg-white/[0.07]"
            data-nuevo
            @click="nuevo"
          >
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-400/[0.16]">
              <GrupoIcono name="plus" class="h-4 w-4" />
            </span>
            Nuevo
          </button>
        </li>
      </ul>
    </Transition>
  </div>
</template>

<script setup>
/**
 * Selector de grupos: un desplegable con los grupos del usuario y, al final,
 * «Nuevo», que abre la hoja de alta (crear o unirse). Sólo pinta y avisa; quien
 * lo usa decide qué hacer con cada elección.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import GrupoIcono from './GrupoIcono.js'
import { inicialDe } from '@/lib/gruposResumen'

const props = defineProps({
  /** [{ id, nombre, detalle?, aviso? }] */
  grupos: { type: Array, default: () => [] },
  activoId: { type: String, default: '' },
  max: { type: Number, default: 5 }
})
const emit = defineEmits(['grupo', 'nuevo'])

const abierto = ref(false)
const raiz = ref(null)
const actual = computed(() => props.grupos.find(g => g.id === props.activoId) || props.grupos[0] || null)

function elegir (id) {
  abierto.value = false
  emit('grupo', id)
}

function nuevo () {
  abierto.value = false
  emit('nuevo')
}

function fuera (e) {
  if (abierto.value && raiz.value && !raiz.value.contains(e.target)) abierto.value = false
}
function tecla (e) {
  if (e.key === 'Escape') abierto.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', fuera)
  document.addEventListener('keydown', tecla)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', fuera)
  document.removeEventListener('keydown', tecla)
})
</script>

<style scoped>
.menu { transform-origin: top center; }
.menu-enter-active { transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1); }
.menu-leave-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.menu-enter-from, .menu-leave-to { opacity: 0; transform: translateY(-6px) scale(0.98); }
@media (prefers-reduced-motion: reduce) {
  .menu-enter-active, .menu-leave-active { transition: none !important; }
}
</style>
