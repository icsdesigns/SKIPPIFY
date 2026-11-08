<template>
  <!-- Esquemas animados de la guía de Macros, uno por paso (prop `paso`). -->
  <!-- 1 · Conectar la cuenta -->
  <div v-if="paso === 'conectar'" class="mg-stage">
    <div class="mg-field">
      <span class="mg-field-label">Client ID</span>
      <span class="mg-typed">a41f9c07d2e65b83</span>
    </div>
    <div class="mg-btn-wrap">
      <span class="mg-btn">Conectar con Spotify</span>
      <svg class="mg-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
        <path d="M12 3a9 9 0 0 1 9 9" />
      </svg>
    </div>
    <div class="mg-chip mg-chip-ok">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12.6C7 14.4 8.6 16.2 10 18.2C12.6 13.6 15.8 9.6 19.4 6.2" />
      </svg>
      Cuenta conectada
    </div>
  </div>

  <!-- 2 · La macro de ejemplo -->
  <div v-else-if="paso === 'macro'" class="mg-stage">
    <div class="mg-row">
      <div class="mg-card mg-card-1">
        <span class="mg-card-n">A</span>
        <div class="min-w-0">
          <p class="mg-card-eyebrow">Origen</p>
          <p class="mg-card-title">Novedades de una playlist</p>
        </div>
      </div>
      <div class="mg-link mg-link-1" />
      <div class="mg-card mg-card-2">
        <span class="mg-card-n">B</span>
        <div class="min-w-0">
          <p class="mg-card-eyebrow">Acción</p>
          <p class="mg-card-title">Copiar</p>
        </div>
      </div>
      <div class="mg-link mg-link-2" />
      <div class="mg-card mg-card-3">
        <span class="mg-card-n">C</span>
        <div class="min-w-0">
          <p class="mg-card-eyebrow">Destino</p>
          <p class="mg-card-title">Tus me gusta</p>
        </div>
        <svg class="mg-heart" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 20.2C7 16.4 3.6 13.3 3.6 9.5C3.6 7 5.5 5.2 7.8 5.2C9.6 5.2 11.2 6.2 12 7.8C12.8 6.2 14.4 5.2 16.2 5.2C18.5 5.2 20.4 7 20.4 9.5C20.4 13.3 17 16.4 12 20.2Z" />
        </svg>
      </div>
      <span class="mg-note mg-note-1" />
      <span class="mg-note mg-note-2" />
      <span class="mg-note mg-note-3" />
    </div>
  </div>

  <!-- 3 · Vincularla al botón de los auriculares -->
  <div v-else class="mg-stage">
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
      <p class="mg-card-title">Novedades a Tus me gusta</p>
    </div>
    <div class="mg-toast">Skippify · «Novedades a Tus me gusta»: hecho</div>
  </div>
</template>

<script setup>
import FeatureIcon from '@/components/FeatureIcon.vue'

/**
 * Escena de cada paso de la guía de Macros: 'conectar', 'macro' o 'boton'.
 * Sólo CSS, en bucle de `--ciclo` (lo fija GuiaInteractiva). El estilo base de
 * cada pieza es su estado FINAL; los keyframes dibujan cómo se llega a él.
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

/* · Paso 1: conectar */

.mg-field {
  display: flex;
  width: 100%;
  max-width: 280px;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.07);
}

.mg-field-label {
  font-size: 10px;
  font-weight: 700;
  color: #8a8a8a;
}

.mg-typed {
  display: inline-block;
  overflow: hidden;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #1ed760;
  width: 16ch;
  animation: mg-type var(--ciclo) steps(16, end) infinite;
}

.mg-btn-wrap {
  position: relative;
  display: flex;
  width: 100%;
  max-width: 280px;
  justify-content: center;
}

.mg-btn {
  width: 100%;
  padding: 9px 12px;
  border-radius: 9999px;
  background: #1ed760;
  text-align: center;
  font-size: 12px;
  font-weight: 800;
  color: #000;
  animation: mg-press var(--ciclo) ease infinite;
}

.mg-spin {
  position: absolute;
  right: 14px;
  top: 50%;
  width: 16px;
  height: 16px;
  margin-top: -8px;
  color: #000;
  opacity: 0;
  animation: mg-spin var(--ciclo) linear infinite;
}

.mg-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
}

.mg-chip svg { width: 13px; height: 13px; }

.mg-chip-ok {
  background: rgba(30, 215, 96, 0.18);
  color: #7ff0a8;
  animation: mg-pop var(--ciclo) ease infinite;
}

/* · Paso 2: la macro */

.mg-row {
  position: relative;
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: stretch;
}

.mg-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.07);
  animation: mg-rise var(--ciclo) ease infinite;
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

.mg-card-2 { animation-name: mg-rise-2; }
.mg-card-3 { animation-name: mg-rise-3; }

.mg-link {
  align-self: flex-start;
  width: 2px;
  height: 10px;
  margin-left: 22px;
  background: rgba(30, 215, 96, 0.6);
  transform-origin: top;
}

.mg-link-1 { animation: mg-grow-1 var(--ciclo) ease infinite; }
.mg-link-2 { animation: mg-grow-2 var(--ciclo) ease infinite; }

.mg-heart {
  position: absolute;
  right: 12px;
  width: 18px;
  height: 18px;
  color: #1ed760;
  animation: mg-beat var(--ciclo) ease infinite;
}

/* Tres notas que bajan del origen al destino mientras dura el copiado */
.mg-note {
  position: absolute;
  left: 11px;
  top: 14px;
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: #7ff0a8;
  opacity: 0;
  animation: mg-fly var(--ciclo) ease-in infinite;
}

.mg-note-2 { animation-delay: 0.35s; }
.mg-note-3 { animation-delay: 0.7s; }

/* · Paso 3: el botón */

.mg-stage:has(.mg-hold) {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 10px 14px;
  padding-bottom: 52px;
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
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.07);
  animation: mg-light var(--ciclo) ease infinite;
}

.mg-toast {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  padding: 8px 12px;
  border-radius: 9999px;
  background: #fff;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  color: #121212;
  animation: mg-toast var(--ciclo) ease infinite;
}

/* ── Fotogramas ─────────────────────────────────────────────────────── */

@keyframes mg-type {
  0% { width: 0; }
  35%, 100% { width: 16ch; }
}

@keyframes mg-press {
  0%, 42% { transform: scale(1); }
  47% { transform: scale(0.95); filter: brightness(0.85); }
  54%, 100% { transform: scale(1); filter: none; }
}

@keyframes mg-spin {
  0%, 48% { opacity: 0; transform: rotate(0); }
  50% { opacity: 1; }
  66% { opacity: 1; transform: rotate(540deg); }
  68%, 100% { opacity: 0; transform: rotate(540deg); }
}

@keyframes mg-pop {
  0%, 66% { opacity: 0; transform: scale(0.8); }
  74% { opacity: 1; transform: scale(1.06); }
  80%, 94% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1); }
}

@keyframes mg-rise {
  0% { opacity: 0; transform: translateY(8px); }
  10%, 92% { opacity: 1; transform: none; }
  100% { opacity: 0; }
}

@keyframes mg-rise-2 {
  0%, 12% { opacity: 0; transform: translateY(8px); }
  22%, 92% { opacity: 1; transform: none; }
  100% { opacity: 0; }
}

@keyframes mg-rise-3 {
  0%, 26% { opacity: 0; transform: translateY(8px); }
  36%, 92% { opacity: 1; transform: none; }
  100% { opacity: 0; }
}

@keyframes mg-grow-1 {
  0%, 10% { transform: scaleY(0); }
  18%, 92% { transform: scaleY(1); }
  100% { transform: scaleY(0); }
}

@keyframes mg-grow-2 {
  0%, 24% { transform: scaleY(0); }
  32%, 92% { transform: scaleY(1); }
  100% { transform: scaleY(0); }
}

@keyframes mg-beat {
  0%, 62% { transform: scale(1); }
  68% { transform: scale(1.35); }
  76%, 100% { transform: scale(1); }
}

@keyframes mg-fly {
  0%, 38% { opacity: 0; transform: translateY(0); }
  42% { opacity: 1; }
  60% { opacity: 1; transform: translateY(96px); }
  64%, 100% { opacity: 0; transform: translateY(100px); }
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

@keyframes mg-toast {
  0%, 52% { opacity: 0; transform: translateY(14px); }
  60%, 90% { opacity: 1; transform: none; }
  100% { opacity: 0; transform: translateY(14px); }
}

@media (prefers-reduced-motion: reduce) {
  .mg-typed, .mg-btn, .mg-spin, .mg-chip-ok, .mg-card, .mg-link, .mg-heart,
  .mg-note, .mg-headset, .mg-ring, .mg-arrow, .mg-macro, .mg-toast {
    animation: none;
  }

  /* Sin movimiento no hay notas volando ni anillos: sólo el estado final. */
  .mg-note, .mg-ring, .mg-spin { display: none; }
}
</style>
