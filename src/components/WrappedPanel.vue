<template>
  <section class="sk-card sk-card-lit p-5" data-wrapped>
    <!-- Cerrado: una tarjeta de opción que invita a abrir la vista previa. -->
    <OpcionFila
      as="button"
      compacta
      color-tesela
      :titulo="abierto ? 'Tu Wrapped del mes' : 'Crea tu Wrapped del mes'"
      detalle="Tus números de los últimos 30 días en una imagen vertical, lista para compartir."
      class="w-full"
      :aria-expanded="abierto"
      data-wrapped-toggle
      @click="alternar"
    >
      <template #icono><StatIcon name="wrapped" class="h-5 w-5" /></template>
      <template #fin>
        <svg
          class="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200"
          :class="abierto ? 'rotate-180' : ''"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
        ><polyline points="6 9 12 15 18 9" /></svg>
      </template>
    </OpcionFila>

    <div v-if="abierto" class="mt-4">
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
 * Sólo mensual: los últimos 30 días, la misma ventana que la variedad mensual
 * de Inicio. La variedad se calcula EXACTAMENTE como allí (escuchas de
 * `last30Events` + duplicadas del mes de `useDuplicateStats`), así que ambas
 * cifras coinciden; sin datos del motor queda en null y la imagen pinta «—».
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import OpcionFila from '@/components/OpcionFila.vue'
import StatIcon from '@/components/StatIcon.vue'
import { useEventStore } from '@/stores/events'
import { useAnalytics } from '@/composables/useAnalytics'
import { useDuplicateStats } from '@/composables/useDuplicateStats'
import { calcularVariedad } from '@/lib/inicioStats'
import { calcularWrapped } from '@/lib/wrapped'
import { generarWrappedPng } from '@/lib/wrappedImagen'
import { compartirPng, guardarPng } from '@/lib/compartirImagen'

const { events } = useEventStore()
const { last30Events } = useAnalytics()
const dup = useDuplicateStats()

const abierto = ref(false)
const blob = ref(null)
const vistaUrl = ref('')
const error = ref('')
const aviso = ref('')
const ocupado = ref(false)
let ticket = 0

/** Variedad mensual: la misma cuenta que el cartel de Inicio (DuplicateKpiCards). */
const variedad = computed(() => dup.hasData.value
  ? calcularVariedad(last30Events.value.length, dup.monthDuplicates.value, dup.monthSkipped.value)
  : null)

function alternar () {
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
    const datos = calcularWrapped(events.value, Date.now(), { variedad: variedad.value })
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
watch([() => events.value.length, variedad], () => { if (abierto.value) generar() })

function nombreArchivo () {
  const d = new Date()
  const f = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
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
