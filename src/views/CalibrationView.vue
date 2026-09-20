<template>
  <div class="sk-stagger space-y-5">
    <!-- Sin motor nativo no hay nada que calibrar -->
    <div v-if="!available" class="sk-card p-5">
      <p class="text-sm font-bold text-amber-200">El motor sólo existe en la app de Android</p>
      <p class="mt-1 text-xs text-amber-200/70">
        En el navegador no hay MediaSession al que engancharse, así que esta pantalla
        no tiene nada que medir ni que ajustar.
      </p>
    </div>

    <template v-else>
      <!-- ── Elección de vía ───────────────────────────────────────────────── -->
      <section v-if="!mode" class="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          class="sk-card sk-card-hover group p-5 text-left"
          @click="mode = 'wizard'"
        >
          <span class="flex h-11 w-11 items-center justify-center rounded-full bg-violet-400/[0.18] text-xl">🩺</span>
          <h2 class="sk-title mt-3.5">Asistente de calibración</h2>
          <p class="sk-subtitle">
            Guiado paso a paso: guardas tu configuración, preparas una playlist de prueba, eliges
            el síntoma (o los dos síntomas) que sufres y el asistente propone, aplica y verifica
            el ajuste hasta resolverlo.
          </p>
          <span class="sk-chip sk-chip-accent mt-4">Recomendado si algo va mal</span>
        </button>

        <button
          type="button"
          class="sk-card sk-card-hover group p-5 text-left"
          @click="mode = 'manual'"
        >
          <span class="flex h-11 w-11 items-center justify-center rounded-full bg-brand-400/[0.18] text-xl">🎛️</span>
          <h2 class="sk-title mt-3.5">Ajuste manual</h2>
          <p class="sk-subtitle">
            Control directo de cada parámetro del motor, con la explicación de qué implica subirlo
            o bajarlo, los interruptores, los puntos de restauración y el registro de decisiones.
          </p>
          <span class="sk-chip mt-4">Para afinar con criterio</span>
        </button>
      </section>

      <!-- ── Asistente ─────────────────────────────────────────────────────── -->
      <CalibrationWizard v-else-if="mode === 'wizard'" @close="mode = null" />

      <!-- ── Ajuste manual ─────────────────────────────────────────────────── -->
      <template v-else>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="sk-title">Ajuste manual del motor</h2>
          <button class="sk-btn sk-btn-ghost sk-btn-sm" @click="mode = null">Volver</button>
        </div>

        <!-- Protocolo de prueba -->
        <section class="sk-card p-5">
          <div class="flex items-start gap-3">
            <span class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-400/[0.18] text-base">🧪</span>
            <div class="min-w-0">
              <h3 class="text-sm font-bold text-white">Cómo probar cada cambio</h3>
              <p class="mt-1.5 text-sm leading-relaxed text-slate-300">
                Pon en cola <strong class="text-sky-200">al menos 10 canciones ya escuchadas</strong>
                dentro del periodo configurado para saltar ({{ intervalLabel }}) y reprodúcelas
                enteras cada vez que toques un ajuste. Sin ese lote fijo no hay forma de saber si
                una mejora es real o casualidad.
              </p>
              <p class="mt-2 text-xs leading-relaxed text-slate-400">
                Guarda un punto de restauración antes de empezar. Si prefieres no hacerlo a mano,
                <button class="font-semibold text-sky-300 underline underline-offset-2" @click="mode = 'wizard'">usa el asistente</button>.
              </p>
            </div>
          </div>
        </section>

        <!-- ── Parámetros: una tarjeta por ajuste ──────────────────────────── -->
        <section class="space-y-3">
          <header class="flex flex-wrap items-center gap-2">
            <span class="flex h-8 w-8 items-center justify-center rounded-full bg-brand-400/[0.18] text-sm">🎛️</span>
            <h3 class="sk-title">Parámetros del motor</h3>
            <button class="sk-btn sk-btn-ghost sk-btn-sm ml-auto" :disabled="busy" @click="resetConfig">
              Valores por defecto
            </button>
          </header>

          <article v-for="param in params" :key="param.key" class="sk-card p-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <h4 class="text-base font-bold text-white">{{ param.label }}</h4>
                <p class="mt-1 text-xs leading-relaxed text-slate-400">{{ param.summary }}</p>
              </div>
              <p class="shrink-0 text-right">
                <span class="font-mono text-2xl font-extrabold leading-none tracking-tightest text-brand-400">{{ config[param.key] }}</span>
                <span class="ml-1 text-xs text-slate-500">{{ param.unit }}</span>
              </p>
            </div>

            <div class="mt-4 flex items-center gap-3">
              <button
                type="button"
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-2xl font-semibold leading-none text-slate-300 transition-colors hover:bg-amber-400/20 hover:text-amber-200 disabled:opacity-40"
                :disabled="busy || config[param.key] <= param.min"
                :aria-label="`Bajar ${stepOf(param)} ${param.unit}`"
                @click="nudge(param, -1)"
              >−</button>

              <input
                type="range"
                :min="param.min"
                :max="param.max"
                :step="param.step"
                :value="config[param.key]"
                class="sk-range h-1.5 w-full"
                :disabled="busy"
                :aria-label="param.label"
                @change="apply({ [param.key]: Number($event.target.value) })"
              >

              <button
                type="button"
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-2xl font-semibold leading-none text-slate-300 transition-colors hover:bg-brand-400/20 hover:text-brand-400 disabled:opacity-40"
                :disabled="busy || config[param.key] >= param.max"
                :aria-label="`Subir ${stepOf(param)} ${param.unit}`"
                @click="nudge(param, 1)"
              >+</button>
            </div>

            <div class="mt-1.5 flex justify-between font-mono text-[10px] text-slate-500">
              <span>{{ param.min }}</span>
              <span>paso de {{ stepOf(param) }} {{ param.unit }}</span>
              <span>{{ param.max }}</span>
            </div>

            <!-- El detalle largo, sólo si se pide: era lo que saturaba la pantalla -->
            <button
              type="button"
              class="mt-3 flex w-full items-center gap-2 rounded-md bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.05]"
              :aria-expanded="openParam === param.key"
              @click="toggleParam(param.key)"
            >
              <svg
                class="h-3.5 w-3.5 text-slate-500 transition-transform duration-200"
                :class="openParam === param.key ? 'rotate-180' : ''"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
              ><polyline points="6 9 12 15 18 9" /></svg>
              ¿Qué pasa si lo subo o lo bajo?
            </button>

            <Transition name="detail">
              <div v-if="openParam === param.key" class="mt-2 space-y-2">
                <p class="rounded-md bg-brand-400/[0.12] px-3 py-2.5 text-xs leading-relaxed text-brand-100">
                  <span class="font-bold text-brand-400">Subirlo (+{{ stepOf(param) }} {{ param.unit }}) · </span>{{ param.up }}
                </p>
                <p class="rounded-md bg-amber-400/[0.12] px-3 py-2.5 text-xs leading-relaxed text-amber-100">
                  <span class="font-bold text-amber-300">Bajarlo (−{{ stepOf(param) }} {{ param.unit }}) · </span>{{ param.down }}
                </p>
              </div>
            </Transition>
          </article>
        </section>

        <!-- ── Interruptores ───────────────────────────────────────────────── -->
        <section class="sk-card p-5">
          <header class="flex flex-wrap items-center gap-2">
            <span class="flex h-8 w-8 items-center justify-center rounded-full bg-brand-400/[0.18] text-sm">🔀</span>
            <h3 class="sk-title">Comportamiento</h3>
          </header>

          <div class="mt-4 space-y-2.5">
            <label
              v-for="toggle in toggles"
              :key="toggle.key"
              class="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors"
              :class="config[toggle.key]
                ? 'sk-option-active'
                : 'sk-option'"
            >
              <input
                type="checkbox"
                class="mt-1 h-4 w-4 shrink-0 accent-brand-400"
                :checked="config[toggle.key]"
                :disabled="busy"
                @change="apply({ [toggle.key]: $event.target.checked })"
              >
              <span class="min-w-0">
                <span class="flex flex-wrap items-center gap-2">
                  <span class="text-sm font-bold text-white">{{ toggle.label }}</span>
                  <span
                    v-if="toggle.legacy"
                    class="rounded-full bg-amber-400/[0.18] px-2 py-0.5 text-[10px] font-bold uppercase text-amber-200"
                  >heredado</span>
                  <span
                    v-else-if="toggle.recommended"
                    class="rounded-full bg-brand-400/[0.18] px-2 py-0.5 text-[10px] font-bold uppercase text-brand-200"
                  >recomendado</span>
                </span>
                <span class="mt-1 block text-xs leading-relaxed text-slate-400">{{ toggle.summary }}</span>
              </span>
            </label>
          </div>
        </section>

        <!-- ── Puntos de restauración ──────────────────────────────────────── -->
        <section class="sk-card p-5">
          <header class="flex flex-wrap items-center gap-2">
            <span class="flex h-8 w-8 items-center justify-center rounded-full bg-sky-400/[0.18] text-sm">💾</span>
            <h3 class="sk-title">Puntos de restauración</h3>
            <span class="ml-auto text-[11px] text-slate-500">{{ checkpoints.length }} / 8 guardados</span>
          </header>
          <p class="sk-subtitle">
            Guarda la configuración que tengas ahora para poder volver a ella si los siguientes
            ajustes empeoran el resultado.
          </p>

          <div class="mt-3.5 flex flex-wrap gap-2">
            <input
              v-model="checkpointName"
              type="text"
              maxlength="40"
              placeholder="Nombre (p. ej. «base estable»)"
              class="sk-input min-w-0 flex-1"
              @keyup.enter="onSaveCheckpoint"
            >
            <button class="sk-btn sk-btn-ghost sk-btn-sm" @click="onSaveCheckpoint">Guardar actual</button>
          </div>

          <p v-if="!checkpoints.length" class="mt-3.5 text-xs text-slate-500">
            Todavía no hay ninguno guardado.
          </p>

          <ul v-else class="mt-3.5 space-y-2">
            <li
              v-for="point in checkpoints"
              :key="point.id"
              class="flex flex-wrap items-center gap-2 rounded-card bg-white/[0.04] p-3"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-bold text-white">{{ point.name }}</p>
                <p class="mt-0.5 font-mono text-[10px] text-slate-500">{{ formatCheckpoint(point) }}</p>
              </div>
              <button class="sk-btn sk-btn-ghost sk-btn-sm" :disabled="busy" @click="onRestoreCheckpoint(point)">Restaurar</button>
              <button class="sk-btn sk-btn-danger sk-btn-sm" @click="deleteCheckpoint(point.id)">Borrar</button>
            </li>
          </ul>

          <p v-if="checkpointMessage" class="mt-3 text-[11px] font-semibold text-brand-400">{{ checkpointMessage }}</p>
        </section>

        <!-- ── Reproducción en curso ───────────────────────────────────────── -->
        <section v-if="session.key" class="sk-card p-5">
          <h3 class="sk-title">Reproducción en curso</h3>
          <p class="mt-2 truncate text-base font-bold text-white">{{ session.track || '—' }}</p>
          <p class="truncate text-sm text-slate-400">{{ session.artist || '—' }}</p>

          <div class="mt-3 flex flex-wrap gap-2">
            <span class="sk-chip">decisión: {{ session.decided ? 'cerrada' : 'pendiente' }}</span>
            <span class="sk-chip">registrada: {{ session.committed ? 'sí' : 'todavía no' }}</span>
            <span v-if="session.muted" class="sk-chip bg-amber-400/[0.18] text-amber-200">
              🔇 silenciada mientras decide
            </span>
            <span class="sk-chip">
              sonando {{ fmtMs(session.playedMs) }} / {{ fmtMs(session.requiredMs) }} para contar
            </span>
          </div>
        </section>

        <!-- ── Registro compacto ───────────────────────────────────────────── -->
        <section class="sk-card p-4">
          <header class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-bold text-white">
              Últimas decisiones <span class="text-slate-500">({{ log.length }})</span>
            </h3>
            <div class="flex items-center gap-2">
              <label class="flex items-center gap-1.5 text-[11px] text-slate-400">
                <input type="checkbox" v-model="autoRefresh" class="accent-brand-400">
                Auto
              </label>
              <button class="sk-btn sk-btn-ghost sk-btn-sm" @click="refresh">Actualizar</button>
              <button class="sk-btn sk-btn-ghost sk-btn-sm" @click="clearLog">Vaciar</button>
            </div>
          </header>

          <p v-if="!log.length" class="mt-3 text-xs text-slate-500">
            Sin decisiones registradas todavía. Pon música en Spotify y vuelve aquí.
          </p>

          <!-- Lista densa con scroll propio: antes crecía sin fin y empujaba
               la zona de riesgo fuera de la pantalla. -->
          <ul v-else class="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1">
            <li
              v-for="(entry, i) in log"
              :key="i"
              class="rounded-md bg-black/30 px-2.5 py-1.5"
            >
              <button
                type="button"
                class="flex w-full items-center gap-2 text-left"
                :aria-expanded="openEntry === i"
                @click="toggleEntry(i)"
              >
                <span class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase" :class="actionClass(entry.action)">
                  {{ entry.action }}
                </span>
                <span class="min-w-0 flex-1 truncate text-[11px] text-slate-300">
                  {{ entry.track || reasonLabel(entry.reason) }}
                </span>
                <span class="shrink-0 font-mono text-[10px] text-slate-500">{{ fmtTime(entry.at) }}</span>
              </button>

              <Transition name="detail">
                <div v-if="openEntry === i" class="mt-1.5 border-t border-white/[0.07] pt-1.5">
                  <p v-if="entry.track" class="truncate text-[11px] text-slate-400">
                    {{ entry.artist || '—' }}
                  </p>
                  <p class="text-[11px] text-slate-400">{{ reasonLabel(entry.reason) }}</p>
                  <div class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-slate-500">
                    <span>fuente={{ entry.source }}</span>
                    <span v-if="entry.positionMs >= 0">pos={{ entry.positionMs }}ms</span>
                    <span v-if="entry.sessionAgeMs != null">edad={{ entry.sessionAgeMs }}ms</span>
                    <span v-if="entry.lookupUs">consulta={{ entry.lookupUs }}µs</span>
                  </div>
                </div>
              </Transition>
            </li>
          </ul>
        </section>

        <!-- ── Zona destructiva ────────────────────────────────────────────── -->
        <section class="sk-card border-l-4 border-rose-500 p-5">
          <h3 class="text-sm font-semibold text-rose-200">Zona de riesgo</h3>
          <p class="mt-1 text-[11px] text-slate-500">
            Borra el historial que el motor usa para decidir si una canción es duplicada.
            No afecta a tus estadísticas, pero durante un tiempo no se saltará nada.
          </p>
          <button class="sk-btn sk-btn-danger sk-btn-sm mt-3" :disabled="busy" @click="onResetHistory">
            {{ confirmReset ? '¿Seguro? Pulsa otra vez' : 'Borrar historial de duplicadas' }}
          </button>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import CalibrationWizard from '@/components/CalibrationWizard.vue'
import {
  useCalibration,
  CALIBRATION_PARAMS,
  CALIBRATION_TOGGLES,
  stepFor
} from '@/composables/useCalibration'

const REASONS = {
  duplicada: 'ya sonaba en la ventana → saltada',
  no_duplicada: 'sin escucha previa en la ventana',
  fuera_de_ventana: 'la canción ya iba muy avanzada',
  sin_posicion: 'el MediaSession no dio posición fiable',
  estabilizando: 'esperando a que asienten los metadatos',
  indice_cargando: 'el índice aún se estaba cargando',
  funcion_desactivada: 'saltar duplicadas está desactivado',
  sin_metadatos: 'sin canción/artista utilizable',
  pista_cambiada: 'la pista viva ya no coincidía',
  esperando_decision: 'silenciada mientras se decide',
  cambio_de_pista: 'cambió la canción',
  tras_salto: 'tras completar el salto',
  salto_abortado: 'el salto se canceló',
  failsafe: 'venció el silencio de seguridad',
  premute_desactivado: 'silenciado desactivado por el usuario',
  detach: 'se perdió la conexión con Spotify',
  sin_transporte: 'sin acceso al reproductor'
}

const INTERVAL_LABELS = {
  '1h': 'última hora',
  '1d': 'último día',
  '1w': 'última semana',
  '2w': 'últimas 2 semanas',
  '1m': 'último mes',
  '3m': 'últimos 3 meses',
  '6m': 'últimos 6 meses',
  '1y': 'último año'
}

const {
  available, busy, config, session, log, checkpoints,
  refresh, apply, resetConfig, clearLog, resetHistory,
  saveCheckpoint, restoreCheckpoint, deleteCheckpoint
} = useCalibration()

const route = useRoute()

const params = CALIBRATION_PARAMS
const toggles = CALIBRATION_TOGGLES

/** `null` = pantalla de elección; el resto son las dos vías de calibración. */
const mode = ref(route.query.asistente === '1' ? 'wizard' : null)

const autoRefresh = ref(true)
const confirmReset = ref(false)
const checkpointName = ref('')
const checkpointMessage = ref('')
/** Detalle largo abierto: uno cada vez, para que la pantalla no crezca. */
const openParam = ref('')
const openEntry = ref(-1)
let timer = null
let messageTimer = null

const intervalLabel = computed(() => INTERVAL_LABELS[config.value.interval] || 'periodo configurado')

function stepOf (param) {
  return stepFor(param)
}

function toggleParam (key) {
  openParam.value = openParam.value === key ? '' : key
}

function toggleEntry (index) {
  openEntry.value = openEntry.value === index ? -1 : index
}

function nudge (param, direction) {
  const next = Number(config.value[param.key]) + direction * stepFor(param)
  apply({ [param.key]: Math.min(param.max, Math.max(param.min, next)) })
}

function onSaveCheckpoint () {
  const saved = saveCheckpoint(checkpointName.value)
  checkpointName.value = ''
  showMessage(`Guardado «${saved.name}».`)
}

async function onRestoreCheckpoint (point) {
  await restoreCheckpoint(point.id)
  showMessage(`Restaurada la configuración «${point.name}».`)
}

function showMessage (text) {
  checkpointMessage.value = text
  if (messageTimer) clearTimeout(messageTimer)
  messageTimer = setTimeout(() => { checkpointMessage.value = '' }, 5000)
}

async function onResetHistory () {
  // Doble pulsación: es irreversible y la pantalla se usa con música sonando.
  if (!confirmReset.value) {
    confirmReset.value = true
    setTimeout(() => { confirmReset.value = false }, 4000)
    return
  }
  confirmReset.value = false
  await resetHistory()
}

function formatCheckpoint (point) {
  const when = new Date(point.savedAt)
  const stamp = Number.isNaN(when.getTime()) ? '—' : when.toLocaleString('es-ES')
  const cfg = point.config || {}
  return `${stamp} · ventana ${cfg.decisionWindowMs ?? '—'}ms · espera ${cfg.minStableMs ?? '—'}ms`
}

function actionClass (action) {
  if (action === 'saltada') return 'bg-rose-500/[0.20] text-rose-200'
  if (action === 'salto_abortado') return 'bg-amber-400/[0.20] text-amber-200'
  if (action === 'silenciada') return 'bg-violet-400/[0.20] text-violet-200'
  if (action === 'pista_reiniciada') return 'bg-sky-400/[0.20] text-sky-200'
  if (action === 'sonido_restaurado') return 'bg-brand-400/[0.20] text-brand-200'
  return 'bg-white/[0.10] text-slate-300'
}

function reasonLabel (reason) {
  return REASONS[reason] || reason || '—'
}

function fmtMs (ms) {
  const n = Number(ms || 0)
  if (!Number.isFinite(n) || n <= 0) return '0s'
  return n < 1000 ? `${n}ms` : `${(n / 1000).toFixed(1)}s`
}

function fmtTime (epochMs) {
  const d = new Date(Number(epochMs || 0))
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('es-ES')
}

onMounted(() => {
  refresh()
  timer = setInterval(() => { if (autoRefresh.value) refresh() }, 2000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (messageTimer) clearTimeout(messageTimer)
})
</script>

<style scoped>
/* Despliegue de los detalles: corto, para que no parezca una recarga. */
.detail-enter-active,
.detail-leave-active {
  transition: opacity 0.16s ease, max-height 0.22s ease;
  overflow: hidden;
  max-height: 220px;
}
.detail-enter-from,
.detail-leave-to {
  opacity: 0;
  max-height: 0;
}
</style>
