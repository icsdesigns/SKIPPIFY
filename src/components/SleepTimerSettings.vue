<template>
  <div>
    <!-- ── Sin temporizador: elegir cuánto ───────────────────────────────── -->
    <div v-if="!activo">
      <p class="sk-eyebrow">Parar la música dentro de</p>
      <div class="sk-segment mt-3">
        <button
          v-for="min in PRESETS_MINUTOS"
          :key="min"
          type="button"
          class="sk-segment-item"
          :class="minutosElegidos === min ? 'sk-segment-item-active' : ''"
          @click="elegirPreset(min)"
        >{{ formatoDuracion(min) }}</button>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <label class="text-[11px] text-slate-400" for="temporizador-horas">O escribe hh:mm</label>
        <div class="flex items-center gap-1.5">
          <input
            id="temporizador-horas"
            v-model="horas"
            type="text"
            inputmode="numeric"
            maxlength="2"
            aria-label="Horas"
            placeholder="hh"
            class="sk-input w-14 text-center font-mono tabular-nums"
            @focus="$event.target.select()"
          >
          <span class="font-bold text-slate-400">:</span>
          <input
            v-model="minutos"
            type="text"
            inputmode="numeric"
            maxlength="2"
            aria-label="Minutos"
            placeholder="mm"
            class="sk-input w-14 text-center font-mono tabular-nums"
            @focus="$event.target.select()"
          >
        </div>
      </div>

      <p class="mt-3 min-h-[1.25rem] text-[11px] leading-relaxed" :class="duracionValida ? 'text-slate-400' : 'text-rose-200'">
        <template v-if="duracionValida">
          Se para hacia las <span class="font-semibold text-white">{{ horaPrevista }}</span>,
          al acabar la canción que esté sonando entonces.
        </template>
        <template v-else>Escribe una duración entre 00:01 y 23:59.</template>
      </p>

      <button
        type="button"
        class="sk-btn sk-btn-primary mt-3 w-full sm:w-auto"
        :disabled="!duracionValida"
        @click="empezar"
      >Iniciar temporizador</button>

      <p v-if="ultimoCierre" class="mt-3 text-[11px] text-slate-500">{{ ultimoCierre }}</p>
    </div>

    <!-- ── Temporizador en marcha ─────────────────────────────────────────── -->
    <div v-else class="text-center" aria-live="polite">
      <template v-if="timer.phase === 'counting'">
        <p class="font-mono text-5xl font-bold tabular-nums tracking-tight text-white">{{ formatoCuenta(restanteMs) }}</p>
        <p class="mt-2 text-xs text-slate-400">
          Hacia las <span class="font-semibold text-white">{{ horaDeReloj(timer.endAt) }}</span>,
          al acabar la canción
        </p>
      </template>
      <template v-else>
        <p class="flex items-center justify-center gap-2 text-base font-bold text-white">
          <span class="h-2 w-2 animate-pulse rounded-full bg-brand-400" aria-hidden="true" />
          {{ timer.phase === 'waiting' ? 'Esperando a que acabe la canción' : 'Terminando…' }}
        </p>
        <p class="mt-2 text-xs text-slate-400">
          {{ timer.phase === 'waiting'
            ? 'La música se pausará justo antes de que empiece la siguiente.'
            : 'Pausa hecha. Completando los pasos finales.' }}
        </p>
      </template>

      <div class="mt-4 flex flex-wrap justify-center gap-2">
        <button
          v-if="timer.phase === 'counting'"
          type="button"
          class="sk-btn sk-btn-ghost sk-btn-sm"
          @click="alargar(15)"
        >+15 min</button>
        <button
          v-if="timer.phase !== 'finishing'"
          type="button"
          class="sk-btn sk-btn-danger sk-btn-sm"
          @click="cancelar"
        >Cancelar</button>
      </div>
    </div>

    <!-- ── Qué pasa al terminar ──────────────────────────────────────────── -->
    <div class="mt-5 border-t border-white/[0.07] pt-5">
      <p class="sk-eyebrow">Al terminar</p>

      <ol class="mt-3 space-y-3">
        <li class="flex items-start gap-3">
          <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[10px] font-bold text-slate-300" aria-hidden="true">1</span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-white">Pausar al acabar la canción</p>
            <p class="mt-0.5 text-[11px] leading-relaxed text-slate-400">
              No corta a mitad: deja terminar la que suena cuando se agota el tiempo.
            </p>
          </div>
        </li>

        <li class="flex items-start gap-3">
          <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[10px] font-bold text-slate-300" aria-hidden="true">2</span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-white">Sonido de aviso</p>
            <p class="mt-0.5 text-[11px] leading-relaxed text-slate-400">
              Dos notas suaves al volumen de la música, justo después de la pausa.
              <button type="button" class="font-semibold text-brand-300 hover:text-brand-200" @click="probarSonido">Escuchar</button>
            </p>
          </div>
          <button
            role="switch"
            :aria-checked="timer.sound"
            aria-label="Sonido de aviso"
            class="sk-switch mt-0.5"
            :class="timer.sound ? 'border-transparent bg-brand-400' : 'border-transparent bg-white/[0.18]'"
            @click="setOpciones({ sound: !timer.sound })"
          >
            <span class="sk-switch-knob" :class="timer.sound ? 'translate-x-6' : 'translate-x-1'" />
          </button>
        </li>
      </ol>
    </div>
  </div>
</template>

<script setup>
/**
 * Contenido del panel «Temporizador» de Funciones.
 *
 * La duración se elige con un preset o escribiéndola en hh:mm; mientras corre
 * se ve la cuenta atrás y la hora aproximada de parada. El sonido de aviso se
 * puede activar o quitar en cualquier momento, también con el temporizador
 * en marcha.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  useSleepTimer,
  PRESETS_MINUTOS,
  duracionMs,
  formatoCuenta,
  formatoDuracion,
  horaDeReloj
} from '@/composables/useSleepTimer'

const {
  state: timer,
  restanteMs,
  activo,
  init,
  refrescar,
  iniciar,
  alargar,
  cancelar,
  setOpciones,
  probarSonido
} = useSleepTimer()

const dos = n => String(n).padStart(2, '0')
const horas = ref(dos(Math.floor(timer.ultimaDuracion / 60)))
const minutos = ref(dos(timer.ultimaDuracion % 60))

const msElegidos = computed(() => duracionMs(horas.value, minutos.value))
const minutosElegidos = computed(() => msElegidos.value / 60_000)
const duracionValida = computed(() => msElegidos.value > 0)
const horaPrevista = computed(() => horaDeReloj(timer.now + msElegidos.value))

function elegirPreset (min) {
  horas.value = dos(Math.floor(min / 60))
  minutos.value = dos(min % 60)
}

function empezar () {
  if (!duracionValida.value) return
  iniciar(minutosElegidos.value)
}

// ── Último cierre ────────────────────────────────────────────────────────────

const ultimoCierre = computed(() => {
  const at = timer.lastFinishedAt
  if (!at || timer.now - at > 12 * 3600_000) return ''
  const partes = timer.lastResult.split(',')
  const hechos = [partes.includes('paused') ? 'música pausada' : 'no sonaba nada']
  return `Último temporizador: terminó a las ${horaDeReloj(at)} · ${hechos.join(' · ')}.`
})

// ── Reloj ────────────────────────────────────────────────────────────────────

let reloj = null
let latidos = 0

onMounted(() => {
  init()
  timer.now = Date.now()
  reloj = setInterval(() => {
    timer.now = Date.now()
    // El estado nativo se relee cada pocos segundos por si el temporizador
    // terminó mientras la pantalla estaba abierta y se perdió el aviso.
    if (++latidos % 4 === 0) refrescar()
  }, 1000)
})

onBeforeUnmount(() => clearInterval(reloj))
</script>

