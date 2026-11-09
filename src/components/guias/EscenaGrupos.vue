<template>
  <!-- Esquemas animados de la guía de Grupos, uno por paso (prop `paso`). -->

  <!-- 1 · Un grupo: móviles conectados y cifrados -->
  <div v-if="paso === 'grupo'" class="gg-stage">
    <div class="gg-nodes gg-rise-1">
      <span class="gg-av gg-av-a">A</span>
      <i class="gg-link gg-link-1" />
      <span class="gg-av">B</span>
      <i class="gg-link gg-link-2" />
      <span class="gg-av">C</span>
    </div>
    <div class="gg-row gg-rise-2">
      <span class="gg-tile"><AjusteIcon name="escudo" class="h-6 w-6" /></span>
      <span class="gg-grow"><span class="gg-eyebrow">Entre vuestros móviles</span><span class="gg-title">Cifrado, sin servidor</span></span>
    </div>
  </div>

  <!-- 2 · Crear o unirse: código exprés que vale 1 hora -->
  <div v-else-if="paso === 'unirse'" class="gg-stage">
    <div class="gg-row gg-rise-1">
      <span class="gg-tile"><AjusteIcon name="ajustes" class="h-6 w-6" /></span>
      <span class="gg-grow"><span class="gg-eyebrow">Invitación exprés</span><span class="gg-code">K7QM-4TXD</span></span>
    </div>
    <div class="gg-mode gg-rise-2">
      <span class="gg-line"><span class="gg-title">Vale</span><span class="gg-eyebrow">1 hora</span></span>
      <span class="gg-track"><span class="gg-fill gg-fill-time" /></span>
    </div>
    <div class="gg-chip gg-pop"><AjusteIcon name="play" class="h-4 w-4" />Dentro del grupo</div>
  </div>

  <!-- 3 · Resumen: Semana / Mes y podio -->
  <div v-else-if="paso === 'ranking'" class="gg-stage">
    <div class="gg-seg gg-rise-1">
      <span class="gg-seg-a">Semana</span>
      <span class="gg-seg-b">Mes</span>
    </div>
    <div class="gg-podium gg-rise-2">
      <span class="gg-col gg-col-2"><b>2</b></span>
      <span class="gg-col gg-col-1"><b>1</b></span>
      <span class="gg-col gg-col-3"><b>3</b></span>
    </div>
    <div class="gg-chip gg-chip-soft gg-pop-late">Cifras provisionales</div>
  </div>

  <!-- 4 · Escucha común contigo -->
  <div v-else-if="paso === 'comun'" class="gg-stage">
    <div class="gg-mode gg-rise-1">
      <span class="gg-line"><span class="gg-title">Tú</span><span class="gg-eyebrow">Rosalía · Quevedo</span></span>
      <span class="gg-track"><span class="gg-fill gg-fill-full" /></span>
    </div>
    <div class="gg-mode gg-rise-2">
      <span class="gg-line"><span class="gg-title">Ana</span><span class="gg-eyebrow">Rosalía · Bad Bunny</span></span>
      <span class="gg-track"><span class="gg-fill gg-fill-half" /></span>
    </div>
    <div class="gg-chip gg-pop"><AjusteIcon name="cuenta" class="h-4 w-4" />50 % en común</div>
  </div>

  <!-- 5 · Privacidad y app cerrada -->
  <div v-else class="gg-stage">
    <div class="gg-row gg-rise-1">
      <span class="gg-tile gg-tile-sky"><FeatureIcon name="luna" class="h-6 w-6" /></span>
      <span class="gg-grow"><span class="gg-eyebrow">App cerrada</span><span class="gg-title">Se comparte sola</span></span>
    </div>
    <div class="gg-row gg-rise-2">
      <span class="gg-tile gg-tile-sky"><AjusteIcon name="globo" class="h-6 w-6" /></span>
      <span class="gg-grow"><span class="gg-eyebrow">Relays públicos</span><span class="gg-title">Sólo ven IP, hora y tamaño</span></span>
    </div>
    <div class="gg-chip gg-chip-sky gg-pop-late"><AjusteIcon name="escudo" class="h-4 w-4" />Cifrado</div>
  </div>
</template>

<script setup>
import AjusteIcon from '@/components/AjusteIcon.vue'
import FeatureIcon from '@/components/FeatureIcon.vue'

/**
 * Escena de cada paso de la guía de Grupos: 'grupo', 'unirse', 'ranking',
 * 'comun' o 'privacidad'. Sólo CSS, en bucle de `--ciclo` (lo fija
 * GuiaInteractiva). El estilo base es el estado FINAL; los keyframes dibujan
 * cómo se llega. Todo va en flujo normal para que a 320 px no se solape.
 */
defineProps({
  paso: { type: String, required: true }
})
</script>

<style scoped>
.gg-stage {
  display: flex;
  min-height: 176px;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 8px;
  padding: 16px 14px;
}

.gg-eyebrow {
  display: block;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8a8a8a;
}
.gg-title { display: block; font-size: 13px; font-weight: 700; color: #fff; }
.gg-code { display: block; font-family: ui-monospace, monospace; font-size: 15px; font-weight: 800; letter-spacing: 0.12em; color: #fff; }
.gg-grow { min-width: 0; flex: 1; }

.gg-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.07);
}
.gg-tile {
  display: grid;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  place-items: center;
  border-radius: 10px;
  background: rgba(30, 215, 96, 0.22);
  color: #b7f5cf;
}
.gg-tile-sky { background: rgba(125, 211, 252, 0.22); color: #bae6fd; }

/* Móviles conectados */
.gg-nodes { display: flex; align-items: center; justify-content: center; padding: 4px 0 6px; }
.gg-av {
  display: flex;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.14);
  font-size: 15px;
  font-weight: 800;
  color: #fff;
}
.gg-av-a { background: #1ed760; color: #000; }
.gg-link {
  display: block;
  width: 44px;
  height: 0;
  border-top: 2px dashed rgba(30, 215, 96, 0.7);
  animation: gg-link var(--ciclo) linear infinite;
}
.gg-link-2 { animation-delay: 0.3s; }

.gg-mode {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 7px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.07);
}
.gg-line { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; min-width: 0; }
.gg-line .gg-eyebrow { text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gg-track { display: block; height: 8px; overflow: hidden; border-radius: 9999px; background: rgba(255, 255, 255, 0.1); }
.gg-fill { display: block; height: 100%; border-radius: 9999px; background: #1ed760; transform-origin: left; }
.gg-fill-time { width: 0; background: #7dd3fc; animation: gg-time var(--ciclo) linear infinite; }
.gg-fill-full { width: 100%; animation: gg-grow var(--ciclo) ease infinite; }
.gg-fill-half { width: 50%; animation: gg-grow var(--ciclo) ease infinite; }

.gg-chip {
  display: inline-flex;
  align-items: center;
  align-self: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 9999px;
  background: rgba(30, 215, 96, 0.18);
  color: #7ff0a8;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}
.gg-chip-sky { background: rgba(125, 211, 252, 0.18); color: #bae6fd; }
.gg-chip-soft { background: rgba(255, 255, 255, 0.1); color: #e5e5e5; }
.gg-pop { animation: gg-pop var(--ciclo) ease infinite; }
.gg-pop-late { animation: gg-pop-late var(--ciclo) ease infinite; }

/* Selector Semana / Mes */
.gg-seg {
  display: inline-flex;
  align-self: center;
  padding: 2px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 11px;
  font-weight: 700;
}
.gg-seg span { padding: 5px 14px; border-radius: 9999px; color: #cbd5e1; }
.gg-seg-a { background: #1ed760; color: #000 !important; animation: gg-seg-a var(--ciclo) ease infinite; }
.gg-seg-b { animation: gg-seg-b var(--ciclo) ease infinite; }

/* Podio */
.gg-podium { display: flex; align-items: flex-end; justify-content: center; gap: 8px; height: 84px; }
.gg-col {
  display: flex;
  width: 64px;
  align-items: flex-start;
  justify-content: center;
  padding-top: 5px;
  border-radius: 8px 8px 0 0;
  background: linear-gradient(180deg, rgba(30, 215, 96, 0.4), rgba(30, 215, 96, 0.1));
  transform-origin: bottom;
}
.gg-col b { display: block; font-size: 12px; font-weight: 800; color: #fff; }
.gg-col-1 { height: 84px; animation: gg-up var(--ciclo) ease infinite; }
.gg-col-2 { height: 60px; animation: gg-up var(--ciclo) ease 0.1s infinite; }
.gg-col-3 { height: 44px; animation: gg-up var(--ciclo) ease 0.2s infinite; }

.gg-rise-1 { animation: gg-rise-1 var(--ciclo) ease infinite; }
.gg-rise-2 { animation: gg-rise-2 var(--ciclo) ease infinite; }

@keyframes gg-rise-1 {
  0% { opacity: 0; transform: translateY(8px); }
  10%, 92% { opacity: 1; transform: none; }
  100% { opacity: 0; }
}
@keyframes gg-rise-2 {
  0%, 14% { opacity: 0; transform: translateY(8px); }
  26%, 92% { opacity: 1; transform: none; }
  100% { opacity: 0; }
}
@keyframes gg-link {
  0%, 100% { border-top-color: rgba(30, 215, 96, 0.25); }
  50% { border-top-color: rgba(30, 215, 96, 0.95); }
}
@keyframes gg-time {
  0%, 10% { width: 100%; }
  70%, 100% { width: 0; }
}
@keyframes gg-grow {
  0%, 12% { transform: scaleX(0); }
  44%, 92% { transform: scaleX(1); }
  100% { transform: scaleX(0); }
}
@keyframes gg-up {
  0%, 14% { transform: scaleY(0); }
  40%, 92% { transform: scaleY(1); }
  100% { transform: scaleY(0); }
}
@keyframes gg-seg-a {
  0%, 46% { background: #1ed760; }
  54%, 100% { background: transparent; }
}
@keyframes gg-seg-b {
  0%, 46% { background: transparent; color: #cbd5e1; }
  54%, 100% { background: #1ed760; color: #000; }
}
@keyframes gg-pop {
  0%, 62% { opacity: 0; transform: scale(0.8); }
  72% { opacity: 1; transform: scale(1.06); }
  80%, 94% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; }
}
@keyframes gg-pop-late {
  0%, 70% { opacity: 0; transform: scale(0.8); }
  80% { opacity: 1; transform: scale(1.06); }
  86%, 94% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .gg-rise-1, .gg-rise-2, .gg-link, .gg-fill, .gg-col, .gg-pop, .gg-pop-late, .gg-seg-a, .gg-seg-b {
    animation: none !important;
  }
  .gg-fill-time { width: 0; }
}
</style>
