<template>
  <div class="sk-stagger space-y-5">
    <!-- ── Rankings ────────────────────────────────────────────────────────── -->
    <section class="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <article
        v-for="board in boards"
        :key="board.id"
        class="sk-card sk-card-lit p-5"
      >
        <header class="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 class="sk-title">{{ board.title }}</h2>
            <p class="sk-subtitle">{{ board.subtitle }}</p>
          </div>
          <span class="sk-chip">Top {{ TOP_LIMIT }}</span>
        </header>

        <div class="sk-segment mb-4">
          <button
            v-for="opt in rangeOptions"
            :key="`${board.id}-${opt.key}`"
            type="button"
            class="sk-segment-item"
            :class="board.range.value === opt.key ? 'sk-segment-item-active' : ''"
            @click="board.range.value = opt.key"
          >
            {{ opt.short }}
          </button>
        </div>

        <ul class="space-y-1.5">
          <li
            v-for="(item, i) in board.items.value"
            :key="item.name"
            class="relative overflow-hidden rounded-md bg-white/[0.04]"
            :class="board.expandable ? 'transition-colors hover:bg-white/[0.09]' : ''"
          >
            <!-- Barra proporcional al líder: da escala sin añadir un gráfico -->
            <div
              class="absolute inset-y-0 left-0 bg-gradient-to-r from-brand-400/[0.22] to-transparent"
              :style="{ width: `${leadShare(board.items.value, item)}%` }"
            />
            <component
              :is="board.expandable ? 'button' : 'div'"
              :type="board.expandable ? 'button' : null"
              :aria-expanded="board.expandable ? openTrack === item.name : null"
              class="relative flex w-full items-center gap-3 px-3 py-2.5 text-left"
              @click="board.expandable ? toggleTrack(item.name) : null"
            >
              <span
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
                :class="i === 0 ? 'bg-brand-400 text-black' : 'bg-white/[0.08] text-slate-300'"
              >{{ i + 1 }}</span>
              <span class="min-w-0 flex-1 truncate text-sm font-semibold text-white">{{ item.name }}</span>
              <!-- Sólo en «Top canciones»: avisa de que la fila se despliega -->
              <svg
                v-if="board.expandable && item.sub"
                class="h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-200"
                :class="openTrack === item.name ? 'rotate-180' : ''"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
              ><polyline points="6 9 12 15 18 9" /></svg>
              <span class="shrink-0 font-mono text-sm font-bold tabular-nums text-brand-400">{{ item.count }}</span>
            </component>

            <Transition
              name="artist"
              @enter="artistEnter"
              @after-enter="artistCleanup"
              @leave="artistLeave"
            >
              <p
                v-if="board.expandable && openTrack === item.name"
                class="relative flex items-center gap-1.5 border-t border-white/[0.07] px-3 py-2 text-xs text-slate-400"
              >
                <span class="text-slate-500">🎤</span>
                <span class="truncate">{{ item.sub || 'Artista desconocido' }}</span>
              </p>
            </Transition>
          </li>
          <li v-if="!board.items.value.length" class="rounded-md border border-dashed border-white/[0.14] px-3 py-6 text-center text-xs text-slate-400">
            Sin datos en este período
          </li>
        </ul>
      </article>
    </section>

    <!-- ── Rachas ──────────────────────────────────────────────────────────── -->
    <section class="sk-card sk-card-lit p-5">
      <header class="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 class="sk-title">Rachas de escucha</h2>
          <p class="sk-subtitle">Cuánto mantienes el hábito de escuchar música día tras día</p>
        </div>
        <span class="sk-chip">Año</span>
      </header>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div
          v-for="streak in streakCards"
          :key="streak.label"
          class="rounded-card bg-white/[0.04] px-4 py-3.5"
        >
          <p class="sk-eyebrow">{{ streak.label }}</p>
          <p class="mt-1.5 flex items-baseline gap-1.5">
            <span class="text-3xl font-extrabold leading-none tracking-tightest text-brand-400">{{ streak.value }}</span>
            <span class="text-xs font-semibold text-slate-400">días</span>
          </p>
          <p class="sk-stat-hint">{{ streak.hint }}</p>
        </div>
      </div>
    </section>

    <!-- ── Horas por mes ───────────────────────────────────────────────────── -->
    <section class="sk-card sk-card-lit p-5">
      <header class="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 class="sk-title">Horas de escucha por mes</h2>
          <p class="sk-subtitle">Tiempo reproducido agregado mes a mes</p>
        </div>
        <span class="sk-chip">Año</span>
      </header>

      <div class="h-72 sm:h-80">
        <Bar :data="monthlyHoursData" :options="monthlyHoursOptions" />
      </div>
    </section>

    <!-- ── Heatmap ─────────────────────────────────────────────────────────── -->
    <section class="sk-card sk-card-lit p-5">
      <header class="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 class="sk-title">Distribución por hora</h2>
          <p class="sk-subtitle">
            Intensidad de escucha por hora y día de la semana, con el tiempo reproducido de los últimos 12 meses
          </p>
        </div>
        <span class="sk-chip">Año</span>
      </header>

      <!-- Resumen global: cuándo escuchas más, sin tener que leer la rejilla -->
      <div class="mb-4 flex flex-wrap gap-2">
        <span
          v-for="(peak, i) in peakHours"
          :key="peak.hour"
          class="sk-chip"
          :class="i === 0 ? 'sk-chip-accent' : ''"
        >
          {{ i === 0 ? '🔥' : '·' }} {{ peak.label }} — {{ peak.hours }} h
        </span>
        <span v-if="!peakHours.length" class="sk-chip">Sin escuchas registradas todavía</span>
      </div>

      <!-- Sin scroll horizontal: las columnas de día son fluidas y las dos fijas
           (hora y total) se quedan en lo mínimo legible, de modo que la rejilla
           entra entera hasta en las pantallas más estrechas. -->
      <div class="pb-1">
        <div class="w-full">
          <div class="grid gap-[3px] sm:gap-1" style="grid-template-columns: 22px repeat(7, minmax(0, 1fr)) 30px;">
            <div />
            <div
              v-for="day in heatmapDays"
              :key="`day-head-${day}`"
              class="flex h-5 items-center justify-center text-[10px] font-medium text-slate-400"
            >{{ day }}</div>
            <div class="flex h-5 items-center justify-center text-[8px] uppercase tracking-tight text-slate-500">Tot.</div>

            <template v-for="(row, rowIdx) in hourlyHeatmapRows" :key="`row-${row.hour}`">
              <!-- La etiqueta de la hora se enciende si es una de las punta -->
              <div
                class="flex h-5 items-center justify-end pr-0.5 text-[9px] tabular-nums transition-colors"
                :class="row.isPeak ? 'font-bold text-brand-400' : 'text-slate-500'"
              >{{ row.hourLabel }}</div>
              <div
                v-for="(cell, dayIdx) in row.cells"
                :key="`cell-${rowIdx}-${dayIdx}`"
                class="h-5 rounded-[4px] border border-white/[0.04]"
                :style="{ backgroundColor: heatColor(cell.level) }"
                :title="`${heatmapDays[dayIdx]} ${row.hourLabel}:00 — ${cell.hours} h`"
              />
              <!-- Columna global: el total de esa hora en toda la semana -->
              <div
                class="relative h-5 overflow-hidden rounded-[4px] border"
                :class="row.isPeak ? 'border-brand-400/45' : 'border-white/[0.07]'"
                :title="`Total ${row.hourLabel}:00 — ${row.totalHours} h`"
              >
                <div
                  class="absolute inset-y-0 left-0"
                  :style="{ width: `${row.globalLevel * 100}%`, backgroundColor: heatColor(row.globalLevel) }"
                />
              </div>
            </template>
          </div>
        </div>
      </div>

      <div class="mt-4 flex items-center justify-end gap-2">
        <span class="text-[10px] text-slate-500">Menos</span>
        <span
          v-for="step in [0, 0.25, 0.5, 0.75, 1]"
          :key="`legend-${step}`"
          class="h-3 w-5 rounded-[3px] border border-white/[0.07]"
          :style="{ backgroundColor: heatColor(step) }"
        />
        <span class="text-[10px] text-slate-500">Más</span>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend
} from 'chart.js'
import { useEventStore } from '@/stores/events'
import {
  CHART_ACCENT_SOFT,
  CHART_ACCENT_STRONG,
  accentAlpha,
  chartScales,
  chartTooltip
} from '@/lib/chartTheme'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const { events } = useEventStore()

const TOP_LIMIT = 5
const MS_IN_DAY = 86400000
const MS_IN_HOUR = 3600000
const MONTHS_WINDOW = 12
const PEAK_COUNT = 3
const heatmapDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const rangeOptions = [
  { key: 'week', label: 'Última semana', short: '7 d', days: 7 },
  { key: 'month', label: 'Último mes', short: '30 d', days: 30 },
  { key: 'sixMonths', label: 'Últimos 6 meses', short: '6 m', days: 182 },
  { key: 'year', label: 'Último año', short: '1 año', days: 365 }
]

const artistsRange = ref('week')
const tracksRange = ref('week')

/**
 * Reloj compartido de la vista. Sin él, todo lo que dependía de `Date.now()`
 * dentro de un `computed` quedaba cacheado para siempre: ni la ventana de 12
 * meses ni el mapa de calor avanzaban con la app abierta.
 */
const nowTick = ref(Date.now())
let clockTimer = null

function refreshClock () {
  nowTick.value = Date.now()
}

onMounted(() => {
  clockTimer = setInterval(refreshClock, 60_000)
  // Al volver del segundo plano el intervalo puede haberse ralentizado.
  document.addEventListener('visibilitychange', onVisibility)
})

onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer)
  document.removeEventListener('visibilitychange', onVisibility)
})

function onVisibility () {
  if (document.visibilityState === 'visible') refreshClock()
}

function getEventMs (event) {
  const msPlayed = Number(event?.ms_played)
  if (Number.isFinite(msPlayed) && msPlayed > 0) return msPlayed

  const durationMs = Number(event?.duration_ms)
  if (Number.isFinite(durationMs) && durationMs > 0) return durationMs

  return 0
}

function normalizeText (value) {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function isExcludedFromRankings (event) {
  const track = normalizeText(event?.track)
  const artist = normalizeText(event?.artist)
  const combined = `${track} ${artist}`.trim()
  if (!combined) return false
  if (combined.includes('publicidad')) return true
  if (combined.includes('anuncio')) return true
  if (combined.includes('spotify')) return true
  if (track.includes('dj x') || artist.includes('dj x')) return true
  return false
}

function eventsByRange (key) {
  const opt = rangeOptions.find(item => item.key === key) || rangeOptions[0]
  const cutoff = new Date(nowTick.value - (opt.days * MS_IN_DAY))
  return events.value.filter(e => new Date(e.played_at) >= cutoff && !isExcludedFromRankings(e))
}

/**
 * Ranking por nombre. `subSelector` es opcional: cuando se pasa (el artista de
 * cada canción) se guarda además cuál es el más frecuente de ese grupo, que es
 * lo que se muestra al pulsar sobre la fila.
 */
function topFromEvents (items, selector, subSelector = null) {
  const map = new Map()
  for (const e of items) {
    const name = (selector(e) || '').toString().trim()
    if (!name) continue

    let entry = map.get(name)
    if (!entry) {
      entry = { count: 0, subs: new Map() }
      map.set(name, entry)
    }
    entry.count += 1

    if (subSelector) {
      const sub = (subSelector(e) || '').toString().trim()
      if (sub) entry.subs.set(sub, (entry.subs.get(sub) || 0) + 1)
    }
  }

  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, TOP_LIMIT)
    .map(([name, entry]) => ({
      name,
      count: entry.count,
      // Una misma canción puede venir con el artista escrito de varias formas
      // (colaboraciones, remasterizaciones): se muestra la más repetida.
      sub: [...entry.subs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ''
    }))
}

const topArtistsRange = computed(() => topFromEvents(eventsByRange(artistsRange.value), e => e.artist))
const topTracksRange = computed(() => topFromEvents(eventsByRange(tracksRange.value), e => e.track, e => e.artist))

/** Fila desplegada de «Top canciones» (sólo una a la vez). */
const openTrack = ref('')

function toggleTrack (name) {
  openTrack.value = openTrack.value === name ? '' : name
}

/**
 * Despliegue del artista, animado contra la altura REAL de la fila.
 *
 * La versión anterior animaba `max-height` hasta un tope fijo de 40 px. Como el
 * contenido mide bastante menos, la transición seguía corriendo un buen rato
 * después de que la fila ya estuviera del todo abierta, y ese tramo en el que no
 * se movía nada es lo que se veía como una animación a tirones.
 *
 * Midiendo `scrollHeight` la animación empieza y acaba exactamente donde lo hace
 * el contenido, sin tiempo muerto ni saltos.
 */
const ARTIST_ANIM_MS = 220

function artistEnter (el, done) {
  el.style.height = '0px'
  // Lectura forzada: sin ella el navegador agrupa las dos asignaciones y no hay
  // transición, sólo un salto al valor final.
  void el.offsetHeight
  el.style.height = `${el.scrollHeight}px`
  setTimeout(done, ARTIST_ANIM_MS)
}

/** Devuelve la altura al flujo normal, por si el texto cambia estando abierta. */
function artistCleanup (el) {
  el.style.height = ''
}

function artistLeave (el, done) {
  el.style.height = `${el.scrollHeight}px`
  void el.offsetHeight
  el.style.height = '0px'
  setTimeout(done, ARTIST_ANIM_MS)
}

const boards = [
  {
    id: 'artists',
    title: 'Top artistas',
    subtitle: 'Quién domina tu rotación en el período elegido',
    range: artistsRange,
    items: topArtistsRange
  },
  {
    id: 'tracks',
    title: 'Top canciones',
    subtitle: 'Las que más veces han sonado · pulsa una para ver su artista',
    range: tracksRange,
    items: topTracksRange,
    expandable: true
  }
]

function leadShare (items, item) {
  const max = items[0]?.count || 0
  return max ? Math.round((item.count / max) * 100) : 0
}

const monthsWindow = computed(() => {
  const labels = []
  const buckets = []
  const now = new Date(nowTick.value)

  for (let i = MONTHS_WINDOW - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
    labels.push(start.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }))
    buckets.push({ start, end })
  }

  return { labels, buckets }
})

/** Nº de días desde 1970 en hora local (inmune a cambios de horario/DST). */
function localDayNumber (date) {
  return Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_IN_DAY)
  )
}

const listeningStreak = computed(() => {
  const now = new Date(nowTick.value)
  const cutoff = new Date(now.getTime() - (365 * MS_IN_DAY))
  // Antes se comparaban timestamps de medianoche local con `=== 86400000`.
  // En los cambios de hora (Europe/Madrid) la diferencia real es de 23 h o 25 h,
  // así que la racha se rompía dos veces al año sin motivo.
  const dayNumbers = new Set()

  for (const e of events.value) {
    const d = new Date(e.played_at)
    if (Number.isNaN(d.getTime()) || d < cutoff) continue
    dayNumbers.add(localDayNumber(d))
  }

  const sorted = [...dayNumbers].sort((a, b) => a - b)
  if (!sorted.length) return { current: 0, best: 0, activeDays: 0 }

  let best = 1
  let run = 1
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] === 1) {
      run += 1
      if (run > best) best = run
    } else {
      run = 1
    }
  }

  const today = localDayNumber(now)
  let current = 0
  // La racha sigue viva si hubo escucha hoy o ayer (a las 00:30 aún no hay
  // reproducciones de "hoy" y la racha se mostraba como 0).
  const anchor = dayNumbers.has(today) ? today : (dayNumbers.has(today - 1) ? today - 1 : null)
  if (anchor !== null) {
    current = 1
    let cursor = anchor - 1
    while (dayNumbers.has(cursor)) {
      current += 1
      cursor -= 1
    }
  }

  return { current, best, activeDays: dayNumbers.size }
})

const streakCards = computed(() => [
  { label: 'Racha actual', value: listeningStreak.value.current, hint: 'Días consecutivos contando desde hoy' },
  { label: 'Mejor racha', value: listeningStreak.value.best, hint: 'Récord histórico de días consecutivos' },
  { label: 'Días activos', value: listeningStreak.value.activeDays, hint: 'Total con escucha en el último año' }
])

const monthlyHoursData = computed(() => {
  const { labels, buckets } = monthsWindow.value
  // Un solo recorrido de los eventos en lugar de 12 (uno por mes).
  const totals = new Array(buckets.length).fill(0)
  const firstStart = buckets[0]?.start
  const lastEnd = buckets[buckets.length - 1]?.end
  const bucketIndexByKey = new Map(
    buckets.map(({ start }, i) => [`${start.getFullYear()}-${start.getMonth()}`, i])
  )

  for (const e of events.value) {
    const playedAt = new Date(e.played_at)
    if (Number.isNaN(playedAt.getTime())) continue
    if (firstStart && playedAt < firstStart) continue
    if (lastEnd && playedAt >= lastEnd) continue
    const idx = bucketIndexByKey.get(`${playedAt.getFullYear()}-${playedAt.getMonth()}`)
    if (idx === undefined) continue
    totals[idx] += getEventMs(e)
  }

  return {
    labels,
    datasets: [{
      label: 'Horas',
      data: totals.map(totalMs => Math.round(totalMs / MS_IN_HOUR)),
      backgroundColor: CHART_ACCENT_SOFT,
      hoverBackgroundColor: CHART_ACCENT_STRONG,
      borderWidth: 0,
      borderRadius: 6,
      categoryPercentage: 0.9,
      barPercentage: 0.82
    }]
  }
})

const monthlyHoursOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: chartTooltip
  },
  scales: chartScales({ yMaxTicks: 6 })
}

/**
 * Matriz día × hora de los últimos 12 meses.
 *
 * Depende de `events` y de `nowTick`, así que se recalcula tanto cuando entra
 * una reproducción nueva como cuando avanza el reloj: antes la ventana de corte
 * se congelaba en el instante en que se abría la pestaña.
 *
 * Además del nivel por celda se calcula el total global de cada hora (sumando
 * los siete días) para poder destacar las horas de mayor escucha del conjunto.
 */
const hourlyHeatmap = computed(() => {
  const dayHourMatrix = Array.from({ length: 7 }, () => new Array(24).fill(0))
  const hourTotals = new Array(24).fill(0)

  const cutoff = nowTick.value - (365 * MS_IN_DAY)
  let maxCellMs = 0

  for (const e of events.value) {
    const playedAt = new Date(e.played_at)
    if (Number.isNaN(playedAt.getTime()) || playedAt.getTime() < cutoff) continue

    const ms = getEventMs(e)
    if (ms <= 0) continue

    const dayIndex = (playedAt.getDay() + 6) % 7
    const hour = playedAt.getHours()

    dayHourMatrix[dayIndex][hour] += ms
    hourTotals[hour] += ms
    if (dayHourMatrix[dayIndex][hour] > maxCellMs) maxCellMs = dayHourMatrix[dayIndex][hour]
  }

  const maxHourMs = Math.max(...hourTotals)

  // Las horas punta son globales (todos los días juntos): es lo que se pide
  // resaltar, y no coincide necesariamente con la celda individual más intensa.
  const peakHourIndexes = new Set(
    hourTotals
      .map((ms, hour) => ({ ms, hour }))
      .filter(item => item.ms > 0)
      .sort((a, b) => b.ms - a.ms)
      .slice(0, PEAK_COUNT)
      .map(item => item.hour)
  )

  const rows = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    hourLabel: hour.toString().padStart(2, '0'),
    isPeak: peakHourIndexes.has(hour),
    totalHours: Math.round((hourTotals[hour] / MS_IN_HOUR) * 10) / 10,
    globalLevel: maxHourMs > 0 ? hourTotals[hour] / maxHourMs : 0,
    cells: heatmapDays.map((_, dayIndex) => {
      const totalMs = dayHourMatrix[dayIndex][hour]
      return {
        hours: Math.round((totalMs / MS_IN_HOUR) * 10) / 10,
        level: maxCellMs > 0 ? totalMs / maxCellMs : 0
      }
    })
  }))

  const peaks = [...peakHourIndexes]
    .sort((a, b) => hourTotals[b] - hourTotals[a])
    .map(hour => ({
      hour,
      label: `${hour.toString().padStart(2, '0')}:00`,
      hours: Math.round((hourTotals[hour] / MS_IN_HOUR) * 10) / 10
    }))

  return { rows, peaks }
})

const hourlyHeatmapRows = computed(() => hourlyHeatmap.value.rows)
const peakHours = computed(() => hourlyHeatmap.value.peaks)

function heatColor (level) {
  // La curva raíz evita que sólo la hora récord se vea: con escuchas muy
  // concentradas, una escala lineal dejaba el resto de la rejilla casi negra.
  const eased = Math.sqrt(Math.min(1, Math.max(0, level)))
  const alpha = 0.08 + (eased * 0.84)
  return accentAlpha(alpha)
}
</script>

<style scoped>
/*
  Despliegue del artista.

  La altura la fijan en píxeles los hooks de JS (`artistEnter` / `artistLeave`),
  no el CSS. Antes esto animaba `max-height` contra un tope fijo de 40 px que
  superaba la altura real de la fila (~33 px): el último tramo de la transición
  no movía nada y ese tiempo muerto se percibía como un tirón al final.

  Las dos propiedades comparten duración y curva para que el despliegue se lea
  como un único movimiento.
*/
.artist-enter-active,
.artist-leave-active {
  overflow: hidden;
  transition:
    height 0.22s cubic-bezier(0.33, 1, 0.68, 1),
    opacity 0.22s cubic-bezier(0.33, 1, 0.68, 1);
}
.artist-enter-from,
.artist-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .artist-enter-active,
  .artist-leave-active {
    transition: none;
  }
}
</style>
