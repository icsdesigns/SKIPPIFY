<template>
  <nav class="sk-card p-3" aria-label="Grupos de Comunidad">
    <!-- Modo: sólo hay que elegir si los dos están activos (los grupos con
         servidor se encienden en Ajustes). Con uno solo, una línea lo nombra. -->
    <div
      v-if="raices.length > 1"
      class="relative grid grid-cols-2 rounded-full bg-white/[0.06] p-1"
      role="tablist"
      aria-label="Tipo de grupo"
    >
      <span
        class="indicador absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-full bg-white"
        :style="{ transform: `translateX(${indiceModo * 100}%)` }"
        aria-hidden="true"
      />
      <button
        v-for="raiz in raices"
        :key="raiz.id"
        type="button"
        role="tab"
        class="relative z-[1] flex min-w-0 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-xs font-bold transition-colors"
        :class="raiz.id === modo ? 'text-black' : 'text-slate-300 hover:text-white'"
        :aria-selected="raiz.id === modo"
        :data-raiz="raiz.id"
        @click="raiz.id !== modo && $emit('modo', raiz.id)"
      >
        <GrupoIcono :name="raiz.icono" class="h-3.5 w-3.5 shrink-0" />
        <span class="truncate">{{ raiz.titulo }}</span>
        <span class="shrink-0 font-mono text-[10px] tabular-nums opacity-70">{{ raiz.grupos.length }} / {{ raiz.max }}</span>
      </button>
    </div>
    <div v-else-if="raizActual" class="flex items-center justify-between gap-2 px-1" :data-raiz="raizActual.id">
      <span class="flex items-center gap-2 text-xs font-bold text-slate-300">
        <GrupoIcono :name="raizActual.icono" class="h-4 w-4 text-brand-400" />Tus grupos
      </span>
      <span class="sk-chip !px-2 !py-0.5 tabular-nums">{{ raizActual.grupos.length }} / {{ raizActual.max }}</span>
    </div>
    <p v-if="raizActual?.nota" class="mt-2 px-1 text-[11px] text-amber-200/80">{{ raizActual.nota }}</p>

    <!-- Grupos del modo en píldoras deslizables; la última abre el alta. -->
    <ul class="pildoras -mx-1 mt-2.5 flex snap-x gap-2 overflow-x-auto px-1 pb-1" aria-label="Grupos">
      <li v-for="(g, i) in raizActual?.grupos || []" :key="g.id" class="snap-start" :style="{ '--orden': i }">
        <button
          type="button"
          class="pildora flex max-w-[15rem] items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4 text-left transition-colors"
          :class="esActual(g.id)
            ? 'bg-brand-400/[0.16] ring-1 ring-inset ring-brand-400/70'
            : 'bg-white/[0.06] hover:bg-white/[0.10]'"
          :aria-current="esActual(g.id) ? 'location' : undefined"
          :data-grupo="g.id"
          @click="$emit('grupo', modo, g.id)"
        >
          <span
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            :class="esActual(g.id) ? 'bg-brand-400 text-black' : 'bg-white/[0.12] text-slate-200'"
          >{{ inicialDe(g.nombre) }}</span>
          <span class="min-w-0">
            <span class="block truncate text-[13px] font-bold" :class="esActual(g.id) ? 'text-white' : 'text-slate-200'" :title="g.nombre">{{ g.nombre }}</span>
            <span v-if="g.aviso" class="block truncate text-[10px] text-sky-300">{{ g.aviso }}</span>
            <span v-else-if="g.detalle" class="block truncate text-[10px] text-slate-400">{{ g.detalle }}</span>
          </span>
        </button>
      </li>
      <li class="snap-start">
        <button
          type="button"
          class="flex h-full min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full border border-dashed border-white/[0.18] px-4 text-[13px] font-bold text-slate-300 transition-colors hover:border-brand-400/60 hover:text-white"
          :data-alta="modo"
          @click="$emit('alta', modo)"
        >
          <GrupoIcono name="plus" class="h-4 w-4" />{{ raizActual?.grupos.length ? 'Nuevo' : 'Crear o unirme' }}
        </button>
      </li>
    </ul>
  </nav>
</template>

<script setup>
/**
 * Selector de Comunidad: el modo (con o sin servidor) y sus grupos en píldoras.
 *
 * Sustituye al árbol desplegable: con los grupos con servidor apagados por
 * defecto, casi siempre hay un solo modo, y una fila de píldoras deja ver todos
 * los grupos y saltar entre ellos de un toque. Sólo pinta y avisa; quien lo usa
 * decide qué hacer con cada toque (cada modo tiene su composable).
 */
import { computed } from 'vue'
import GrupoIcono from './GrupoIcono.js'
import { inicialDe } from '@/lib/gruposResumen'

const props = defineProps({
  modo: { type: String, required: true },
  /** [{ id, titulo, icono, max, activoId, nota?, grupos: [{ id, nombre, detalle?, aviso? }] }] */
  raices: { type: Array, required: true }
})
defineEmits(['modo', 'grupo', 'alta'])

const raizActual = computed(() => props.raices.find(r => r.id === props.modo) || props.raices[0])
const indiceModo = computed(() => Math.max(0, props.raices.findIndex(r => r.id === props.modo)))
const esActual = (grupoId) => grupoId === raizActual.value?.activoId
</script>

<style scoped>
.indicador { transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1); }
.pildoras { scrollbar-width: none; }
.pildoras::-webkit-scrollbar { display: none; }
.pildoras > li {
  animation: entrada 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--orden, 0) * 50ms);
}
@keyframes entrada {
  from { opacity: 0; transform: translateX(8px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .indicador { transition: none !important; }
  .pildoras > li { animation: none !important; }
}
</style>
