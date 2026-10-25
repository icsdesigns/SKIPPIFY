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
    <!-- Cabecera: siempre visible. Tocarla despliega las cifras. -->
    <button
      type="button"
      class="flex w-full items-center gap-3 px-3 py-3 text-left"
      :class="sinDatos ? 'cursor-default' : 'hover:bg-white/[0.03]'"
      :aria-expanded="sinDatos ? undefined : abierta"
      :aria-controls="sinDatos ? undefined : `ficha-${ficha.id}`"
      :disabled="sinDatos"
      @click="abierta = !abierta"
    >
      <!-- Posición: medalla para el podio, número para el resto. -->
      <span
        class="medalla relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold tabular-nums"
        :class="claseMedalla"
        :aria-label="sinDatos ? 'Sin posición' : `Puesto ${posicion}`"
      >
        <span class="relative z-[1]">{{ sinDatos ? '·' : posicion }}</span>
      </span>

      <!-- Avatar con anillo: su tiempo respecto al que más ha escuchado. -->
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
      </span>

      <span class="min-w-0 flex-1">
        <span class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span class="sk-clamp-2 text-sm font-semibold text-white">{{ ficha.nombre }}</span>
          <span v-if="ficha.yo" class="text-[10px] font-bold uppercase tracking-wider text-brand-400">tú</span>
          <span v-if="ficha.admin" class="sk-chip !px-2 !py-0.5 !text-[10px]">Admin</span>
        </span>
        <span class="mt-0.5 block truncate text-[11px] text-slate-400">
          <template v-if="!sinDatos">{{ ficha.canciones }} canciones</template>
          <template v-else>Sin escuchas esta semana</template>
        </span>
      </span>

      <span class="flex shrink-0 flex-col items-end gap-1">
        <span
          class="font-mono text-sm font-bold tabular-nums"
          :class="sinDatos ? 'text-slate-600' : 'text-brand-400'"
        >{{ sinDatos ? '—' : formatearHoras(ficha.minutos) }}</span>
        <GrupoIcono
          v-if="!sinDatos"
          name="chevron"
          class="h-4 w-4 text-slate-500 transition-transform duration-300"
          :class="abierta ? '-rotate-90' : 'rotate-90'"
        />
      </span>
    </button>

    <!-- Detalle desplegable. Se queda en el DOM (también para lectores de
         pantalla con la ficha abierta); la altura anima con grid-rows. -->
    <div
      v-if="!sinDatos"
      :id="`ficha-${ficha.id}`"
      class="desplegable grid"
      :class="abierta ? 'abierta' : ''"
    >
      <div class="min-h-0 overflow-hidden">
        <div class="space-y-3 px-3 pb-3">
          <!-- Lo más escuchado, con las veces que sonó. -->
          <div v-if="ficha.artista || ficha.tema" class="grid gap-1.5 sm:grid-cols-2">
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
          <ul v-if="cifras.length" class="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
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
import { computed, onMounted, ref } from 'vue'
import GrupoIcono from './GrupoIcono.js'
import { formatearHoras, inicialDe } from '@/lib/gruposResumen'
import { cifrasDe } from '@/lib/gruposExtras'

const CIRCUNFERENCIA = 2 * Math.PI * 20

const props = defineProps({
  ficha: { type: Object, required: true },
  posicion: { type: Number, default: 0 },
  /** Su tiempo respecto al que más ha escuchado, de 0 a 1. */
  progreso: { type: Number, default: 0 },
  indice: { type: Number, default: 0 },
  abiertaAlInicio: { type: Boolean, default: false }
})

const sinDatos = computed(() => !(Number(props.ficha.minutos) > 0))
const abierta = ref(props.abiertaAlInicio && !sinDatos.value)
const cifras = computed(() => cifrasDe(props.ficha.datos))

// El anillo y las barras parten de cero y crecen al montarse la ficha. En el
// render del servidor (pruebas) quedan a cero; el valor está en el texto.
const visible = ref(false)
onMounted(() => {
  requestAnimationFrame(() => { visible.value = true })
})

const claseMedalla = computed(() => {
  if (sinDatos.value) return 'bg-white/[0.06] text-slate-500'
  if (props.posicion === 1) return 'oro text-black'
  if (props.posicion === 2) return 'plata text-black'
  if (props.posicion === 3) return 'bronce text-black'
  return 'bg-white/[0.10] text-slate-300'
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

/* Podio: degradados metálicos; el primero lleva un brillo que pasa despacio. */
.oro { background: linear-gradient(135deg, #fde68a, #f59e0b 55%, #fcd34d); }
.plata { background: linear-gradient(135deg, #f1f5f9, #94a3b8 55%, #e2e8f0); }
.bronce { background: linear-gradient(135deg, #fed7aa, #c2410c 60%, #fdba74); }

.oro::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, 0.75) 50%, transparent 70%);
  background-size: 250% 100%;
  animation: brillo 3.2s ease-in-out infinite;
}

@keyframes brillo {
  0%, 60% { background-position: 150% 0; }
  100% { background-position: -100% 0; }
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
  .ficha, .oro::after { animation: none !important; }
  .anillo, .desplegable, .cifra, .barra { transition: none !important; }
}
</style>
