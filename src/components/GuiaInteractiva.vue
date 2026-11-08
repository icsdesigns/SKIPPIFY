<template>
  <Transition name="gi-fade">
    <div v-if="guia.state.open" class="gi-backdrop fixed inset-0 z-[99]" aria-hidden="true" @click="guia.minimize" />
  </Transition>

  <Transition name="gi-slide">
    <section
      v-if="guia.state.open"
      ref="panel"
      class="gi-panel fixed z-[100] mx-auto flex max-w-lg flex-col"
      role="dialog"
      aria-modal="true"
      :aria-label="guia.ariaLabel"
      tabindex="-1"
      @keydown.esc="guia.minimize"
    >
      <header class="flex items-center justify-between gap-3">
        <span class="gi-badge">{{ guia.etiqueta }}</span>
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold tabular-nums text-slate-400">{{ guia.state.step + 1 }} / {{ guia.total }}</span>
          <button
            type="button"
            class="gi-close"
            aria-label="Cerrar la guía. Podrás reabrirla desde el icono de la cabecera"
            @click="guia.minimize"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </header>

      <div class="gi-body">
        <!-- La escena se vuelve a montar en cada paso para que su animación
             arranque desde el principio. -->
        <div v-if="paso.escena" :key="paso.id" class="gi-scene" aria-hidden="true">
          <component :is="paso.escena" v-bind="paso.escenaProps || {}" />
        </div>

        <h3 class="mt-4 text-lg font-extrabold leading-tight tracking-tight text-white">{{ paso.titulo }}</h3>
        <GuiaPuntos class="mt-3" :puntos="paso.puntos" />
      </div>

      <div class="gi-dots">
        <button
          v-for="(p, indice) in guia.pasos"
          :key="p.id"
          type="button"
          class="gi-dot"
          :class="{ 'is-current': indice === guia.state.step }"
          :aria-label="`Ir al paso ${indice + 1}: ${p.titulo}`"
          :aria-current="indice === guia.state.step ? 'step' : undefined"
          @click="guia.goTo(indice)"
        />
      </div>

      <div class="grid grid-cols-2 gap-2">
        <button class="sk-btn sk-btn-ghost" :disabled="guia.state.step === 0" @click="guia.prev">
          Anterior
        </button>
        <button v-if="!esUltimo" class="sk-btn sk-btn-primary" @click="guia.next">
          Siguiente
        </button>
        <button v-else class="sk-btn sk-btn-primary" @click="guia.finish">
          Entendido
        </button>
      </div>
    </section>
  </Transition>
</template>

<script setup>
/**
 * Panel de una guía interactiva. Es genérico: recibe la guía que crea
 * `crearGuia` (estado + pasos) y la pinta con el formato de la de Macros:
 * insignia, progreso, esquema animado, título, tarjetas de opción compactas con
 * los puntos, indicadores de paso y Anterior / Siguiente / Entendido.
 *
 * Para crear una guía nueva, ver el comentario de `composables/crearGuia.js`.
 * El botón para reabrirla lo pone la cabecera de la app, no esta vista.
 */
import { computed, nextTick, ref, watch } from 'vue'
import GuiaPuntos from '@/components/GuiaPuntos.vue'

const props = defineProps({
  guia: { type: Object, required: true }
})

const panel = ref(null)

const paso = computed(() => props.guia.pasos[props.guia.state.step] || props.guia.pasos[0])
const esUltimo = computed(() => props.guia.state.step === props.guia.total - 1)

// Al abrir, el foco pasa al panel para que Escape y el teclado funcionen.
watch(() => props.guia.state.open, async (abierto) => {
  if (!abierto) return
  await nextTick()
  panel.value?.focus?.()
}, { immediate: true })
</script>

<style scoped>
.gi-backdrop {
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(3px);
}

.gi-panel {
  left: 16px;
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  gap: 14px;
  max-height: 92dvh;
  padding: 14px 16px 18px;
  border-radius: 16px;
  background: #242424;
  box-shadow: 0 -12px 60px rgba(0, 0, 0, 0.65);
  outline: none;
}

.gi-badge {
  padding: 3px 10px;
  border-radius: 9999px;
  background: rgba(30, 215, 96, 0.16);
  color: #1ed760;
  font-size: 12px;
  font-weight: 700;
}

.gi-close {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 9999px;
  color: #b3b3b3;
  background: rgba(255, 255, 255, 0.08);
  transition: background 0.15s ease, color 0.15s ease;
}

.gi-close:hover {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

.gi-body {
  min-height: 0;
  overflow-y: auto;
}

.gi-dots {
  display: flex;
  justify-content: center;
  gap: 6px;
}

.gi-dot {
  position: relative;
  width: 7px;
  height: 7px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.22);
  transition: background 0.16s ease, width 0.16s ease;
}

.gi-dot::after {
  content: '';
  position: absolute;
  inset: -9px -3px;
}

.gi-dot:hover { background: rgba(255, 255, 255, 0.4); }
.gi-dot.is-current { width: 20px; background: #1ed760; }

/* ── Escenas ─────────────────────────────────────────────────────────────
   El estilo base de cada pieza es su estado FINAL; los keyframes sólo dibujan
   cómo se llega a él. Con «reducir movimiento» no hay animación y la escena
   se queda como acabaría. Todas duran 6 s y se repiten. */

.gi-scene {
  --ciclo: 6s;
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  background: #121212;
  border: 1px solid rgba(255, 255, 255, 0.07);
}

/* ── Entrada y salida del panel ─────────────────────────────────────── */

.gi-fade-enter-active,
.gi-fade-leave-active { transition: opacity 0.2s ease; }
.gi-fade-enter-from,
.gi-fade-leave-to { opacity: 0; }

.gi-slide-enter-active,
.gi-slide-leave-active {
  transition: opacity 0.24s ease, transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}
.gi-slide-enter-from,
.gi-slide-leave-to { opacity: 0; transform: translateY(16px); }

@media (prefers-reduced-motion: reduce) {
  .gi-fade-enter-active,
  .gi-fade-leave-active,
  .gi-slide-enter-active,
  .gi-slide-leave-active,
  .gi-dot { transition: none; }
}
</style>
