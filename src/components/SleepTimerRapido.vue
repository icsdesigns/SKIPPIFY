<template>
  <!-- Vista rápida del temporizador con el panel plegado: tres duraciones que
       arrancan al pulsarlas o, si ya corre, su estado con +15 min / Cancelar. -->
  <div class="flex flex-1 flex-col">
    <SleepTimerEstado v-if="activo" compacta />

    <template v-else>
      <p class="sk-eyebrow">Parar la música dentro de</p>
      <div class="mt-2 grid grid-cols-3 gap-2">
        <button
          v-for="min in RAPIDOS"
          :key="min"
          type="button"
          class="sk-option rounded-xl border px-1.5 py-2.5 text-center text-xs font-semibold text-slate-200 transition-all duration-200"
          @click="iniciar(min)"
        >{{ formatoDuracion(min) }}</button>
      </div>
      <p class="mt-2 text-[11px] leading-relaxed text-slate-500">
        Toca una duración para empezar ya. Se detiene al acabar la canción que esté sonando.
      </p>
    </template>

    <p class="sk-eyebrow mt-4">Al terminar</p>
    <OpcionFila
      class="mt-2"
      plana
      compacta
      tono="brand"
      :activo="timer.sound"
      titulo="Sonido de aviso"
      detalle="Dos notas suaves tras la pausa."
    >
      <template #icono><AjusteIcon name="campana" class="h-6 w-6" /></template>
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
  </div>
</template>

<script setup>
import AjusteIcon from '@/components/AjusteIcon.vue'
import OpcionFila from '@/components/OpcionFila.vue'
import SleepTimerEstado from '@/components/SleepTimerEstado.vue'
import { useSleepTimer, formatoDuracion } from '@/composables/useSleepTimer'

/** Las tres duraciones de un toque; el resto están en el panel desplegado. */
const RAPIDOS = [15, 30, 60]

const { state: timer, activo, iniciar, setOpciones } = useSleepTimer()
</script>
