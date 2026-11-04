<template>
  <FeaturePanel
    data-ajuste="escuchas-api"
    title="Escuchas desde Spotify"
    subtitle="También las de otros dispositivos de tu cuenta."
    icon-class="bg-brand-400/[0.18] text-brand-400"
  >
    <template #icono><AjusteIcon name="antena" class="h-5 w-5" /></template>
    <template #estado>
      <span class="sk-chip" :class="activo ? 'sk-chip-accent' : ''">{{ activo ? 'Activado' : 'Desactivado' }}</span>
    </template>

    <div class="space-y-3">
      <p v-if="!isNative" class="text-[11px] text-slate-500">
        Sólo disponible en la app instalada.
      </p>

      <template v-else>
        <p class="text-xs leading-relaxed text-slate-300">
          Skippify consulta a Spotify cada pocos minutos qué has escuchado y lo suma a tu historial,
          sea cual sea el dispositivo. Las notificaciones siguen siendo la vía principal en este móvil
          (son las únicas que saltan duplicadas); esto es su refuerzo, y recupera lo que se haya
          escapado si el servicio estuvo parado. Una escucha tiene que superar los mismos umbrales
          y nunca se cuenta dos veces.
        </p>

        <!-- Interruptor -->
        <OpcionFila
          plana
          :activo="activo"
          titulo="Leer mis escuchas de Spotify"
          :detalle="estadoTexto"
        >
          <template #icono><AjusteIcon name="antena" class="h-8 w-8" /></template>
          <template #fin>
            <button
              role="switch"
              :aria-checked="activo"
              aria-label="Leer mis escuchas de Spotify"
              class="sk-switch shrink-0 disabled:opacity-40"
              :class="activo ? 'border-transparent bg-brand-400' : 'border-transparent bg-white/[0.18]'"
              :disabled="!puedeActivar && !activo"
              @click="alternar"
            >
              <span class="sk-switch-knob" :class="activo ? 'translate-x-6' : 'translate-x-1'" />
            </button>
          </template>
        </OpcionFila>

        <p
          v-if="avisoError"
          class="rounded-card bg-amber-400/[0.14] px-3 py-2.5 text-xs text-amber-100"
        >{{ avisoError }}</p>

        <!-- Cuenta de Spotify -->
        <OpcionFila
          plana
          tono="sky"
          :activo="conectada"
          titulo="Cuenta de Spotify"
          :detalle="conectada ? 'Conectada' : 'Sin conectar'"
        >
          <template #icono><AjusteIcon name="cuenta" class="h-8 w-8" /></template>
          <template #fin>
            <button
              v-if="conectada"
              type="button"
              class="sk-btn sk-btn-ghost sk-btn-sm shrink-0"
              @click="desconectar"
            >Desconectar</button>
          </template>
        </OpcionFila>

        <!-- El formulario va fuera de la tarjeta, que no crece por él. -->
        <div v-if="!conectada" class="sk-well px-3.5 py-3">
            <p class="mt-2 text-[11px] leading-relaxed text-slate-400">
              Necesitas el Client ID de tu aplicación de Spotify y que
              <span class="text-slate-300">{{ redirectUri() }}</span>
              esté entre sus Redirect URIs. Los pasos están explicados en la pestaña
              <router-link to="/macros" class="text-brand-400 underline">Macros</router-link>;
              la sesión es la misma para las dos cosas.
            </p>
            <input
              v-model="clientIdInput"
              type="text"
              placeholder="Client ID (32 caracteres)"
              aria-label="Client ID de Spotify"
              class="mt-2.5 w-full sk-input px-3 py-2.5 font-mono text-xs text-slate-200 placeholder:text-slate-600"
            >
            <button
              type="button"
              class="mt-2.5 w-full sk-btn sk-btn-primary disabled:opacity-50"
              :disabled="!clientIdInput.trim() || state.connecting"
              @click="conectar"
            >{{ state.connecting ? 'Esperando a Spotify…' : 'Iniciar sesión con Spotify' }}</button>
            <p v-if="state.error" class="mt-2.5 rounded-md bg-rose-500/[0.16] px-3 py-2 text-[11px] text-rose-200">
              {{ state.error }}
            </p>
        </div>

        <!-- Qué ha hecho -->
        <dl v-if="activo" class="grid grid-cols-2 gap-2.5 text-center">
          <div class="sk-well px-3 py-2.5">
            <dt class="text-[10px] uppercase tracking-wide text-slate-500">Última consulta</dt>
            <dd class="mt-0.5 text-xs font-bold text-white">{{ ultimaConsulta }}</dd>
          </div>
          <div class="sk-well px-3 py-2.5">
            <dt class="text-[10px] uppercase tracking-wide text-slate-500">Escuchas añadidas</dt>
            <dd class="mt-0.5 text-xs font-bold text-white">{{ estado.total || 0 }}</dd>
          </div>
        </dl>
        <p v-if="activo" class="text-[11px] leading-relaxed text-slate-500">
          Al activarlo sólo se miran las escuchas a partir de ese momento, no el pasado.
          Spotify no dice cuánto se oyó de cada canción: se calcula con el hueco respecto a la anterior,
          así que una pausa muy larga puede hacer que una escucha parezca más completa de lo que fue.
        </p>
      </template>
    </div>
  </FeaturePanel>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSpotify } from '@/composables/useSpotify'
import FeaturePanel from '@/components/FeaturePanel.vue'
import AjusteIcon from '@/components/AjusteIcon.vue'
import OpcionFila from '@/components/OpcionFila.vue'

const spotify = useSpotify()
const { state, connected, clientId, setClientId, redirectUri, connect, disconnect, consumeRedirect, cancelConnecting } = spotify

const isNative = !!window.Capacitor?.isNativePlatform?.()
const estado = ref({})
const clientIdInput = ref(clientId.value)
let redirectHandle = null
let refrescoTimer = null

function plugin () {
  return window.Capacitor?.Plugins?.NotifListener || null
}

const activo = computed(() => !!estado.value.enabled)
const conectada = computed(() => connected.value || !!estado.value.connected)
const puedeActivar = computed(() => conectada.value && estado.value.hasScope !== false)

const ERRORES = {
  'no-session': 'La sesión de Spotify ya no es válida: vuelve a iniciar sesión.',
  'missing-scope': 'Tu sesión no incluye el permiso para leer el historial. Desconecta e inicia sesión de nuevo.',
  forbidden: 'Spotify rechaza la consulta. Si tu aplicación está en modo desarrollo, tu cuenta debe estar en su lista de usuarios.',
  'rate-limit': 'Spotify ha pedido esperar un poco; se reintenta solo.',
  network: 'No se pudo consultar a Spotify; se reintenta solo.',
  error: 'La última consulta falló; se reintenta sola.'
}

const avisoError = computed(() => {
  if (!activo.value) return ''
  const e = estado.value.lastError
  if (e && ERRORES[e]) return ERRORES[e]
  if (!conectada.value) return ERRORES['no-session']
  return ''
})

const estadoTexto = computed(() => {
  if (!conectada.value) return 'Inicia sesión con Spotify para poder activarlo.'
  if (estado.value.hasScope === false) return 'Falta un permiso: vuelve a iniciar sesión.'
  return activo.value ? 'Activado' : 'Desactivado'
})

const ultimaConsulta = computed(() => {
  const t = Number(estado.value.lastPollAt || 0)
  if (!t) return 'Aún no'
  const min = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (min < 1) return 'Ahora mismo'
  if (min < 60) return `Hace ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `Hace ${h} h` : `Hace ${Math.round(h / 24)} d`
})

async function refrescar () {
  const NL = plugin()
  if (!NL?.getApiListening) return
  try {
    estado.value = (await NL.getApiListening()) || {}
  } catch { /* ignored */ }
}

async function alternar () {
  const NL = plugin()
  if (!NL?.setApiListening) return
  try {
    estado.value = (await NL.setApiListening({ enabled: !activo.value })) || {}
    // La primera consulta se hace en segundo plano: se vuelve a leer enseguida.
    setTimeout(refrescar, 2500)
  } catch { /* ignored */ }
}

async function conectar () {
  setClientId(clientIdInput.value)
  await connect()
}

async function desconectar () {
  // Sin sesión no hay nada que leer: se apaga también el interruptor.
  const NL = plugin()
  try {
    if (activo.value) await NL?.setApiListening?.({ enabled: false })
  } catch { /* ignored */ }
  await disconnect()
  await refrescar()
}

async function alVolver (url) {
  const ok = await consumeRedirect(url)
  await refrescar()
  return ok
}

/** Red de seguridad: la redirección puede haberse quedado esperando en el nativo. */
async function mirarRedireccionPendiente () {
  const NL = plugin()
  if (!NL?.consumeAuthRedirect) return false
  const pendiente = await NL.consumeAuthRedirect().catch(() => null)
  if (!pendiente?.url) return false
  return alVolver(pendiente.url)
}

async function alCambiarVisibilidad () {
  if (document.visibilityState !== 'visible') return
  const tratada = await mirarRedireccionPendiente()
  if (!tratada && !connected.value) cancelConnecting()
  refrescar()
}

onMounted(async () => {
  if (!isNative) return
  const NL = plugin()
  if (NL?.addListener) {
    redirectHandle = await NL.addListener('spotifyAuthRedirect', payload => alVolver(payload?.url))
  }
  await mirarRedireccionPendiente()
  document.addEventListener('visibilitychange', alCambiarVisibilidad)
  await refrescar()
  // Al abrir los ajustes se aprovecha para consultar sin esperar al latido.
  try {
    if (estado.value.enabled) estado.value = (await NL?.pollApiListening?.()) || estado.value
  } catch { /* ignored */ }
  refrescoTimer = setInterval(refrescar, 15000)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', alCambiarVisibilidad)
  clearInterval(refrescoTimer)
  try { redirectHandle?.remove?.() } catch { /* ignored */ }
})
</script>
