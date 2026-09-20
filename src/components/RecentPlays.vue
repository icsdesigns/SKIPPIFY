<template>
  <section class="sk-card sk-card-lit overflow-hidden p-5">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
      <div>
        <h2 class="sk-title">Historial de reproducciones</h2>
        <p class="sk-subtitle">Todo lo que Skippify ha registrado, buscable y filtrable por mes</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="sk-chip">{{ visibleEvents.length }} eventos</span>
        <button
          @click="openModal"
          class="sk-btn sk-btn-danger sk-btn-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
          Eliminar historial
        </button>
      </div>
    </div>

    <!-- Search bar -->
    <div class="relative mb-3">
      <svg xmlns="http://www.w3.org/2000/svg" class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        v-model="search"
        type="text"
        placeholder="Buscar canción o artista…"
        class="sk-input pl-9 pr-8"
      />
      <button
        v-if="search"
        @click="search = ''"
        class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
        aria-label="Limpiar búsqueda"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <!-- Monthly index -->
    <div class="mb-4">
      <div ref="monthFilterRef" class="month-filter-shell relative max-w-xs">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-400/80"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <button
          type="button"
          @click="toggleMonthMenu"
          class="sk-input month-filter-select pl-9 pr-9 text-left font-medium"
        >
          {{ selectedMonthLabel }}
        </button>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 transition-transform duration-150"
          :class="monthMenuOpen ? 'rotate-180' : ''"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>

        <Transition name="month-menu">
          <div
            v-if="monthMenuOpen"
            class="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-card bg-ink-400 p-1 shadow-lift"
          >
            <button
              type="button"
              @click="selectMonth('all')"
              class="w-full truncate rounded-md px-3 py-2 text-left text-sm font-semibold transition-colors"
              :class="selectedMonth === 'all' ? 'bg-white/[0.14] text-white' : 'text-slate-300 hover:bg-white/[0.08] hover:text-white'"
            >
              Todos
            </button>
            <button
              v-for="item in monthIndex"
              :key="`month-opt-${item.key}`"
              type="button"
              @click="selectMonth(item.key)"
              class="w-full truncate rounded-md px-3 py-2 text-left text-sm font-semibold transition-colors"
              :class="selectedMonth === item.key ? 'bg-white/[0.14] text-white' : 'text-slate-300 hover:bg-white/[0.08] hover:text-white'"
            >
              {{ item.label }} ({{ item.count }})
            </button>
          </div>
        </Transition>
      </div>
    </div>

    <p v-if="feedback" class="text-xs text-slate-400 mb-3">{{ feedback }}</p>

    <!-- Filas de canción al estilo de Spotify en vez de una tabla: el número, el
         título sobre el artista y la fecha a la derecha. Una tabla de tres
         columnas obligaba a desplazamiento lateral en cuanto el título era
         largo; así cada dato tiene su sitio a cualquier ancho. -->
    <div class="max-h-[600px] overflow-y-auto overflow-x-hidden">
      <ol class="space-y-0.5">
        <li v-for="(e, i) in visibleRows" :key="e.key" class="sk-row group">
          <span class="w-6 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-500 group-hover:text-slate-400">
            {{ i + 1 }}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold text-white">{{ e.track }}</span>
            <span class="block truncate text-xs text-slate-400">{{ e.artist }}</span>
          </span>
          <span class="shrink-0 text-right text-[11px] leading-tight text-slate-500">
            <span class="block whitespace-nowrap">{{ e.date }}</span>
            <span class="block whitespace-nowrap text-slate-500">{{ e.time }}</span>
          </span>
        </li>
      </ol>

      <p v-if="!filteredEvents.length" class="px-2.5 py-6 text-center text-sm text-slate-400">
        {{ search ? `Sin resultados para «${search}»` : 'No hay reproducciones registradas' }}
      </p>
    </div>

    <div v-if="hasMore" class="mt-3 flex items-center justify-center gap-3">
      <span class="text-xs text-slate-500">
        Mostrando {{ visibleRows.length }} de {{ filteredEvents.length }}
      </span>
      <button
        @click="showMore"
        class="sk-btn sk-btn-ghost sk-btn-sm"
      >
        Mostrar más
      </button>
    </div>
  </section>

  <!-- Delete history modal -->
  <Transition name="modal">
    <div
      v-if="showModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="showModal = false" />
      <div class="sk-card sk-card-lit relative w-full max-w-sm p-6">

        <!-- Header -->
        <div class="mb-6 flex items-center gap-3">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-500/[0.18]">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-rose-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </div>
          <div class="min-w-0">
            <h3 class="truncate text-base font-extrabold tracking-tight text-white">Eliminar historial</h3>
            <p class="truncate text-xs text-slate-400">Arrastra para seleccionar el rango</p>
          </div>
        </div>

        <!-- Selected label -->
        <div class="mb-4 text-center">
          <span
            class="inline-block max-w-full truncate rounded-full px-4 py-1.5 text-sm font-bold transition-colors"
            :class="sliderIndex === steps.length - 1
              ? 'bg-rose-500/[0.18] text-rose-200'
              : 'bg-white/[0.10] text-white'"
          >
            {{ steps[sliderIndex].label }}
          </span>
        </div>

        <!-- Slider -->
        <div class="px-1 mb-3">
          <input
            v-model.number="sliderIndex"
            type="range"
            min="0"
            :max="steps.length - 1"
            step="1"
            class="slider w-full"
            :style="{ '--pct': sliderPct }"
          />
          <!-- Tick labels -->
          <div class="flex justify-between mt-2">
            <span
              v-for="(s, i) in steps"
              :key="i"
              class="text-[10px] text-center transition-colors"
              :class="i === sliderIndex ? 'text-slate-200 font-semibold' : 'text-slate-500'"
              :style="{ width: (100 / steps.length) + '%' }"
            >{{ s.tick }}</span>
          </div>
        </div>

        <!-- Warning for "all" -->
        <p v-if="sliderIndex === steps.length - 1" class="text-xs text-red-400/80 text-center mb-4">
          ⚠ Esta acción eliminará todo el historial y no se puede deshacer.
        </p>
        <p v-else class="text-xs text-slate-500 text-center mb-4">
          Se eliminarán los eventos anteriores a {{ steps[sliderIndex].label.toLowerCase() }}.
        </p>

        <!-- Actions -->
        <div class="flex gap-2">
          <button
            @click="showModal = false"
            class="sk-btn sk-btn-ghost flex-1"
          >
            Cancelar
          </button>
          <button
            @click="confirmDelete"
            class="sk-btn flex-1"
            :class="sliderIndex === steps.length - 1
              ? 'bg-rose-500 text-white hover:bg-rose-400'
              : 'bg-rose-500/[0.18] text-rose-200 hover:bg-rose-500/30'"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch, watchEffect, onMounted, onBeforeUnmount } from 'vue'
import { useEventStore } from '@/stores/events'

const { events, clearEvents, deleteOlderThan } = useEventStore()

const showModal  = ref(false)
const feedback   = ref('')
const sliderIndex = ref(0)
const search = ref('')
const selectedMonth = ref('all')
const monthMenuOpen = ref(false)
const monthFilterRef = ref(null)

function normalizeText (value) {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function isExcludedEntry (event) {
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

const visibleEvents = computed(() => events.value.filter(e => !isExcludedEntry(e)))

function monthKeyFromIso (iso) {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${m}`
}

const monthIndex = computed(() => {
  const map = new Map()
  for (const e of visibleEvents.value) {
    const key = monthKeyFromIso(e.played_at)
    if (!key) continue
    map.set(key, (map.get(key) || 0) + 1)
  }

  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, count]) => {
      const [y, m] = key.split('-').map(Number)
      const labelRaw = new Date(y, m - 1, 1).toLocaleDateString('es-ES', {
        month: 'long',
        year: 'numeric'
      })
      const label = labelRaw.charAt(0).toUpperCase() + labelRaw.slice(1)
      return { key, label, count }
    })
})

watchEffect(() => {
  if (selectedMonth.value === 'all') return
  if (!monthIndex.value.some(item => item.key === selectedMonth.value)) {
    selectedMonth.value = 'all'
  }
})

const filteredEvents = computed(() => {
  const q = search.value.trim().toLowerCase()
  return visibleEvents.value.filter(e => {
    const sameMonth = selectedMonth.value === 'all' || monthKeyFromIso(e.played_at) === selectedMonth.value
    if (!sameMonth) return false
    if (!q) return true
    return e.track?.toLowerCase().includes(q) || e.artist?.toLowerCase().includes(q)
  })
})

// La tabla renderizaba TODO el historial de golpe y formateaba cada fecha dos
// veces por fila. Con miles de reproducciones el Inicio tardaba en abrir en el
// móvil. Ahora se pagina y se formatea una sola vez por fila visible.
const PAGE_SIZE = 100
const visibleCount = ref(PAGE_SIZE)

const visibleRows = computed(() =>
  filteredEvents.value.slice(0, visibleCount.value).map(e => {
    const parts = formatDateParts(e.played_at)
    return {
      key: `${e.played_at}|${e.track}|${e.artist}`,
      track: e.track,
      artist: e.artist,
      date: parts.date,
      time: parts.time
    }
  })
)

const hasMore = computed(() => filteredEvents.value.length > visibleRows.value.length)

function showMore () {
  visibleCount.value += PAGE_SIZE
}

// Al cambiar de filtro se vuelve a la primera página.
watch([search, selectedMonth], () => { visibleCount.value = PAGE_SIZE })

const selectedMonthLabel = computed(() => {
  if (selectedMonth.value === 'all') return 'Todos'
  const item = monthIndex.value.find(x => x.key === selectedMonth.value)
  return item ? `${item.label} (${item.count})` : 'Todos'
})

function toggleMonthMenu () {
  monthMenuOpen.value = !monthMenuOpen.value
}

function selectMonth (value) {
  selectedMonth.value = value
  monthMenuOpen.value = false
}

function handleOutsideMonthMenu (event) {
  if (!monthMenuOpen.value) return
  const root = monthFilterRef.value
  if (!root) return
  if (root.contains(event.target)) return
  monthMenuOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', handleOutsideMonthMenu)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideMonthMenu)
})

const sliderPct = computed(() =>
  (sliderIndex.value / (steps.length - 1)) * 100
)

const steps = [
  { value: 1,     label: '1 mes',           tick: '1m'  },
  { value: 3,     label: '3 meses',          tick: '3m'  },
  { value: 5,     label: '5 meses',          tick: '5m'  },
  { value: 10,    label: '10 meses',         tick: '10m' },
  { value: 'all', label: 'Todo el historial', tick: 'Todo' },
]

function openModal () {
  sliderIndex.value = 0
  showModal.value = true
}

function formatDateParts (iso) {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) {
    return { date: '-', time: '--:--' }
  }

  return {
    date: d.toLocaleDateString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    }),
    time: d.toLocaleTimeString('es-ES', {
      hour: '2-digit', minute: '2-digit', hour12: false
    })
  }
}

function confirmDelete () {
  const step = steps[sliderIndex.value]
  showModal.value = false
  if (step.value === 'all') {
    const before = events.value.length
    clearEvents()
    feedback.value = `Se eliminaron ${before} eventos. Quedan 0.`
  } else {
    const removed = deleteOlderThan(step.value)
    feedback.value = `Se eliminaron ${removed} eventos. Quedan ${events.value.length}.`
  }
}
</script>

<style scoped>
.month-filter-shell {
  border-radius: 0.375rem;
}

.month-filter-select {
  letter-spacing: 0.01em;
}

.month-menu-enter-active,
.month-menu-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.month-menu-enter-from,
.month-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* Slider track */
.slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 9999px;
  background: linear-gradient(
    to right,
    #f4436a 0%,
    #f4436a calc(var(--pct) * 1%),
    rgba(255, 255, 255, 0.18) calc(var(--pct) * 1%),
    rgba(255, 255, 255, 0.18) 100%
  );
  outline: none;
  cursor: pointer;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #f4436a;
  border: 2px solid #ffb5c5;
  box-shadow: 0 0 0 4px rgba(244, 67, 106, 0.18);
  cursor: pointer;
  transition: box-shadow 0.15s ease;
}

.slider::-webkit-slider-thumb:hover {
  box-shadow: 0 0 0 6px rgba(244, 67, 106, 0.3);
}

.slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #f4436a;
  border: 2px solid #ffb5c5;
  box-shadow: 0 0 0 4px rgba(244, 67, 106, 0.18);
  cursor: pointer;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-active .relative,
.modal-leave-active .relative {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.modal-enter-from .relative,
.modal-leave-to .relative {
  transform: scale(0.95);
  opacity: 0;
}
</style>
