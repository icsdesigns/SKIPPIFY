<template>
  <!-- Velo detrás del panel, como el tour de Salbus: oscurece lo justo para
       que el panel mande sin ocultar la pestaña de la que se está hablando. -->
  <Transition name="tour-fade">
    <div v-if="modelValue" class="tour-backdrop fixed inset-0 z-[99]" aria-hidden="true" />
  </Transition>

  <Transition name="tour-slide">
    <section
      v-if="modelValue"
      class="tour-panel fixed z-[100] mx-auto flex max-w-lg flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Guía rápida de Skippify"
    >
      <!-- Cabecera: la versión a la izquierda y por dónde vas a la derecha. No
           hay botón de cerrar: dos pasos son obligatorios y saltarlos dejaría
           la app sin modo de escucha ni permisos. -->
      <header class="flex items-center justify-between gap-3">
        <span class="tour-badge">{{ APP_VERSION }}</span>
        <span class="text-xs font-bold tabular-nums text-slate-400">{{ stepIndex + 1 }} / {{ steps.length }}</span>
      </header>

      <div class="tour-body">
        <div class="flex flex-col items-center gap-2 text-center">
          <div class="tour-icon">
            <NavIcon :name="currentStep.icon" class="h-7 w-7" />
          </div>
          <h3 class="text-lg font-extrabold leading-tight tracking-tight text-white">{{ currentStep.title }}</h3>
          <p class="text-sm leading-relaxed text-slate-300">{{ currentStep.description }}</p>
        </div>

        <!-- Paso obligatorio: sin modo elegido no se pasa de aquí. Se
             resuelve dentro del panel para no depender de que la tarjeta de
             Funciones quede visible detrás en pantallas pequeñas. -->
        <template v-if="currentStep.requiereModo">
          <div class="mt-3 grid gap-2 sm:grid-cols-3">
            <button
              v-for="modo in modosEscucha"
              :key="modo.id"
              type="button"
              class="min-w-0 rounded-card border p-3 text-left transition-colors duration-200"
              :class="modoElegido === modo.id ? 'sk-option-active' : 'sk-option'"
              @click="elegirModoEscucha(modo.id)"
            >
              <p class="text-sm font-bold text-white">
                {{ modo.icon }} {{ modo.title }}
              </p>
              <p class="mt-1 text-[11px] leading-relaxed text-slate-400">{{ modo.detail }}</p>
            </button>
          </div>

          <p
            class="mt-2.5 text-[11px] leading-relaxed"
            :class="modoElegido ? 'text-brand-400' : 'text-amber-300'"
          >
            <template v-if="modoElegido">
              Listo: has elegido {{ tituloModo(modoElegido) }}. Puedes cambiarlo cuando
              quieras desde Funciones o desde la notificación persistente.
            </template>
            <template v-else>
              Elige un modo de salto de duplicadas para continuar.
            </template>
          </p>
        </template>

        <!-- Último paso: los permisos. Es el único sitio de la guía donde se
             nombran, para no sacar al usuario a los ajustes del sistema
             antes de haberle enseñado la app. -->
        <template v-if="currentStep.permisos">
          <ul v-if="isCapacitor" class="mt-3 space-y-2">
            <li
              v-for="permiso in permisos"
              :key="permiso.id"
              class="rounded-card border-l-4 bg-white/[0.05] px-3 py-2.5"
              :class="permiso.granted ? 'border-brand-400' : 'border-amber-400'"
            >
              <div class="flex items-start gap-3">
                <span class="mt-0.5 text-base">{{ permiso.granted ? '✅' : '⚠️' }}</span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-bold text-white">{{ permiso.title }}</p>
                  <p class="mt-0.5 text-[11px] leading-relaxed text-slate-400">{{ permiso.detail }}</p>
                </div>
                <button
                  v-if="!permiso.granted"
                  type="button"
                  class="sk-btn sk-btn-primary sk-btn-sm shrink-0 self-center"
                  @click="onActivarPermiso(permiso)"
                >
                  {{ permisoIntentado(permiso.id) ? 'Reintentar' : 'Activar' }}
                </button>
                <span
                  v-else
                  class="sk-badge sk-badge-ok shrink-0 self-center uppercase"
                >Concedido</span>
              </div>

              <!-- Qué hacer a mano. Sólo aparece tras pulsar «Activar» y
                   seguir sin concederse: antes de intentarlo no hay nada
                   que explicar, y salir a los ajustes del sistema es
                   justamente lo que se quiere evitar si el botón basta. -->
              <p
                v-if="ayudaManual(permiso.id, permiso.granted)"
                class="mt-2.5 rounded-md bg-amber-400/[0.14] px-3 py-2 text-[11px] leading-relaxed text-amber-100"
              >
                ✋ {{ ayudaManual(permiso.id, permiso.granted) }}
              </p>
            </li>
          </ul>

          <p v-else class="mt-3 rounded-card bg-white/[0.05] px-3 py-2.5 text-[11px] leading-relaxed text-slate-400">
            Estás viendo Skippify en el navegador: aquí no hay permisos que conceder.
            En la app de Android este paso te obliga a activarlos antes de terminar.
          </p>

          <!-- Qué falta para poder terminar. El texto cambia según si aún
               hay permisos sin intentar o si ya se intentaron todos y
               simplemente Android no los concedió. -->
          <p v-if="!puedeAvanzar" class="mt-2.5 text-[11px] leading-relaxed text-amber-300">
            Pulsa «Activar» en los que falten para terminar la guía.
          </p>
          <p v-else-if="faltanPermisos" class="mt-2.5 text-[11px] leading-relaxed text-slate-400">
            Puedes terminar: los que sigan pendientes te los recordará el aviso de
            Configuración, con las instrucciones para activarlos a mano.
          </p>
        </template>
      </div>

      <!-- Un punto por paso; el actual se alarga -->
      <div class="tour-dots" aria-hidden="true">
        <span
          v-for="(paso, indice) in steps"
          :key="paso.id"
          class="tour-dot"
          :class="{ 'is-current': indice === stepIndex }"
        />
      </div>

      <div class="grid grid-cols-2 gap-2">
        <button class="sk-btn sk-btn-ghost" :disabled="stepIndex === 0" @click="prevStep">
          Atrás
        </button>
        <button
          class="sk-btn sk-btn-primary"
          :disabled="!puedeAvanzar"
          @click="nextStep"
        >
          {{ isLastStep ? 'Empezar' : 'Siguiente' }}
        </button>
      </div>
    </section>
  </Transition>
</template>

<script setup>
/**
 * Guía rápida de Skippify: un paso por pestaña, seis en total.
 *
 * El panel sigue el estilo del tour de Salbus: velo detrás, versión arriba,
 * icono y texto centrados, un punto por paso y los dos botones a lo ancho.
 * Está anclado abajo y no se mueve: cada paso cambia de pestaña detrás
 * para que se vea de lo que se habla, con el texto justo para saber qué hay en
 * cada una. Dos pasos piden algo en lugar de sólo contar: Funciones obliga a
 * elegir modo de salto de duplicadas y Configuración obliga a conceder los
 * permisos. Los permisos NO se nombran antes de ese último paso: concederlos
 * saca al usuario a los ajustes del sistema, y a mitad de recorrido eso dejaba
 * la guía a medias.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useNotifListener } from '@/composables/useNotifListener'
import { useFeatures } from '@/composables/useFeatures'
import NavIcon from '@/components/NavIcon.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'complete', 'step-change', 'toggle-sidebar'])
const router = useRouter()
const {
  notifEnabled,
  postNotifGranted,
  batteryOptimizationIgnored,
  isCapacitor,
  recheckPermission,
  refreshSystemPermissions,
  activarPermiso,
  permisoIntentado,
  permisosResueltos,
  ayudaManual
} = useNotifListener()
const { state: features, setListeningMode } = useFeatures()

/** Los mismos tres modos que la pestaña Funciones, en versión corta. */
const modosEscucha = [
  { id: 'discovery', icon: '🧭', title: 'Descubrimiento', detail: 'No repetir nada en un año.' },
  { id: 'casual', icon: '🎧', title: 'Casual', detail: 'Sin filtros: no se salta nada.' },
  { id: 'custom', icon: '🛠️', title: 'Personalizado', detail: 'Tú decides cada cuánto se repite.' }
]

/** Vacío mientras no se haya elegido nunca: el valor por defecto no cuenta. */
const modoElegido = computed(() => (features.listeningModeChosen ? features.listeningMode : ''))

function tituloModo (id) {
  return modosEscucha.find(m => m.id === id)?.title || id
}

function elegirModoEscucha (id) {
  // Personalizado entra con la frecuencia que ya hubiera guardada; afinarla es
  // cosa de la pestaña Funciones, no de un paso de la guía.
  setListeningMode(id)
}

const APP_VERSION = __APP_VERSION__

/**
 * Un paso por pestaña, en el orden en que se recorren. El icono es el mismo de
 * la barra de navegación, para que el usuario reconozca la pestaña luego.
 */
const PASOS = [
  {
    id: 'inicio',
    icon: 'home',
    title: 'Inicio',
    description: 'Skippify escucha lo que suena en Spotify y lo convierte en estadísticas y automatismos. Aquí tienes el pulso del día: qué suena ahora, el resumen de la semana, las duplicadas saltadas y el historial completo.',
    route: '/'
  },
  {
    id: 'estadisticas',
    icon: 'bars',
    title: 'Estadísticas',
    description: 'La vista larga: rankings de canciones y artistas por período, rachas de escucha, horas por mes y un mapa de calor con tus horas punta del último año.',
    route: '/stats'
  },
  {
    id: 'funciones',
    icon: 'layers',
    title: 'Funciones',
    description: 'Las automatizaciones: el salto de canciones duplicadas, el silenciado de anuncios para cuentas gratuitas y el temporizador para dormirse con música. Elige ahora cada cuánto puedes repetir una canción, que es lo que gobierna el salto.',
    route: '/features',
    requiereModo: true
  },
  {
    id: 'comunidad',
    icon: 'trophy',
    title: 'Comunidad',
    description: 'Crea un grupo o únete con un código de 6 caracteres. Cada domingo se publica el ranking de lo que habéis escuchado durante la semana.',
    route: '/comunidad'
  },
  {
    id: 'macros',
    icon: 'bolt',
    title: 'Macros',
    description: 'Automatiza tu biblioteca encadenando origen, acción y destino: «las novedades de esta playlist → copiarlas → a Tus me gusta». Se ejecutan con la app abierta y recuerdan por dónde iban.',
    route: '/macros'
  },
  {
    id: 'configuracion',
    icon: 'shield',
    title: 'Configuración',
    description: 'Permisos, respaldo e importación del historial y limpieza de datos antiguos. Estos tres permisos son imprescindibles: sin ellos Skippify no puede detectar lo que suena.',
    route: '/settings',
    permisos: true
  }
]

const steps = computed(() => PASOS)

const stepIndex = ref(0)
const currentStep = computed(() => steps.value[stepIndex.value] || steps.value[0])
const isLastStep = computed(() => stepIndex.value === steps.value.length - 1)

const permisos = computed(() => [
  {
    id: 'notif-access',
    title: 'Acceso a notificaciones',
    detail: 'El permiso imprescindible: sin él Skippify no ve qué canción suena.',
    granted: notifEnabled.value
  },
  {
    id: 'post-notifications',
    title: 'Mostrar notificaciones',
    detail: 'Necesario en Android 13 o superior para la notificación persistente con los modos.',
    granted: postNotifGranted.value
  },
  {
    id: 'battery',
    title: 'Sin optimización de batería',
    detail: 'Evita que Android detenga el servicio y se pierdan escuchas en segundo plano.',
    granted: batteryOptimizationIgnored.value
  }
])

const faltanPermisos = computed(() => isCapacitor.value && permisos.value.some(p => !p.granted))

/**
 * Los dos pasos obligatorios bloquean el botón de avanzar, pero con criterios
 * distintos a propósito:
 *
 *  · Funciones exige HABER ELEGIDO modo. Depende sólo del usuario, así que se
 *    puede exigir el resultado.
 *  · Configuración exige HABER INTENTADO cada permiso que falte, no tenerlos
 *    concedidos. Conceder no siempre está en manos del usuario: hay capas de
 *    Android que no dejan abrir el ajuste de batería desde la app, y el permiso
 *    de notificaciones deja de preguntarse tras dos negativas. Exigir el
 *    resultado encerraba al usuario en la guía sin salida posible; en su lugar
 *    se le enseñan las instrucciones manuales y se le deja terminar, que para
 *    eso el banner de Configuración seguirá recordándole lo que queda.
 */
const puedeAvanzar = computed(() => {
  if (currentStep.value?.requiereModo) return !!modoElegido.value
  if (currentStep.value?.permisos) return permisosResueltos(permisos.value)
  return true
})

// La activación y las instrucciones manuales viven en `useNotifListener`: son
// las mismas que usa Configuración, y tenerlas por duplicado ya había hecho que
// sólo el permiso de batería explicara qué hacer cuando fallaba.
function onActivarPermiso (permiso) {
  return activarPermiso(permiso.id)
}

async function refrescarPermisos () {
  if (!isCapacitor.value) return
  await recheckPermission()
  await refreshSystemPermissions()
}

/**
 * Conceder un permiso saca al usuario a los ajustes del sistema: al volver hay
 * que releer el estado o las tarjetas seguirían en «pendiente» y el botón de
 * finalizar seguiría bloqueado.
 */
function onVisibilityChange () {
  if (document.visibilityState !== 'visible') return
  if (props.modelValue && currentStep.value?.permisos) refrescarPermisos()
}

async function irAPaso (indice) {
  stepIndex.value = indice
  const paso = currentStep.value
  emit('step-change', indice)
  if (paso?.route && router.currentRoute.value.path !== paso.route) {
    await router.push(paso.route)
  }
  if (paso?.permisos) await refrescarPermisos()
}

async function nextStep () {
  if (!puedeAvanzar.value) return
  if (isLastStep.value) {
    emit('complete')
    emit('update:modelValue', false)
    return
  }
  await irAPaso(stepIndex.value + 1)
}

async function prevStep () {
  if (stepIndex.value === 0) return
  await irAPaso(stepIndex.value - 1)
}

watch(() => props.modelValue, async (open) => {
  // El menú lateral no se abre durante la guía: el panel explica la pestaña y
  // la pestaña se ve detrás, sin nada que tape la pantalla.
  emit('toggle-sidebar', false)
  if (!open) return
  await irAPaso(0)
})

onMounted(() => {
  document.addEventListener?.('visibilitychange', onVisibilityChange)
  if (props.modelValue) irAPaso(0)
})

onBeforeUnmount(() => {
  document.removeEventListener?.('visibilitychange', onVisibilityChange)
})
</script>

<style scoped>
/* Velo como el de Salbus: oscurece y desenfoca un poco, lo justo para que el
   panel se lea primero sin perder de vista la pestaña que explica. */
.tour-backdrop {
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(3px);
}

.tour-panel {
  /* El hueco seguro del sistema se suma al margen: en un móvil con gestos, un
     bottom pelado deja el botón de «Siguiente» bajo la barra de inicio. */
  left: 16px;
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  gap: 14px;
  max-height: 82dvh;
  padding: 14px 16px 18px;
  border-radius: 16px;
  /* Gris sólido, como las hojas de Spotify: una superficie translúcida sobre
     una pantalla llena de tarjetas se volvía ilegible. */
  background: #242424;
  box-shadow: 0 -12px 60px rgba(0, 0, 0, 0.65);
}

.tour-badge {
  padding: 3px 10px;
  border-radius: 9999px;
  background: rgba(30, 215, 96, 0.16);
  color: #1ed760;
  font-size: 12px;
  font-weight: 700;
}

.tour-icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: rgba(30, 215, 96, 0.16);
  color: #1ed760;
}

/* El cuerpo crece con el contenido pero nunca se come la pantalla: en el paso
   de permisos son tres tarjetas y en un móvil bajo hay que poder desplazarlas. */
.tour-body {
  max-height: min(52vh, 380px);
  overflow-y: auto;
}

.tour-dots {
  display: flex;
  justify-content: center;
  gap: 6px;
}

.tour-dot {
  width: 7px;
  height: 7px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.22);
  transition: background 0.16s ease, width 0.16s ease;
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
