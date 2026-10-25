<template>
  <!-- Marco de un esquema: la cabecera y la barra de pestañas de la app real,
       con el contenido de ejemplo en medio. Todo es de adorno: `inert` quita
       el foco y los clics, y se oculta a los lectores de pantalla porque el
       texto del paso ya lo cuenta. -->
  <div class="tour-screen" aria-hidden="true" inert>
    <div class="tour-screen-head">
      <p class="truncate text-sm font-extrabold tracking-tightest text-white">{{ title }}</p>
    </div>

    <div class="tour-screen-body">
      <div class="space-y-3">
        <slot />
      </div>
    </div>

    <nav class="tour-screen-tabs">
      <span
        v-for="t in TABS"
        :key="t.name"
        class="flex flex-1 flex-col items-center gap-0.5 py-1.5"
        :class="t.name === active ? 'text-white' : 'text-slate-500'"
      >
        <NavIcon :name="t.name" :active="t.name === active" class="h-[18px] w-[18px]" />
        <span class="text-[9px] font-bold">{{ t.label }}</span>
      </span>
    </nav>
  </div>
</template>

<script setup>
import NavIcon from '@/components/NavIcon.js'

defineProps({
  title: { type: String, required: true },
  /** Icono de la pestaña resaltada; Configuración no está en la barra. */
  active: { type: String, default: '' }
})

const TABS = [
  { name: 'home', label: 'Inicio' },
  { name: 'bars', label: 'Stats' },
  { name: 'layers', label: 'Funciones' },
  { name: 'trophy', label: 'Grupos' },
  { name: 'bolt', label: 'Macros' }
]
</script>

<style scoped>
.tour-screen {
  position: relative;
  overflow: hidden;
  border-radius: 14px;
  background: #121212;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  pointer-events: none;
  user-select: none;
}

.tour-screen-head {
  padding: 10px 14px 8px;
}

/* La pantalla se corta con un fundido: es un esquema, no la pantalla entera.
   `zoom` encoge los componentes reales sin rehacerlos: caben más cosas y el
   resultado sigue siendo la app, no un dibujo aparte. */
.tour-screen-body {
  zoom: 0.66;
  height: 410px;
  overflow: hidden;
  padding: 0 12px;
  -webkit-mask-image: linear-gradient(to bottom, #000 86%, transparent);
  mask-image: linear-gradient(to bottom, #000 86%, transparent);
}

.tour-screen-tabs {
  display: flex;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  background: #181818;
}
</style>
