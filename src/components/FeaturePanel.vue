<template>
  <section class="sk-card overflow-hidden">
    <!-- Cabecera: siempre visible y pulsable entera. Con el panel plegado es lo
         único que se ve, así que lleva el estado de la función a la derecha. -->
    <button
      :id="`${idBase}-cabecera`"
      type="button"
      class="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-200 hover:bg-white/[0.03]"
      :aria-expanded="abierto"
      :aria-controls="`${idBase}-cuerpo`"
      @click="abierto = !abierto"
    >
      <span
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base"
        :class="iconClass"
        aria-hidden="true"
      >{{ icon }}</span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-bold text-white">{{ title }}</span>
        <span v-if="subtitle" class="hidden truncate text-[11px] text-slate-500 sm:block">{{ subtitle }}</span>
        <!-- En móvil el resumen no cabe junto al estado: el estado ocupa su línea. -->
        <span v-if="$slots.estado" class="mt-1 flex sm:hidden">
          <slot name="estado" />
        </span>
      </span>
      <span v-if="$slots.estado" class="hidden shrink-0 sm:inline-flex">
        <slot name="estado" />
      </span>
      <span
        class="shrink-0 text-[15px] text-slate-400 transition-transform duration-200"
        :class="abierto ? 'rotate-90' : ''"
        aria-hidden="true"
      >›</span>
    </button>

    <!-- Cuerpo: la rejilla 0fr → 1fr anima la altura real del contenido, sin
         el tope fijo de max-height que recortaba los paneles largos. Plegado
         queda inerte para que el foco del teclado no se cuele dentro. -->
    <div
      :id="`${idBase}-cuerpo`"
      role="region"
      :aria-labelledby="`${idBase}-cabecera`"
      class="grid transition-[grid-template-rows] duration-300 ease-out"
      :class="abierto ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
      :inert="!abierto"
    >
      <div class="min-h-0 overflow-hidden">
        <div
          class="border-t border-white/[0.07] p-5 transition-opacity duration-200"
          :class="abierto ? 'opacity-100' : 'opacity-0'"
        >
          <slot />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
/**
 * Panel plegable de una función de Skippify.
 *
 * Cada automatización de la pestaña Funciones va dentro de uno: la cabecera
 * (icono, nombre, resumen y estado) se ve siempre y el contenido sólo al
 * desplegarlo. Añadir una función nueva es añadir otro <FeaturePanel>.
 */
import { ref, useId } from 'vue'

const props = defineProps({
  icon: { type: String, required: true },
  /** Fondo del círculo del icono, p. ej. 'bg-amber-400/[0.18]'. */
  iconClass: { type: String, default: 'bg-white/[0.08]' },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  /** Plegado salvo que se pida lo contrario. */
  defaultOpen: { type: Boolean, default: false }
})

const idBase = `panel-${useId()}`
const abierto = ref(props.defaultOpen)
</script>
