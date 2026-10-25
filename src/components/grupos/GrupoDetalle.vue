<template>
  <section class="sk-card sk-card-lit p-5">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="sk-clamp-2 text-xl font-extrabold tracking-tightest text-white">{{ nombre }}</h2>
        <p v-for="linea in meta" :key="linea" class="mt-0.5 text-xs text-slate-500">{{ linea }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <slot name="acciones" />
      </div>
    </header>

    <slot name="aviso" />

    <!-- ── Cifras del grupo esta semana ─────────────────────────────────── -->
    <dl class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div class="sk-well px-3 py-2.5">
        <dt class="flex items-center gap-1.5 text-[11px] text-slate-400"><GrupoIcono name="users" class="h-3.5 w-3.5" />Miembros</dt>
        <dd class="mt-1 font-mono text-lg font-bold tabular-nums text-white">{{ miembros.length || '—' }}</dd>
      </div>
      <div class="sk-well px-3 py-2.5">
        <dt class="flex items-center gap-1.5 text-[11px] text-slate-400"><GrupoIcono name="clock" class="h-3.5 w-3.5" />Escucha</dt>
        <dd class="mt-1 font-mono text-lg font-bold tabular-nums text-white">{{ resumen.minutos ? formatearHoras(resumen.minutos) : '—' }}</dd>
      </div>
      <div class="sk-well px-3 py-2.5">
        <dt class="flex items-center gap-1.5 text-[11px] text-slate-400"><GrupoIcono name="disc" class="h-3.5 w-3.5" />Canciones</dt>
        <dd class="mt-1 font-mono text-lg font-bold tabular-nums text-white">{{ resumen.canciones || '—' }}</dd>
      </div>
      <div class="sk-well px-3 py-2.5">
        <dt class="flex items-center gap-1.5 text-[11px] text-slate-400"><GrupoIcono name="medal" class="h-3.5 w-3.5" />Va primero</dt>
        <dd class="mt-1 truncate text-sm font-bold text-white" :title="resumen.lider">{{ resumen.lider || '—' }}</dd>
      </div>
    </dl>

    <div class="sk-divider my-4" />

    <!-- ── Miembros y resultados de la semana ───────────────────────────────
         Un solo panel: cada miembro es una fila del ranking (por tiempo de
         escucha) con su papel y su antigüedad. Quien aún no tiene escuchas esta
         semana va al final, para que la lista siga siendo la del grupo. La barra
         fina es su tiempo respecto al que más ha escuchado. -->
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-sm font-bold text-white">Miembros y resultados</h3>
      <slot name="vistas">
        <span v-if="semana" class="sk-chip">{{ semana }}</span>
      </slot>
    </div>

    <slot name="avisoRanking" />

    <p v-if="!filas.length" class="mt-3 text-xs text-slate-500">
      Todavía no se ha podido leer la lista de miembros.
    </p>
    <p v-else-if="!ranking.length" class="mt-3 text-xs text-slate-500">{{ sinRanking }}</p>

    <ul v-if="filas.length" class="mt-3.5 space-y-2">
      <MiembroFicha
        v-for="(item, idx) in filas"
        :key="item.id"
        :ficha="item"
        :posicion="idx + 1"
        :indice="idx"
        :progreso="aporte.get(item.id) || 0"
        :abierta-al-inicio="item.yo"
      />
    </ul>
    <p v-if="filas.some(f => f.minutos > 0)" class="mt-2 text-[11px] text-slate-500">
      Toca a un miembro para ver sus cifras. El anillo es su tiempo respecto al que más ha escuchado.
    </p>

    <!-- ── Escucha en común ─────────────────────────────────────────────────
         La parte de su música que coincide entre dos miembros, artista a
         artista. Sale sólo cuando hay al menos dos con datos. -->
    <template v-if="pares.length">
      <div class="sk-divider my-4" />
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-sm font-bold text-white">Escucha en común</h3>
        <span class="text-[11px] text-slate-500" title="La parte de su escucha que coincide, artista a artista">100 % = oís lo mismo</span>
      </div>
      <ul class="mt-3 grid gap-2 sm:grid-cols-2">
        <li
          v-for="(par, i) in paresVisibles"
          :key="`${par.idA}-${par.idB}`"
          class="par flex items-center gap-3 rounded-card px-3 py-2.5"
          :class="par.yo ? 'bg-brand-400/[0.10] ring-1 ring-inset ring-brand-400/30' : 'bg-white/[0.04]'"
          :style="{ '--retardo': `${i * 60}ms` }"
        >
          <!-- La pareja: dos avatares solapados. -->
          <span class="relative h-9 w-[60px] shrink-0" aria-hidden="true">
            <span class="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-full bg-slate-600 pr-2 text-xs font-bold text-slate-100 ring-2 ring-black/50">{{ inicialDe(par.a) }}</span>
            <span class="absolute left-6 top-0 flex h-9 w-9 items-center justify-center rounded-full bg-brand-400 text-xs font-bold text-black ring-2 ring-black/50">{{ inicialDe(par.b) }}</span>
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold text-white">{{ par.a }} · {{ par.b }}</span>
            <span class="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/[0.08]">
              <span class="barra-par block h-full rounded-full bg-brand-400" :style="{ width: `${montado ? par.pct : 0}%` }" />
            </span>
          </span>
          <!-- Anillo con el porcentaje. -->
          <span class="relative h-11 w-11 shrink-0">
            <svg viewBox="0 0 44 44" class="absolute inset-0 h-11 w-11 -rotate-90" aria-hidden="true">
              <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" stroke-width="3.5" class="text-white/[0.08]" />
              <circle
                cx="22" cy="22" r="18" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"
                class="anillo-par text-brand-400"
                :stroke-dasharray="CIRC_PAR"
                :stroke-dashoffset="CIRC_PAR * (1 - (montado ? par.pct / 100 : 0))"
              />
            </svg>
            <span class="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-bold tabular-nums text-white">{{ par.pct }} %</span>
          </span>
        </li>
      </ul>
      <button
        v-if="pares.length > PARES_PLEGADOS"
        type="button"
        class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-[11px] font-semibold text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-slate-200"
        :aria-expanded="verTodasLasParejas"
        @click="verTodasLasParejas = !verTodasLasParejas"
      >
        {{ verTodasLasParejas ? 'Ver menos' : `Ver las ${pares.length} parejas` }}
        <GrupoIcono name="chevron" class="h-3.5 w-3.5 transition-transform duration-300" :class="verTodasLasParejas ? '-rotate-90' : 'rotate-90'" />
      </button>
    </template>

    <slot />
  </section>
</template>

<script setup>
/**
 * Detalle de un grupo de Comunidad: cifras de la semana, miembros y ranking.
 *
 * Es sólo presentación y la comparten los dos modos. Cada uno le pasa los datos
 * ya normalizados (ver `miembros` y `ranking` abajo), así que el de Firebase
 * sigue leyendo de su composable sin que esto lo toque.
 */
import { computed, onMounted, ref } from 'vue'
import GrupoIcono from './GrupoIcono.js'
import MiembroFicha from './MiembroFicha.vue'
import { formatearHoras, inicialDe, proporciones, resumirRanking } from '@/lib/gruposResumen'
import { paresEnComun } from '@/lib/gruposExtras'

const props = defineProps({
  nombre: { type: String, required: true },
  /** Líneas pequeñas bajo el título (última sincronización, próxima publicación…). */
  meta: { type: Array, default: () => [] },
  /** [{ id, nombre, yo, admin, desde, minutos }] */
  miembros: { type: Array, default: () => [] },
  /**
   * [{ id, nombre, yo, minutos, canciones, artista, artistaVeces, tema, temaVeces,
   *    extras: [{ texto, pista }], conteoArtistas }], ya ordenado por tiempo de escucha.
   */
  ranking: { type: Array, default: () => [] },
  semana: { type: String, default: '' },
  sinRanking: { type: String, default: 'Todavía no hay datos de esta semana.' }
})

const resumen = computed(() => resumirRanking(props.ranking))
/**
 * Una fila por miembro: primero quienes tienen cifras esta semana (el ranking,
 * ya ordenado por tiempo), con su papel y antigüedad; después el resto del
 * grupo, para que la lista siga siendo la de todos.
 */
const filas = computed(() => {
  const porId = new Map(props.miembros.map(m => [m.id, m]))
  const vistas = new Set()
  const filas = props.ranking.map((r) => {
    vistas.add(r.id)
    const m = porId.get(r.id)
    return { ...r, admin: !!m?.admin, desde: m?.desde || '', yo: r.yo || !!m?.yo }
  })
  const resto = props.miembros
    .filter(m => !vistas.has(m.id))
    .map(m => ({ id: m.id, nombre: m.nombre, yo: m.yo, admin: m.admin, desde: m.desde, minutos: 0, canciones: 0, extras: [] }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'))
  return [...filas, ...resto]
})
const aporte = computed(() => proporciones(filas.value))
const pares = computed(() => paresEnComun(props.ranking))

// Los anillos y barras de «Escucha en común» crecen desde cero al montarse.
const CIRC_PAR = 2 * Math.PI * 18
/** Plegadas, sólo las parejas más parecidas: con 5 miembros ya son 10. */
const PARES_PLEGADOS = 3
const verTodasLasParejas = ref(false)
const paresVisibles = computed(() => verTodasLasParejas.value ? pares.value : pares.value.slice(0, PARES_PLEGADOS))
const montado = ref(false)
onMounted(() => requestAnimationFrame(() => { montado.value = true }))
</script>

<style scoped>
.par {
  animation: entrada-par 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: var(--retardo, 0ms);
}
@keyframes entrada-par {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
.anillo-par { transition: stroke-dashoffset 1s cubic-bezier(0.22, 1, 0.36, 1) 0.15s; }
.barra-par { transition: width 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.15s; }
@media (prefers-reduced-motion: reduce) {
  .par { animation: none !important; }
  .anillo-par, .barra-par { transition: none !important; }
}
</style>
