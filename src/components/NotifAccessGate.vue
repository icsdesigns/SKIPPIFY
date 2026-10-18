<template>
  <!--
    Pantalla de bloqueo: sin acceso a notificaciones Skippify no ve qué suena,
    así que la app no se deja usar hasta concederlo. Se cierra sola en cuanto
    el nativo avisa del cambio al volver de Ajustes (`permissionChanged`).
  -->
  <div
    class="sk-gate fixed inset-0 z-[80] overflow-y-auto bg-ink-800"
    role="dialog"
    aria-modal="true"
    aria-labelledby="sk-gate-title"
  >
    <div class="mx-auto flex min-h-full w-full max-w-md flex-col gap-3 px-4 pb-8 pt-6">
      <!-- ── Cabecera ──────────────────────────────────────────────────────── -->
      <div class="sk-card sk-card-lit p-5">
        <div class="mb-3 flex items-center gap-3">
          <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-400/[0.16] text-amber-300">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M6.2 15.6C6.6 14.6 6.8 13.5 6.8 12.4V10.6C6.8 7.7 9.1 5.3 12 5.3C14.9 5.3 17.2 7.7 17.2 10.6V12.4C17.2 13.5 17.4 14.6 17.8 15.6L18.3 16.8H5.7Z" />
              <path d="M10.1 19.4C10.6 20.2 11.3 20.6 12 20.6C12.7 20.6 13.4 20.2 13.9 19.4" />
              <path d="M12 3.4V5.3" />
            </svg>
          </span>
          <div class="min-w-0">
            <h2 id="sk-gate-title" class="text-lg font-extrabold leading-tight tracking-tight text-white">
              Activa el acceso a notificaciones
            </h2>
            <p class="mt-0.5 text-[11px] font-semibold text-amber-300">Imprescindible para usar Skippify</p>
          </div>
        </div>
        <p class="text-sm leading-relaxed text-slate-300">
          Skippify lee la notificación de Spotify para saber qué canción suena. Sin
          este permiso no puede saltar duplicadas, silenciar anuncios ni registrar
          tus escuchas, así que la app queda bloqueada hasta que lo actives.
        </p>
      </div>

      <!-- ── Dispositivo detectado ─────────────────────────────────────────── -->
      <div v-if="guia.dispositivo" class="sk-card flex items-start gap-3 px-4 py-3">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-slate-300">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M8.2 3.4H15.8C16.8 3.4 17.6 4.2 17.6 5.2V18.8C17.6 19.8 16.8 20.6 15.8 20.6H8.2C7.2 20.6 6.4 19.8 6.4 18.8V5.2C6.4 4.2 7.2 3.4 8.2 3.4Z" />
            <path d="M10.8 17.6H13.2" />
          </svg>
        </span>
        <div class="min-w-0 flex-1">
          <p class="sk-eyebrow">Tu dispositivo</p>
          <p class="break-words text-sm font-bold text-white">{{ guia.dispositivo }}</p>
          <span v-if="guia.restringido" class="sk-badge sk-badge-warn mt-1.5">Ajuste restringido por instalar la APK</span>
        </div>
      </div>

      <!-- ── Pasos ─────────────────────────────────────────────────────────── -->
      <div
        v-for="(paso, i) in guia.pasos"
        :key="paso.id"
        class="sk-card p-4 transition-opacity"
        :class="estadoPaso(paso, i) === 'pendiente' ? 'opacity-60' : ''"
      >
        <div class="flex items-start gap-3">
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold"
            :class="estadoPaso(paso, i) === 'hecho' ? 'bg-brand-400 text-black' : estadoPaso(paso, i) === 'actual' ? 'bg-white text-black' : 'bg-white/[0.08] text-slate-300'"
          >
            <svg v-if="estadoPaso(paso, i) === 'hecho'" viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5.6 12.6C7 13.9 8.4 15.3 9.7 16.8C12.4 13 15.3 9.6 18.6 6.8" />
            </svg>
            <template v-else>{{ i + 1 }}</template>
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-bold text-white">{{ paso.titulo }}</p>
            <p class="mt-1 text-xs leading-relaxed text-slate-400">{{ paso.texto }}</p>
            <p v-if="paso.ruta" class="mt-1.5 text-[11px] leading-relaxed text-slate-500">{{ paso.ruta }}</p>
            <button
              type="button"
              class="sk-btn mt-3 w-full"
              :class="estadoPaso(paso, i) === 'actual' ? 'sk-btn-primary' : 'sk-btn-ghost'"
              @click="ejecutar(paso)"
            >
              {{ paso.etiqueta }}
            </button>
          </div>
        </div>
      </div>

      <!-- Sin saber si la instalación está restringida: se avisa por si acaso. -->
      <div v-if="guia.condicional" class="sk-card p-4">
        <p class="text-sm font-bold text-white">Si aparece «Ajuste restringido»</p>
        <p class="mt-1 text-xs leading-relaxed text-slate-400">{{ guia.condicional }}</p>
        <button type="button" class="sk-btn sk-btn-ghost sk-btn-sm mt-3" @click="ejecutar({ id: 'restringidos', accion: 'info-app' })">
          Abrir información de la app
        </button>
      </div>

      <!-- ── Aviso tras volver sin el permiso ──────────────────────────────── -->
      <p
        v-if="aviso"
        class="rounded-card bg-amber-400/[0.12] px-4 py-3 text-xs leading-relaxed text-amber-100"
        role="status"
      >
        {{ aviso }}
      </p>

      <!-- ── Ruta manual ───────────────────────────────────────────────────── -->
      <div class="sk-card overflow-hidden">
        <button
          type="button"
          class="flex w-full items-center gap-3 px-4 py-3 text-left"
          :aria-expanded="verManual"
          @click="verManual = !verManual"
        >
          <span class="min-w-0 flex-1 text-sm font-bold text-white">¿No encuentras el ajuste?</span>
          <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-slate-400 transition-transform" :class="verManual ? 'rotate-180' : ''" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M6.4 9.4C8.3 11.2 10.1 13 12 14.9C13.9 13 15.7 11.2 17.6 9.4" />
          </svg>
        </button>
        <div v-if="verManual" class="space-y-2 border-t border-white/[0.07] px-4 py-3 text-xs leading-relaxed text-slate-400">
          <p>{{ guia.rutaManual }}</p>
          <p v-if="guia.consejo">{{ guia.consejo }}</p>
        </div>
      </div>

      <button type="button" class="sk-btn sk-btn-ghost w-full" :disabled="comprobando" @click="comprobar(true)">
        {{ comprobando ? 'Comprobando…' : 'Ya lo he activado' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useNotifListener } from '@/composables/useNotifListener'
import { construirGuia } from '@/lib/guiaAccesoNotificaciones'

const notif = useNotifListener()

const info = ref(null)
const intentados = ref(new Set())
const aviso = ref('')
const verManual = ref(false)
const comprobando = ref(false)

/**
 * Una vez vista la restricción, los tres pasos se quedan en pantalla aunque ya
 * se haya permitido: si no, al volver de Ajustes la guía se reducía a un solo
 * paso y el usuario perdía de vista lo que ya había hecho.
 */
const vistoRestringido = ref(false)

const guiaReal = computed(() => construirGuia(info.value))

watch(() => guiaReal.value.restringido, (v) => {
  if (v) vistoRestringido.value = true
}, { immediate: true })

const guia = computed(() => {
  if (!vistoRestringido.value || guiaReal.value.restringido) return guiaReal.value
  return { ...construirGuia({ ...info.value, restrictedSettings: 'restricted' }), restringido: false }
})

/**
 * Un paso está hecho si se sabe (ajustes restringidos ya permitidos) o, para el
 * intento del paso 1, si se ha pulsado: su único fin es que Android muestre la
 * opción del paso 2. El paso actual es el primero sin hacer.
 */
function pasoHecho (paso) {
  if (paso.id === 'intento') return intentados.value.has('intento') || info.value?.restrictedSettings === 'allowed'
  if (paso.id === 'restringidos') return info.value?.restrictedSettings === 'allowed'
  return false
}

const indiceActual = computed(() => {
  const i = guia.value.pasos.findIndex(p => !pasoHecho(p))
  return i === -1 ? guia.value.pasos.length - 1 : i
})

function estadoPaso (paso, i) {
  if (pasoHecho(paso)) return 'hecho'
  return i === indiceActual.value ? 'actual' : 'pendiente'
}

async function ejecutar (paso) {
  aviso.value = ''
  intentados.value = new Set(intentados.value).add(paso.id)
  if (paso.accion === 'info-app') {
    const abierto = await notif.abrirInfoApp()
    if (!abierto) {
      aviso.value = 'Android no ha dejado abrir la información de la app. Ábrela desde Ajustes → Aplicaciones → Skippify.'
      verManual.value = true
    }
    return
  }
  const via = await notif.abrirAccesoNotificaciones()
  if (via === 'none') {
    aviso.value = 'Android no ha dejado abrir el ajuste desde la app. Sigue la ruta de abajo.'
    verManual.value = true
  } else if (via === 'app-details') {
    aviso.value = 'Se ha abierto la información de la app porque tu sistema no tiene acceso directo. Busca «Acceso a notificaciones» desde Ajustes.'
    verManual.value = true
  }
}

/** Relee permiso y dispositivo. `manual` = lo ha pedido el usuario. */
async function comprobar (manual = false) {
  comprobando.value = true
  try {
    const [nuevo] = await Promise.all([notif.leerDispositivo(), notif.recheckPermission()])
    if (nuevo) info.value = nuevo
    if (manual && !notif.notifEnabled.value) {
      aviso.value = guia.value.restringido
        ? 'Todavía no está activado. Si el interruptor sigue bloqueado, completa antes el paso de los ajustes restringidos.'
        : 'Todavía no está activado. Abre el ajuste, activa Skippify y confirma el aviso del sistema.'
    }
  } finally {
    comprobando.value = false
  }
}

function alVolver () {
  if (document.visibilityState === 'visible') comprobar(false)
}

let overflowPrevio = ''

onMounted(() => {
  // Lo de debajo no debe desplazarse mientras la pantalla está puesta.
  overflowPrevio = document.documentElement.style.overflow
  document.documentElement.style.overflow = 'hidden'
  document.addEventListener('visibilitychange', alVolver)
  comprobar(false)
})

onBeforeUnmount(() => {
  document.documentElement.style.overflow = overflowPrevio
  document.removeEventListener('visibilitychange', alVolver)
})
</script>

<style scoped>
.sk-gate {
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
</style>
