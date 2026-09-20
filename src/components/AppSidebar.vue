<template>
  <!-- ── Escritorio · barra lateral negra con estantes ───────────────────────
       El patrón de Spotify: fondo a negro puro, y dentro dos «estantes»
       redondeados en gris. La jerarquía la da la superficie, no los bordes. -->
  <aside
    :class="[
      // Adherida y a pantalla completa, como la de Spotify: el contenido pasa
      // por debajo y la navegación nunca se va con el scroll. Se usa 'sticky' y
      // no 'fixed' para no tener que reservar el hueco a mano.
      'hidden shrink-0 flex-col gap-2 bg-ink-900 p-2 md:sticky md:top-0 md:flex md:h-screen',
      'transition-[width] duration-300 ease-in-out',
      collapsed ? 'md:w-[5.5rem]' : 'md:w-[16.5rem]'
    ]"
  >
    <!-- Estante 1 · identidad -->
    <div class="rounded-shelf bg-ink-700 px-3 py-3">
      <router-link
        to="/"
        class="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        :class="collapsed ? 'justify-center' : ''"
        :title="collapsed ? 'Skippify' : ''"
      >
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-400 shadow-glow">
          <BrandMark class="h-5 w-5 text-black" />
        </span>
        <span v-if="!collapsed" class="min-w-0 overflow-hidden">
          <span class="block truncate text-[15px] font-extrabold leading-none tracking-tight text-white">Skippify</span>
          <span class="mt-1 block truncate text-[10px] leading-none text-slate-400">Premium para tu Spotify</span>
        </span>
      </router-link>
    </div>

    <!-- Estante 2 · navegación -->
    <div class="flex min-h-0 flex-1 flex-col rounded-shelf bg-ink-700">
      <div
        class="flex items-center justify-between px-3 pt-3 pb-1"
        :class="collapsed ? 'justify-center' : ''"
      >
        <p v-if="!collapsed" class="truncate px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
          Tu Skippify
        </p>
        <button
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-white"
          :title="collapsed ? 'Expandir menú' : 'Contraer menú'"
          :aria-label="collapsed ? 'Expandir menú' : 'Contraer menú'"
          @click="collapsed = !collapsed"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transition-transform duration-300"
            :class="collapsed ? 'rotate-0' : 'rotate-180'"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <nav data-tour="sidebar-nav" class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden p-2">
        <router-link
          v-for="item in desktopItems"
          :key="item.to"
          :to="item.to"
          custom
          v-slot="{ isActive, navigate }"
        >
          <button
            :data-tour="item.tour"
            :title="collapsed ? item.label : ''"
            class="group relative flex w-full items-center gap-3 rounded-lg transition-colors duration-150"
            :class="[
              collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5',
              navClasses(item, isActive)
            ]"
            @click="navigate()"
          >
            <span class="shrink-0" :class="iconClasses(item, isActive)">
              <NavIcon :name="item.icon" :active="isActive" />
            </span>

            <span v-if="!collapsed" class="min-w-0 flex-1 overflow-hidden text-left">
              <span class="block truncate text-sm font-bold leading-tight">{{ item.label }}</span>
              <span class="mt-0.5 block truncate text-[10px] leading-tight text-slate-500">{{ item.hint }}</span>
            </span>

            <!-- Aviso de permisos: un punto, no un bloque rojo. Informa sin
                 gritar, y en modo contraído sigue viéndose. -->
            <span
              v-if="item.highlight && needsPermissions"
              class="absolute h-2 w-2 rounded-full bg-rose-400 ring-2 ring-ink-700"
              :class="collapsed ? 'right-3 top-2' : 'right-3 top-1/2 -translate-y-1/2'"
            />

            <!-- Rótulo flotante cuando el menú está contraído -->
            <span
              v-if="collapsed"
              class="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md bg-ink-400 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lift transition-opacity duration-150 group-hover:opacity-100"
            >{{ item.label }}</span>
          </button>
        </router-link>
      </nav>

      <p
        v-if="!collapsed"
        class="truncate border-t border-white/[0.07] px-4 py-3 text-[10px] text-slate-500"
      >{{ APP_SIGNATURE }}</p>
    </div>
  </aside>

  <!-- ── Móvil · barra de pestañas inferior ──────────────────────────────────
       Sustituye al cajón lateral. El pulgar llega solo, la pestaña activa se ve
       sin abrir nada y se gana el gesto de deslizar desde el borde, que en
       Android es «atrás» y chocaba con el cajón. Configuración no va aquí: vive
       en el botón de la cabecera, como el engranaje de Spotify. -->
  <nav
    class="sk-tabbar fixed inset-x-0 bottom-0 z-40 md:hidden"
    aria-label="Navegación principal"
  >
    <div class="flex items-stretch justify-around gap-0.5 px-1 pt-1.5">
      <router-link
        v-for="item in mobileItems"
        :key="item.to"
        :to="item.to"
        custom
        v-slot="{ isActive, navigate }"
      >
        <button
          :data-tour="item.tour"
          class="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 transition-colors duration-150"
          :class="isActive ? 'text-white' : 'text-slate-400 active:text-white'"
          :aria-current="isActive ? 'page' : undefined"
          @click="navigate(); $emit('update:open', false)"
        >
          <NavIcon :name="item.icon" :active="isActive" class="h-[22px] w-[22px]" />
          <span class="w-full truncate text-center text-[10px] font-bold leading-none">{{ item.short }}</span>
        </button>
      </router-link>
    </div>
  </nav>
</template>

<script setup>
import { computed, h, ref } from 'vue'
import BrandMark from '@/components/BrandMark.vue'
import { useNotifListener } from '@/composables/useNotifListener'

// `open` se conserva aunque el cajón ya no exista: la guía rápida emite
// «ciérralo» al arrancar y App.vue sigue pasándolo. Quitar la prop obligaría a
// tocar ese contrato sin ganar nada.
defineProps({ open: Boolean })
defineEmits(['update:open'])

const collapsed = ref(false)
const APP_VERSION = __APP_VERSION__
const APP_SIGNATURE = `Skippify ${APP_VERSION}`

const notif = useNotifListener()

/**
 * Trazos de cada icono, en dos versiones: contorno para el estado normal y
 * relleno para el activo. Es el recurso que usa Spotify para marcar la pestaña
 * en la que estás sin recurrir al color, de modo que también se distingue en
 * escala de grises.
 *
 * Antes cada entrada del menú llevaba su SVG escrito a mano DOS veces
 * (escritorio y móvil): al tocar la navegación era muy fácil que ambas listas
 * dejaran de coincidir.
 */
const ICON_PATHS = {
  home: [['path', { d: 'M4 10.5 12 3.5l8 7V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z' }]],
  bars: [
    ['line', { x1: 4, y1: 20, x2: 20, y2: 20 }],
    ['rect', { x: 6, y: 11, width: 3, height: 6 }],
    ['rect', { x: 11, y: 8, width: 3, height: 9 }],
    ['rect', { x: 16, y: 5, width: 3, height: 12 }]
  ],
  layers: [
    ['path', { d: 'M12 2 2 7l10 5 10-5-10-5z' }],
    ['path', { d: 'M2 17l10 5 10-5' }],
    ['path', { d: 'M2 12l10 5 10-5' }]
  ],
  trophy: [
    ['circle', { cx: 12, cy: 8, r: 4 }],
    ['path', { d: 'M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6' }],
    ['path', { d: 'M2 12h4' }],
    ['path', { d: 'M18 12h4' }]
  ],
  bolt: [['path', { d: 'M13 2 4.5 13.5H11l-1 8.5L18.5 10.5H12l1-8.5z' }]],
  shield: [['path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }]]
}

/** Iconos que quedan bien rellenos al estar activos (silueta cerrada). */
const FILLABLE = new Set(['home', 'trophy', 'bolt', 'shield', 'layers'])

const NavIcon = (props) => {
  const filled = props.active && FILLABLE.has(props.name)
  return h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      class: props.class || 'h-5 w-5',
      viewBox: '0 0 24 24',
      fill: filled ? 'currentColor' : 'none',
      stroke: 'currentColor',
      'stroke-width': filled ? 1.5 : 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true'
    },
    (ICON_PATHS[props.name] || []).map(([tag, attrs]) => h(tag, attrs))
  )
}
NavIcon.props = ['name', 'active', 'class']

const BASE_ITEMS = [
  { to: '/', label: 'Inicio', short: 'Inicio', hint: 'Métricas y reproducciones', icon: 'home', tour: 'dashboard-nav' },
  { to: '/stats', label: 'Estadísticas', short: 'Stats', hint: 'Top artistas y canciones', icon: 'bars', tour: 'stats-nav' },
  { to: '/features', label: 'Funciones', short: 'Funciones', hint: 'Salto y anuncios', icon: 'layers', tour: 'features-nav' },
  { to: '/comunidad', label: 'Comunidad', short: 'Grupos', hint: 'Grupos y ranking entre amigos', icon: 'trophy', tour: 'community-nav' },
  // Macros ya no se puede ocultar desde Configuración: era el único conmutador
  // de la sección y escondía una pestaña entera sin ganar nada a cambio.
  { to: '/macros', label: 'Macros', short: 'Macros', hint: 'Automatiza tu biblioteca', icon: 'bolt' }
]

// «Calibración de salto» no aparece aquí a propósito: se entra desde el panel
// de calibración de la pestaña Funciones, que es donde el problema se nota.

const SETTINGS_ITEM = {
  to: '/settings',
  label: 'Configuración',
  short: 'Ajustes',
  hint: 'Permisos y respaldos',
  icon: 'shield',
  tour: 'settings-nav',
  highlight: true
}

// En escritorio Configuración cierra la lista; en móvil no entra en la barra de
// pestañas (cinco es el tope antes de que los rótulos dejen de leerse) y se
// alcanza por el botón de la cabecera.
const desktopItems = computed(() => [...BASE_ITEMS, SETTINGS_ITEM])
const mobileItems = computed(() => [...BASE_ITEMS])

const needsPermissions = computed(() => {
  if (!notif.isCapacitor.value) return false
  if (!notif.notifChecked.value) return true
  return !notif.notifEnabled.value
})

/**
 * Activo = texto blanco sobre una superficie algo más clara. Spotify no tiñe la
 * entrada activa de color: la ilumina. Así el verde queda reservado para lo que
 * de verdad es una acción.
 */
function navClasses (item, isActive) {
  if (isActive) return 'bg-white/[0.12] text-white'
  return 'text-slate-400 hover:bg-white/[0.07] hover:text-white'
}

function iconClasses (item, isActive) {
  if (item.highlight && needsPermissions.value) return 'text-rose-200'
  return isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
}
</script>

<style scoped>
/* La barra inferior se apoya en un degradado hacia negro: el contenido que pasa
   por debajo se desvanece en vez de cortarse en una línea dura. El hueco seguro
   del sistema (gestos de Android, isla dinámica) se suma al relleno. */
.sk-tabbar {
  padding-bottom: calc(0.35rem + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.78) 0%, #000 42%);
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
</style>
