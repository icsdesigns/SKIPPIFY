<template>
  <section class="sk-card sk-card-lit p-5" data-dispositivos>
    <header class="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 class="sk-title">Este dispositivo vs otros</h2>
        <p class="sk-subtitle">Dónde se registraron tus escuchas: aquí (notificaciones) o en otros dispositivos (API de Spotify)</p>
      </div>
      <span class="sk-chip">{{ DIAS_DISPOSITIVOS }} d</span>
    </header>

    <!-- Barra proporcional: verde = este dispositivo, azul = otros. -->
    <div
      class="mb-4 flex h-3 w-full overflow-hidden rounded-full bg-white/[0.08]"
      role="img"
      :aria-label="vacio ? 'Sin escuchas en los últimos 30 días' : `Este dispositivo ${reparto.pctEste} %, otros dispositivos ${reparto.pctOtros} %`"
    >
      <div v-if="!vacio" class="h-full bg-brand-400" :style="{ width: `${reparto.pctEste}%` }" data-barra-este />
      <div v-if="!vacio && reparto.pctOtros > 0" class="h-full bg-sky-400" :style="{ width: `${reparto.pctOtros}%` }" data-barra-otros />
    </div>

    <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <OpcionFila
        compacta plana color-tesela tono="brand"
        titulo="Este dispositivo"
        :detalle="detalleEste"
        data-disp-este
      >
        <template #icono><StatIcon name="movil" class="h-5 w-5" /></template>
        <template #fin>
          <span class="shrink-0 pl-1 text-xl font-extrabold tabular-nums text-brand-400">{{ vacio ? '—' : reparto.pctEste }}<span v-if="!vacio" class="text-xs font-bold"> %</span></span>
        </template>
      </OpcionFila>

      <OpcionFila
        compacta plana color-tesela tono="sky"
        titulo="Otros dispositivos"
        :detalle="detalleOtros"
        data-disp-otros
      >
        <template #icono><StatIcon name="otros" class="h-5 w-5" /></template>
        <template #fin>
          <span class="shrink-0 pl-1 text-xl font-extrabold tabular-nums text-sky-300">{{ vacio ? '—' : reparto.pctOtros }}<span v-if="!vacio" class="text-xs font-bold"> %</span></span>
        </template>
      </OpcionFila>
    </div>

    <p v-if="vacio" class="sk-stat-hint">Aún no hay escuchas en los últimos {{ DIAS_DISPOSITIVOS }} días.</p>
    <p v-else-if="!reparto.hayApi" class="sk-stat-hint" data-disp-pista>
      Todas tus escuchas se han registrado en este dispositivo. Vincula tu cuenta de Spotify en Inicio para registrar también lo que escuchas en otros.
    </p>
  </section>
</template>

<script setup>
/**
 * Reparto de las escuchas entre «este dispositivo» y «otros dispositivos» en los
 * últimos 30 días. Se apoya en `source` de cada evento: `notification` y
 * `notification_background` (o sin fuente) = este dispositivo; `spotify_api` =
 * otros (la lectura por API sólo añade lo que el móvil no llegó a ver). El
 * porcentaje principal es de escuchas; el de tiempo va en la descripción.
 */
import { computed } from 'vue'
import OpcionFila from '@/components/OpcionFila.vue'
import StatIcon from '@/components/StatIcon.vue'
import { useEventStore } from '@/stores/events'
import { DIAS_DISPOSITIVOS, formatearDuracion, repartoDispositivos } from '@/lib/wrapped'

const { events } = useEventStore()

const props = defineProps({
  /** Reloj compartido de la vista, para que el periodo avance con la app abierta. */
  ahora: { type: Number, default: () => Date.now() }
})

const reparto = computed(() => repartoDispositivos(events.value, props.ahora))
const vacio = computed(() => reparto.value.vacio)

function describir (bolsa, pctTiempo) {
  const n = bolsa.count
  const base = `${n} ${n === 1 ? 'escucha' : 'escuchas'}`
  if (!bolsa.ms) return base
  const t = formatearDuracion(bolsa.ms)
  return pctTiempo === null ? `${base} · ${t}` : `${base} · ${t} (${pctTiempo} % del tiempo)`
}

const detalleEste = computed(() => vacio.value ? 'Sin escuchas registradas' : describir(reparto.value.este, reparto.value.pctEsteTiempo))
const detalleOtros = computed(() => vacio.value ? 'Sin escuchas registradas' : describir(reparto.value.otros, reparto.value.pctOtrosTiempo))
</script>
