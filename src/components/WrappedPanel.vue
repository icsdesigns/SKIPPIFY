<template>
  <section class="sk-card sk-card-lit p-5" data-wrapped>
    <!-- Cerrado: una tarjeta de opción que invita a abrir la vista previa. -->
    <OpcionFila
      as="button"
      compacta
      color-tesela
      :titulo="abierto ? 'Tu Wrapped del mes' : 'Crea tu Wrapped del mes'"
      detalle="Tu último mes completo en una imagen vertical, lista para tus historias de Instagram."
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
 * Sólo mensual: el mes natural anterior (del día 1 al último día), sin datos
 * nuevos hasta que acaba el mes en curso. La variedad usa la misma fórmula que
 * Inicio (`calcularVariedad`) con las escuchas y las duplicadas de ESE mes;
 * sin datos del motor queda en null y la imagen pinta «—».
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import OpcionFila from '@/components/OpcionFila.vue'
import StatIcon from '@/components/StatIcon.vue'
import { useEventStore } from '@/stores/events'
import { useDuplicateStats } from '@/composables/useDuplicateStats'
import { calcularVariedad } from '@/lib/inicioStats'
import { calcularWrapped, mesAnterior, msDeEscucha } from '@/lib/wrapped'
import { generarWrappedPng, cacheWrapped } from '@/lib/wrappedImagen'
import { compartirPng, guardarPng } from '@/lib/compartirImagen'

const { events } = useEventStore()
const dup = useDuplicateStats()

const abierto = ref(false)
const blob = ref(null)
const vistaUrl = ref('')
const error = ref('')
const aviso = ref('')
const ocupado = ref(false)
let ticket = 0

/** Variedad del mes anterior: la misma fórmula que el cartel de Inicio (DuplicateKpiCards). */
function variedadDelMes (mes) {
  if (!dup.hasData.value) return null
  let escuchas = 0
  for (const e of events.value) {
    const t = msDeEscucha(e)
    if (t >= mes.inicio && t < mes.fin) escuchas++
  }
  const { duplicates, skipped } = dup.rango(mes.inicio, mes.fin)
  return calcularVariedad(escuchas, duplicates, skipped)
}

/** Deja pintar la pantalla antes de un cálculo pesado (dos fotogramas). */
function cederPintado () {
  if (typeof requestAnimationFrame !== 'function') return Promise.resolve()
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

/** Lee las duplicadas del motor sin esperar más de 1,5 s si el puente tarda. */
function refrescarDuplicadas () {
  return Promise.race([
    Promise.resolve().then(() => dup.refresh()).catch(() => {}),
    new Promise(resolve => setTimeout(resolve, 1500))
  ])
}

/**
 * El Wrapped es del mes ya cerrado: sus datos casi no cambian. Se calcula y se
 * dibuja UNA vez y se reutiliza mientras los datos sean los mismos (también al
 * volver a abrirlo o al cambiar de pestaña). Antes se redibujaba con cada
 * escucha nueva y dos veces al abrir, y en un móvil modesto tardaba mucho.
 */
async function prepararPng () {
  const mes = mesAnterior(Date.now())
  const datos = calcularWrapped(events.value, Date.now(), { variedad: variedadDelMes(mes) })
  const clave = JSON.stringify(datos)
  if (cacheWrapped.png && cacheWrapped.png.clave === clave) return cacheWrapped.png.blob
  const png = await generarWrappedPng(datos)
  cacheWrapped.png = { clave, blob: png }
  return png
}

function alternar () {
  abierto.value = !abierto.value
  if (abierto.value) generar()
}

async function generar () {
  const mio = ++ticket
  error.value = ''
  aviso.value = ''
  try {
    if (!blob.value && cacheWrapped.png) mostrar(cacheWrapped.png.blob)
    await cederPintado()
    await refrescarDuplicadas()
    if (mio !== ticket) return
    const png = await prepararPng()
    if (mio !== ticket) return
    if (png !== blob.value) mostrar(png)
  } catch (e) {
    if (mio !== ticket) return
    blob.value = null
    error.value = 'No se pudo generar la imagen en este dispositivo.'
  }
}

function mostrar (png) {
  if (vistaUrl.value) URL.revokeObjectURL(vistaUrl.value)
  blob.value = png
  vistaUrl.value = URL.createObjectURL(png)
}

// Se prepara en segundo plano al entrar en Estadísticas, cuando la app está
// ociosa, para que al abrir el Wrapped la imagen ya esté lista.
let tareaPrevia = null
onMounted(() => {
  if (cacheWrapped.png) return
  const lanzar = () => { tareaPrevia = null; if (!abierto.value) prepararPng().catch(() => {}) }
  tareaPrevia = typeof requestIdleCallback === 'function'
    ? { idle: requestIdleCallback(lanzar, { timeout: 4000 }) }
    : { t: setTimeout(lanzar, 2000) }
})

function nombreArchivo () {
  const d = new Date(mesAnterior(Date.now()).inicio)
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
  if (tareaPrevia?.idle) cancelIdleCallback(tareaPrevia.idle)
  if (tareaPrevia?.t) clearTimeout(tareaPrevia.t)
  if (vistaUrl.value) URL.revokeObjectURL(vistaUrl.value)
})
</script>
