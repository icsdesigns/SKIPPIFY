<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-[60]" role="dialog" aria-modal="true" :aria-label="titulo">
      <Transition name="velo" appear>
        <div v-if="abierta" class="absolute inset-0 bg-black/60" @click="cerrar" />
      </Transition>
      <Transition name="hoja" appear @after-leave="visible = false">
        <div
          v-if="abierta"
          class="hoja absolute inset-x-0 bottom-0 mx-auto flex max-h-[88vh] w-full max-w-xl flex-col rounded-t-[1.5rem] bg-ink-700 shadow-lift ring-1 ring-white/[0.08]"
        >
          <div class="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-3">
            <span class="mx-auto h-1 w-10 rounded-full bg-white/[0.18]" aria-hidden="true" />
          </div>
          <header class="flex shrink-0 items-center justify-between gap-3 px-5 pb-3">
            <h2 class="text-base font-extrabold text-white">{{ titulo }}</h2>
            <button type="button" class="sk-btn sk-btn-ghost sk-btn-sm !px-2.5" aria-label="Cerrar" @click="cerrar">
              <GrupoIcono name="plus" class="h-4 w-4 rotate-45" />
            </button>
          </header>
          <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <slot />
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<script setup>
/**
 * Hoja inferior: un panel que sube desde el borde de abajo de la pantalla.
 * Se monta en <body> para quedar por encima de la barra de pestañas, y se
 * desmonta cuando termina la animación de salida.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import GrupoIcono from './GrupoIcono.js'

const props = defineProps({
  abierta: { type: Boolean, default: false },
  titulo: { type: String, default: '' }
})
const emit = defineEmits(['cerrar'])

const visible = ref(props.abierta)
function bloquearScroll (v) {
  if (typeof document !== 'undefined' && document.body) document.body.style.overflow = v ? 'hidden' : ''
}
watch(() => props.abierta, (v) => {
  if (v) visible.value = true
  bloquearScroll(v)
})

function cerrar () { emit('cerrar') }
function tecla (e) { if (e.key === 'Escape' && props.abierta) cerrar() }
onMounted(() => document.addEventListener('keydown', tecla))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', tecla)
  bloquearScroll(false)
})
</script>

<style scoped>
.velo-enter-active, .velo-leave-active { transition: opacity 0.28s ease; }
.velo-enter-from, .velo-leave-to { opacity: 0; }
.hoja-enter-active { transition: transform 0.42s cubic-bezier(0.22, 1, 0.36, 1); }
.hoja-leave-active { transition: transform 0.28s cubic-bezier(0.4, 0, 1, 1); }
.hoja-enter-from, .hoja-leave-to { transform: translateY(100%); }
@media (prefers-reduced-motion: reduce) {
  .velo-enter-active, .velo-leave-active, .hoja-enter-active, .hoja-leave-active { transition: none !important; }
}
</style>
