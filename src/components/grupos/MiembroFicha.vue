<template>
  <li
    class="ficha relative overflow-hidden rounded-card transition-colors"
    :class="[
      ficha.yo ? 'bg-brand-400/[0.10] ring-1 ring-inset ring-brand-400/30' : 'bg-white/[0.04]',
      sinDatos ? 'opacity-70' : ''
    ]"
    :style="{ '--retardo': `${indice * 70}ms` }"
    :data-miembro="ficha.id"
  >
    <!-- Cabecera: siempre visible. Tocarla despliega las cifras; el icono de
         información (hermano, no hijo: un botón dentro de otro no es válido)
         despliega el registro de funcionalidad de ESTE miembro. -->
    <div class="flex items-center">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-2.5 py-3 pl-3 pr-1 text-left"
        :class="expandible ? 'hover:bg-white/[0.03]' : 'cursor-default'"
        :aria-expanded="expandible ? abierta : undefined"
        :aria-controls="expandible ? `ficha-${ficha.id}` : undefined"
        :disabled="!expandible"
        @click="abierta = !abierta"
      >
        <!-- Avatar con anillo (su tiempo respecto al que más ha escuchado) y,
             en su esquina, la medalla del puesto. -->
        <span class="relative h-11 w-11 shrink-0">
          <svg viewBox="0 0 44 44" class="absolute inset-0 h-11 w-11 -rotate-90" aria-hidden="true">
            <circle cx="22" cy="22" r="20" fill="none" stroke="currentColor" stroke-width="3" class="text-white/[0.08]" />
            <circle
              cx="22" cy="22" r="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"
              class="anillo text-brand-400"
              :stroke-dasharray="CIRCUNFERENCIA"
              :stroke-dashoffset="CIRCUNFERENCIA * (1 - (visible ? progreso : 0))"
            />
          </svg>
          <span
            class="absolute inset-[5px] flex items-center justify-center rounded-full text-sm font-bold"
            :class="ficha.yo ? 'bg-brand-400 text-black' : 'bg-white/[0.12] text-slate-100'"
          >{{ inicialDe(ficha.nombre) }}</span>
          <span class="absolute -bottom-1 -left-1 flex rounded-full ring-2 ring-[#1c1c1c]"><Medalla tamano="sm" :posicion="posicion" :sin-datos="sinDatos" /></span>
        </span>

        <span class="min-w-0 flex-1">
          <span class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span class="sk-clamp-2 text-sm font-semibold text-white">{{ ficha.nombre }}</span>
            <span v-if="ficha.yo" class="text-[10px] font-bold uppercase tracking-wider text-brand-400">tú</span>
            <span v-if="ficha.admin" class="sk-chip !px-2 !py-0.5 !text-[10px]">Admin</span>
          </span>
          <span class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
            <template v-if="!sinDatos">
              <span class="font-mono text-xs font-bold tabular-nums text-brand-400">{{ formatearHoras(ficha.minutos) }}</span>
              <span>{{ ficha.canciones }} canciones</span>
            </template>
            <span v-else>{{ sinDatosTexto }}</span>
            <!-- % de escucha común contigo: sólo en la ficha de los demás. -->
            <span
              v-if="comun !== null && comun !== undefined"
              class="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brand-400/[0.14] px-1.5 py-0.5 text-[10px] font-bold text-brand-300"
              :title="'La parte de su escucha que coincide con la tuya, artista a artista'"
              data-comun
            >
              <GrupoIcono name="users" class="h-3 w-3" />{{ comun }} % en común
            </span>
          </span>
        </span>

        <GrupoIcono
          v-if="expandible"
          name="chevron"
          class="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-300"
          :class="abierta ? '-rotate-90' : 'rotate-90'"
        />
      </button>

      <button
        v-if="descargar"
        type="button"
        class="mx-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors"
        :class="registroAbierto ? 'bg-brand-400 text-black' : 'bg-white/[0.08] text-slate-300 hover:bg-white/[0.16]'"
        :aria-expanded="registroAbierto"
        :aria-controls="`registro-${ficha.id}`"
        :aria-label="`Registro de funcionalidad de ${ficha.nombre}`"
        title="Registro de funcionalidad"
        data-info-registro
        @click="registroAbierto = !registroAbierto"
      >
        <GrupoIcono name="info" class="h-4 w-4" />
      </button>
    </div>

    <!-- Registro de funcionalidad de este miembro (icono de información). -->
    <div :id="`registro-${ficha.id}`" class="desplegable grid" :class="registroAbierto ? 'abierta' : ''" :inert="!registroAbierto">
      <div class="min-h-0 overflow-hidden">
        <div class="px-3 pb-3">
          <RegistroMiembro v-if="descargar" :registro="registro" :descargar="descargar" />
        </div>
      </div>
    </div>

    <!-- Cifras desplegables. Se quedan en el DOM (también para lectores de
         pantalla con la ficha abierta); la altura anima con grid-rows. -->
    <div
      v-if="expandible"
      :id="`ficha-${ficha.id}`"
      class="desplegable grid"
      :class="abierta ? 'abierta' : ''"
    >
      <div class="min-h-0 overflow-hidden">
        <div class="space-y-3 px-3 pb-3">
          <!-- Lo más escuchado, con las veces que sonó. -->
          <div v-if="!sinDatos && (ficha.artista || ficha.tema)" class="grid gap-1.5 sm:grid-cols-2">
            <p v-if="ficha.artista" class="flex min-w-0 items-center gap-2 rounded-md bg-white/[0.05] px-2.5 py-2 text-[11px]" :title="ficha.artista">
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-400/15 text-brand-300">
                <GrupoIcono name="mic" class="h-3.5 w-3.5" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-[10px] uppercase tracking-wider text-slate-500">Artista top</span>
                <span class="block truncate font-semibold text-slate-100">{{ ficha.artista }}</span>
              </span>
              <span v-if="ficha.artistaVeces > 1" class="veces shrink-0 rounded-full bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-300">×{{ ficha.artistaVeces }}</span>
            </p>
            <p v-if="ficha.tema" class="flex min-w-0 items-center gap-2 rounded-md bg-white/[0.05] px-2.5 py-2 text-[11px]" :title="ficha.tema">
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-400/15 text-brand-300">
                <GrupoIcono name="note" class="h-3.5 w-3.5" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-[10px] uppercase tracking-wider text-slate-500">Tema top</span>
                <span class="block truncate font-semibold text-slate-100">{{ ficha.tema }}</span>
              </span>
              <span v-if="ficha.temaVeces > 1" class="veces shrink-0 rounded-full bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-300">×{{ ficha.temaVeces }}</span>
            </p>
          </div>

          <!-- Mosaico de cifras. -->
          <ul v-if="!sinDatos && cifras.length" class="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            <li
              v-for="(c, i) in cifras"
              :key="c.clave"
              class="cifra rounded-md bg-white/[0.04] px-2.5 py-2"
              :style="{ '--orden': i }"
              :data-cifra="c.clave"
            >
              <span class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                <GrupoIcono :name="c.icono" class="h-3.5 w-3.5 text-brand-300" />{{ c.etiqueta }}
              </span>
              <span class="mt-1 block truncate text-sm font-bold text-white">{{ c.valor }}</span>
              <span v-if="c.progreso !== undefined" class="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/[0.08]">
                <span
                  class="barra block h-full rounded-full bg-brand-400"
                  :style="{ width: `${Math.round((abierta && visible ? c.progreso : 0) * 100)}%` }"
                />
              </span>
              <span v-if="c.detalle" class="mt-1 block truncate text-[10px] text-slate-500">{{ c.detalle }}</span>
            </li>
          </ul>

          <p v-if="ficha.desde" class="text-[10px] text-slate-500">Miembro desde {{ ficha.desde }}</p>

          <!-- Sólo el administrador, nunca sobre sí mismo, y sólo con la ficha
               desplegada: así no hay un botón destructivo a la vista de todos. -->
          <div v-if="puedeExpulsar" class="flex justify-end">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-rose-300 transition-colors hover:bg-rose-500/[0.16]"
              :data-expulsar="ficha.id"
              @click="pedirExpulsion"
            >
              <GrupoIcono name="userX" class="h-3.5 w-3.5" />{{ confirmandoExpulsion ? '¿Seguro? Pulsa otra vez' : 'Expulsar' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </li>
</template>

<script setup>
/**
 * Ficha de un miembro en el panel «Miembros y resultados».
 *
 * Plegada enseña lo esencial (puesto, nombre, tiempo y un anillo con su parte
 * respecto al que más ha escuchado); al tocarla se despliega lo más escuchado
 * y el mosaico de cifras. Las animaciones (anillo, barras, despliegue, brillo
 * del primer puesto) se apagan con «reducir movimiento».
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import GrupoIcono from './GrupoIcono.js'
import Medalla from './Medalla.vue'
import RegistroMiembro from './RegistroMiembro.vue'
import { formatearHoras, inicialDe } from '@/lib/gruposResumen'
import { cifrasDe } from '@/lib/gruposExtras'

const CIRCUNFERENCIA = 2 * Math.PI * 20

const props = defineProps({
  ficha: { type: Object, required: true },
  posicion: { type: Number, default: 0 },
  /** Su tiempo respecto al que más ha escuchado, de 0 a 1. */
  progreso: { type: Number, default: 0 },
  indice: { type: Number, default: 0 },
  abiertaAlInicio: { type: Boolean, default: false },
  /** El usuario es administrador y esta ficha es de otra persona. */
  puedeExpulsar: { type: Boolean, default: false },
  /** % de escucha común contigo en el periodo elegido; null en tu propia ficha. */
  comun: { type: Number, default: null },
  /** Texto cuando no hay escuchas en el periodo («Sin escuchas esta semana»). */
  sinDatosTexto: { type: String, default: 'Sin escuchas' },
  /** Registro de funcionalidad de este miembro: { id, nombre, version, subidoEn, filas } o null. */
  registro: { type: Object, default: null },
  /** async (id) => ruta del JSON. Sin ella no hay icono de información. */
  descargar: { type: Function, default: null }
})
const emit = defineEmits(['expulsar'])

/** Expulsar cambia la llave del grupo: se pide una segunda pulsación. */
const confirmandoExpulsion = ref(false)
let confirmTimer = null
function pedirExpulsion () {
  if (!confirmandoExpulsion.value) {
    confirmandoExpulsion.value = true
    clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => { confirmandoExpulsion.value = false }, 4000)
    return
  }
  confirmandoExpulsion.value = false
  clearTimeout(confirmTimer)
  emit('expulsar', props.ficha.id)
}
onBeforeUnmount(() => clearTimeout(confirmTimer))

const sinDatos = computed(() => !(Number(props.ficha.minutos) > 0))
/** Con datos se despliegan las cifras; sin ellos, sólo hay algo que abrir si se puede expulsar. */
const expandible = computed(() => !sinDatos.value || props.puedeExpulsar)
const abierta = ref(props.abiertaAlInicio && expandible.value)
const registroAbierto = ref(false)
const cifras = computed(() => cifrasDe(props.ficha.datos))

// El anillo y las barras parten de cero y crecen al montarse la ficha. En el
// render del servidor (pruebas) quedan a cero; el valor está en el texto.
const visible = ref(false)
onMounted(() => {
  requestAnimationFrame(() => { visible.value = true })
})

</script>

<style scoped>
.ficha {
  animation: entrada 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: var(--retardo, 0ms);
}

@keyframes entrada {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.anillo {
  transition: stroke-dashoffset 1s cubic-bezier(0.22, 1, 0.36, 1);
  transition-delay: calc(var(--retardo, 0ms) + 120ms);
}

/* Despliegue por grid-template-rows: anima la altura real sin medirla. */
.desplegable {
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}
.desplegable.abierta { grid-template-rows: 1fr; }

.cifra {
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 0.25s ease, transform 0.25s ease;
  transition-delay: calc(var(--orden, 0) * 40ms);
}
.abierta .cifra { opacity: 1; transform: none; }

.barra {
  transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1);
  transition-delay: calc(var(--orden, 0) * 40ms + 120ms);
}

@media (prefers-reduced-motion: reduce) {
  .ficha { animation: none !important; }
  .anillo, .desplegable, .cifra, .barra { transition: none !important; }
}
</style>
