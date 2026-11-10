<template>
  <!-- Temporizador en marcha: una tarjeta de opción con lo que queda y, debajo,
       los botones de siempre. El aviso de lectura
       anuncia sólo los cambios de fase, no cada segundo de la cuenta atrás:
       el texto visible no es una región viva y el aviso va aparte, oculto. -->
  <div>
    <span class="sr-only" role="status" aria-live="polite">{{ anuncioFase }}</span>
    <OpcionFila
      plana
      color-tesela
      tono="sky"
      :titulo="titulo"
      :detalle="detalle"
    >
      <template #icono>
        <AjusteIcon
          :name="timer.phase === 'counting' ? 'reloj' : 'pausa'"
          class="h-8 w-8"
          :class="timer.phase === 'counting' ? '' : 'animate-pulse'"
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

const { state: timer, restanteMs, alargar, cancelar } = useSleepTimer()

const titulo = computed(() => {
  if (timer.phase === 'counting') return `Quedan ${formatoCuenta(restanteMs.value)}`
  if (timer.phase === 'waiting') return 'Esperando a que acabe la canción'
  return 'Terminando…'
})

/** Lo que lee el lector de pantalla: cambia sólo al cambiar de fase. */
const anuncioFase = computed(() => {
  if (timer.phase === 'counting') return 'Temporizador en marcha'
  if (timer.phase === 'waiting') return 'Esperando a que acabe la canción'
  return 'Temporizador terminando'
})

const detalle = computed(() => {
  if (timer.phase === 'counting') return `Se pausará hacia las ${horaDeReloj(timer.endAt)}, al acabar la canción.`
  if (timer.phase === 'waiting') return 'La música se pausará justo antes de que empiece la siguiente.'
  return 'Pausa hecha. Completando los pasos finales.'
})
</script>
