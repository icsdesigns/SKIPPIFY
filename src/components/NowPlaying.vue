<template>
  <!-- Cabecera de reproducción al estilo de la página de álbum de Spotify: un
       degradado del color del estado que se funde con el lienzo, la «portada»
       (aquí el disco de estado) y el texto grande a su derecha. -->
  <section class="sk-card sk-card-lit relative overflow-hidden">
    <div class="pointer-events-none absolute inset-0" :class="tone.wash" />

    <div class="relative p-5 sm:p-6">
      <div class="flex items-center gap-2">
        <span class="relative flex h-2 w-2" role="img" :aria-label="tone.label">
          <span v-if="isPlaying" class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" :class="tone.dot" />
          <span class="relative inline-flex h-2 w-2 rounded-full" :class="tone.dot" />
        </span>
        <p class="sk-eyebrow truncate">Reproducción actual</p>
      </div>

      <!-- En móvil el disco y el texto van en columna: a 320 px de ancho, uno al
           lado del otro deja el título en dos letras por línea. -->
      <div class="mt-4 flex flex-col gap-4 sm:mt-5 sm:flex-row sm:items-center sm:gap-6">
        <!-- Disco con anillo de progreso: dice estado y avance sin ocupar sitio -->
        <div class="relative flex h-24 w-24 shrink-0 items-center justify-center self-start rounded-full bg-black/40 shadow-lift sm:h-28 sm:w-28 sm:self-auto">
          <svg class="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="5" />
            <circle
              cx="40" cy="40" r="34" fill="none"
              :stroke="tone.ring"
              stroke-width="5"
              stroke-linecap="round"
              :stroke-dasharray="RING_LENGTH"
              :stroke-dashoffset="ringOffset"
              class="transition-[stroke-dashoffset] duration-700 ease-out"
            />
          </svg>

          <!-- Ecualizador mientras suena; icono de estado en cualquier otro caso.
               Las barras crecen desde su centro y el perfil es simétrico (la más
               alta al medio), así el conjunto queda centrado en el círculo. -->
          <div v-if="isPlaying" class="flex h-9 items-center justify-center gap-[3px]">
            <span
              v-for="(h, i) in WAVE_BARS"
              :key="i"
              class="sk-eq-bar"
              :style="{ height: h + 'px', animationDelay: WAVE_DELAYS[i] + 's' }"
            />
          </div>
          <svg v-else class="h-8 w-8" :class="tone.icon" viewBox="0 0 24 24" fill="currentColor">
            <path v-if="state.mode === 'paused'" d="M9 5h3v14H9zM14 5h3v14h-3z" />
            <path v-else d="M8 8h8v8H8z" />
          </svg>
        </div>

        <div class="min-w-0 flex-1">
          <p class="sk-clamp-2 text-2xl font-extrabold leading-[1.1] tracking-tightest text-white sm:text-3xl">
            {{ trackLabel }}
          </p>
          <p class="mt-1.5 truncate text-sm font-semibold text-slate-400">{{ artistLabel }}</p>

          <div class="mt-3 flex flex-wrap items-center gap-1.5">
            <span v-if="state.album" class="sk-chip min-w-0"><span class="truncate">💿 {{ state.album }}</span></span>
            <span v-if="durationLabel" class="sk-chip">⏱ {{ durationLabel }}</span>
            <span v-if="meta" class="sk-chip min-w-0"><span class="truncate">{{ meta }}</span></span>
          </div>
        </div>
      </div>

      <!-- Barra de avance con tiempos: sólo cuando hay algo que medir. Se pinta
           como la de Spotify — pista fina y gris que se llena de blanco. -->
      <div v-if="showProgress" class="mt-5">
        <div class="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.14]">
          <div
            class="h-full rounded-full transition-[width] duration-700 ease-out"
            :class="tone.bar"
            :style="{ width: `${progressPct}%` }"
          />
        </div>
        <div class="mt-2 flex items-center justify-between gap-2 font-mono text-[11px] font-semibold text-slate-400">
          <span class="shrink-0">{{ elapsedLabel }}</span>
          <span class="shrink-0 tabular-nums">{{ progressPct }}%</span>
          <span class="shrink-0">{{ durationLabel || '--:--' }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  state: {
    type: Object,
    default: () => ({ mode: 'stopped' })
  }
})

/**
 * Perfil simétrico (palíndromo, número impar de barras): con una barra central y
 * dos pares iguales a los lados el ecualizador tiene un eje propio, que es el que
 * se hace coincidir con el centro del anillo de progreso.
 */
const WAVE_BARS = [14, 22, 30, 22, 14]
/** El desfase también es simétrico: la onda nace en el centro y se abre. */
const WAVE_DELAYS = [0.22, 0.11, 0, 0.11, 0.22]
const RING_LENGTH = 2 * Math.PI * 34
const nowTick = ref(Date.now())
let tickTimer = null

const isPlaying = computed(() => props.state.mode === 'playing')

const TONES = {
  playing: {
    label: 'Reproduciendo',
    wash: 'bg-[linear-gradient(160deg,rgba(30,215,96,0.22),rgba(30,215,96,0.04)_48%,transparent_72%)]',
    dot: 'bg-brand-400',
    ring: '#1ed760',
    bar: 'bg-brand-400',
    icon: 'text-brand-400'
  },
  paused: {
    label: 'En pausa',
    wash: 'bg-[linear-gradient(160deg,rgba(247,201,72,0.18),rgba(247,201,72,0.03)_48%,transparent_72%)]',
    dot: 'bg-amber-300',
    ring: '#f7c948',
    bar: 'bg-amber-300',
    icon: 'text-amber-300'
  },
  stopped: {
    label: 'Sin reproducción',
    wash: 'bg-[linear-gradient(160deg,rgba(255,255,255,0.07),transparent_62%)]',
    dot: 'bg-slate-600',
    ring: '#535353',
    bar: 'bg-slate-600',
    icon: 'text-slate-500'
  }
}

const tone = computed(() => TONES[props.state.mode] || TONES.stopped)

const trackLabel = computed(() => props.state.track || (props.state.mode === 'paused' ? 'Reproducción en pausa' : 'Sin música'))
const artistLabel = computed(() => props.state.artist || 'Pon algo en Spotify y aparecerá aquí')
const meta = computed(() => (props.state.meta || '').trim())

/**
 * Avance real: el porcentaje que llega por la notificación se queda quieto entre
 * eventos, así que mientras suena se extrapola con el reloj local.
 */
const rawProgress = computed(() => {
  const raw = Number(props.state?.progressPct)
  if (!Number.isFinite(raw)) return null

  const durationMs = Number(props.state?.durationMs)
  const syncedAt = Number(props.state?.progressSyncedAt)
  const canEstimate = isPlaying.value && Number.isFinite(durationMs) && durationMs > 0 && Number.isFinite(syncedAt)

  const pct = canEstimate
    ? raw + ((Math.max(0, nowTick.value - syncedAt) / durationMs) * 100)
    : raw

  return Math.max(0, Math.min(100, pct))
})

const progressPct = computed(() => (rawProgress.value === null ? 0 : Math.round(rawProgress.value)))
const showProgress = computed(() => rawProgress.value !== null && props.state.mode !== 'stopped')
const ringOffset = computed(() => RING_LENGTH * (1 - (showProgress.value ? progressPct.value : 0) / 100))

function fmtClock (ms) {
  const total = Math.max(0, Math.round(Number(ms) / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const durationLabel = computed(() => {
  const durationMs = Number(props.state?.durationMs)
  return Number.isFinite(durationMs) && durationMs > 0 ? fmtClock(durationMs) : ''
})

const elapsedLabel = computed(() => {
  const durationMs = Number(props.state?.durationMs)
  if (!Number.isFinite(durationMs) || durationMs <= 0 || rawProgress.value === null) return '0:00'
  return fmtClock((rawProgress.value / 100) * durationMs)
})

// El temporizador sólo corre mientras hay reproducción visible: en pausa o con
// la app en segundo plano no hay nada que extrapolar.
function startTicker () {
  if (tickTimer) return
  tickTimer = setInterval(() => { nowTick.value = Date.now() }, 1000)
}

function stopTicker () {
  if (!tickTimer) return
  clearInterval(tickTimer)
  tickTimer = null
}

function syncTicker () {
  const shouldRun = isPlaying.value &&
    (typeof document === 'undefined' || document.visibilityState === 'visible')
  if (shouldRun) startTicker()
  else stopTicker()
}

watch(() => props.state?.mode, syncTicker)

onMounted(() => {
  syncTicker()
  document.addEventListener('visibilitychange', syncTicker)
})

onBeforeUnmount(() => {
  stopTicker()
  document.removeEventListener('visibilitychange', syncTicker)
})
</script>

<style scoped>
.sk-eq-bar {
  width: 4px;
  min-height: 6px;
  border-radius: 3px;
  background: #1ed760;
  transform-origin: center center;
  animation: sk-eq-bounce 1s ease-in-out infinite;
}

@keyframes sk-eq-bounce {
  0%, 100% { transform: scaleY(0.35); opacity: 0.65; }
  50% { transform: scaleY(1); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .sk-eq-bar { animation: none; }
}
</style>
