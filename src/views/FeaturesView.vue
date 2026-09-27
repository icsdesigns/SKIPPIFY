<template>
  <!-- Cada función va en su propio panel plegable (FeaturePanel). Para añadir
       una función nueva basta con otro <FeaturePanel> en esta lista. Sólo uno
       está desplegado a la vez: abrir otro pliega el anterior. -->
  <div class="sk-stagger space-y-3">

    <!-- ══ 1 · Salto de duplicadas ═══════════════════════════════════════════ -->
    <FeaturePanel
      icon="🔁"
      icon-class="bg-brand-400/[0.18]"
      title="Salto de duplicadas"
      subtitle="Cuánto tiempo tiene que pasar para volver a oír la misma canción"
    >
      <template #estado>
        <span class="sk-chip sk-chip-accent">{{ resumenActivo }}</span>
      </template>

      <!-- ── Elección de familia: predefinidos o personalizado ─────────────── -->
      <div data-tour="listening-modes">
        <p class="sk-eyebrow">Modo de escucha</p>
        <!-- Los tres modos, siempre a la vista: son los mismos que ofrece la
             notificación persistente, así que la rejilla no cambia de forma. -->
        <!-- Tres columnas sólo a partir de lg: entre 640 y 1024 px la barra
             lateral se lleva 264 px y cada tarjeta se quedaba en 98 px de texto
             útil, menos de los 112 px que mide «Descubrimiento». -->
        <div class="mt-4 grid gap-2.5 lg:grid-cols-3">
          <button
            v-for="modo in modos"
            :key="modo.id"
            type="button"
            class="relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-200"
            :class="features.listeningMode === modo.id
              ? 'sk-option-active'
              : 'sk-option'"
            :aria-expanded="modo.id === 'custom' ? panelPersonalizado : undefined"
            @click="elegirModo(modo)"
          >
            <div
              v-if="features.listeningMode === modo.id"
              class="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-400/[0.10] to-transparent"
            />
            <!-- Icono y marcador arriba, título debajo a todo el ancho. En una
                 sola fila los tres, «Descubrimiento» se quedaba en 26 px útiles
                 con la rejilla de tres columnas y salía recortado; así el título
                 siempre dispone del ancho entero de la tarjeta. -->
            <div class="relative flex items-center gap-2.5">
              <span
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base transition-colors"
                :class="features.listeningMode === modo.id ? 'bg-brand-400/25' : 'bg-white/[0.08]'"
              >{{ modo.icon }}</span>
              <span
                v-if="modo.id === 'custom'"
                class="ml-auto shrink-0 text-[13px] text-slate-400 transition-transform"
                :class="panelPersonalizado ? 'rotate-90' : ''"
              >›</span>
              <span
                v-else
                class="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors"
                :class="features.listeningMode === modo.id ? 'border-brand-400/60 text-brand-400' : 'border-white/15'"
                aria-hidden="true"
              >
                <span v-if="features.listeningMode === modo.id" class="h-1.5 w-1.5 rounded-full bg-current" />
              </span>
            </div>

            <p class="relative mt-2.5 text-sm font-bold leading-tight text-white">{{ modo.title }}</p>
            <p class="relative mt-1.5 text-[11px] leading-relaxed text-slate-400">{{ modo.description }}</p>
            <p class="relative mt-1.5 text-[11px] leading-relaxed text-slate-500">{{ modo.detail }}</p>
          </button>
        </div>

        <!-- Panel del modo personalizado: se abre al pulsarlo y se cierra al
             elegir una frecuencia. -->
        <Transition name="desplegar">
          <div v-if="panelPersonalizado" class="mt-4 border-t border-white/[0.07] pt-4">
            <p class="sk-eyebrow">No repetir una canción hasta pasados</p>
            <div class="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <button
                v-for="opt in intervalOptions"
                :key="opt.value"
                type="button"
                class="rounded-xl border px-3 py-2.5 text-center text-xs font-semibold transition-all duration-200"
                :class="features.skipDuplicatesInterval === opt.value && features.listeningMode === 'custom'
                  ? 'sk-option-active'
                  : 'sk-option text-slate-200'"
                @click="elegirIntervalo(opt.value)"
              >{{ opt.label }}</button>
            </div>
            <p class="mt-2.5 text-[11px] leading-relaxed text-slate-500">
              Se guarda como tu configuración propia: al elegir «Personalizado» desde la
              notificación persistente se recupera exactamente esto.
            </p>
          </div>
        </Transition>
      </div>

      <!-- ── Calibración del salto ────────────────────────────────────────── -->
      <div data-tour="calibration-cta" class="mt-5 border-t border-white/[0.07] pt-5">
        <div class="flex flex-wrap items-center gap-3">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-400/[0.18] text-lg">🩺</span>
          <div class="min-w-0 flex-1">
            <h3 class="sk-title">Calibración del salto</h3>
            <p class="mt-0.5 text-[11px] leading-relaxed text-slate-400">
              ¿Se salta canciones que no toca, o deja pasar duplicadas? El asistente monta una
              prueba controlada, identifica el síntoma y ajusta el motor contigo.
            </p>
          </div>
          <button class="sk-btn sk-btn-primary sk-btn-sm shrink-0" @click="abrirCalibracion">
            Calibrar
          </button>
        </div>
      </div>
    </FeaturePanel>

    <!-- ══ 2 · Silenciamiento de anuncios ════════════════════════════════════ -->
    <FeaturePanel
      icon="🔇"
      icon-class="bg-amber-400/[0.18]"
      title="Silenciamiento de anuncios"
      subtitle="Solo tiene efecto en cuentas gratuitas de Spotify"
    >
      <template #estado>
        <span class="sk-chip" :class="features.silenceAds ? 'sk-chip-accent' : ''">
          {{ features.silenceAds ? 'Activado' : 'Desactivado' }}
        </span>
      </template>

      <div class="flex items-start gap-4">
        <span
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl transition-colors"
          :class="features.silenceAds ? 'bg-brand-400/25' : 'bg-white/[0.08]'"
        >🚫</span>

        <div class="min-w-0 flex-1">
          <h3 class="sk-title">Silenciar anuncios</h3>
          <p class="sk-subtitle">
            Cuando la notificación de Spotify contiene alguna palabra clave, Skippify baja
            el volumen multimedia mientras dura el anuncio y lo restaura al terminar.
          </p>
          <p class="mt-1 text-[11px] text-slate-500">Experimental · Requiere acceso a notificaciones</p>
        </div>

        <button
          role="switch"
          :aria-checked="features.silenceAds"
          aria-label="Silenciar anuncios"
          class="sk-switch mt-1"
          :class="features.silenceAds ? 'border-transparent bg-brand-400' : 'border-transparent bg-white/[0.18]'"
          @click="features.silenceAds = !features.silenceAds"
        >
          <span class="sk-switch-knob" :class="features.silenceAds ? 'translate-x-6' : 'translate-x-1'" />
        </button>
      </div>

      <Transition name="desplegar">
        <div v-if="features.silenceAds" class="mt-4 border-t border-white/[0.07] pt-4">
          <p class="sk-eyebrow">Palabras clave detectadas</p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <span v-for="kw in features.silenceAdsKeywords" :key="kw" class="sk-chip">
              {{ kw }}
              <button
                v-if="!requiredKeywords.includes(kw)"
                class="text-slate-500 transition-colors hover:text-rose-200"
                aria-label="Quitar palabra"
                @click="removeKeyword(kw)"
              >×</button>
            </span>
          </div>

          <div class="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              v-model="newKeyword"
              type="text"
              placeholder="Añadir palabra personalizada"
              class="sk-input flex-1"
              @keydown.enter.prevent="addKeyword"
            >
            <button class="sk-btn sk-btn-primary sk-btn-sm" @click="addKeyword">Añadir</button>
          </div>
          <p class="mt-2 text-[11px] text-slate-500">Las palabras por defecto no se pueden eliminar.</p>
        </div>
      </Transition>
    </FeaturePanel>

    <!-- ══ 3 · Temporizador ══════════════════════════════════════════════════ -->
    <FeaturePanel
      icon="🌙"
      icon-class="bg-sky-400/[0.18]"
      title="Temporizador"
      subtitle="Pausa la música al acabar la canción cuando se agote el tiempo"
    >
      <template #estado>
        <span class="sk-chip" :class="temporizador.activo.value ? 'sk-chip-accent' : ''">{{ resumenTemporizador }}</span>
      </template>

      <SleepTimerSettings />
    </FeaturePanel>

  </div>
</template>

<script setup>
/**
 * Funciones — las automatizaciones de Skippify en una sola pantalla.
 *
 * El salto de duplicadas se elige entre tres modos, los mismos que ofrece la
 * notificación persistente: Descubrimiento, Casual y Personalizado. Los dos
 * primeros se aplican al pulsarlos; Personalizado abre un panel con las
 * frecuencias y se cierra al elegir una, para que la tarjeta sólo crezca
 * mientras hace falta.
 */
import { computed, provide, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useFeatures } from '@/composables/useFeatures'
import FeaturePanel from '@/components/FeaturePanel.vue'
import SleepTimerSettings from '@/components/SleepTimerSettings.vue'
import { useSleepTimer, formatoCuenta } from '@/composables/useSleepTimer'

const router = useRouter()
const { state: features, setListeningMode } = useFeatures()

const temporizador = useSleepTimer()

// Acordeón: los paneles de esta vista comparten cuál está desplegado.
provide('grupoPaneles', ref(null))

/** Lo que enseña la cabecera del temporizador con el panel plegado. */
const resumenTemporizador = computed(() => {
  const { state } = temporizador
  if (state.phase === 'counting') return formatoCuenta(temporizador.restanteMs.value)
  if (state.phase === 'waiting') return 'Última canción'
  if (state.phase === 'finishing') return 'Terminando'
  return 'Desactivado'
})

const newKeyword = ref('')
const requiredKeywords = ['publicidad', 'anuncio', 'anuncios']

const modos = [
  {
    id: 'discovery',
    icon: '🧭',
    title: 'Descubrimiento',
    description: 'Prioriza canciones fuera de tu repertorio habitual para fomentar una escucha más variada.',
    detail: 'Fija el salto de duplicadas en 1 año mientras esté activo.'
  },
  {
    id: 'casual',
    icon: '🎧',
    title: 'Casual',
    description: 'Escucha sin filtros: no se salta ninguna canción por haberla oído antes.',
    detail: 'Desactiva el salto de duplicadas mientras esté activo.'
  },
  {
    id: 'custom',
    icon: '🛠️',
    title: 'Personalizado',
    description: 'Tú decides cada cuánto se permite repetir una canción.',
    detail: 'Abre las frecuencias disponibles, de 1 semana a 6 meses.'
  }
]

/** Frecuencias del modo personalizado. */
const intervalOptions = [
  { value: '1w', label: '1 semana' },
  { value: '2w', label: '2 semanas' },
  { value: '1m', label: '1 mes' },
  { value: '3m', label: '3 meses' },
  { value: '6m', label: '6 meses' }
]

/** Abierto sólo mientras se elige la frecuencia del modo personalizado. */
const panelPersonalizado = ref(false)

const resumenActivo = computed(() => {
  if (features.listeningMode === 'discovery') return 'Descubrimiento'
  if (features.listeningMode === 'casual') return 'Casual'
  const opt = intervalOptions.find(o => o.value === features.skipDuplicatesInterval)
  return opt ? `Personalizado · ${opt.label}` : 'Personalizado'
})

/**
 * Descubrimiento y Casual se aplican al pulsarlos. Personalizado no: primero
 * hay que decir cada cuánto, así que sólo abre (o cierra) su panel.
 */
function elegirModo (modo) {
  if (modo.id === 'custom') {
    panelPersonalizado.value = !panelPersonalizado.value
    return
  }
  panelPersonalizado.value = false
  setListeningMode(modo.id)
}

function elegirIntervalo (value) {
  setListeningMode('custom')
  // En personalizado el salto siempre está activo: quien no quiera saltar nada
  // tiene el modo Casual, así que un interruptor extra aquí sólo confundiría.
  features.skipDuplicates = true
  features.skipDuplicatesInterval = value
  panelPersonalizado.value = false
}

/**
 * La calibración vive fuera de la navegación: sólo se entra desde aquí.
 *
 * Se aterriza en la pantalla de elección —«Asistente de calibración» o «Ajuste
 * manual»— y no directamente en el asistente: quien ya sabe qué parámetro
 * quiere mover no tiene por qué pasar antes por una prueba guiada entera.
 */
function abrirCalibracion () {
  router.push({ path: '/calibration' })
}

function normalizeKeyword (value) {
  return (value || '').toString().trim().toLowerCase()
}

function addKeyword () {
  const kw = normalizeKeyword(newKeyword.value)
  if (!kw) return
  if (!Array.isArray(features.silenceAdsKeywords)) {
    features.silenceAdsKeywords = [...requiredKeywords]
  }
  if (!features.silenceAdsKeywords.includes(kw)) {
    features.silenceAdsKeywords.push(kw)
  }
  newKeyword.value = ''
}

function removeKeyword (kw) {
  if (requiredKeywords.includes(kw)) return
  features.silenceAdsKeywords = (features.silenceAdsKeywords || []).filter(item => item !== kw)
}
</script>

<style scoped>
.desplegar-enter-active, .desplegar-leave-active {
  transition: opacity 0.2s ease, max-height 0.25s ease;
  overflow: hidden;
  max-height: 420px;
}
.desplegar-enter-from, .desplegar-leave-to {
  opacity: 0;
  max-height: 0;
}
</style>
