<template>
  <!-- Velo detrás del panel, como el tour de Salbus: oscurece lo justo para
       que el panel mande sin perder de vista la app. -->
  <Transition name="tour-fade">
    <div v-if="visible" class="tour-backdrop fixed inset-0 z-[99]" aria-hidden="true" @click="minimize" />
  </Transition>

  <Transition name="tour-slide">
    <section
      v-if="visible"
      ref="panel"
      class="tour-panel fixed z-[100] mx-auto flex max-w-lg flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Tour de Skippify"
      tabindex="-1"
      @keydown.esc="minimize"
    >
      <header class="flex items-center justify-between gap-3">
        <span class="tour-badge">{{ APP_VERSION }}</span>
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold tabular-nums text-slate-400">{{ state.step + 1 }} / {{ STEPS.length }}</span>
          <button
            type="button"
            class="tour-close"
            aria-label="Cerrar el tour. Podrás retomarlo desde la cabecera"
            @click="minimize"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </header>

      <div class="tour-body">
        <h3 class="text-lg font-extrabold leading-tight tracking-tight text-white">{{ paso.title }}</h3>

        <div class="mt-3">
          <component :is="paso.schema" :key="paso.id" />
        </div>

        <ul class="mt-4 space-y-2">
          <li v-for="punto in paso.points" :key="punto" class="flex items-start gap-2.5 text-sm leading-snug text-slate-300">
            <span class="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden="true" />
            <span>{{ punto }}</span>
          </li>
        </ul>

        <button type="button" class="sk-btn sk-btn-ghost mt-4 w-full" @click="abrirVentana">
          Abrir esta ventana
        </button>
      </div>

      <!-- Un punto por paso; sirven para saltar a cualquiera -->
      <div class="tour-dots">
        <button
          v-for="(p, indice) in STEPS"
          :key="p.id"
          type="button"
          class="tour-dot"
          :class="{ 'is-current': indice === state.step }"
          :aria-label="`Ir al paso ${indice + 1}: ${p.title}`"
          :aria-current="indice === state.step ? 'step' : undefined"
          @click="goTo(indice)"
        />
      </div>

      <div class="grid grid-cols-2 gap-2">
        <button class="sk-btn sk-btn-ghost" :disabled="state.step === 0" @click="prev">
          Anterior
        </button>
        <button v-if="!esUltimo" class="sk-btn sk-btn-primary" @click="next">
          Siguiente
        </button>
        <button v-else class="sk-btn sk-btn-primary" @click="terminar">
          Terminar el tour
        </button>
      </div>
    </section>
  </Transition>
</template>

<script setup>
/**
 * Tour de Skippify: un paso por pantalla, seis en total.
 *
 * Cada paso enseña un esquema de la pantalla (hecho con los mismos
 * componentes y estilos que la app, con datos de ejemplo y sin interacción),
 * unos puntos clave y un botón que lleva a la pantalla de verdad. El estado
 * (paso, minimizado, terminado) vive en `useTour` y se guarda en el navegador.
 * El panel sigue el estilo del tour de Salbus: velo detrás, versión arriba,
 * un punto por paso y los dos botones a lo ancho.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTour } from '@/composables/useTour'
import SchemaInicio from '@/components/tour/SchemaInicio.vue'
import SchemaStats from '@/components/tour/SchemaStats.vue'
import SchemaFunciones from '@/components/tour/SchemaFunciones.vue'
import SchemaComunidad from '@/components/tour/SchemaComunidad.vue'
import SchemaMacros from '@/components/tour/SchemaMacros.vue'
import SchemaAjustes from '@/components/tour/SchemaAjustes.vue'

const props = defineProps({
  /** Algo más importante tapa la app (el bloqueo de permisos): el tour se aparta. */
  suppressed: { type: Boolean, default: false }
})

const router = useRouter()
const { state, next, prev, goTo, minimize, finish } = useTour()
const panel = ref(null)

const APP_VERSION = __APP_VERSION__

const STEPS = [
  {
    id: 'inicio',
    title: 'Inicio',
    route: '/',
    schema: SchemaInicio,
    points: [
      'Aquí ves qué suena ahora, con su avance.',
      'Las tarjetas resumen tu semana.',
      'Más abajo, el historial de lo que has escuchado.'
    ]
  },
  {
    id: 'estadisticas',
    title: 'Estadísticas',
    route: '/stats',
    schema: SchemaStats,
    points: [
      'Rankings de tus canciones y artistas.',
      'Cámbialos entre semana, mes y año.',
      'Rachas de escucha, horas por mes y un mapa de calor con tus horas punta.'
    ]
  },
  {
    id: 'funciones',
    title: 'Funciones',
    route: '/features',
    schema: SchemaFunciones,
    points: [
      'Salta las canciones que ya has oído hace poco.',
      'Elige un modo: Descubrimiento, Casual o Personalizado.',
      'Silencia los anuncios si no tienes Premium.',
      'Programa un temporizador para dormirte con música.'
    ]
  },
  {
    id: 'comunidad',
    title: 'Comunidad',
    route: '/comunidad',
    schema: SchemaComunidad,
    points: [
      'Crea un grupo o únete con un código de 6 caracteres.',
      'Cada domingo se publica el ranking de la semana.',
      'Elige si va con servidor o sin servidor.'
    ]
  },
  {
    id: 'macros',
    title: 'Macros',
    route: '/macros',
    schema: SchemaMacros,
    points: [
      'Encadena un origen, una acción y un destino.',
      'Por ejemplo: copiar las novedades de una playlist a Tus me gusta.',
      'Se ejecutan con la app abierta y recuerdan por dónde iban.'
    ]
  },
  {
    id: 'configuracion',
    title: 'Configuración',
    route: '/settings',
    schema: SchemaAjustes,
    points: [
      'Concede los tres permisos: sin ellos Skippify no oye lo que suena.',
      'Haz copias del historial y restáuralas cuando quieras.',
      'Limpia los datos antiguos.',
      'Para repetir este tour: Ajustes, Ayuda, Tour de la app.'
    ]
  }
]

const visible = computed(() => state.open && !props.suppressed)
const paso = computed(() => STEPS[state.step] || STEPS[0])
const esUltimo = computed(() => state.step === STEPS.length - 1)

/** Lleva a la pantalla de verdad y aparta el tour: se retoma desde la cabecera. */
function abrirVentana () {
  const destino = paso.value.route
  minimize()
  if (router.currentRoute.value.path !== destino) router.push(destino)
}

/** Al terminar, el tour deja al usuario en Configuración: permisos y ajustes. */
function terminar () {
  finish()
  if (router.currentRoute.value.path !== '/settings') router.push('/settings')
}

// Al abrir, el foco pasa al panel para que Escape y el teclado funcionen.
watch(visible, async (abierto) => {
  if (!abierto) return
  await nextTick()
  panel.value?.focus?.()
}, { immediate: true })
</script>

<style scoped>
.tour-backdrop {
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(3px);
}

.tour-panel {
  /* El hueco seguro del sistema se suma al margen: en un móvil con gestos, un
     bottom pelado deja el botón de «Siguiente» bajo la barra de inicio. */
  left: 16px;
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  gap: 14px;
  max-height: 92dvh;
  padding: 14px 16px 18px;
  border-radius: 16px;
  /* Gris sólido, como las hojas de Spotify. */
  background: #242424;
  box-shadow: 0 -12px 60px rgba(0, 0, 0, 0.65);
  outline: none;
}

.tour-badge {
  padding: 3px 10px;
  border-radius: 9999px;
  background: rgba(30, 215, 96, 0.16);
  color: #1ed760;
  font-size: 12px;
  font-weight: 700;
}

.tour-close {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 9999px;
  color: #b3b3b3;
  background: rgba(255, 255, 255, 0.08);
  transition: background 0.15s ease, color 0.15s ease;
}

.tour-close:hover {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

/* El cuerpo crece con el contenido pero nunca se come la pantalla. */
.tour-body {
  min-height: 0;
  overflow-y: auto;
}

.tour-dots {
  display: flex;
  justify-content: center;
  gap: 6px;
}

/* El punto es pequeño, pero la zona pulsable no: el relleno invisible la
   lleva hacia los 24 px sin cambiar el dibujo. */
.tour-dot {
  position: relative;
  width: 7px;
  height: 7px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.22);
  transition: background 0.16s ease, width 0.16s ease;
}

.tour-dot::after {
  content: '';
  position: absolute;
  inset: -9px -3px;
}

.tour-dot:hover {
  background: rgba(255, 255, 255, 0.4);
}

.tour-dot.is-current {
  width: 20px;
  background: #1ed760;
}

.tour-fade-enter-active,
.tour-fade-leave-active {
  transition: opacity 0.2s ease;
}

.tour-fade-enter-from,
.tour-fade-leave-to {
  opacity: 0;
}

.tour-slide-enter-active,
.tour-slide-leave-active {
  transition: opacity 0.24s ease, transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

.tour-slide-enter-from,
.tour-slide-leave-to {
  opacity: 0;
  transform: translateY(16px);
}

@media (prefers-reduced-motion: reduce) {
  .tour-fade-enter-active,
  .tour-fade-leave-active,
  .tour-slide-enter-active,
  .tour-slide-leave-active,
  .tour-dot {
    transition: none;
  }
}
</style>
