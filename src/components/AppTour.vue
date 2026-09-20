<template>
  <Transition name="tour-slide">
    <div
      v-if="modelValue"
      class="tour-dock fixed inset-x-0 bottom-0 z-[100] px-3 sm:px-4"
      role="dialog"
      aria-label="Guía rápida de Skippify"
    >
      <div class="tour-panel mx-auto w-full max-w-2xl">
        <!-- Barra de progreso: primero, porque es lo que sitúa al usuario -->
        <div class="h-1 w-full overflow-hidden rounded-t-shelf bg-white/[0.10]">
          <div
            class="h-full bg-brand-400 transition-all duration-300"
            :style="{ width: `${((stepIndex + 1) / steps.length) * 100}%` }"
          />
        </div>

        <div class="p-4 sm:p-5">
          <div class="mb-3 flex items-start justify-between gap-3">
            <div class="flex min-w-0 items-center gap-3">
              <span
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-400/[0.18] text-lg"
              >{{ currentStep.icon }}</span>
              <div class="min-w-0">
                <p class="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-brand-400">
                  {{ currentStep.eyebrow }}
                </p>
                <h3 class="truncate text-lg font-extrabold leading-tight tracking-tight text-white">{{ currentStep.title }}</h3>
              </div>
            </div>
            <span class="shrink-0 whitespace-nowrap text-xs font-bold tabular-nums text-slate-400">{{ stepIndex + 1 }} / {{ steps.length }}</span>
          </div>

          <div class="tour-body">
            <p class="text-sm leading-relaxed text-slate-300">{{ currentStep.description }}</p>

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
                      @click="activarPermiso(permiso)"
                    >
                      Activar
                    </button>
                    <span
                      v-else
                      class="sk-badge sk-badge-ok shrink-0 self-center uppercase"
                    >Concedido</span>
                  </div>
                </li>
              </ul>

              <p v-else class="mt-3 rounded-card bg-white/[0.05] px-3 py-2.5 text-[11px] leading-relaxed text-slate-400">
                Estás viendo Skippify en el navegador: aquí no hay permisos que conceder.
                En la app de Android este paso te obliga a activarlos antes de terminar.
              </p>

              <p v-if="pistaBateria" class="mt-2.5 text-[11px] leading-relaxed text-amber-300">
                {{ pistaBateria }}
              </p>

              <p v-if="faltanPermisos" class="mt-2.5 text-[11px] leading-relaxed text-amber-300">
                Actívalos todos para terminar la guía.
              </p>
            </template>
          </div>

          <div class="mt-4 flex items-center justify-between gap-2">
            <!-- Salida de emergencia: sólo después de haber intentado conceder
                 lo que falta. Algunas capas de Android no dejan aplicar la
                 exclusión de batería desde la app, y encerrar al usuario en la
                 guía sería peor que dejarle entrar con un permiso pendiente:
                 el banner de Configuración se lo seguirá recordando. -->
            <button
              v-if="mostrarSalida"
              class="px-2 py-1 text-xs text-slate-400 transition-colors hover:text-slate-200"
              @click="handleSkip"
            >
              No puedo activarlo ahora
            </button>
            <span v-else />

            <div class="flex items-center gap-2">
              <button class="sk-btn sk-btn-ghost sk-btn-sm" :disabled="stepIndex === 0" @click="prevStep">
                Atrás
              </button>
              <button
                class="sk-btn sk-btn-primary sk-btn-sm disabled:opacity-40"
                :disabled="!puedeAvanzar"
                @click="nextStep"
              >
                {{ isLastStep ? 'Finalizar' : 'Siguiente' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
/**
 * Guía rápida de Skippify: un paso por pestaña, seis en total.
 *
 * El panel está anclado abajo y no se mueve: cada paso cambia de pestaña detrás
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
  promptPermission,
  recheckPermission,
  refreshSystemPermissions,
  getPlugin
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

/** Un paso por pestaña, en el orden en que se recorren. */
const PASOS = [
  {
    id: 'inicio',
    icon: '🏠',
    eyebrow: 'Pestaña',
    title: 'Inicio',
    description: 'Skippify escucha lo que suena en Spotify y lo convierte en estadísticas y automatismos. Aquí tienes el pulso del día: qué suena ahora, el resumen de la semana, las duplicadas saltadas y el historial completo.',
    route: '/'
  },
  {
    id: 'estadisticas',
    icon: '📊',
    eyebrow: 'Pestaña',
    title: 'Estadísticas',
    description: 'La vista larga: rankings de canciones y artistas por período, rachas de escucha, horas por mes y un mapa de calor con tus horas punta del último año.',
    route: '/stats'
  },
  {
    id: 'funciones',
    icon: '⚙️',
    eyebrow: 'Pestaña',
    title: 'Funciones',
    description: 'Las dos automatizaciones: el salto de canciones duplicadas y el silenciado de anuncios para cuentas gratuitas. Elige ahora cada cuánto puedes repetir una canción, que es lo que gobierna el salto.',
    route: '/features',
    requiereModo: true
  },
  {
    id: 'comunidad',
    icon: '🏆',
    eyebrow: 'Pestaña',
    title: 'Comunidad',
    description: 'Crea un grupo o únete con un código de 6 caracteres. Cada domingo se publica el ranking de lo que habéis escuchado durante la semana.',
    route: '/comunidad'
  },
  {
    id: 'macros',
    icon: '⚡',
    eyebrow: 'Pestaña',
    title: 'Macros',
    description: 'Automatiza tu biblioteca encadenando origen, acción y destino: «las novedades de esta playlist → copiarlas → a Tus me gusta». Se ejecutan con la app abierta y recuerdan por dónde iban.',
    route: '/macros'
  },
  {
    id: 'configuracion',
    icon: '🛡️',
    eyebrow: 'Pestaña',
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

/** Qué hacer a mano cuando Android no deja abrir el ajuste de batería. */
const pistaBateria = ref('')
/** Permisos en los que el usuario ya ha pulsado «Activar». */
const intentados = ref(new Set())

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
 * Los dos pasos obligatorios bloquean el botón de avanzar: el de Funciones
 * hasta elegir modo, el de Configuración hasta tener los tres permisos.
 */
const puedeAvanzar = computed(() => {
  if (currentStep.value?.requiereModo) return !!modoElegido.value
  if (currentStep.value?.permisos) return !faltanPermisos.value
  return true
})

/** La salida de emergencia sólo aparece tras intentar lo que falta. */
const mostrarSalida = computed(() => {
  if (!currentStep.value?.permisos || !faltanPermisos.value) return false
  return permisos.value.every(p => p.granted || intentados.value.has(p.id))
})

async function activarPermiso (permiso) {
  intentados.value = new Set(intentados.value).add(permiso.id)
  const NL = getPlugin()
  if (!NL) return
  try {
    if (permiso.id === 'notif-access') {
      await promptPermission()
    } else if (permiso.id === 'post-notifications') {
      await NL.ensureAllPermissions()
    } else if (permiso.id === 'battery') {
      pistaBateria.value = ''
      const res = await NL.requestIgnoreBatteryOptimization()
      if (res?.granted) {
        batteryOptimizationIgnored.value = true
      } else if (!res?.opened) {
        pistaBateria.value = 'Android no ha dejado abrir el ajuste. Búscalo en Ajustes → Batería → '
          + 'Optimización de batería y marca Skippify como «Sin restricciones».'
      } else if (res.via === 'battery-list') {
        pistaBateria.value = 'Se ha abierto la lista de optimización de batería: elige Skippify y marca «No optimizar».'
      } else if (res.via === 'app-details') {
        pistaBateria.value = 'Se ha abierto la ficha de la app: entra en Batería y marca «Sin restricciones».'
      }
    }
  } catch { /* ignored */ }
  // Android tarda un instante en persistir el cambio al volver de los ajustes.
  setTimeout(() => { refrescarPermisos() }, 800)
}

async function refrescarPermisos () {
  if (!isCapacitor.value) return
  await recheckPermission()
  await refreshSystemPermissions()
  if (batteryOptimizationIgnored.value) pistaBateria.value = ''
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

function handleSkip () {
  emit('complete')
  emit('update:modelValue', false)
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
.tour-dock {
  /* El hueco seguro del sistema se suma al relleno: en un móvil con gestos, un
     bottom:0 pelado deja el botón de «Siguiente» bajo la barra de inicio. */
  padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
}

.tour-panel {
  border-radius: 16px;
  /* Gris sólido, como las hojas de Spotify: una superficie translúcida sobre
     una pantalla llena de tarjetas se volvía ilegible. */
  background: #242424;
  box-shadow: 0 -12px 60px rgba(0, 0, 0, 0.65);
  overflow: hidden;
}

/* El cuerpo crece con el contenido pero nunca se come la pantalla: en el paso
   de permisos son tres tarjetas y en un móvil bajo hay que poder desplazarlas. */
.tour-body {
  max-height: min(46vh, 340px);
  overflow-y: auto;
}

.tour-slide-enter-active,
.tour-slide-leave-active {
  transition: opacity 0.25s ease, transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.tour-slide-enter-from,
.tour-slide-leave-to {
  opacity: 0;
  transform: translateY(16px);
}

@media (prefers-reduced-motion: reduce) {
  .tour-slide-enter-active,
  .tour-slide-leave-active {
    transition: none;
  }
}
</style>
