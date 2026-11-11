<template>
  <section class="sk-card sk-card-lit p-5" data-wrapped>
    <!-- Cerrado: una tarjeta de opción que invita a abrir la vista previa. -->
    <OpcionFila
      as="button"
      compacta
      color-tesela
      :titulo="ventana.disponible && !abierto ? 'Crea tu Wrapped del mes' : 'Tu Wrapped del mes'"
      :detalle="ventana.disponible
        ? `Tus números de ${mesNombre} en una imagen vertical, lista para compartir.`
        : `Se desbloquea ${textoVentana(ventana)}, con los números del último mes.`"
      class="w-full"
      :class="ventana.disponible ? '' : 'opacity-60'"
      :disabled="!ventana.disponible"
      :aria-expanded="abierto"
      :data-wrapped-bloqueado="ventana.disponible ? null : ''"
      data-wrapped-toggle
      @click="alternar"
    >
      <template #icono><StatIcon name="wrapped" class="h-5 w-5" /></template>
      <template #fin>
        <svg v-if="!ventana.disponible" class="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
        <svg
          v-else
          class="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200"
          :class="abierto ? 'rotate-180' : ''"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
        ><polyline points="6 9 12 15 18 9" /></svg>
      </template>
    </OpcionFila>

    <div v-if="abierto && ventana.disponible" class="mt-4">
      <!-- Vista previa: la propia imagen que se compartirá, 9:16. Imagen,
           botones y aviso comparten ancho (320 px como mucho) y van separados
           por el mismo hueco (mt-4), dentro del relleno p-5 de la tarjeta. -->
      <div class="mx-auto w-full max-w-[320px]">
        <div class="relative aspect-[9/16] w-full overflow-hidden rounded-card bg-black/40">
          <img
            v-if="vistaUrl"
            :src="vistaUrl"
            alt="Vista previa de tu Wrapped"
            class="absolute inset-0 h-full w-full object-contain"
            data-wrapped-img
          />
          <p
            v-else-if="error"
            class="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-rose-200"
          >{{ error }}</p>
          <p v-else class="absolute inset-0 flex items-center justify-center text-xs text-slate-400">Generando imagen…</p>
        </div>
      </div>

      <div class="mx-auto mt-4 grid w-full max-w-[320px] gap-2">
        <button type="button" class="sk-btn sk-btn-primary w-full justify-center" :disabled="!blob || ocupado" data-wrapped-compartir @click="compartir">
          <StatIcon name="compartir" class="h-4 w-4" />
          Compartir
        </button>
        <button type="button" class="sk-btn sk-btn-ghost w-full justify-center" :disabled="!blob || ocupado" data-wrapped-guardar @click="guardar">
          <StatIcon name="descargar" class="h-4 w-4" />
          Guardar imagen
        </button>
      </div>
      <p v-if="aviso" class="sk-stat-hint mx-auto mt-4 max-w-[320px] text-center [overflow-wrap:anywhere]" role="status">{{ aviso }}</p>
    </div>
  </section>
</template>

<script setup>
/**
 * Wrapped: imagen vertical (1080 × 1920) para compartir. Los números salen de
 * `lib/wrapped.js`, el dibujo de `lib/wrappedImagen.js` y el reparto de
 * «compartir / guardar» de `lib/compartirImagen.js`.
 *
 * Sólo mensual y sólo del último mes natural: está desbloqueado desde 7 días
 * antes hasta 7 días después del día 1 de cada mes (`ventanaWrapped`); fuera de
 * ese periodo la tarjeta aparece bloqueada con la fecha de apertura. La variedad
 * usa la misma fórmula que Inicio, pero con las escuchas y las duplicadas de ese
 * mes; sin datos del motor queda en null y la imagen pinta «—».
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import OpcionFila from '@/components/OpcionFila.vue'
import StatIcon from '@/components/StatIcon.vue'
import { useEventStore } from '@/stores/events'
import { useAnalytics } from '@/composables/useAnalytics'
import { useDuplicateStats } from '@/composables/useDuplicateStats'
import { calcularVariedad } from '@/lib/inicioStats'
import { calcularWrapped, ventanaWrapped, textoVentana, nombreMes } from '@/lib/wrapped'
import { generarWrappedPng } from '@/lib/wrappedImagen'
import { compartirPng, guardarPng } from '@/lib/compartirImagen'

const { events } = useEventStore()
const { nowTick } = useAnalytics()
const dup = useDuplicateStats()

const abierto = ref(false)
const blob = ref(null)
const vistaUrl = ref('')
const error = ref('')
const aviso = ref('')
const ocupado = ref(false)
let ticket = 0

/** Ventana de desbloqueo y mes que enseña (se recalcula con el reloj de la app). */
const ventana = computed(() => ventanaWrapped(nowTick.value))
const mesNombre = computed(() => nombreMes(ventana.value.desde).toLowerCase())

/** Variedad del mes: la cuenta de Inicio (DuplicateKpiCards) sobre ese mes natural. */
const variedad = computed(() => {
  if (!dup.hasData.value) return null
  const { desde, hasta } = ventana.value
  const escuchas = events.value.filter(e => {
    const t = new Date(e?.played_at).getTime()
    return t >= desde && t < hasta
  }).length
  const { duplicates, skipped } = dup.entre(desde, hasta)
  return calcularVariedad(escuchas, duplicates, skipped)
})

function alternar () {
  if (!ventana.value.disponible) return
  abierto.value = !abierto.value
  if (abierto.value) {
    dup.refresh()
    generar()
  }
}

async function generar () {
  const mio = ++ticket
  error.value = ''
  aviso.value = ''
  try {
    const datos = calcularWrapped(events.value, Date.now(), { variedad: variedad.value, ventana: ventana.value })
    const png = await generarWrappedPng(datos)
    if (mio !== ticket) return
    if (vistaUrl.value) URL.revokeObjectURL(vistaUrl.value)
    blob.value = png
    vistaUrl.value = URL.createObjectURL(png)
  } catch (e) {
    if (mio !== ticket) return
    blob.value = null
    error.value = 'No se pudo generar la imagen en este dispositivo.'
  }
}

// Si llegan escuchas o datos del motor con la vista previa abierta, se redibuja.
watch([() => events.value.length, variedad], () => { if (abierto.value && ventana.value.disponible) generar() })
// Si la ventana se cierra con el panel abierto (cambio de día), se pliega.
watch(() => ventana.value.disponible, ok => { if (!ok) abierto.value = false })

function nombreArchivo () {
  const d = new Date(ventana.value.desde)
  const f = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
  return `skippify-wrapped-mes-${f}.png`
}

function textoResultado (r) {
  if (r.estado === 'guardado') return `Imagen guardada en ${r.ruta}. Ábrela desde tu galería o gestor de archivos para compartirla.`
  if (r.estado === 'descargado') return 'Imagen descargada.'
  return ''
}

async function compartir () {
  if (!blob.value) return
  ocupado.value = true
  aviso.value = ''
  try {
    const etiqueta = 'Tu mes en música'
    aviso.value = textoResultado(await compartirPng(blob.value, nombreArchivo(), { titulo: etiqueta, texto: `${etiqueta} · Skippify` }))
  } catch {
    aviso.value = 'No se pudo compartir la imagen.'
  } finally {
    ocupado.value = false
  }
}

async function guardar () {
  if (!blob.value) return
  ocupado.value = true
  aviso.value = ''
  try {
    aviso.value = textoResultado(await guardarPng(blob.value, nombreArchivo()))
  } catch {
    aviso.value = 'No se pudo guardar la imagen.'
  } finally {
    ocupado.value = false
  }
}

onBeforeUnmount(() => {
  ticket++
  if (vistaUrl.value) URL.revokeObjectURL(vistaUrl.value)
})
</script>
