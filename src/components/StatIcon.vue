<template>
  <!-- Iconos de Estadísticas y del Wrapped. Trazo de FeatureIcon / MacroIcon;
       heredan `currentColor`. La geometría vive en `lib/statIconos.js`. -->
  <svg
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="(d, i) in trazos" :key="i" :d="d" />
  </svg>
</template>

<script setup>
import { computed } from 'vue'
import { STAT_ICONOS } from '@/lib/statIconos'

const props = defineProps({
  /** 'cancion' | 'artista' | 'reloj' | 'racha' | 'variedad' | 'sesion' | 'movil' | 'otros' | 'wrapped' | 'descubrimiento' | 'compartir' | 'descargar' */
  name: { type: String, required: true }
})

const trazos = computed(() => STAT_ICONOS[props.name] || [])
</script>
