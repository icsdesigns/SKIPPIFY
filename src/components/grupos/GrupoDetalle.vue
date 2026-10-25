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

    <!-- ── Miembros ───────────────────────────────────────────────────────
         Quien aparece aquí cuenta en el ranking. La barra fina es su tiempo
         de escucha esta semana respecto al que más ha escuchado. -->
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-sm font-bold text-white">Miembros</h3>
      <span class="sk-chip">{{ miembros.length || '—' }}</span>
    </div>

    <p v-if="!miembros.length" class="mt-3 text-xs text-slate-500">
      Todavía no se ha podido leer la lista de miembros.
    </p>

    <ul v-else class="mt-3 grid gap-2 sm:grid-cols-2">
      <li
        v-for="m in miembros"
        :key="m.id"
        class="flex items-center gap-3 rounded-card px-3 py-2.5"
        :class="m.yo ? 'bg-brand-400/[0.14]' : 'bg-white/[0.05]'"
      >
        <span
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
          :class="m.yo ? 'bg-brand-400 text-black' : 'bg-white/[0.12] text-slate-200'"
        >{{ inicialDe(m.nombre) }}</span>
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5">
            <span class="min-w-0 truncate text-sm font-semibold text-white">{{ m.nombre }}</span>
            <span v-if="m.yo" class="shrink-0 text-[10px] font-bold uppercase tracking-wider text-brand-400">tú</span>
            <span v-if="m.admin" class="sk-chip shrink-0 !px-2 !py-0.5 !text-[10px]">Admin</span>
          </span>
          <span class="mt-0.5 block truncate text-[11px] text-slate-500">
            {{ m.minutos ? formatearHoras(m.minutos) + ' esta semana' : 'Sin escuchas esta semana' }}<template v-if="m.desde"> · desde {{ m.desde }}</template>
          </span>
          <span class="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/[0.08]">
            <span
              class="block h-full rounded-full bg-brand-400"
              :style="{ width: `${Math.round((aporte.get(m.id) || 0) * 100)}%` }"
            />
          </span>
        </span>
      </li>
    </ul>

    <div class="sk-divider my-4" />

    <!-- ── Ranking semanal ──────────────────────────────────────────────── -->
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-sm font-bold text-white">Resultados semanales</h3>
      <slot name="vistas">
        <span v-if="semana" class="sk-chip">{{ semana }}</span>
      </slot>
    </div>

    <slot name="avisoRanking" />

    <p v-if="!ranking.length" class="mt-3 text-xs text-slate-500">{{ sinRanking }}</p>

    <ul v-else class="mt-3.5 space-y-2">
      <li
        v-for="(item, idx) in ranking"
        :key="`${item.id}-${idx}`"
        class="flex items-center justify-between gap-3 rounded-card px-3 py-2.5 transition-colors"
        :class="item.yo ? 'bg-brand-400/[0.14]' : 'bg-white/[0.05] hover:bg-white/[0.09]'"
      >
        <div class="flex min-w-0 items-start gap-3">
          <span
            class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold tabular-nums"
            :class="idx === 0 ? 'bg-brand-400 text-black' : idx < 3 ? 'bg-brand-400/25 text-brand-200' : 'bg-white/[0.10] text-slate-300'"
          >{{ idx + 1 }}</span>
          <div class="min-w-0">
            <!-- Dos líneas en vez de recorte: un nombre de 24 caracteres, el
                 máximo del formulario, no cabe en una a ancho de móvil. -->
            <p class="sk-clamp-2 text-sm font-semibold text-white">
              {{ item.nombre }}
              <span v-if="item.yo" class="ml-1 text-[10px] uppercase tracking-wider text-brand-400">tú</span>
            </p>
            <p class="mt-0.5 text-[11px] text-slate-400">
              {{ item.canciones }} canciones
            </p>
            <!-- Cada línea en su renglón y recortada; el title deja leer el
                 nombre entero al pasar por encima. -->
            <p v-if="item.artista" class="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500" :title="item.artista">
              <GrupoIcono name="mic" class="h-3 w-3 shrink-0" /><span class="truncate">{{ item.artista }}</span><span v-if="item.artistaVeces > 1" class="shrink-0 text-slate-600">×{{ item.artistaVeces }}</span>
            </p>
            <p v-if="item.tema" class="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500" :title="item.tema">
              <GrupoIcono name="note" class="h-3 w-3 shrink-0" /><span class="truncate">{{ item.tema }}</span><span v-if="item.temaVeces > 1" class="shrink-0 text-slate-600">×{{ item.temaVeces }}</span>
            </p>
            <p v-if="item.extras && item.extras.length" class="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-slate-500">
              <span v-for="e in item.extras" :key="e.texto" :title="e.pista">{{ e.texto }}</span>
            </p>
          </div>
        </div>
        <span class="shrink-0 text-right font-mono text-sm font-bold tabular-nums text-brand-400">{{ formatearHoras(item.minutos) }}</span>
      </li>
    </ul>

    <!-- ── Escucha en común ─────────────────────────────────────────────────
         La parte de su música que coincide entre dos miembros, artista a
         artista. Sale sólo cuando hay al menos dos con datos. -->
    <template v-if="pares.length">
      <div class="sk-divider my-4" />
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-sm font-bold text-white">Escucha en común</h3>
        <span class="text-[11px] text-slate-500" title="La parte de su escucha que coincide, artista a artista">100 % = oís lo mismo</span>
      </div>
      <ul class="mt-3 space-y-2">
        <li
          v-for="par in pares"
          :key="`${par.idA}-${par.idB}`"
          class="rounded-card px-3 py-2.5"
          :class="par.yo ? 'bg-brand-400/[0.14]' : 'bg-white/[0.05]'"
        >
          <div class="flex items-center justify-between gap-3">
            <span class="min-w-0 truncate text-sm font-semibold text-white">{{ par.a }} · {{ par.b }}</span>
            <span class="shrink-0 font-mono text-sm font-bold tabular-nums text-brand-400">{{ par.pct }} %</span>
          </div>
          <span class="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/[0.08]">
            <span class="block h-full rounded-full bg-brand-400" :style="{ width: `${par.pct}%` }" />
          </span>
        </li>
      </ul>
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
import { computed } from 'vue'
import GrupoIcono from './GrupoIcono.js'
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
const aporte = computed(() => proporciones(props.miembros))
const pares = computed(() => paresEnComun(props.ranking))
</script>
