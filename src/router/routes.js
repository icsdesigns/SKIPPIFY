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
      title: 'Inicio',
      description: 'Qué suena ahora, cómo va tu semana y el historial completo de reproducciones.'
    }
  },
  {
    path: '/stats',
    name: 'stats',
    component: StatsView,
    meta: {
      title: 'Estadísticas',
      description: 'Analiza tus reproducciones, artistas y géneros con mayor detalle.'
    }
  },
  {
    path: '/settings',
    name: 'settings',
    component: SettingsView,
    meta: {
      title: 'Configuración',
      description: 'Gestiona permisos, respaldos y parámetros clave de funcionamiento de la app.'
    }
  },
  {
    path: '/features',
    name: 'features',
    component: FeaturesView,
    meta: {
      title: 'Funciones',
      description: 'Salto de duplicadas, silenciado de anuncios y temporizador, con la calibración del motor a mano.'
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
      title: 'Comunidad',
      description: 'Crea o únete a un grupo y compara tu resumen de escucha con el de tus amigos.'
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
      title: 'Macros',
      description: 'Automatiza tu biblioteca encadenando origen, acción y destino.'
    }
  },
  {
    path: '/calibration',
    name: 'calibration',
    component: CalibrationView,
    meta: {
      title: 'Calibración de salto',
      description: 'Ejecuta el asistente guiado o ajusta a mano cada parámetro del motor de duplicadas.'
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
