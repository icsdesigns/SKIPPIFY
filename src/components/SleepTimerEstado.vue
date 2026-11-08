<template>
  <!-- Temporizador en marcha: una tarjeta de opción con lo que queda y, debajo,
       los botones de siempre. Es la misma pieza en el panel y en la vista
       rápida del panel plegado (prop `compacta`). El aviso de lectura
       (aria-live) está aquí para que ambos sitios lo anuncien igual. -->
  <div aria-live="polite">
    <OpcionFila
      plana
      color-tesela
      tono="sky"
      :compacta="compacta"
      :titulo="titulo"
      :detalle="detalle"
    >
      <template #icono>
        <AjusteIcon
          :name="timer.phase === 'counting' ? 'reloj' : 'pausa'"
          :class="[compacta ? 'h-6 w-6' : 'h-8 w-8', timer.phase === 'counting' ? '' : 'animate-pulse']"
        />
      </template>
    </OpcionFila>

    <div v-if="timer.phase !== 'finishing'" class="mt-3 flex flex-wrap gap-2">
      <button
        v-if="timer.phase === 'counting'"
        type="button"
        class="sk-btn sk-btn-ghost sk-btn-sm"
        @click="alargar(15)"
      >+15 min</button>
      <button type="button" class="sk-btn sk-btn-danger sk-btn-sm" @click="cancelar">Cancelar</button>
    </div>
  </div>
</template>

<script setup>
/**
 * Estado del temporizador mientras corre: cuenta atrás, hora aproximada de
 * parada y los botones +15 min / Cancelar. Lee y gobierna `useSleepTimer`.
 */
import { computed } from 'vue'
import AjusteIcon from '@/components/AjusteIcon.vue'
import OpcionFila from '@/components/OpcionFila.vue'
import { useSleepTimer, formatoCuenta, horaDeReloj } from '@/composables/useSleepTimer'

defineProps({
  compacta: { type: Boolean, default: false }
})

const { state: timer, restanteMs, alargar, cancelar } = useSleepTimer()

const titulo = computed(() => {
  if (timer.phase === 'counting') return `Quedan ${formatoCuenta(restanteMs.value)}`
  if (timer.phase === 'waiting') return 'Esperando a que acabe la canción'
  return 'Terminando…'
})

const detalle = computed(() => {
  if (timer.phase === 'counting') return `Se pausará hacia las ${horaDeReloj(timer.endAt)}, al acabar la canción.`
  if (timer.phase === 'waiting') return 'La música se pausará justo antes de que empiece la siguiente.'
  return 'Pausa hecha. Completando los pasos finales.'
})
</script>
