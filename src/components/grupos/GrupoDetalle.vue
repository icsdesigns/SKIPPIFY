<template>
  <div data-grupo-detalle>
    <!-- ── Barra del grupo: cambiar nombre (admin) y actualizar, sólo iconos ─
         El nombre y los miembros los pone el panel plegable que lo contiene. -->
    <div class="flex items-center justify-end gap-2 px-5 pb-3 pt-1">
      <p v-if="ultimaSync" class="mr-auto min-w-0 truncate text-[11px] text-slate-500">Sincronizado {{ ultimaSync }}</p>
      <button
        v-if="esAdmin"
        type="button"
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-slate-200 transition-colors hover:bg-white/[0.16]"
        :aria-expanded="editando"
        title="Cambiar el nombre del grupo"
        aria-label="Cambiar el nombre del grupo"
        data-renombrar
        @click="abrirEdicion"
      >
        <GrupoIcono name="pencil" class="h-4 w-4" />
      </button>
      <button
        type="button"
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-slate-200 transition-colors hover:bg-white/[0.16] disabled:opacity-40"
        :disabled="actualizando"
        :title="ultimaSync ? `Última sincronización: ${ultimaSync}` : 'Actualizar'"
        aria-label="Actualizar"
        @click="$emit('actualizar')"
      >
        <GrupoIcono name="refresh" class="h-[18px] w-[18px]" :class="actualizando ? 'girar' : ''" />
      </button>
    </div>

    <form v-if="editando" class="flex items-center gap-2 px-5 pb-3" @submit.prevent="guardarNombre">
      <input
        v-model.trim="nombreNuevo"
        class="sk-input min-w-0 flex-1"
        maxlength="32"
        placeholder="Nombre del grupo (mín. 3 caracteres)"
        aria-label="Nombre del grupo"
        data-nombre-grupo
      >
      <button
        type="submit"
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-400 text-black transition-opacity disabled:opacity-40"
        :disabled="!nombreValido"
        title="Guardar"
        aria-label="Guardar nombre"
      >
        <GrupoIcono name="check" class="h-[18px] w-[18px]" />
      </button>
      <button
        type="button"
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-slate-200 hover:bg-white/[0.16]"
        title="Cancelar"
        aria-label="Cancelar"
        @click="editando = false"
      >
        <GrupoIcono name="plus" class="h-[18px] w-[18px] rotate-45" />
      </button>
    </form>

    <slot name="aviso" />

    <!-- ── Ranking ──────────────────────────────────────────────────────── -->
    <SeccionGrupo id="ranking" titulo="Ranking" icono="medal" inicial>
      <template #accion>
        <SelectorSemana v-model="semanaRanking" :semanas="semanasDisponibles" aria-label="Semana del ranking" />
      </template>

      <p v-if="!filas.length" class="text-xs text-slate-500">Todavía no se ha podido leer la lista de miembros.</p>
      <p v-else-if="!rankingActual.length" class="mb-2.5 text-xs text-slate-500">No hay escuchas en esta semana.</p>

      <!-- Sin mover nodos: el orden visual lo da `order`, así las medallas no
           reinician su animación cuando alguien sube o baja de puesto. -->
      <ul v-if="filas.length" class="flex flex-col gap-2">
        <MiembroFicha
          v-for="(item, idx) in filasVisibles"
          :key="item.id"
          :ficha="item"
          :posicion="idx + 1"
          :indice="idx"
          :progreso="aporte.get(item.id) || 0"
          :puede-expulsar="esAdmin && !item.yo"
          :style="{ order: idx }"
          @expulsar="$emit('expulsar', item.id)"
        />
      </ul>
      <button
        v-if="filas.length > TOP_PLEGADO"
        type="button"
        class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-[11px] font-semibold text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-slate-200"
        :aria-expanded="verTodos"
        data-ver-todos
        @click="verTodos = !verTodos"
      >
        {{ verTodos ? 'Ver menos' : `Ver todos (${filas.length})` }}
        <GrupoIcono name="chevron" class="h-3.5 w-3.5 transition-transform duration-300" :class="verTodos ? '-rotate-90' : 'rotate-90'" />
      </button>
      <p v-if="filas.some(f => f.minutos > 0)" class="mt-2 text-[11px] text-slate-500">
        Toca a un miembro para ver sus cifras. El anillo es su tiempo respecto al que más ha escuchado.
      </p>
    </SeccionGrupo>

    <!-- ── Escucha común ────────────────────────────────────────────────── -->
    <SeccionGrupo id="comun" titulo="Escucha común" icono="users">
      <template #accion>
        <SelectorSemana v-model="semanaComun" :semanas="semanasDisponibles" aria-label="Semana de la escucha común" />
      </template>

      <template #default="{ abierta }">
      <p class="mb-2.5 text-[11px] text-slate-500" title="La parte de su escucha que coincide, artista a artista">100 % = oís lo mismo</p>
      <p v-if="!pares.length" class="text-xs text-slate-500">
        Aparecerá cuando al menos dos miembros tengan escuchas en la semana elegida.
      </p>
      <ul v-else class="grid gap-2 sm:grid-cols-2">
        <li
          v-for="(par, i) in paresVisibles"
          :key="`${par.idA}-${par.idB}`"
          class="flex items-center gap-3 rounded-card px-3 py-2.5"
          :class="par.yo ? 'bg-brand-400/[0.10] ring-1 ring-inset ring-brand-400/30' : 'bg-white/[0.04]'"
        >
          <span class="relative h-9 w-[60px] shrink-0" aria-hidden="true">
            <span class="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-full bg-slate-600 pr-2 text-xs font-bold text-slate-100 ring-2 ring-black/50">{{ inicialDe(par.a) }}</span>
            <span class="absolute left-6 top-0 flex h-9 w-9 items-center justify-center rounded-full bg-brand-400 text-xs font-bold text-black ring-2 ring-black/50">{{ inicialDe(par.b) }}</span>
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold text-white">{{ par.a }} · {{ par.b }}</span>
            <span class="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/[0.08]">
              <span class="barra-par block h-full rounded-full bg-brand-400" :style="{ width: `${abierta ? par.pct : 0}%`, transitionDelay: `${i * 50 + 150}ms` }" />
            </span>
          </span>
          <span class="relative h-11 w-11 shrink-0">
            <svg viewBox="0 0 44 44" class="absolute inset-0 h-11 w-11 -rotate-90" aria-hidden="true">
              <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" stroke-width="3.5" class="text-white/[0.08]" />
              <circle
                cx="22" cy="22" r="18" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"
                class="anillo-par text-brand-400"
                :stroke-dasharray="CIRC_PAR"
                :stroke-dashoffset="CIRC_PAR * (1 - (abierta ? par.pct / 100 : 0))"
                :style="{ transitionDelay: `${i * 50 + 150}ms` }"
              />
            </svg>
            <span class="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-bold tabular-nums text-white">{{ par.pct }} %</span>
          </span>
        </li>
      </ul>
      <button
        v-if="pares.length > PARES_PLEGADOS"
        type="button"
        class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-[11px] font-semibold text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-slate-200"
        :aria-expanded="verTodasLasParejas"
        @click="verTodasLasParejas = !verTodasLasParejas"
      >
        {{ verTodasLasParejas ? 'Ver menos' : `Ver las ${pares.length} parejas` }}
        <GrupoIcono name="chevron" class="h-3.5 w-3.5 transition-transform duration-300" :class="verTodasLasParejas ? '-rotate-90' : 'rotate-90'" />
      </button>
      </template>
    </SeccionGrupo>

    <!-- ── Invitar y abandonar ──────────────────────────────────────────── -->
    <footer class="border-t border-white/[0.07] px-5 py-4">
      <div class="flex gap-2">
        <button
          v-if="esAdmin"
          type="button"
          class="sk-btn sk-btn-primary sk-btn-sm flex-1"
          :disabled="!puedeInvitar || invitando"
          @click="$emit('invitar')"
        >
          <GrupoIcono name="userPlus" class="h-4 w-4" />{{ invitando ? 'Generando…' : 'Invitar' }}
        </button>
        <button type="button" class="sk-btn sk-btn-danger sk-btn-sm flex-1" @click="abandonar">
          <GrupoIcono name="logout" class="h-4 w-4" />{{ confirmando ? '¿Seguro? Pulsa otra vez' : 'Abandonar' }}
        </button>
      </div>
      <slot name="invitacion" />
    </footer>
  </div>
</template>

<script setup>
/**
 * Detalle de un grupo (va dentro de su panel plegable, que ya muestra el nombre y
 * el número de miembros): barra con cambiar nombre (administrador) y actualizar; el ranking y la escucha común (cada uno con su desplegable de
 * semana: actual, anterior y hace dos); y los botones de invitar y abandonar.
 *
 * Es sólo presentación. Invitar y expulsar son cosa del administrador: el botón
 * y la acción de cada ficha sólo salen con `esAdmin`, y el kit lo vuelve a
 * exigir al escribir.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import GrupoIcono from './GrupoIcono.js'
import MiembroFicha from './MiembroFicha.vue'
import SeccionGrupo from './SeccionGrupo.vue'
import SelectorSemana from './SelectorSemana.vue'
import { inicialDe, proporciones } from '@/lib/gruposResumen'
import { paresEnComun } from '@/lib/gruposExtras'

const props = defineProps({
  nombre: { type: String, required: true },
  /** [{ id, nombre, yo, admin, desde, minutos }] */
  miembros: { type: Array, default: () => [] },
  /**
   * Una clasificación por semana: { actual, pasada, hace2 }, cada una
   * [{ id, nombre, yo, minutos, canciones, … }] ya ordenada por tiempo.
   */
  ranking: { type: Object, default: () => ({}) },
  esAdmin: { type: Boolean, default: false },
  puedeInvitar: { type: Boolean, default: true },
  invitando: { type: Boolean, default: false },
  actualizando: { type: Boolean, default: false },
  ultimaSync: { type: String, default: '' }
})
const emit = defineEmits(['actualizar', 'invitar', 'abandonar', 'expulsar', 'renombrar'])

const semanasDisponibles = [
  { id: 'actual', etiqueta: 'Esta semana' },
  { id: 'pasada', etiqueta: 'Semana pasada' },
  { id: 'hace2', etiqueta: 'Hace 2 semanas' }
]
const semanaRanking = ref('actual')
const rankingActual = computed(() => props.ranking[semanaRanking.value] || [])

/**
 * Una fila por miembro: primero quienes tienen cifras en la semana elegida (ya
 * ordenadas por tiempo), luego el resto del grupo.
 */
const filas = computed(() => {
  const porId = new Map(props.miembros.map(m => [m.id, m]))
  const vistas = new Set()
  const conDatos = rankingActual.value.map((r) => {
    vistas.add(r.id)
    const m = porId.get(r.id)
    return { ...r, admin: !!m?.admin, desde: m?.desde || '', yo: r.yo || !!m?.yo }
  })
  const resto = props.miembros
    .filter(m => !vistas.has(m.id))
    .map(m => ({ id: m.id, nombre: m.nombre, yo: m.yo, admin: m.admin, desde: m.desde, minutos: 0, canciones: 0, extras: [] }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'))
  return [...conDatos, ...resto]
})
const aporte = computed(() => proporciones(filas.value))

/** Plegado, sólo el podio del ranking; el resto sale con «Ver todos». */
const TOP_PLEGADO = 3
const verTodos = ref(false)
const filasVisibles = computed(() => verTodos.value ? filas.value : filas.value.slice(0, TOP_PLEGADO))

// Cambiar el nombre (sólo administrador): el campo sale al pulsar el lápiz.
const editando = ref(false)
const nombreNuevo = ref('')
const nombreValido = computed(() => nombreNuevo.value.length >= 3 && nombreNuevo.value !== props.nombre)
function abrirEdicion () {
  editando.value = !editando.value
  nombreNuevo.value = props.nombre
}
function guardarNombre () {
  if (!nombreValido.value) return
  emit('renombrar', nombreNuevo.value)
  editando.value = false
}

// Escucha común: la semana elegida es la del desplegable de esa sección.
const semanaComun = ref('actual')
const pares = computed(() => paresEnComun(props.ranking[semanaComun.value] || []))
const CIRC_PAR = 2 * Math.PI * 18
/** Plegadas, sólo las parejas más parecidas: con 5 miembros ya son 10. */
const PARES_PLEGADOS = 3
const verTodasLasParejas = ref(false)
const paresVisibles = computed(() => verTodasLasParejas.value ? pares.value : pares.value.slice(0, PARES_PLEGADOS))

/** Abandonar es irreversible sin otra invitación: se pide una segunda pulsación. */
const confirmando = ref(false)
let confirmTimer = null
function abandonar () {
  if (!confirmando.value) {
    confirmando.value = true
    clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => { confirmando.value = false }, 4000)
    return
  }
  confirmando.value = false
  clearTimeout(confirmTimer)
  emit('abandonar')
}
onBeforeUnmount(() => clearTimeout(confirmTimer))
</script>

<style scoped>
.girar { animation: girar 0.9s linear infinite; }
@keyframes girar { to { transform: rotate(360deg); } }
.anillo-par { transition: stroke-dashoffset 1s cubic-bezier(0.22, 1, 0.36, 1); }
.barra-par { transition: width 0.9s cubic-bezier(0.22, 1, 0.36, 1); }
@media (prefers-reduced-motion: reduce) {
  .girar { animation: none !important; }
  .anillo-par, .barra-par { transition: none !important; }
}
</style>
