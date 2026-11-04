<template>
  <component
    :is="as"
    class="flex items-center gap-3.5 rounded-xl border p-3 text-left transition-all"
    :class="clases"
    :type="as === 'button' ? 'button' : undefined"
  >
    <!-- Icono grande a la izquierda: es lo que da a «Crear una macro» su
         aspecto y lo que se reparte ahora por el resto de pestañas. -->
    <span
      class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-colors"
      :class="teselaClase"
    ><slot name="icono" /></span>

    <span class="min-w-0 flex-1">
      <span class="block line-clamp-2 text-sm font-bold text-white [overflow-wrap:anywhere]">{{ titulo }}</span>
      <span v-if="detalle" class="mt-1 line-clamp-4 block text-[11px] leading-relaxed text-slate-500">{{ detalle }}</span>
      <slot />
    </span>

    <slot name="fin" />
  </component>
</template>

<script setup>
/**
 * Fila de opción con el estilo de «Crear una macro»: icono grande en una tesela
 * redondeada a la izquierda y, a su derecha, título y descripción.
 *
 * Sirve igual de botón elegible (`as="button"` + `activo`), que de ficha
 * informativa (`as="div"`), y admite un hueco `#fin` para un interruptor, una
 * insignia o una flecha. `tono` colorea la tesela y el borde cuando está activa.
 *
 * Alto máximo: el de la tarjeta «Personalizado» de Funciones, es decir, título
 * (dos líneas como mucho) y cuatro líneas de descripción. Lo que no cabe —un
 * botón, un formulario, una explicación larga— va fuera de la tarjeta, debajo.
 */
import { computed } from 'vue'

const props = defineProps({
  as: { type: String, default: 'div' },
  titulo: { type: String, required: true },
  detalle: { type: String, default: '' },
  /** Elegida (o «encendida»): borde y tesela de color. */
  activo: { type: Boolean, default: false },
  /** 'brand' | 'violet' | 'sky' | 'amber' | 'rose' */
  tono: { type: String, default: 'brand' },
  /** Ficha informativa: superficie hundida en vez de botón elegible. */
  plana: { type: Boolean, default: false },
  /** Se ve apagada (macro pausada, permiso sin conceder…). */
  tenue: { type: Boolean, default: false }
})

const TONOS = {
  brand: { borde: 'border-brand-400 bg-brand-400/[0.12]', tesela: 'bg-brand-400/[0.22] text-brand-200' },
  violet: { borde: 'border-violet-400 bg-violet-400/[0.14]', tesela: 'bg-violet-400/[0.25] text-violet-100' },
  sky: { borde: 'border-sky-400 bg-sky-400/[0.14]', tesela: 'bg-sky-400/[0.25] text-sky-100' },
  amber: { borde: 'border-amber-400 bg-amber-400/[0.12]', tesela: 'bg-amber-400/[0.22] text-amber-100' },
  rose: { borde: 'border-rose-400 bg-rose-400/[0.12]', tesela: 'bg-rose-400/[0.22] text-rose-100' }
}

const tono = computed(() => TONOS[props.tono] || TONOS.brand)

const clases = computed(() => {
  if (props.activo) return [tono.value.borde, 'text-white']
  if (props.plana) return ['border-white/[0.07] bg-black/30', props.tenue ? 'opacity-70' : '']
  return ['sk-option', props.tenue ? 'opacity-70' : '']
})

const teselaClase = computed(() => props.activo ? tono.value.tesela : 'bg-white/[0.06] text-slate-300')
</script>
