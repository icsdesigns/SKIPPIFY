<template>
  <!-- Con descubrimiento: tarjeta pulsable (lleva a Estadísticas, como los
       carteles de la semana). Arriba el rótulo con «Nuevo»; luego la fila
       de opción —tesela y texto—, con el alto acotado (nombre en 2 líneas y
       cifras en 2), y debajo, fuera de esa fila, sus tres canciones más
       escuchadas. -->
  <button
    v-if="desc"
    type="button"
    class="sk-card sk-card-hover group relative flex w-full min-w-0 flex-col overflow-hidden p-4 text-left"
    data-descubrimiento="nuevo"
    :aria-label="etiqueta"
    @click="irAEstadisticas"
  >
    <span class="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-brand-500/12 to-transparent opacity-60" aria-hidden="true" />

    <span class="relative flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span class="sk-eyebrow leading-snug">Descubrimiento del mes</span>
      <span class="shrink-0 rounded-full bg-brand-400/[0.18] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-200">Nuevo</span>
    </span>

    <span class="relative mt-3 flex w-full min-w-0 items-center gap-3" data-descubrimiento-fila>
      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-400/[0.22] text-brand-200">
        <StatIcon name="descubrimiento" class="h-5 w-5" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="line-clamp-2 text-sm font-extrabold leading-snug text-white [overflow-wrap:anywhere]" data-descubrimiento-artista>{{ desc.artista }}</span>
        <span class="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-400">{{ resumen }}</span>
      </span>
    </span>

    <span v-if="desc.canciones.length" class="relative mt-3 flex w-full min-w-0 flex-col gap-1.5">
      <span
        v-for="(c, i) in desc.canciones"
        :key="i"
        class="flex w-full min-w-0 items-center gap-2.5 rounded-lg bg-black/25 px-2.5 py-1.5"
        data-descubrimiento-cancion
      >
        <span class="w-3 shrink-0 text-center text-[11px] font-extrabold tabular-nums" :class="i === 0 ? 'text-brand-300' : 'text-slate-500'">{{ i + 1 }}</span>
        <span class="min-w-0 flex-1 truncate text-xs font-semibold text-slate-200">{{ c.titulo }}</span>
        <span class="shrink-0 text-[11px] tabular-nums text-slate-500">{{ veces(c.escuchas) }}</span>
      </span>
    </span>
  </button>

  <!-- Bloqueado: progreso hasta las 300 canciones únicas. -->
  <section
    v-else-if="!estado.desbloqueado"
    class="sk-card relative overflow-hidden p-4"
    data-descubrimiento="bloqueado"
  >
    <div class="flex min-w-0 items-start gap-3">
      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-slate-300">
        <StatIcon name="descubrimiento" class="h-5 w-5" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="sk-eyebrow leading-snug">Descubrimientos</p>
        <p class="mt-1 line-clamp-3 text-[11px] leading-snug text-slate-400">
          Al llegar a {{ estado.umbral }} canciones distintas, te avisaremos de los artistas nuevos que empieces a escuchar.
        </p>
      </div>
    </div>
    <div
      class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]"
      role="progressbar"
      aria-label="Canciones distintas para desbloquear los descubrimientos"
      aria-valuemin="0"
      :aria-valuemax="estado.umbral"
      :aria-valuenow="estado.cancionesUnicas"
      data-descubrimiento-progreso
    >
      <div class="h-full rounded-full bg-brand-400 transition-[width] duration-500" :style="{ width: `${Math.round(estado.progreso * 100)}%` }" />
    </div>
    <p class="mt-1.5 flex items-baseline justify-between gap-2 text-[11px] tabular-nums">
      <span class="min-w-0 font-bold text-slate-300">{{ estado.cancionesUnicas }} de {{ estado.umbral }} canciones</span>
      <span class="shrink-0 text-slate-500">{{ Math.floor(estado.progreso * 100) }} %</span>
    </p>
  </section>

  <!-- Desbloqueado y sin descubrimiento: una línea discreta. -->
  <section
    v-else
    class="sk-card relative overflow-hidden p-4"
    data-descubrimiento="ninguno"
  >
    <div class="flex min-w-0 items-center gap-3">
      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-slate-400">
        <StatIcon name="descubrimiento" class="h-5 w-5" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="line-clamp-2 text-sm font-bold leading-snug text-slate-300">Sin descubrimientos este mes</p>
        <p class="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">Cuando escuches muchas canciones de un artista nuevo, aparecerá aquí.</p>
      </div>
    </div>
  </section>
</template>

<script setup>
/**
 * Tarjeta «Descubrimientos» de Inicio, bajo los carteles de la semana.
 * Tres estados: bloqueado (progreso hasta 300 canciones únicas), con
 * descubrimiento (sólo el principal) y sin descubrimiento este mes. Las reglas
 * viven en `lib/descubrimientos.js`; el estado, en `useDescubrimientos`.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import StatIcon from '@/components/StatIcon.vue'
import { useDescubrimientos } from '@/composables/useDescubrimientos'
import { desdeCuando, textoCancionesNuevas, textoEscuchas } from '@/lib/descubrimientos'

const router = useRouter()
const { estado } = useDescubrimientos()

const desc = computed(() => (estado.value.desbloqueado ? estado.value.descubrimiento : null))

const resumen = computed(() => {
  const d = desc.value
  if (!d) return ''
  const desde = desdeCuando(d.primeraEscucha, Date.now())
  return `${textoCancionesNuevas(d.cancionesNuevas)} · ${textoEscuchas(d.escuchas)}${desde ? ` · ${desde}` : ''}`
})

const etiqueta = computed(() => desc.value
  ? `Descubrimiento del mes: ${desc.value.artista}, ${resumen.value.replace(/ · /g, ', ')}. Abrir estadísticas`
  : '')

function veces (n) {
  return n === 1 ? '1 vez' : `${n} veces`
}

function irAEstadisticas () {
  router.push('/stats')
}
</script>
