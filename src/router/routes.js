/**
 * Tabla de rutas de la aplicación.
 *
 * Vive separada de `index.js` porque `createWebHashHistory()` toca
 * `window.location` al construirse: el render de comprobación en Node
 * (scripts/smoke-ssr.mjs) necesita las rutas sin crear ese router.
 */
import DashboardView from '@/views/DashboardView.vue'
import SettingsView from '@/views/SettingsView.vue'
import FeaturesView from '@/views/FeaturesView.vue'
import StatsView from '@/views/StatsView.vue'
import CommunityView from '@/views/CommunityView.vue'
import CalibrationView from '@/views/CalibrationView.vue'
import MacrosView from '@/views/MacrosView.vue'

export const routes = [
  {
    path: '/',
    name: 'dashboard',
    component: DashboardView,
    meta: {
      title: 'Inicio'
    }
  },
  {
    path: '/stats',
    name: 'stats',
    component: StatsView,
    meta: {
      title: 'Estadísticas'
    }
  },
  {
    path: '/settings',
    name: 'settings',
    component: SettingsView,
    meta: {
      title: 'Configuración'
    }
  },
  {
    path: '/features',
    name: 'features',
    component: FeaturesView,
    meta: {
      title: 'Funciones'
    }
  },
  {
    // «Modos» se fusionó con «Funciones»: el modo de escucha manda sobre el
    // salto de duplicadas y no tenía sentido leerlo en otra pestaña.
    path: '/modes',
    redirect: '/features'
  },
  {
    path: '/comunidad',
    name: 'comunidad',
    component: CommunityView,
    meta: {
      title: 'Grupos'
    }
  },
  {
    // La pestaña se llamó «Liga» hasta la v3.4 y «Friendly-Wrapped» hasta la v3.9:
    // un acceso directo guardado o la ruta que recuerda la WebView aún apunta ahí.
    path: '/friendly-wrapped',
    redirect: '/comunidad'
  },
  {
    path: '/league',
    redirect: '/comunidad'
  },
  {
    path: '/macros',
    name: 'macros',
    component: MacrosView,
    meta: {
      title: 'Macros'
    }
  },
  {
    path: '/calibration',
    name: 'calibration',
    component: CalibrationView,
    meta: {
      title: 'Calibración de salto'
    }
  },
  {
    // La pestaña se llamaba «Desarrollo»: un acceso directo guardado o la ruta
    // recordada por la WebView seguiría apuntando aquí.
    path: '/dev',
    redirect: '/calibration'
  },
  {
    // Un hash antiguo o desconocido (p. ej. #/claude, guardado por la WebView)
    // dejaba la pantalla en blanco al no coincidir con ninguna ruta.
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]
