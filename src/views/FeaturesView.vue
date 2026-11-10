<template>
  <div>
  <!-- Cada función va en su propio panel plegable (FeaturePanel). Para añadir
       una función nueva basta con otro <FeaturePanel> en esta lista. Sólo uno
       está desplegado a la vez: abrir otro pliega el anterior.

       Diseño: igual que Ajustes y Macros. Plegado, cada panel es sólo su
       cabecera (icono, nombre, resumen y estado); desplegado, enseña todas sus
       opciones. Nada se repite entre las dos vistas. Una sola columna a
       cualquier ancho: así, al abrir uno, los demás sólo bajan, sin saltar de
       columna ni dejar huecos. -->
  <!-- Guía interactiva: flotante; fuera de la lista para que su animación de
       entrada no se mezcle con la de los paneles. -->
  <GuiaInteractiva :guia="guiaFunciones" />

  <div class="sk-stagger space-y-3">

    <!-- ══ 1 · Salto de duplicadas ═══════════════════════════════════════════ -->
    <FeaturePanel
      panel-id="duplicadas"
      icon-class="bg-brand-400/[0.18]"
      title="Salto de duplicadas"
      subtitle="Cuánto tiempo tiene que pasar para volver a oír la misma canción"
    >
      <template #icono>
        <FeatureIcon name="salto" class="h-5 w-5 text-brand-400" />
      </template>
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
        <div class="mt-3 grid gap-2">
          <OpcionFila
            v-for="modo in modos"
            :key="modo.id"
            as="button"
            :titulo="modo.title"
            :detalle="`${modo.description} ${modo.detail}`"
            :activo="features.listeningMode === modo.id"
            :aria-expanded="modo.id === 'custom' ? panelPersonalizado : undefined"
            @click="elegirModo(modo)"
          >
            <template #icono><AjusteIcon :name="modo.icon" class="h-8 w-8" /></template>
            <template #fin>
              <MacroIcon
                v-if="modo.id === 'custom'"
                name="siguiente"
                class="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200"
                :class="panelPersonalizado ? 'rotate-90' : ''"
              />
              <span
                v-else
                class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors"
                :class="features.listeningMode === modo.id ? 'border-brand-400/60 text-brand-400' : 'border-white/15'"
                aria-hidden="true"
              >
                <span v-if="features.listeningMode === modo.id" class="h-1.5 w-1.5 rounded-full bg-current" />
              </span>
            </template>
          </OpcionFila>
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
        <OpcionFila
          as="button"
          class="w-full"
          tono="violet"
          titulo="Calibrar el salto"
          detalle="¿Salta lo que no toca o deja pasar duplicadas? Una prueba guiada lo ajusta."
          @click="abrirCalibracion"
        >
          <template #icono><AjusteIcon name="calibrar" class="h-8 w-8 text-violet-200" /></template>
          <template #fin>
            <MacroIcon name="siguiente" class="h-4 w-4 shrink-0 text-slate-400" />
          </template>
        </OpcionFila>
      </div>
    </FeaturePanel>

    <!-- ══ 2 · Silenciamiento de anuncios ════════════════════════════════════ -->
    <FeaturePanel
      panel-id="anuncios"
      icon-class="bg-amber-400/[0.18]"
      title="Silenciamiento de anuncios"
      subtitle="Experimental: solo tiene efecto en cuentas gratuitas de Spotify"
    >
      <template #icono>
        <FeatureIcon name="silencio" class="h-5 w-5 text-amber-300" />
      </template>
      <template #estado>
        <span class="sk-chip" :class="features.silenceAds ? 'sk-chip-accent' : ''">
          {{ features.silenceAds ? 'Activado' : 'Desactivado' }}
        </span>
      </template>

      <OpcionFila
        plana
        compacta
        tono="amber"
        :activo="features.silenceAds"
        titulo="Silenciar anuncios"
        detalle="Baja el volumen mientras dura un anuncio."
      >
        <template #icono><FeatureIcon name="silencio" class="h-6 w-6" /></template>
        <template #fin>
          <button
            role="switch"
            :aria-checked="features.silenceAds"
            aria-label="Silenciar anuncios"
            class="sk-switch shrink-0"
            :class="features.silenceAds ? 'border-transparent bg-brand-400' : 'border-transparent bg-white/[0.18]'"
            @click="features.silenceAds = !features.silenceAds"
          >
            <span class="sk-switch-knob" :class="features.silenceAds ? 'translate-x-6' : 'translate-x-1'" />
          </button>
        </template>
      </OpcionFila>

      <!-- Las palabras clave son configuración: se editan también con los
           anuncios apagados, para dejarlas listas antes de activarlos. -->
      <div class="mt-4 border-t border-white/[0.07] pt-4">
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
    </FeaturePanel>

    <!-- ══ 3 · Temporizador ══════════════════════════════════════════════════ -->
    <FeaturePanel
      panel-id="temporizador"
      icon-class="bg-sky-400/[0.18]"
      title="Temporizador"
      subtitle="Pausa la música al acabar la canción cuando se agote el tiempo"
    >
      <template #icono>
        <FeatureIcon name="luna" class="h-5 w-5 text-sky-300" />
      </template>
      <template #estado>
        <span class="sk-chip" :class="temporizador.activo.value ? 'sk-chip-accent' : ''">{{ resumenTemporizador }}</span>
      </template>

      <SleepTimerSettings />
    </FeaturePanel>

  </div>
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
import { computed, onMounted, provide, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useFeatures } from '@/composables/useFeatures'
import FeaturePanel from '@/components/FeaturePanel.vue'
import FeatureIcon from '@/components/FeatureIcon.vue'
import AjusteIcon from '@/components/AjusteIcon.vue'
import MacroIcon from '@/components/MacroIcon.vue'
import OpcionFila from '@/components/OpcionFila.vue'
import SleepTimerSettings from '@/components/SleepTimerSettings.vue'
import GuiaInteractiva from '@/components/GuiaInteractiva.vue'
import { guiaFunciones } from '@/guias'
import { useTour } from '@/composables/useTour'
import { useSleepTimer, formatoCuenta } from '@/composables/useSleepTimer'

const router = useRouter()
const { state: features, setListeningMode } = useFeatures()

const temporizador = useSleepTimer()

const tour = useTour()

onMounted(() => {
  // Primera visita a la pestaña: la guía se abre sola, una única vez. Si el
  // tour de la app está a la vista, espera: dos paneles a la vez no se leen.
  if (!tour.state.open) guiaFunciones.autoStart()
})

// Acordeón: los paneles de esta vista comparten cuál está desplegado.
const grupo = ref(null)
provide('grupoPaneles', grupo)

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
    icon: 'brujula',
    title: 'Descubrimiento',
    description: 'Prioriza canciones fuera de tu repertorio habitual.',
    detail: 'Fija el salto de duplicadas en 1 año.'
  },
  {
    id: 'casual',
    icon: 'casual',
    title: 'Casual',
    description: 'Sin filtros: no se salta nada por haberlo oído antes.',
    detail: 'Sin salto de duplicadas.'
  },
  {
    id: 'custom',
    icon: 'ajustes',
    title: 'Personalizado',
    description: 'Tú decides cada cuánto se permite repetir una canción.',
    detail: 'De 1 semana a 6 meses.'
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
