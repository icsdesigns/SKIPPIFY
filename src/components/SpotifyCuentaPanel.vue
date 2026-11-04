<template>
  <section class="sk-card overflow-hidden" data-cuenta-api>
    <!-- Cabecera compacta: quién eres (o la invitación a conectar) y, aparte,
         el botón de información. Son dos botones hermanos: uno dentro del otro
         no es HTML válido. -->
    <div class="flex items-center gap-1 pr-3">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
        :aria-expanded="abierto"
        aria-controls="cuenta-api-cuerpo"
        @click="abierto = !abierto"
      >
        <span class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-400/[0.18] text-sky-200">
          <img
            v-if="conectada && state.profile?.images?.[0]?.url"
            :src="state.profile.images[0].url"
            alt=""
            class="h-9 w-9 rounded-full object-cover"
          >
          <AjusteIcon v-else :name="conectada ? 'cuenta' : 'antena'" class="h-5 w-5" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-bold text-white">{{ titulo }}</span>
          <span class="block truncate text-[11px] text-slate-500">{{ subtitulo }}</span>
        </span>
        <span class="sk-chip shrink-0" :class="conectada && activo ? 'sk-chip-accent' : ''">{{ chip }}</span>
        <MacroIcon
          name="siguiente"
          class="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200"
          :class="abierto ? 'rotate-90' : ''"
        />
      </button>

      <button
        type="button"
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-slate-300 transition-colors hover:bg-white/[0.16]"
        :class="info ? '!bg-sky-400/[0.25] !text-sky-100' : ''"
        :aria-expanded="info"
        aria-controls="cuenta-api-info"
        aria-label="Información sobre registrar escuchas con la API de Spotify"
        data-cuenta-api-info
        @click="info = !info"
      >
        <AjusteIcon name="ayuda" class="h-5 w-5" />
      </button>
    </div>

    <!-- Información: para qué sirve, cómo registrarse y si hace falta Premium.
         Cada punto es una tarjeta de opción de alto acotado. -->
    <div
      id="cuenta-api-info"
      class="grid transition-[grid-template-rows] duration-300 ease-out"
      :class="info ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
      :inert="!info"
    >
      <div class="min-h-0 overflow-hidden">
        <div class="space-y-2 border-t border-white/[0.07] p-4">
          <OpcionFila
            v-for="punto in puntosInfo"
            :key="punto.titulo"
            plana
            :tono="punto.tono"
            :titulo="punto.titulo"
            :detalle="punto.detalle"
          >
            <template #icono><AjusteIcon :name="punto.icono" class="h-8 w-8" /></template>
          </OpcionFila>
          <p class="px-1 text-[10px] leading-relaxed text-slate-500">
            Fuente de la condición de Premium: guía de cambios de febrero de 2026 de la API de
            Spotify para desarrolladores (developer.spotify.com).
          </p>
        </div>
      </div>
    </div>

    <!-- Cuerpo: iniciar sesión, o el interruptor y las acciones de la cuenta. -->
    <div
      id="cuenta-api-cuerpo"
      class="grid transition-[grid-template-rows] duration-300 ease-out"
      :class="abierto ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
      :inert="!abierto"
    >
      <div class="min-h-0 overflow-hidden">
        <div class="space-y-3 border-t border-white/[0.07] p-4">
          <template v-if="!conectada">
            <p class="text-[11px] leading-relaxed text-slate-400">
              Pega el Client ID de tu aplicación de Spotify y pulsa conectar. Si aún no tienes
              una, el botón de información te dice cómo crearla.
            </p>

            <div class="flex flex-wrap items-center gap-2">
              <code class="min-w-0 flex-1 break-all rounded-lg bg-black/30 px-2.5 py-2 font-mono text-[11px] text-brand-400">{{ redirectUri() }}</code>
              <button type="button" class="sk-btn sk-btn-ghost sk-btn-sm shrink-0" @click="copiarRedirect">
                {{ redirectCopiada ? '¡Copiada!' : 'Copiar URI' }}
              </button>
            </div>

            <input
              v-model="clientIdInput"
              type="text"
              placeholder="Client ID (32 caracteres)"
              aria-label="Client ID de Spotify"
              class="w-full sk-input px-3 py-2.5 font-mono text-xs text-slate-200 placeholder:text-slate-600"
            >
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

          <template v-else>
            <OpcionFila
              plana
              :activo="activo"
              titulo="Registrar mis escuchas"
              :detalle="estadoTexto"
            >
              <template #icono><AjusteIcon name="antena" class="h-8 w-8" /></template>
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

            <div class="flex justify-end">
              <button
                type="button"
                class="sk-btn sk-btn-ghost sk-btn-sm flex h-9 w-9 items-center justify-center !p-0"
                aria-label="Desconectar la cuenta"
                title="Desconectar"
                @click="desconectar"
              >
                <MacroIcon name="desconectar" class="h-5 w-5" />
              </button>
            </div>
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
 * Sin sesión invita a iniciarla (Client ID y botón de conectar); con sesión
 * enseña tu perfil y el interruptor de la lectura por API, la misma que hay en
 * Configuración. El botón de información explica para qué sirve (anotar lo que
 * suena en cualquier dispositivo), cómo registrarse y que Spotify exige Premium
 * a quien crea la aplicación de desarrollador.
 *
 * Al iniciar sesión desde aquí la lectura se activa sola: es para lo que se
 * conecta la cuenta en este panel, y el interruptor sigue a mano.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useSpotify } from '@/composables/useSpotify'
import AjusteIcon from '@/components/AjusteIcon.vue'
import MacroIcon from '@/components/MacroIcon.vue'
import OpcionFila from '@/components/OpcionFila.vue'

const spotify = useSpotify()
const { state, connected, clientId, setClientId, redirectUri, connect, disconnect, consumeRedirect, cancelConnecting, loadProfile } = spotify

const isNative = !!window.Capacitor?.isNativePlatform?.()
const estado = ref({})
const clientIdInput = ref(clientId.value)
const redirectCopiada = ref(false)
const info = ref(false)
let redirectHandle = null
let copiadaTimer = null

function plugin () {
  return window.Capacitor?.Plugins?.NotifListener || null
}

const activo = computed(() => !!estado.value.enabled)
const conectada = computed(() => connected.value || !!estado.value.connected)
const puedeActivar = computed(() => isNative && conectada.value && estado.value.hasScope !== false)

// Abierto de entrada sólo si falta conectar: es lo que hay que hacer aquí.
const abierto = ref(!connected.value)

const titulo = computed(() => conectada.value
  ? (state.profile?.display_name || 'Cuenta conectada')
  : 'Registra tus escuchas desde Spotify')
const subtitulo = computed(() => conectada.value
  ? (state.profile?.email || state.profile?.id || '')
  : 'Inicia sesión y se anotan las de cualquier dispositivo.')
const chip = computed(() => {
  if (!conectada.value) return 'Sin conectar'
  return activo.value ? 'Activado' : 'Desactivado'
})

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

/**
 * Qué cuenta el botón de información. Cada texto cabe en la tarjeta de opción
 * (cuatro líneas); los pasos del registro sólo salen mientras no hay sesión.
 */
const puntosInfo = computed(() => {
  const lista = [
    {
      icono: 'antena',
      tono: 'brand',
      titulo: 'Para qué sirve',
      detalle: 'Anota lo que escuchas en cualquier dispositivo (otro móvil, el ordenador, un altavoz), sin depender de las notificaciones.'
    },
    {
      icono: 'escudo',
      tono: 'amber',
      titulo: 'Requiere Spotify Premium',
      detalle: 'Spotify exige Premium a quien crea la aplicación de desarrollador, y admite hasta 5 cuentas autorizadas.'
    }
  ]
  if (!conectada.value) {
    lista.push(
      {
        icono: 'tour',
        tono: 'sky',
        titulo: '1 · Crea una aplicación',
        detalle: 'En developer.spotify.com/dashboard pulsa Create app y ponle el nombre que quieras.'
      },
      {
        icono: 'copia',
        tono: 'sky',
        titulo: '2 · Añade la URI de redirección',
        detalle: 'Pégala en Redirect URIs, exactamente como sale en este panel (botón Copiar URI).'
      },
      {
        icono: 'cuenta',
        tono: 'sky',
        titulo: '3 · Autoriza tu cuenta',
        detalle: 'En User Management de la aplicación añade el correo de tu cuenta de Spotify.'
      },
      {
        icono: 'version',
        tono: 'sky',
        titulo: '4 · Pega el Client ID',
        detalle: 'Está en Settings de la aplicación. Pégalo aquí y pulsa Conectar con Spotify.'
      }
    )
  }
  return lista
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
    setTimeout(refrescar, 2500)
  } catch { /* ignored */ }
}

async function conectar () {
  setClientId(clientIdInput.value)
  await connect()
}

async function desconectar () {
  const NL = plugin()
  try {
    if (activo.value) await NL?.setApiListening?.({ enabled: false })
  } catch { /* ignored */ }
  await disconnect()
  await refrescar()
  abierto.value = true
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
    setTimeout(refrescar, 2500)
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
    if (!state.profile) { try { await loadProfile() } catch { /* ignored */ } }
  }
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', alCambiarVisibilidad)
  clearTimeout(copiadaTimer)
  try { redirectHandle?.remove?.() } catch { /* ignored */ }
})
</script>
