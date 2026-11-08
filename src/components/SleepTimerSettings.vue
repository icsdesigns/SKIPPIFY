<template>
  <div>
    <!-- ── Sin temporizador: elegir cuánto ───────────────────────────────── -->
    <div v-if="!activo">
      <p class="sk-eyebrow">Parar la música dentro de</p>
      <!-- Los presets son opciones elegibles como las frecuencias del salto de
           duplicadas: mismo botón, misma activa. -->
      <div class="mt-3 grid grid-cols-3 gap-2 lg:grid-cols-5">
        <button
          v-for="min in PRESETS_MINUTOS"
          :key="min"
          type="button"
          class="rounded-xl border px-1.5 py-2.5 text-center text-xs font-semibold transition-all duration-200"
          :class="minutosElegidos === min ? 'sk-option-active' : 'sk-option text-slate-200'"
          @click="elegirPreset(min)"
        >{{ formatoDuracion(min) }}</button>
      </div>

      <div class="mt-4">
        <label class="sk-eyebrow" for="temporizador-horas">O a medida (hh:mm)</label>
        <div class="mt-2 flex items-center gap-1.5">
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

      <!-- Hora prevista: la misma tarjeta de opción que el estado en marcha. -->
      <OpcionFila
        class="mt-4"
        plana
        color-tesela
        :tono="duracionValida ? 'sky' : 'rose'"
        :titulo="duracionValida ? `Se parará hacia las ${horaPrevista}` : 'Duración no válida'"
        :detalle="duracionValida
          ? 'Al acabar la canción que esté sonando entonces.'
          : 'Escribe una duración entre 00:01 y 23:59.'"
      >
        <template #icono><AjusteIcon name="reloj" class="h-8 w-8" /></template>
      </OpcionFila>

      <button
        type="button"
        class="sk-btn sk-btn-primary mt-4 w-full sm:w-auto"
        :disabled="!duracionValida"
        @click="empezar"
      >Iniciar temporizador</button>

      <p v-if="ultimoCierre" class="mt-3 text-[11px] leading-relaxed text-slate-500">{{ ultimoCierre }}</p>
    </div>

    <!-- ── Temporizador en marcha ─────────────────────────────────────────── -->
    <div v-else>
      <p class="sk-eyebrow">Temporizador en marcha</p>
      <SleepTimerEstado class="mt-3" />
    </div>

    <!-- ── Qué pasa al terminar ──────────────────────────────────────────── -->
    <div class="mt-5 border-t border-white/[0.07] pt-5">
      <p class="sk-eyebrow">Al terminar</p>

      <div class="mt-3 grid gap-2">
        <OpcionFila
          plana
          tono="sky"
          titulo="Pausar al acabar la canción"
          detalle="No corta a mitad: deja acabar la canción que suena."
        >
          <template #icono><AjusteIcon name="pausa" class="h-8 w-8 text-sky-200" /></template>
        </OpcionFila>

        <OpcionFila
          plana
          tono="brand"
          :activo="timer.sound"
          titulo="Sonido de aviso"
          detalle="Dos notas suaves tras la pausa."
        >
          <template #icono><AjusteIcon name="campana" class="h-8 w-8" /></template>
          <template #fin>
            <button
              role="switch"
              :aria-checked="timer.sound"
              aria-label="Sonido de aviso"
              class="sk-switch shrink-0"
              :class="timer.sound ? 'border-transparent bg-brand-400' : 'border-transparent bg-white/[0.18]'"
              @click="setOpciones({ sound: !timer.sound })"
            >
              <span class="sk-switch-knob" :class="timer.sound ? 'translate-x-6' : 'translate-x-1'" />
            </button>
          </template>
        </OpcionFila>

        <button type="button" class="sk-btn sk-btn-ghost sk-btn-sm justify-self-start" @click="probarSonido">
          <AjusteIcon name="play" class="h-4 w-4" />
          Escuchar el aviso
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * Contenido del panel «Temporizador» de Funciones.
 *
 * Todo el panel habla el mismo idioma que el resto de la pestaña: opciones
 * elegibles (presets), tarjetas de opción para la hora prevista y el estado,
 * y los botones de la app. La duración se elige con un preset o escribiéndola
 * en hh:mm; mientras corre se ve la cuenta atrás y la hora aproximada de
 * parada. El sonido de aviso se puede activar o quitar en cualquier momento,
 * también con el temporizador en marcha.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AjusteIcon from '@/components/AjusteIcon.vue'
import OpcionFila from '@/components/OpcionFila.vue'
import SleepTimerEstado from '@/components/SleepTimerEstado.vue'
import {
  useSleepTimer,
  PRESETS_MINUTOS,
  duracionMs,
  formatoDuracion,
  horaDeReloj
} from '@/composables/useSleepTimer'

const {
  state: timer,
  activo,
  init,
  refrescar,
  iniciar,
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
