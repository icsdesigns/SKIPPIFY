<template>
  <!-- Sin fondo propio: el lienzo lo pinta `body::before`, y un color
       opaco aquí lo taparía por completo. -->
  <div class="flex min-h-screen">
    <!-- ── Splash de arranque (1,5 s) ─────────────────────────────────────── -->
    <Transition name="splash-fade">
      <div
        v-if="showSplash"
        class="splash fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-black"
      >
        <div class="splash-aurora absolute inset-0" />

        <div class="relative z-10 flex flex-col items-center px-6 text-center">
          <!-- El logo se dibuja de un trazo dentro del disco verde. -->
          <div class="relative mb-8 flex h-28 w-28 items-center justify-center">
            <span class="splash-ring absolute inset-0 rounded-full border border-brand-400/30" />
            <span class="splash-ring splash-ring--delay absolute inset-0 rounded-full border border-brand-400/20" />
            <span class="splash-disc relative flex h-20 w-20 items-center justify-center rounded-full bg-brand-400 shadow-glow">
              <BrandMark class="splash-mark h-11 w-11 text-black" />
            </span>
          </div>

          <h1 class="flex text-5xl font-extrabold tracking-tightest text-white sm:text-6xl">
            <span
              v-for="(char, i) in splashLetters"
              :key="i"
              class="splash-letter"
              :style="{ animationDelay: `${120 + i * 40}ms` }"
            >{{ char }}</span>
          </h1>

          <p class="splash-in splash-in--2 mt-3 text-sm font-semibold text-slate-400">
            Funcionalidades premium para tu Spotify
          </p>

          <!-- La barra recorre exactamente los 1,5 s que dura la pantalla. -->
          <div class="splash-in splash-in--2 mt-8 h-1 w-40 overflow-hidden rounded-full bg-white/10">
            <span class="splash-progress block h-full rounded-full bg-brand-400" />
          </div>
        </div>
      </div>
    </Transition>

    <AppSidebar v-model:open="sidebarOpen" />

    <!-- `min-w-0` es imprescindible: sin él, un hijo ancho (una tabla, un
         nombre largo) estira la columna y saca la página de la pantalla. -->
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- ── Aviso de permisos en el primer arranque ──────────────────────── -->
      <Transition name="modal">
        <div
          v-if="notif.showPermissionsModal.value"
          class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
        >
          <div class="sk-card sk-card-lit my-auto w-full max-w-md p-6">
            <div class="mb-4 flex items-center gap-3">
              <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-400/[0.16] text-xl">🔔</span>
              <div class="min-w-0">
                <h2 class="truncate text-lg font-extrabold tracking-tight text-white">Permisos requeridos</h2>
                <p class="truncate text-[11px] font-semibold text-amber-300">Acceso a notificaciones</p>
              </div>
            </div>
            <p class="mb-2 text-sm leading-relaxed text-slate-300">
              Skippify necesita acceso a las notificaciones del sistema para detectar
              automáticamente las canciones que escuchas en Spotify.
            </p>
            <p class="mb-6 text-sm leading-relaxed text-slate-400">
              Dirígete a la pestaña <span class="font-bold text-white">Configuración</span> para
              revisar y conceder los permisos necesarios.
            </p>
            <div class="flex flex-wrap gap-2">
              <button class="sk-btn sk-btn-primary min-w-0 flex-1" @click="goToSettings">
                Ir a Configuración
              </button>
              <button class="sk-btn sk-btn-ghost sk-btn-sm shrink-0" @click="notif.dismissPermissionsModal()">
                Ahora no
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- ── Cabecera ──────────────────────────────────────────────────────
           Translúcida arriba del todo y sólida en cuanto se hace scroll, igual
           que la de Spotify: el título nunca se lee sobre el contenido que
           pasa por debajo. -->
      <header
        data-tour="app-header"
        class="sk-header sticky top-0 z-30"
        :class="scrolled ? 'sk-header--solid' : ''"
      >
        <div class="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-400 shadow-glow md:hidden">
            <BrandMark class="h-[22px] w-[22px] text-black" />
          </div>

          <div class="min-w-0 flex-1">
            <h1 class="truncate text-xl font-extrabold leading-tight tracking-tightest text-white sm:text-2xl">
              {{ currentTabTitle }}
            </h1>
            <p class="sk-clamp-2 mt-0.5 text-[11px] leading-snug text-slate-400 sm:text-xs">
              {{ currentTabDescription }}
            </p>
          </div>

          <!-- Estado en vivo, siempre visible sin volver a Inicio. -->
          <span
            class="hidden shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold lg:inline-flex"
            :class="statusPill.classes"
          >
            <span class="h-2 w-2 rounded-full" :class="statusPill.dot" />
            {{ statusPill.label }}
          </span>

          <!-- Configuración no cabe en la barra de pestañas: vive aquí, como el
               engranaje de Spotify. -->
          <button
            type="button"
            class="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-slate-300 transition-colors hover:bg-white/[0.16] hover:text-white md:hidden"
            aria-label="Configuración"
            @click="router.push('/settings')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span
              v-if="ajustesPendientes.length"
              class="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-rose-400 ring-2 ring-ink-800"
            />
          </button>
        </div>

        <!-- ── Aviso de ajustes pendientes ───────────────────────────────────
             Un permiso sin conceder deja el motor a medias sin decir nada. El
             banner es el aviso, y pulsarlo lleva a donde se arregla. -->
        <button
          v-if="ajustesPendientes.length && !showTour && route.path !== '/settings'"
          type="button"
          class="flex w-full items-center gap-3 bg-amber-400/[0.14] px-4 py-2.5 text-left transition-colors hover:bg-amber-400/[0.22] sm:px-6"
          @click="router.push('/settings')"
        >
          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400/25 text-sm">⚠️</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-xs font-bold text-amber-100">
              {{ ajustesPendientes.length === 1 ? 'Falta un ajuste por activar' : `Faltan ${ajustesPendientes.length} ajustes por activar` }}
            </span>
            <span class="block truncate text-[11px] text-amber-200/80">{{ ajustesPendientesTexto }}</span>
          </span>
          <span class="shrink-0 text-[11px] font-bold text-amber-200">Configurar →</span>
        </button>
      </header>

      <main class="sk-main mx-auto w-full max-w-7xl flex-1 px-4 pt-5 sm:px-6">
        <router-view v-slot="{ Component }">
          <Transition name="view" mode="out-in">
            <component
              :is="Component"
              :now-playing="nowPlaying"
              @update-now-playing="setNowPlaying"
            />
          </Transition>
        </router-view>
      </main>

      <UpdateBanner />

      <AppTour
        v-model="showTour"
        @complete="completeTour"
        @toggle-sidebar="handleTourSidebarToggle"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import AppTour from '@/components/AppTour.vue'
import UpdateBanner from '@/components/UpdateBanner.vue'
import BrandMark from '@/components/BrandMark.vue'
import { useNotifListener } from '@/composables/useNotifListener'
import { useFeatures } from '@/composables/useFeatures'
import { useAppUpdate } from '@/composables/useAppUpdate'
import { useLeague } from '@/composables/useLeague'

// Vestigio del cajón lateral que había en móvil, ahora sustituido por la barra
// de pestañas inferior. Se conserva porque la guía rápida sigue emitiendo
// «ciérralo» al arrancar (AppTour → toggle-sidebar) y AppSidebar sigue
// declarando la prop: quitarlo obligaría a tocar ese contrato a cambio de nada.
const sidebarOpen = ref(false)
const notif = useNotifListener()
const { initializeNativeFeatures } = useFeatures()
const update = useAppUpdate()
const league = useLeague()
const nowPlaying = ref({ mode: 'stopped' })
const router = useRouter()
const route = useRoute()
const showTour = ref(false)
const showSplash = ref(true)
const scrolled = ref(false)
const TOUR_DONE_KEY = `skippify.tour.build.${__APP_BUILD_ID__}.completed`
const SPLASH_MS = 1500
const splashLetters = 'Skippify'.split('')

/** Ajustes del sistema pendientes; alimenta el banner de aviso. */
const ajustesPendientes = notif.missingSystemSettings
const ajustesPendientesTexto = computed(() => {
  const lista = ajustesPendientes.value
  if (lista.length <= 1) return `Falta ${lista[0] || ''}.`
  return `Faltan ${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}.`
})

const currentTabTitle = computed(() => route.meta?.title || 'Skippify')
const currentTabDescription = computed(() => route.meta?.description || 'Funcionalidades premium para tu Spotify')

const statusPill = computed(() => {
  const mode = nowPlaying.value?.mode
  if (mode === 'playing') {
    return {
      label: 'Reproduciendo',
      classes: 'bg-brand-400/[0.18] text-brand-200',
      dot: 'bg-brand-400 animate-pulse'
    }
  }
  if (mode === 'paused') {
    return {
      label: 'En pausa',
      classes: 'bg-amber-400/[0.16] text-amber-200',
      dot: 'bg-amber-300'
    }
  }
  return {
    label: 'Sin reproducción',
    classes: 'bg-white/[0.08] text-slate-300',
    dot: 'bg-slate-600'
  }
})

let splashTimer = null
let tourTimer = null

function setNowPlaying (state) {
  nowPlaying.value = state
}

function handleTourSidebarToggle (open) {
  sidebarOpen.value = !!open
}

function goToSettings () {
  notif.dismissPermissionsModal()
  router.push('/settings')
}

function completeTour () {
  localStorage.setItem(TOUR_DONE_KEY, '1')
  // La guía ha terminado (en su paso de permisos): a partir de aquí el aviso de
  // permisos del arranque vuelve a poder aparecer.
  notif.setPermissionsPromptSuppressed(false)
}

/**
 * La cabecera se vuelve sólida en cuanto hay contenido por debajo. El umbral es
 * bajo a propósito: con 8 px basta para que ya no se solape nada legible.
 */
function onScroll () {
  scrolled.value = (window.scrollY || 0) > 8
}

let userNavigated = false

// Si el usuario (o la notificación nativa) navega durante el splash, no se le
// devuelve a Inicio a la fuerza.
const stopNavWatch = router.afterEach(() => { userNavigated = true })

onMounted(async () => {
  // Se decide antes de tocar el nativo: si la guía va a salir, el aviso de
  // permisos no debe adelantársele. Conceder permisos manda al usuario fuera de
  // la app y la guía no se recupera, así que va al final y sin competencia.
  const tourPending = localStorage.getItem(TOUR_DONE_KEY) !== '1'
  notif.setPermissionsPromptSuppressed(tourPending)

  splashTimer = setTimeout(() => {
    if (!userNavigated && router.currentRoute.value.path !== '/') {
      router.replace('/')
    }
    showSplash.value = false
  }, SPLASH_MS)

  await initializeNativeFeatures()
  await notif.checkAndInit(setNowPlaying)
  await notif.refreshSystemPermissions()
  document.addEventListener('visibilitychange', onVisibleAgain)
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()

  const requestedRoute = notif.consumePendingOpenRoute()
  if (requestedRoute) router.replace(requestedRoute)

  // Se comprueba al final: nunca debe retrasar el arranque ni el splash, y si
  // no hay red simplemente no pasa nada.
  update.initialize()

  // Avisa de los resultados de la comunidad sin tener que entrar en la pestaña.
  // Si el usuario no pertenece a ningún grupo no sale ni una petición.
  league.startPublishedResultsWatch()

  if (tourPending) {
    tourTimer = setTimeout(() => {
      showTour.value = true
    }, SPLASH_MS + 350)
  }
})

watch(() => notif.pendingOpenRoute.value, (route) => {
  if (!route) return
  notif.consumePendingOpenRoute()
  if (router.currentRoute.value.path !== route) router.replace(route)
})

// Cada cambio de pestaña vuelve arriba: si no, se entra a media pantalla en la
// vista nueva y la cabecera aparece ya en modo sólido sin motivo.
watch(() => route.path, () => {
  if (typeof window === 'undefined') return
  window.scrollTo({ top: 0, behavior: 'auto' })
  scrolled.value = false
})

function onVisibleAgain () {
  if (document.visibilityState !== 'visible') return
  notif.refreshSystemPermissions()
  // Volver a la app es el momento más probable de haberse perdido una
  // publicación: el temporizador no corre mientras el proceso está dormido.
  void league.checkPublishedResults()
}

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibleAgain)
  window.removeEventListener('scroll', onScroll)
  league.stopPublishedResultsWatch()
  if (splashTimer) clearTimeout(splashTimer)
  if (tourTimer) clearTimeout(tourTimer)
  stopNavWatch()
})
</script>

<style>
/* ── Cabecera adherida ───────────────────────────────────────────────────── */
.sk-header {
  transition: background-color 0.25s ease, box-shadow 0.25s ease;
  background-color: transparent;
}

.sk-header--solid {
  background-color: rgba(18, 18, 18, 0.88);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
}

/* ── Zona de contenido ───────────────────────────────────────────────────
   El relleno inferior deja sitio a la barra de pestañas en móvil (y al hueco
   seguro del sistema). En escritorio no hay barra, así que basta un respiro. */
.sk-main {
  padding-bottom: calc(var(--sk-tabbar-h) + var(--sk-safe-bottom) + 1.5rem);
}

@media (min-width: 768px) {
  .sk-main {
    padding-bottom: 3.5rem;
  }
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

/* Cambio de pestaña: un desplazamiento corto, sin llegar a parecer una carga. */
.view-enter-active {
  transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}
.view-leave-active {
  transition: opacity 0.12s ease;
}
.view-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.view-leave-to {
  opacity: 0;
}

.splash-fade-enter-active,
.splash-fade-leave-active {
  transition: opacity 0.35s ease, transform 0.35s ease;
}

.splash-fade-enter-from,
.splash-fade-leave-to {
  opacity: 0;
}

.splash-fade-leave-to {
  transform: scale(1.05);
}

/* ── Splash de 1,5 s ──────────────────────────────────────────────────────
   Todos los tiempos caben dentro de la ventana: el trazo del logo termina a los
   0,62 s, el texto entra hasta 0,58 s y la barra cierra justo al desaparecer.
   ────────────────────────────────────────────────────────────────────────── */
.splash-aurora {
  background: radial-gradient(760px 520px at 50% 40%, rgba(30, 215, 96, 0.20), transparent 68%);
  animation: splash-aurora 1.5s ease-out both;
}

.splash-disc {
  animation: splash-disc 0.7s cubic-bezier(0.34, 1.45, 0.64, 1) both;
}

.splash-ring {
  animation: splash-ring 1.2s ease-out infinite;
}

.splash-ring--delay {
  animation-delay: 0.6s;
}

/* La «S» se dibuja sola, de un trazo.

   40 supera holgadamente la longitud de cada arco —ninguno llega a 20 en un
   lienzo de 24—, así que basta para recorrerlos enteros sin medirlos por JS.
   `stroke-dasharray` se aplica a cada subtrazo por separado, de modo que los
   dos bucles de la «S» se dibujan a la vez y se encuentran en la cintura. */
.splash-mark .sk-mark-s {
  stroke-dasharray: 40;
  stroke-dashoffset: 40;
  animation: splash-draw 0.78s cubic-bezier(0.33, 1, 0.68, 1) 0.06s forwards;
}

.splash-letter {
  display: inline-block;
  white-space: pre;
  opacity: 0;
  animation: splash-letter 0.4s cubic-bezier(0.22, 1.2, 0.36, 1) both;
}

.splash-in {
  opacity: 0;
  animation: splash-in 0.4s ease-out both;
}

.splash-in--1 { animation-delay: 0.06s; }
.splash-in--2 { animation-delay: 0.5s; }

.splash-progress {
  width: 0;
  animation: splash-progress 1.5s cubic-bezier(0.35, 0.6, 0.3, 1) forwards;
}

@keyframes splash-aurora {
  from { opacity: 0.25; transform: scale(0.94); }
  to   { opacity: 1; transform: scale(1.06); }
}

@keyframes splash-disc {
  0%   { opacity: 0; transform: scale(0.55) rotate(-14deg); }
  65%  { opacity: 1; transform: scale(1.07) rotate(3deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); }
}

@keyframes splash-ring {
  0%   { opacity: 0.6; transform: scale(0.82); }
  100% { opacity: 0; transform: scale(1.3); }
}

@keyframes splash-draw {
  from { stroke-dashoffset: 40; opacity: 0.4; }
  to   { stroke-dashoffset: 0; opacity: 1; }
}

@keyframes splash-letter {
  from { opacity: 0; transform: translateY(14px); filter: blur(5px); }
  to   { opacity: 1; transform: translateY(0); filter: blur(0); }
}

@keyframes splash-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes splash-progress {
  from { width: 0; }
  to   { width: 100%; }
}

/* Respeta la preferencia del sistema: sin movimiento, sólo aparición. */
@media (prefers-reduced-motion: reduce) {
  .splash-aurora,
  .splash-disc,
  .splash-ring,
  .splash-letter,
  .splash-in,
  .splash-progress,
  .splash-mark .sk-mark-s {
    animation: none !important;
    opacity: 1;
  }
  .splash-progress { width: 100%; }
  .splash-mark .sk-mark-s { stroke-dashoffset: 0; }
}
</style>
