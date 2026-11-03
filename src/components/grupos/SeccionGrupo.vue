<template>
  <section class="border-t border-white/[0.07]" :data-seccion="id">
    <div class="flex items-center gap-2 px-5 py-3">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        :aria-expanded="abierta"
        :aria-controls="`seccion-${id}`"
        @click="abierta = !abierta"
      >
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-400/[0.16] text-brand-300">
          <GrupoIcono :name="icono" class="h-4 w-4" />
        </span>
        <span class="truncate text-sm font-bold text-white">{{ titulo }}</span>
        <GrupoIcono
          name="chevron"
          class="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-300"
          :class="abierta ? '-rotate-90' : 'rotate-90'"
        />
      </button>
      <slot name="accion" />
    </div>
    <!-- El contenido se queda en el DOM (sin display:none): así las animaciones
         de dentro no se reinician cada vez que se pliega o se despliega. -->
    <div :id="`seccion-${id}`" class="desplegable grid" :class="abierta ? 'abierta' : ''" :inert="!abierta">
      <div class="min-h-0 overflow-hidden">
        <div class="px-5 pb-5 pt-1">
          <slot :abierta="abierta" />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import GrupoIcono from './GrupoIcono.js'

const props = defineProps({
  id: { type: String, required: true },
  titulo: { type: String, required: true },
  icono: { type: String, default: 'medal' },
  /** Desplegada al montarse. */
  inicial: { type: Boolean, default: false }
})
const abierta = ref(props.inicial)
</script>

<style scoped>
.desplegable {
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}
.desplegable.abierta { grid-template-rows: 1fr; }
@media (prefers-reduced-motion: reduce) {
  .desplegable { transition: none !important; }
}
</style>
