<template>
  <!-- Esquemas animados de la guía de Macros, uno por paso (prop `paso`).
       Los tres primeros enseñan la MISMA macro de ejemplo —ejecución manual →
       copiar → Tus me gusta— con la pieza de ese paso resaltada; el cuarto la
       aplica al botón de los auriculares. Todas llevan arriba la etiqueta
       «Macro sugerida»: es un ejemplo que se puede crear, no algo que el
       usuario ya tenga configurado. -->
  <div v-if="paso !== 'boton'" class="mg-stage">
    <span class="mg-chip mg-chip-sugerida">
      <MacroIcon name="novedades" class="mg-chip-icon-fijo" />
      Macro sugerida · créala tú
    </span>
    <div class="mg-row">
      <div class="mg-card mg-card-1" :class="{ 'mg-hot': paso === 'manual' }">
        <span class="mg-card-n">A</span>
        <div class="min-w-0 flex-1">
          <p class="mg-card-eyebrow">Origen</p>
          <p class="mg-card-title">Ejecución manual</p>
        </div>
        <!-- Pulsar «Ejecutar»: el dedo baja y un anillo se abre. -->
        <span v-if="paso === 'manual'" class="mg-tap">
          <span class="mg-tap-ring" />
          <MacroIcon name="manual" class="mg-tap-icon" />
        </span>
      </div>

      <div class="mg-link" />

      <div class="mg-card mg-card-2" :class="{ 'mg-hot': paso === 'copiar' }">
        <span class="mg-card-n">B</span>
        <div class="min-w-0 flex-1">
          <p class="mg-card-eyebrow">Acción</p>
          <p class="mg-card-title">Copiar</p>
        </div>
        <MacroIcon v-if="paso === 'copiar'" name="copiar" class="mg-card-glyph" />
      </div>

      <div class="mg-link" />

      <div class="mg-card mg-card-3" :class="{ 'mg-hot': paso === 'megusta' }">
        <span class="mg-card-n">C</span>
        <div class="min-w-0 flex-1">
          <p class="mg-card-eyebrow">Destino</p>
          <p class="mg-card-title">Tus me gusta</p>
        </div>
        <svg class="mg-heart" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 20.2C7 16.4 3.6 13.3 3.6 9.5C3.6 7 5.5 5.2 7.8 5.2C9.6 5.2 11.2 6.2 12 7.8C12.8 6.2 14.4 5.2 16.2 5.2C18.5 5.2 20.4 7 20.4 9.5C20.4 13.3 17 16.4 12 20.2Z" />
        </svg>
      </div>

      <!-- Tres notas viajan del origen a la acción (copiar) o de ésta al
           destino (Tus me gusta). -->
      <template v-if="paso === 'copiar' || paso === 'megusta'">
        <span class="mg-note" :class="paso === 'megusta' ? 'mg-note-b' : ''" />
        <span class="mg-note mg-note-2" :class="paso === 'megusta' ? 'mg-note-b' : ''" />
        <span class="mg-note mg-note-3" :class="paso === 'megusta' ? 'mg-note-b' : ''" />
      </template>
    </div>
  </div>

  <!-- 4 · Aplicarla al botón de los auriculares. Nada flota sobre el resto: el
       «hecho» y el tono van en el flujo, debajo de la tarjeta. -->
  <div v-else class="mg-stage mg-stage-boton">
    <span class="mg-chip mg-chip-sugerida">
      <MacroIcon name="novedades" class="mg-chip-icon-fijo" />
      Macro sugerida · créala tú
    </span>
    <div class="mg-line">
      <div class="mg-hold">
        <span class="mg-ring" />
        <span class="mg-ring mg-ring-2" />
        <span class="mg-headset">
          <FeatureIcon name="auriculares" class="h-8 w-8" />
        </span>
        <p class="mg-hold-label">Mantén pulsado</p>
      </div>
      <svg class="mg-arrow" viewBox="0 0 48 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 6h40M37 1.5L43 6l-6 4.5" />
      </svg>
      <div class="mg-macro">
        <p class="mg-card-eyebrow">Macro vinculada</p>
        <p class="mg-card-title">Guardar lo que suena</p>
        <p class="mg-done">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12.6C7 14.4 8.6 16.2 10 18.2C12.6 13.6 15.8 9.6 19.4 6.2" />
          </svg>
          Hecho
        </p>
      </div>
    </div>
    <span class="mg-chip mg-chip-sound">
      <AjusteIcon name="campana" class="mg-chip-icon" />
      Tono de confirmación
    </span>
  </div>
</template>

<script setup>
import FeatureIcon from '@/components/FeatureIcon.vue'
import MacroIcon from '@/components/MacroIcon.vue'
import AjusteIcon from '@/components/AjusteIcon.vue'

/**
 * Escena de cada paso de la guía de Macros: 'manual', 'copiar', 'megusta' o
 * 'boton'. Sólo CSS, en bucle de `--ciclo` (lo fija GuiaInteractiva). El estilo
 * base de cada pieza es su estado FINAL; los keyframes dibujan cómo se llega a
 * él.
 */
defineProps({
  paso: { type: String, required: true }
})
</script>

<style scoped>
.mg-stage {
  position: relative;
  display: flex;
  min-height: 176px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 18px 16px;
}

.mg-card-eyebrow {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8a8a8a;
}

.mg-card-title {
  font-size: 13px;
  font-weight: 700;
  color: #fff;
}

/* · Pasos 1-3: la macro de ejemplo */

.mg-row {
  position: relative;
  display: flex;
  width: 100%;
  max-width: 320px;
  flex-direction: column;
  align-items: stretch;
}

/* Alto fijo: las notas viajan una distancia exacta (alto + enlace = 58 px). */
.mg-card {
  position: relative;
  display: flex;
  height: 48px;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  opacity: 0.5;
}

.mg-card.mg-hot {
  opacity: 1;
  background: rgba(30, 215, 96, 0.16);
  box-shadow: 0 0 0 1px rgba(30, 215, 96, 0.5);
  animation: mg-glow var(--ciclo) ease infinite;
}

.mg-card-n {
  display: flex;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: #1ed760;
  font-size: 11px;
  font-weight: 800;
  color: #000;
}

.mg-card-glyph {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  color: #7ff0a8;
  animation: mg-pulse var(--ciclo) ease infinite;
}

.mg-link {
  align-self: flex-start;
  width: 2px;
  height: 10px;
  margin-left: 22px;
  background: rgba(30, 215, 96, 0.45);
}

.mg-tap {
  position: relative;
  display: grid;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  place-items: center;
}

.mg-tap-icon {
  position: relative;
  z-index: 1;
  width: 24px;
  height: 24px;
  color: #7ff0a8;
  animation: mg-tap var(--ciclo) ease infinite;
}

.mg-tap-ring {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  border: 2px solid rgba(127, 240, 168, 0.8);
  opacity: 0;
  animation: mg-tap-ring var(--ciclo) ease-out infinite;
}

.mg-heart {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: #1ed760;
}

.mg-hot .mg-heart { animation: mg-beat var(--ciclo) ease infinite; }

/* Tres notas que bajan una tarjeta (58 px) mientras dura el paso. */
.mg-note {
  position: absolute;
  left: 15px;
  top: 38px;
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: #7fe0a8;
  opacity: 0;
  animation: mg-fly var(--ciclo) ease-in infinite;
}

.mg-note-b { top: 96px; }
.mg-note-2 { animation-delay: 0.3s; }
.mg-note-3 { animation-delay: 0.6s; }

/* · Paso 4: el botón de los auriculares */

.mg-line {
  margin-top: 6px;
  display: flex;
  width: 100%;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px 14px;
}

.mg-hold {
  position: relative;
  display: flex;
  width: 84px;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.mg-headset {
  position: relative;
  z-index: 1;
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border-radius: 9999px;
  background: rgba(125, 211, 252, 0.16);
  color: #7dd3fc;
  animation: mg-hold var(--ciclo) ease infinite;
}

.mg-ring {
  position: absolute;
  top: 0;
  left: 16px;
  width: 52px;
  height: 52px;
  border-radius: 9999px;
  border: 2px solid rgba(125, 211, 252, 0.7);
  opacity: 0;
  animation: mg-ring var(--ciclo) ease-out infinite;
}

.mg-ring-2 { animation-delay: 0.45s; }

.mg-hold-label {
  margin-top: 10px;
  font-size: 10px;
  font-weight: 700;
  color: #8a8a8a;
}

.mg-arrow {
  width: 40px;
  height: 12px;
  color: #8a8a8a;
  animation: mg-arrow var(--ciclo) ease infinite;
}

.mg-macro {
  min-width: 0;
  flex: 1 1 150px;
  max-width: 220px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.07);
  animation: mg-light var(--ciclo) ease infinite;
}

/* El «hecho» va dentro de la propia tarjeta, en una línea que ya está reservada. */
.mg-done {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 3px;
  font-size: 11px;
  font-weight: 800;
  color: #7ff0a8;
  animation: mg-show var(--ciclo) ease infinite;
}

.mg-done svg { width: 12px; height: 12px; }

.mg-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
}

/* Etiqueta fija de la sugerencia: no se anima, se lee desde el primer
   fotograma. Violeta, el color de las macros de ejemplo. */
.mg-chip-sugerida {
  max-width: 100%;
  background: rgba(167, 139, 250, 0.18);
  color: #ddd6fe;
  white-space: nowrap;
}
.mg-chip-icon-fijo {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.mg-chip-sound {
  background: rgba(125, 211, 252, 0.16);
  color: #7dd3fc;
  animation: mg-pop var(--ciclo) ease infinite;
}

.mg-chip-icon {
  width: 14px;
  height: 14px;
  animation: mg-ring-bell var(--ciclo) ease infinite;
}

/* ── Fotogramas ─────────────────────────────────────────────────────── */

@keyframes mg-glow {
  0%, 10% { background: rgba(255, 255, 255, 0.05); box-shadow: none; }
  22%, 88% { background: rgba(30, 215, 96, 0.16); box-shadow: 0 0 0 1px rgba(30, 215, 96, 0.5); }
  100% { background: rgba(255, 255, 255, 0.05); box-shadow: none; }
}

@keyframes mg-pulse {
  0%, 30% { transform: scale(1); }
  40% { transform: scale(1.25); }
  50%, 100% { transform: scale(1); }
}

@keyframes mg-tap {
  0%, 20% { transform: translateY(0) scale(1); }
  28% { transform: translateY(3px) scale(0.88); }
  36%, 100% { transform: translateY(0) scale(1); }
}

@keyframes mg-tap-ring {
  0%, 26% { opacity: 0; transform: scale(0.8); }
  30% { opacity: 0.9; }
  56%, 100% { opacity: 0; transform: scale(1.7); }
}

@keyframes mg-beat {
  0%, 62% { transform: scale(1); }
  68% { transform: scale(1.35); }
  76%, 100% { transform: scale(1); }
}

@keyframes mg-fly {
  0%, 30% { opacity: 0; transform: translateY(0); }
  34% { opacity: 1; }
  56% { opacity: 1; transform: translateY(54px); }
  60%, 100% { opacity: 0; transform: translateY(58px); }
}

@keyframes mg-hold {
  0%, 12% { transform: scale(1); }
  18%, 40% { transform: scale(0.9); }
  46%, 100% { transform: scale(1); }
}

@keyframes mg-ring {
  0%, 18% { opacity: 0; transform: scale(1); }
  20% { opacity: 0.9; }
  42%, 100% { opacity: 0; transform: scale(1.9); }
}

@keyframes mg-arrow {
  0%, 40% { opacity: 0.25; transform: translateX(-4px); }
  50%, 100% { opacity: 1; transform: none; }
}

@keyframes mg-light {
  0%, 44% { background: rgba(255, 255, 255, 0.07); box-shadow: none; }
  52%, 90% { background: rgba(30, 215, 96, 0.2); box-shadow: 0 0 0 1px rgba(30, 215, 96, 0.55); }
  100% { background: rgba(255, 255, 255, 0.07); }
}

@keyframes mg-show {
  0%, 52% { opacity: 0; }
  60%, 90% { opacity: 1; }
  100% { opacity: 0; }
}

@keyframes mg-pop {
  0%, 58% { opacity: 0; transform: scale(0.85); }
  66% { opacity: 1; transform: scale(1.06); }
  72%, 92% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1); }
}

@keyframes mg-ring-bell {
  0%, 60% { transform: rotate(0); }
  64% { transform: rotate(-16deg); }
  68% { transform: rotate(14deg); }
  72% { transform: rotate(-9deg); }
  76%, 100% { transform: rotate(0); }
}

@media (prefers-reduced-motion: reduce) {
  .mg-card.mg-hot, .mg-card-glyph, .mg-tap-icon, .mg-tap-ring, .mg-hot .mg-heart,
  .mg-note, .mg-headset, .mg-ring, .mg-arrow, .mg-macro, .mg-done,
  .mg-chip-sound, .mg-chip-icon {
    animation: none;
  }

  /* Sin movimiento no hay notas volando ni anillos: sólo el estado final. */
  .mg-note, .mg-ring, .mg-tap-ring { display: none; }
}
</style>
