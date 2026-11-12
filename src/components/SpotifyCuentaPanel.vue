<template>
  <section class="sk-card overflow-hidden" data-cuenta-api>
    <!-- Cabecera. Sin vincular: icono de desconexión + «Vincula tu Spotify».
         Vinculada: foto de perfil, nombre, correo y el icono de desvincular
         (botón hermano del que despliega: uno dentro del otro no es HTML válido).
         Los textos se parten en varias líneas, nunca se recortan. -->
    <div class="flex items-center gap-1 pr-3">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
        :aria-expanded="abierto"
        aria-controls="cuenta-api-cuerpo"
        @click="abierto = !abierto"
      >
        <span
          class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full"
          :class="conectada ? 'bg-sky-400/[0.18] text-sky-200' : 'bg-white/[0.08] text-slate-300'"
        >
          <img
            v-if="conectada && fotoPerfil"
            :src="fotoPerfil"
            alt=""
            class="h-9 w-9 rounded-full object-cover"
          >
          <AjusteIcon v-else :name="conectada ? 'cuenta' : 'desconexion'" class="h-5 w-5" data-cuenta-icono />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-bold leading-snug text-white [overflow-wrap:anywhere]" data-cuenta-titulo>{{ titulo }}</span>
          <span v-if="subtitulo" class="block text-[11px] leading-snug text-slate-500 [overflow-wrap:anywhere]">{{ subtitulo }}</span>
        </span>
        <MacroIcon
          name="siguiente"
          class="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200"
          :class="abierto ? 'rotate-90' : ''"
        />
      </button>

      <button
        v-if="conectada"
        type="button"
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-slate-300 transition-colors hover:bg-rose-500/[0.2] hover:text-rose-100"
        :class="confirmando ? '!bg-rose-500/[0.25] !text-rose-100' : ''"
        aria-label="Desvincular la cuenta de Spotify"
        title="Desvincular"
        data-cuenta-desvincular
        @click="confirmando = !confirmando"
      >
        <MacroIcon name="desconectar" class="h-5 w-5" />
      </button>
    </div>

    <!-- Confirmación mínima antes de desvincular. -->
    <div v-if="conectada && confirmando" class="flex flex-wrap items-center gap-2 border-t border-white/[0.07] bg-rose-500/[0.08] px-4 py-3">
      <p class="min-w-0 flex-1 basis-40 text-xs text-rose-100">¿Desvincular tu cuenta de Spotify? Se dejarán de registrar las escuchas por la API.</p>
      <div class="flex shrink-0 gap-2">
        <button type="button" class="sk-btn sk-btn-ghost sk-btn-sm" @click="confirmando = false">Cancelar</button>
        <button type="button" class="sk-btn sk-btn-primary sk-btn-sm" data-cuenta-confirmar @click="desconectar">Desvincular</button>
      </div>
    </div>

    <!-- Cuerpo desplegable. -->
    <div
      id="cuenta-api-cuerpo"
      class="grid transition-[grid-template-rows] duration-300 ease-out"
      :class="abierto ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
      :inert="!abierto"
    >
      <div class="min-h-0 overflow-hidden">
        <div class="space-y-2 border-t border-white/[0.07] p-4">
          <!-- Sin vincular: todas las instrucciones, una tarjeta por paso. -->
          <template v-if="!conectada">
            <OpcionFila plana compacta color-tesela tono="brand" titulo="1 · Para qué sirve" detalle="Anota lo que escuchas en cualquier dispositivo, sin depender de las notificaciones.">
              <template #icono><AjusteIcon name="antena" class="h-6 w-6" /></template>
            </OpcionFila>

            <OpcionFila plana compacta color-tesela tono="amber" titulo="2 · Requisitos" detalle="Requiere Spotify Premium. Sólo pueden vincularse 5 cuentas a la aplicación que vas a crear ahora.">
              <template #icono><AjusteIcon name="escudo" class="h-6 w-6" /></template>
            </OpcionFila>

            <OpcionFila plana compacta color-tesela tono="sky" titulo="3 · Crea una aplicación" detalle="Inicia sesión con tu cuenta de Spotify, entra en «Dashboard» y pulsa «Create app».">
              <template #icono><AjusteIcon name="tour" class="h-6 w-6" /></template>
            </OpcionFila>
            <button type="button" class="w-full sk-btn sk-btn-ghost" data-cuenta-abrir-dashboard @click="abrirDashboard">
              Abrir Spotify for Developers
            </button>

            <OpcionFila plana compacta color-tesela tono="sky" titulo="4a · Nombre y descripción" detalle="En «App name» escribe Skippify y, en «App description», Registro personal de mis escuchas.">
              <template #icono><AjusteIcon name="etiqueta" class="h-6 w-6" /></template>
            </OpcionFila>

            <OpcionFila plana compacta color-tesela tono="sky" titulo="4b · URI de redirección" detalle="En «Redirect URIs» pega esta dirección, exactamente igual, y pulsa «Add» (Añadir).">
              <template #icono><AjusteIcon name="copia" class="h-6 w-6" /></template>
            </OpcionFila>
            <div class="flex flex-wrap items-center gap-2">
              <code class="min-w-0 flex-1 basis-40 break-all rounded-lg bg-black/30 px-2.5 py-2 font-mono text-[11px] text-brand-400">{{ redirectUri() }}</code>
              <button type="button" class="sk-btn sk-btn-ghost sk-btn-sm shrink-0" @click="copiarRedirect">
                {{ redirectCopiada ? '¡Copiada!' : 'Copiar URI' }}
              </button>
            </div>

            <OpcionFila plana compacta color-tesela tono="sky" titulo="4c · API y guardado" detalle="En «Which API/SDKs are you planning to use?» marca «Web API», acepta los términos y pulsa «Save» (Guardar).">
              <template #icono><AjusteIcon name="registro" class="h-6 w-6" /></template>
            </OpcionFila>

            <OpcionFila plana compacta color-tesela tono="brand" titulo="5a · Copia el Client ID" detalle="En «Settings» de tu aplicación de Spotify copia el Client ID y pégalo aquí.">
              <template #icono><AjusteIcon name="version" class="h-6 w-6" /></template>
            </OpcionFila>
            <input
              v-model="clientIdInput"
              type="text"
              placeholder="Client ID (32 caracteres)"
              aria-label="Client ID de Spotify"
              class="w-full sk-input px-3 py-2.5 font-mono text-xs text-slate-200 placeholder:text-slate-600"
            >

            <OpcionFila plana compacta color-tesela tono="brand" titulo="5b · Conecta y acepta" detalle="Pulsa «Conectar con Spotify» y, en la pantalla de Spotify, pulsa «Aceptar».">
              <template #icono><AjusteIcon name="cuenta" class="h-6 w-6" /></template>
            </OpcionFila>
            <button
              type="button"
              class="w-full sk-btn sk-btn-primary disabled:opacity-50"
              :disabled="!clientIdInput.trim() || state.connecting"
              @click="conectar"
            >{{ state.connecting ? 'Esperando a Spotify…' : 'Conectar con Spotify' }}</button>
            <p v-if="state.error" class="rounded-md bg-rose-500/[0.16] px-3 py-2 text-[11px] text-rose-200">
              {{ state.error }}
            </p>
          </template>

          <!-- Vinculada: el conmutador y la invitación a crear macros. -->
          <template v-else>
            <OpcionFila
              plana
              compacta
              :activo="activo"
              titulo="Registrar mis escuchas"
              :detalle="estadoTexto"
            >
              <template #icono><AjusteIcon name="antena" class="h-6 w-6" /></template>
              <template #fin>
                <button
                  role="switch"
                  :aria-checked="activo"
                  aria-label="Registrar mis escuchas desde la API de Spotify"
                  class="sk-switch shrink-0 disabled:opacity-40"
                  :class="activo ? 'border-transparent bg-brand-400' : 'border-transparent bg-white/[0.18]'"
                  :disabled="!puedeActivar && !activo"
                  @click="alternar"
                >
                  <span class="sk-switch-knob" :class="activo ? 'translate-x-6' : 'translate-x-1'" />
                </button>
              </template>
            </OpcionFila>

            <p v-if="avisoError" class="rounded-card bg-amber-400/[0.14] px-3 py-2.5 text-xs text-amber-100">{{ avisoError }}</p>

            <OpcionFila
              v-if="!ocultarInvitacionMacros"
              as="button"
              compacta
              color-tesela
              tono="violet"
              class="w-full"
              titulo="Crea macros"
              detalle="Con tu cuenta vinculada, tus macros funcionan en Spotify. Pulsa para crear una."
              data-cuenta-macros
              @click="irAMacros"
            >
              <template #icono><MacroIcon name="nueva" class="h-6 w-6" /></template>
              <template #fin><MacroIcon name="siguiente" class="hidden h-4 w-4 shrink-0 text-slate-500 sm:block" /></template>
            </OpcionFila>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
/**
 * Panel compacto de Inicio para registrar escuchas con la API de Spotify.
 *
 * Componente autónomo y reutilizable (no depende de la vista que lo aloja).
 * Sin sesión se titula «Vincula tu Spotify» y, desplegado, da el paso a paso
 * completo: para qué sirve, requisitos (Premium, 5 cuentas), crear la aplicación,
 * qué rellenar y copiar el Client ID. Con sesión, plegado muestra foto, nombre,
 * correo y el icono de desvincular; desplegado, el conmutador de la lectura por
 * API y una invitación a crear macros.
 *
 * Al iniciar sesión desde aquí la lectura se activa sola: es para lo que se
 * conecta la cuenta en este panel, y el interruptor sigue a mano.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useSpotify } from '@/composables/useSpotify'
import AjusteIcon from '@/components/AjusteIcon.vue'
import MacroIcon from '@/components/MacroIcon.vue'
import OpcionFila from '@/components/OpcionFila.vue'
import { useRouter } from 'vue-router'

/**
 * `ocultarInvitacionMacros`: quita la tarjeta «Crea macros» (que lleva a
 * /macros) del cuerpo con sesión. Para alojar el panel en la propia pestaña
 * Macros, donde esa invitación no tiene sentido.
 */
defineProps({
  ocultarInvitacionMacros: { type: Boolean, default: false }
})

const spotify = useSpotify()
const { state, connected, clientId, setClientId, redirectUri, connect, disconnect, consumeRedirect, cancelConnecting, loadProfile } = spotify

const isNative = !!window.Capacitor?.isNativePlatform?.()
const estado = ref({})
const clientIdInput = ref(clientId.value)
const redirectCopiada = ref(false)
const confirmando = ref(false)
const router = useRouter()
let redirectHandle = null
let copiadaTimer = null
let refrescoTimer = null
let cargandoPerfil = false

function plugin () {
  return window.Capacitor?.Plugins?.NotifListener || null
}

const activo = computed(() => !!estado.value.enabled)
const conectada = computed(() => connected.value || !!estado.value.connected)
const puedeActivar = computed(() => isNative && conectada.value && estado.value.hasScope !== false)

// Plegado por defecto, con o sin cuenta: la cabecera ya dice qué hay que hacer
// («Vincula tu Spotify») y el panel se despliega al pulsarla.
const abierto = ref(false)

const fotoPerfil = computed(() => state.profile?.images?.[0]?.url || '')
const titulo = computed(() => conectada.value
  ? (state.profile?.display_name || 'Cuenta vinculada')
  : 'Vincula tu Spotify')
const subtitulo = computed(() => conectada.value
  ? (state.profile?.id || '')
  : 'Para anotar las escuchas de cualquier dispositivo.')

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
  return e && ERRORES[e] ? ERRORES[e] : ''
})
const estadoTexto = computed(() => {
  if (!isNative) return 'Sólo disponible en la app instalada.'
  if (estado.value.hasScope === false) return 'Falta un permiso: vuelve a iniciar sesión.'
  return activo.value ? 'Activado' : 'Desactivado'
})

async function refrescar () {
  const NL = plugin()
  if (!NL?.getApiListening) return
  try {
    estado.value = (await NL.getApiListening()) || {}
  } catch { /* ignored */ }
}

/** Relee el estado a los 2,5 s; un solo temporizador, que se limpia al desmontar. */
function refrescarLuego () {
  clearTimeout(refrescoTimer)
  refrescoTimer = setTimeout(refrescar, 2500)
}

/** Carga el perfil si falta (p. ej. falló sin red): se reintenta al desplegar o volver a primer plano. */
async function asegurarPerfil () {
  if (cargandoPerfil || !connected.value || state.profile) return
  cargandoPerfil = true
  try { await loadProfile() } catch { /* se reintentará */ } finally { cargandoPerfil = false }
}

async function alternar () {
  const NL = plugin()
  if (!NL?.setApiListening) return
  try {
    estado.value = (await NL.setApiListening({ enabled: !activo.value })) || {}
    refrescarLuego()
  } catch { /* ignored */ }
}

async function conectar () {
  setClientId(clientIdInput.value)
  await connect()
}

const URL_DASHBOARD = 'https://developer.spotify.com/dashboard'

/** Abre el panel de desarrolladores de Spotify (navegador del sistema en la app nativa). */
async function abrirDashboard () {
  const NL = plugin()
  try {
    if (isNative && NL?.openExternalUrl) {
      const r = await NL.openExternalUrl({ url: URL_DASHBOARD })
      if (r?.opened) return
    }
  } catch { /* se prueba con window.open */ }
  window.open(URL_DASHBOARD, '_blank', 'noopener')
}

function irAMacros () {
  router?.push('/macros')
}

async function desconectar () {
  confirmando.value = false
  const NL = plugin()
  try {
    if (activo.value) await NL?.setApiListening?.({ enabled: false })
  } catch { /* ignored */ }
  await disconnect()
  await refrescar()
}

async function copiarRedirect () {
  try {
    await navigator.clipboard.writeText(redirectUri())
    redirectCopiada.value = true
    clearTimeout(copiadaTimer)
    copiadaTimer = setTimeout(() => { redirectCopiada.value = false }, 2000)
  } catch { /* la Clipboard API no existe fuera de contextos seguros */ }
}

/** Vuelta de Spotify: se guarda la sesión, se carga el perfil y se activa la lectura. */
async function alVolver (url) {
  const ok = await consumeRedirect(url)
  if (ok) {
    try { if (!state.profile) await loadProfile() } catch { /* se verá sin nombre */ }
    const NL = plugin()
    try {
      if (NL?.setApiListening) estado.value = (await NL.setApiListening({ enabled: true })) || {}
    } catch { /* ignored */ }
    abierto.value = false
    refrescarLuego()
  }
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
  asegurarPerfil()
}

onMounted(async () => {
  const NL = plugin()
  if (isNative && NL?.addListener) {
    redirectHandle = await NL.addListener('spotifyAuthRedirect', payload => alVolver(payload?.url))
  }
  if (isNative) await mirarRedireccionPendiente()
  document.addEventListener('visibilitychange', alCambiarVisibilidad)
  // El servicio pudo refrescar el token con la app cerrada: el bueno es el suyo.
  try { await spotify.adoptarSesionNativa?.() } catch { /* ignored */ }
  await refrescar()
  if (connected.value) {
    abierto.value = false
    await asegurarPerfil()
  }
})

watch(abierto, v => { if (v) asegurarPerfil() })

onUnmounted(() => {
  document.removeEventListener('visibilitychange', alCambiarVisibilidad)
  clearTimeout(copiadaTimer)
  clearTimeout(refrescoTimer)
  try { redirectHandle?.remove?.() } catch { /* ignored */ }
})
</script>
