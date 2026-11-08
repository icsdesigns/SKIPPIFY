<template>
  <!-- Los puntos de un paso (del tour o de una guía) como tarjetas de opción
       compactas: tesela de icono a la izquierda, título y descripción a la
       derecha. Son fichas informativas, no se pulsan. -->
  <ul class="space-y-2">
    <li v-for="p in puntos" :key="p.titulo">
      <OpcionFila
        compacta
        plana
        color-tesela
        :tono="p.tono || 'brand'"
        :titulo="p.titulo"
        :detalle="p.detalle"
      >
        <template #icono>
          <component :is="iconoDe(p.icono).componente" :name="iconoDe(p.icono).nombre" class="h-6 w-6" />
        </template>
      </OpcionFila>
    </li>
  </ul>
</template>

<script setup>
/**
 * `puntos`: [{ icono: 'macro:copiar', titulo, detalle?, tono? }]. El icono lleva
 * el prefijo del juego al que pertenece: `macro:` (MacroIcon), `feature:`
 * (FeatureIcon) o `ajuste:` (AjusteIcon). Sin prefijo se toma de AjusteIcon.
 */
import OpcionFila from '@/components/OpcionFila.vue'
import MacroIcon from '@/components/MacroIcon.vue'
import FeatureIcon from '@/components/FeatureIcon.vue'
import AjusteIcon from '@/components/AjusteIcon.vue'

defineProps({
  puntos: { type: Array, required: true }
})

const JUEGOS = { macro: MacroIcon, feature: FeatureIcon, ajuste: AjusteIcon }

function iconoDe (icono = '') {
  const [prefijo, nombre] = String(icono).includes(':') ? String(icono).split(':') : ['ajuste', icono]
  return { componente: JUEGOS[prefijo] || AjusteIcon, nombre }
}
</script>
