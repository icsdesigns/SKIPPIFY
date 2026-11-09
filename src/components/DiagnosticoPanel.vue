<template>
  <div class="space-y-2" data-diagnostico>
    <!-- La tarjeta que lanza el diagnóstico. Su texto es fijo y el indicador de
         progreso ocupa siempre el mismo sitio (#fin): no cambia ni de ancho ni
         de alto mientras comprueba, así que no hay parpadeo. -->
    <OpcionFila
      as="button"
      tono="sky"
      class="w-full"
      :aria-busy="ocupado"
      titulo="¿Por qué no detecta?"
      detalle="Diagnóstico guiado con el arreglo en un toque."
      @click="ejecutar()"
    >
      <template #icono><AjusteIcon name="pulso" class="h-8 w-8" /></template>
      <template #fin>
        <span class="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
          <span v-if="ocupado" class="h-4 w-4 animate-spin rounded-full border-2 border-sky-300/30 border-t-sky-200" />
        </span>
      </template>
    </OpcionFila>

    <template v-if="resultado">
      <p
        class="rounded-card px-3 py-2.5 text-xs leading-relaxed"
        :class="resultado.problemas ? 'bg-amber-400/[0.14] text-amber-100' : 'bg-brand-400/[0.14] text-brand-100'"
        role="status"
        data-diagnostico-resumen
      >{{ resultado.resumen }}</p>

      <p v-if="mensaje" class="rounded-card bg-white/[0.06] px-3 py-2.5 text-xs leading-relaxed text-slate-200" role="status">{{ mensaje }}</p>

      <!-- Una tarjeta compacta por comprobación; el botón del arreglo va debajo,
           fuera de la tarjeta, para no pasar del alto de referencia. -->
      <div v-for="it in resultado.items" :key="it.id" :data-comprobacion="it.id" :data-estado="it.estado">
        <OpcionFila
          as="article"
          compacta
          plana
          :color-tesela="it.estado !== 'nd'"
          :tenue="it.estado === 'nd'"
          :tono="TONOS[it.estado]"
          :titulo="it.titulo"
          :detalle="it.detalle"
          :aria-label="`${ETIQUETAS[it.estado]}: ${it.titulo}. ${it.detalle}`"
        >
          <template #icono><AjusteIcon :name="ICONOS[it.estado]" class="h-6 w-6" /></template>
        </OpcionFila>

        <button
          v-if="it.arreglo"
          type="button"
          class="sk-btn sk-btn-sm mt-2 w-full sm:w-auto"
          :class="CLASE_BOTON[it.estado]"
          :disabled="aplicando"
          @click="arreglar(it)"
        >{{ it.arreglo.etiqueta }}</button>
      </div>
    </template>
  </div>
</template>

<script setup>
/**
 * Diagnóstico guiado «¿por qué no detecta?».
 *
 * Esta pantalla sólo LEE el estado (permisos del sistema, sesión de Spotify,
 * lectura por API) y EJECUTA el arreglo elegido; qué está mal y qué arreglo
 * toca lo decide `evaluarDiagnostico` (src/lib/diagnostico.js), con pruebas.
 *
 * Fuera de la app instalada no hay plugin: esas comprobaciones salen como
 * «No disponible aquí» y no se ofrece ningún arreglo.
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNotifListener } from '@/composables/useNotifListener'
import { useSpotify } from '@/composables/useSpotify'
import { evaluarDiagnostico } from '@/lib/diagnostico'
import AjusteIcon from '@/components/AjusteIcon.vue'
import OpcionFila from '@/components/OpcionFila.vue'

const router = useRouter()
const { getPlugin, activarPermiso, abrirAccesoNotificaciones, isCapacitor } = useNotifListener()
const spotify = useSpotify()

const ICONOS = { ok: 'comprobado', fallo: 'cruz', aviso: 'alerta', info: 'informacion', nd: 'guion' }
const TONOS = { ok: 'brand', fallo: 'rose', aviso: 'amber', info: 'sky', nd: 'brand' }
const ETIQUETAS = { ok: 'Correcto', fallo: 'Problema', aviso: 'Aviso', info: 'Información', nd: 'No disponible' }
const CLASE_BOTON = {
  ok: 'bg-white/[0.08] text-slate-200 hover:bg-white/[0.16]',
  fallo: 'bg-rose-400/[0.18] text-rose-100 hover:bg-rose-400/30',
  aviso: 'bg-amber-400/[0.18] text-amber-100 hover:bg-amber-400/30',
  info: 'bg-sky-400/[0.18] text-sky-100 hover:bg-sky-400/30',
  nd: 'bg-white/[0.08] text-slate-200 hover:bg-white/[0.16]'
}

const resultado = ref(null)
const ocupado = ref(false)
const aplicando = ref(false)
const mensaje = ref('')
/** Si «Reconectar» ya se probó y no bastó, se pasa a lo manual. */
const reconexionFallida = ref(false)

async function leerSafe (fn) {
  try { return await fn() } catch { return null }
}

/** Lee del plugin (y de la sesión de la WebView) todo lo que el diagnóstico necesita. */
async function leerEstado () {
  const NL = getPlugin()
  const nativo = !!NL && isCapacitor.value

  const permisos = NL?.getPermissionsState ? await leerSafe(() => NL.getPermissionsState()) : null

  // La sesión que manda es la del nativo (es quien refresca el token); en el
  // navegador se mira la de la WebView.
  let sesion = null
  const nativa = NL?.getSpotifySession ? await leerSafe(() => NL.getSpotifySession()) : null
  if (nativa) {
    sesion = {
      conectada: !!nativa.connected,
      scope: nativa.scope || '',
      tieneRefresh: nativa.hasRefreshToken !== false,
      expiresAt: Number(nativa.expiresAt || 0)
    }
  } else {
    const concedidos = spotify.grantedScopes()
    sesion = {
      conectada: spotify.connected.value,
      scope: concedidos ? concedidos.join(' ') : '',
      tieneRefresh: true,
      expiresAt: 0
    }
  }

  const api = NL?.getApiListening ? await leerSafe(() => NL.getApiListening()) : null

  return {
    nativo,
    permisos: permisos && nativo ? permisos : null,
    spotify: sesion,
    api: api && nativo ? { enabled: !!api.enabled, lastError: api.lastError || '' } : null,
    capacidades: { reconectar: !!NL?.reconnectListener && !reconexionFallida.value }
  }
}

async function ejecutar ({ limpiar = true } = {}) {
  if (ocupado.value) return
  ocupado.value = true
  if (limpiar) mensaje.value = ''
  try {
    resultado.value = evaluarDiagnostico(await leerEstado())
  } finally {
    ocupado.value = false
  }
}

async function arreglar (it) {
  const NL = getPlugin()
  const id = it.arreglo?.id
  if (!id || aplicando.value) return
  aplicando.value = true
  mensaje.value = ''
  try {
    if (id === 'ir-spotify') {
      router.push('/')
      return
    }
    if (id === 'reconectar') {
      const res = await leerSafe(() => NL.reconnectListener())
      reconexionFallida.value = !res?.connected
      mensaje.value = res?.connected
        ? 'Servicio reconectado. Reproduce algo en Spotify para comprobarlo.'
        : 'El servicio sigue sin conectar. Apaga y vuelve a encender el acceso de Skippify en los ajustes del sistema.'
    } else if (id === 'abrir-acceso') {
      await abrirAccesoNotificaciones()
      mensaje.value = 'Activa Skippify en la lista y vuelve aquí: el diagnóstico se repite solo.'
    } else if (id === 'pedir-notificaciones') {
      await activarPermiso('post-notifications')
    } else if (id === 'excluir-bateria') {
      await activarPermiso('battery')
    }
    // Android tarda un instante en reflejar el cambio.
    await new Promise(resolve => setTimeout(resolve, 900))
    await ejecutar({ limpiar: false })
  } finally {
    aplicando.value = false
  }
}

/** Al volver de los ajustes del sistema se repite solo, para ver si ya está. */
function alVolver () {
  if (document.visibilityState === 'visible' && resultado.value && !ocupado.value && !aplicando.value) {
    ejecutar({ limpiar: false })
  }
}

onMounted(() => document.addEventListener('visibilitychange', alVolver))
onUnmounted(() => document.removeEventListener('visibilitychange', alVolver))
</script>
