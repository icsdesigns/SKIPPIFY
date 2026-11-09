<template>
  <!-- Esquemas animados de la guía de Funciones, uno por paso (prop `paso`). -->

  <!-- 1 · Salto de duplicadas: lo ya oído se salta -->
  <div v-if="paso === 'duplicadas'" class="fg-stage">
    <div class="fg-row fg-rise-1">
      <span class="fg-dot">1</span>
      <span class="fg-grow"><span class="fg-eyebrow">Canción nueva</span><span class="fg-title">Suena</span></span>
      <span class="fg-tag fg-tag-ok">Suena</span>
    </div>
    <div class="fg-row fg-skip fg-rise-2">
      <span class="fg-dot fg-dot-warn">2</span>
      <span class="fg-grow"><span class="fg-eyebrow">Oída hace 3 días</span><span class="fg-title">Ya la conoces</span></span>
      <span class="fg-tag fg-tag-warn">Se salta</span>
    </div>
    <div class="fg-row fg-rise-3">
      <span class="fg-dot">3</span>
      <span class="fg-grow"><span class="fg-eyebrow">Canción nueva</span><span class="fg-title">Suena después</span></span>
      <span class="fg-tag fg-tag-ok">Suena</span>
    </div>
  </div>

  <!-- 2 · Los tres modos: cuánto se tarda en volver a oír lo mismo -->
  <div v-else-if="paso === 'modos'" class="fg-stage">
    <div class="fg-mode fg-rise-1">
      <span class="fg-line"><span class="fg-title">Descubrimiento</span><span class="fg-eyebrow">1 año</span></span>
      <span class="fg-track"><span class="fg-fill fg-fill-1" /></span>
    </div>
    <div class="fg-mode fg-rise-2">
      <span class="fg-line"><span class="fg-title">Casual</span><span class="fg-eyebrow">Sin salto</span></span>
      <span class="fg-track"><span class="fg-fill fg-fill-2" /></span>
    </div>
    <div class="fg-mode fg-rise-3">
      <span class="fg-line"><span class="fg-title">Personalizado</span><span class="fg-eyebrow">1 semana a 6 meses</span></span>
      <span class="fg-track"><span class="fg-fill fg-fill-3" /></span>
    </div>
  </div>

  <!-- 3 · Calibración: prueba guiada -->
  <div v-else-if="paso === 'calibracion'" class="fg-stage">
    <div class="fg-row fg-rise-1">
      <span class="fg-tile"><AjusteIcon name="calibrar" class="h-6 w-6" /></span>
      <span class="fg-grow"><span class="fg-eyebrow">Prueba guiada</span><span class="fg-title">Escucha y responde</span></span>
    </div>
    <div class="fg-progress">
      <span class="fg-track fg-track-lg"><span class="fg-fill fg-fill-prog" /></span>
      <span class="fg-steps"><i class="fg-step fg-step-1" /><i class="fg-step fg-step-2" /><i class="fg-step fg-step-3" /></span>
    </div>
    <div class="fg-chip fg-pop">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12.6C7 14.4 8.6 16.2 10 18.2C12.6 13.6 15.8 9.6 19.4 6.2" />
      </svg>
      Salto ajustado
    </div>
  </div>

  <!-- 4 · Anuncios: baja el volumen y lo devuelve -->
  <div v-else-if="paso === 'anuncios'" class="fg-stage">
    <div class="fg-row fg-rise-1">
      <span class="fg-tile fg-tile-amber"><FeatureIcon name="silencio" class="h-6 w-6" /></span>
      <span class="fg-grow"><span class="fg-eyebrow">Volumen</span>
        <span class="fg-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
      </span>
    </div>
    <div class="fg-row fg-rise-2">
      <span class="fg-tile fg-tile-amber"><AjusteIcon name="etiqueta" class="h-6 w-6" /></span>
      <span class="fg-grow">
        <span class="fg-eyebrow">Lo detecta por el título</span>
        <span class="fg-words"><i>publicidad</i><i>anuncio</i><i>anuncios</i></span>
      </span>
    </div>
    <div class="fg-slot">
      <span class="fg-chip fg-chip-warn fg-ad">Anuncio detectado: silencio</span>
      <span class="fg-chip fg-chip-ok fg-back">Volumen restaurado</span>
    </div>
  </div>

  <!-- 5 · Temporizador: cuenta atrás y pausa al acabar la canción -->
  <div v-else-if="paso === 'temporizador'" class="fg-stage">
    <div class="fg-row fg-rise-1">
      <span class="fg-tile fg-tile-sky"><AjusteIcon name="reloj" class="h-6 w-6" /></span>
      <span class="fg-grow"><span class="fg-eyebrow">Parar dentro de</span><span class="fg-title">30 min</span></span>
    </div>
    <div class="fg-mode fg-rise-1">
      <span class="fg-line"><span class="fg-title">Tiempo</span><span class="fg-eyebrow">se agota</span></span>
      <span class="fg-track fg-track-lg"><span class="fg-fill fg-fill-time" /></span>
    </div>
    <div class="fg-mode fg-rise-2">
      <span class="fg-line"><span class="fg-title">Canción actual</span><span class="fg-eyebrow">termina</span></span>
      <span class="fg-track fg-track-lg"><span class="fg-fill fg-fill-song" /></span>
    </div>
    <div class="fg-chip fg-chip-sky fg-pop-late">
      <AjusteIcon name="pausa" class="h-4 w-4" />
      Música pausada
    </div>
  </div>

  <!-- 6 · Vista rápida de los paneles plegados -->
  <div v-else class="fg-stage">
    <div class="fg-row fg-rise-1">
      <span class="fg-grow"><span class="fg-title">Salto de duplicadas</span></span>
      <span class="fg-pill">Casual</span>
    </div>
    <div class="fg-row fg-rise-2">
      <span class="fg-grow"><span class="fg-title">Anuncios</span></span>
      <span class="fg-switch"><i /></span>
    </div>
    <div class="fg-row fg-rise-3">
      <span class="fg-grow"><span class="fg-title">Temporizador</span></span>
      <span class="fg-pill fg-pill-press">30 min</span>
    </div>
  </div>
</template>

<script setup>
import AjusteIcon from '@/components/AjusteIcon.vue'
import FeatureIcon from '@/components/FeatureIcon.vue'

/**
 * Escena de cada paso de la guía de Funciones: 'duplicadas', 'modos',
 * 'calibracion', 'anuncios', 'temporizador' o 'rapido'. Sólo CSS, en bucle de
 * `--ciclo` (lo fija GuiaInteractiva). El estilo base es el estado FINAL; los
 * keyframes dibujan cómo se llega. Todo va en flujo normal (nada absoluto
 * encima de otras piezas), para que a 320 px no se solape ni se corte.
 */
defineProps({
  paso: { type: String, required: true }
})
</script>

<style scoped>
.fg-stage {
  display: flex;
  min-height: 176px;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 8px;
  padding: 16px 14px;
}

.fg-eyebrow {
  display: block;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8a8a8a;
}

.fg-title {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
}

.fg-grow { min-width: 0; flex: 1; }

.fg-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.07);
}

.fg-dot {
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
.fg-dot-warn { background: #fb7185; }

.fg-tile {
  display: grid;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  place-items: center;
  border-radius: 10px;
  background: rgba(167, 139, 250, 0.25);
  color: #ddd6fe;
}
.fg-tile-sky { background: rgba(125, 211, 252, 0.22); color: #bae6fd; }
.fg-tile-amber { background: rgba(251, 191, 36, 0.22); color: #fde68a; }

.fg-tag {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 700;
}
.fg-tag-ok { background: rgba(30, 215, 96, 0.18); color: #7ff0a8; }
.fg-tag-warn { background: rgba(251, 113, 133, 0.2); color: #fecdd3; }

/* La canción repetida acaba apagada: es la que se salta. */
.fg-skip { opacity: 0.5; animation-name: fg-skip !important; }

.fg-mode {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 7px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.07);
}

.fg-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.fg-line .fg-eyebrow { text-align: right; }

.fg-track {
  display: block;
  height: 6px;
  overflow: hidden;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.1);
}
.fg-track-lg { height: 8px; }

.fg-fill {
  display: block;
  height: 100%;
  border-radius: 9999px;
  background: #1ed760;
  transform-origin: left;
}
.fg-fill-1 { width: 100%; animation: fg-grow-1 var(--ciclo) ease infinite; }
.fg-fill-2 { width: 0; }
.fg-fill-3 { width: 45%; animation: fg-grow-3 var(--ciclo) ease infinite; }
.fg-fill-prog { width: 100%; animation: fg-grow-1 var(--ciclo) ease infinite; }
.fg-fill-time { width: 0; background: #7dd3fc; animation: fg-time var(--ciclo) linear infinite; }
.fg-fill-song { width: 100%; background: #1ed760; animation: fg-song var(--ciclo) linear infinite; }

.fg-progress { display: flex; flex-direction: column; gap: 8px; padding: 0 2px; }
.fg-steps { display: flex; justify-content: space-between; padding: 0 2px; }
.fg-step {
  width: 9px;
  height: 9px;
  border-radius: 9999px;
  background: #1ed760;
}
.fg-step-1 { animation: fg-step-1 var(--ciclo) ease infinite; }
.fg-step-2 { animation: fg-step-2 var(--ciclo) ease infinite; }
.fg-step-3 { animation: fg-step-3 var(--ciclo) ease infinite; }

.fg-chip {
  display: inline-flex;
  align-items: center;
  align-self: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}
.fg-chip svg { width: 13px; height: 13px; flex-shrink: 0; }
.fg-chip-ok { background: rgba(30, 215, 96, 0.18); color: #7ff0a8; }
.fg-chip-warn { background: rgba(251, 191, 36, 0.2); color: #fde68a; }
.fg-chip-sky { background: rgba(125, 211, 252, 0.18); color: #bae6fd; }
.fg-pop { animation: fg-pop var(--ciclo) ease infinite; }
.fg-pop-late { animation: fg-pop-late var(--ciclo) ease infinite; }

/* Anuncios: barras de volumen y dos carteles que se turnan en el mismo hueco */
.fg-bars {
  display: flex;
  height: 22px;
  align-items: flex-end;
  gap: 4px;
  margin-top: 3px;
}
.fg-bars i {
  width: 8px;
  height: 100%;
  border-radius: 2px;
  background: #fbbf24;
  transform-origin: bottom;
  animation: fg-vol var(--ciclo) ease infinite;
}
.fg-bars i:nth-child(2) { animation-delay: 0.05s; }
.fg-bars i:nth-child(3) { animation-delay: 0.1s; }
.fg-bars i:nth-child(4) { animation-delay: 0.15s; }
.fg-bars i:nth-child(5) { animation-delay: 0.2s; }
.fg-bars i:nth-child(6) { animation-delay: 0.25s; }

.fg-words { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
.fg-words i {
  padding: 1px 8px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
  color: #e5e5e5;
}

.fg-slot { display: grid; justify-items: center; }
.fg-slot > * { grid-area: 1 / 1; }
.fg-ad { animation: fg-ad var(--ciclo) ease infinite; }
.fg-back { animation: fg-back var(--ciclo) ease infinite; }

/* Vista rápida */
.fg-pill {
  flex-shrink: 0;
  padding: 3px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 11px;
  font-weight: 700;
  color: #e5e5e5;
}
.fg-pill-press { border-color: #1ed760; background: rgba(30, 215, 96, 0.14); animation: fg-press var(--ciclo) ease infinite; }

.fg-switch {
  display: flex;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-end;
  padding: 0 3px;
  border-radius: 9999px;
  background: #1ed760;
  animation: fg-switch var(--ciclo) ease infinite;
}
.fg-switch i {
  width: 14px;
  height: 14px;
  border-radius: 9999px;
  background: #fff;
}

/* Entradas escalonadas */
.fg-rise-1 { animation: fg-rise-1 var(--ciclo) ease infinite; }
.fg-rise-2 { animation: fg-rise-2 var(--ciclo) ease infinite; }
.fg-rise-3 { animation: fg-rise-3 var(--ciclo) ease infinite; }

/* ── Fotogramas ─────────────────────────────────────────────────────── */

@keyframes fg-rise-1 {
  0% { opacity: 0; transform: translateY(8px); }
  10%, 92% { opacity: 1; transform: none; }
  100% { opacity: 0; }
}
@keyframes fg-rise-2 {
  0%, 12% { opacity: 0; transform: translateY(8px); }
  22%, 92% { opacity: 1; transform: none; }
  100% { opacity: 0; }
}
@keyframes fg-rise-3 {
  0%, 26% { opacity: 0; transform: translateY(8px); }
  36%, 92% { opacity: 1; transform: none; }
  100% { opacity: 0; }
}
@keyframes fg-skip {
  0%, 12% { opacity: 0; transform: translateY(8px); }
  22%, 40% { opacity: 1; transform: none; background: rgba(251, 113, 133, 0.22); }
  55%, 92% { opacity: 0.5; transform: none; }
  100% { opacity: 0; }
}
@keyframes fg-grow-1 {
  0%, 10% { transform: scaleX(0); }
  40%, 92% { transform: scaleX(1); }
  100% { transform: scaleX(0); }
}
@keyframes fg-grow-3 {
  0%, 30% { transform: scaleX(0); }
  55%, 92% { transform: scaleX(1); }
  100% { transform: scaleX(0); }
}
@keyframes fg-time {
  0%, 8% { width: 100%; }
  60%, 100% { width: 0; }
}
@keyframes fg-song {
  0%, 40% { width: 40%; }
  80%, 100% { width: 100%; }
}
@keyframes fg-step-1 { 0%, 20% { opacity: 0.2; } 28%, 100% { opacity: 1; } }
@keyframes fg-step-2 { 0%, 42% { opacity: 0.2; } 50%, 100% { opacity: 1; } }
@keyframes fg-step-3 { 0%, 64% { opacity: 0.2; } 72%, 100% { opacity: 1; } }
@keyframes fg-pop {
  0%, 74% { opacity: 0; transform: scale(0.8); }
  82% { opacity: 1; transform: scale(1.06); }
  88%, 94% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; }
}
@keyframes fg-pop-late {
  0%, 78% { opacity: 0; transform: scale(0.8); }
  86% { opacity: 1; transform: scale(1.06); }
  90%, 94% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; }
}
@keyframes fg-vol {
  0%, 24% { transform: scaleY(1); }
  32%, 62% { transform: scaleY(0.12); }
  72%, 100% { transform: scaleY(1); }
}
@keyframes fg-ad {
  0%, 26% { opacity: 0; transform: translateY(6px); }
  34%, 58% { opacity: 1; transform: none; }
  66%, 100% { opacity: 0; }
}
@keyframes fg-back {
  0%, 68% { opacity: 0; transform: translateY(6px); }
  76%, 92% { opacity: 1; transform: none; }
  100% { opacity: 0; }
}
@keyframes fg-press {
  0%, 52% { transform: scale(1); }
  58% { transform: scale(0.92); filter: brightness(0.85); }
  66%, 100% { transform: scale(1); filter: none; }
}
@keyframes fg-switch {
  0%, 34% { background: rgba(255, 255, 255, 0.18); justify-content: flex-start; }
  42%, 100% { background: #1ed760; justify-content: flex-end; }
}

@media (prefers-reduced-motion: reduce) {
  .fg-rise-1, .fg-rise-2, .fg-rise-3, .fg-skip, .fg-fill, .fg-step, .fg-pop,
  .fg-pop-late, .fg-bars i, .fg-ad, .fg-pill-press, .fg-switch {
    animation: none !important;
  }

  /* Sin movimiento sólo se ve el estado final: el cartel de anuncio sobra. */
  .fg-ad { display: none; }
  .fg-fill-time { width: 0; }
}
</style>
