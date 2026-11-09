<template>
  <div data-grupo-detalle>
    <slot name="aviso" />

    <!-- ── Portada: el resumen del grupo en el periodo elegido ───────────────
         Es lo primero y lo que más pesa: tiempo total del grupo, podio y
         cuánto lleva cada uno respecto al líder. El nombre y los miembros los
         pone el panel plegable que lo contiene. -->
    <section class="portada mx-3 overflow-hidden rounded-card" data-portada>
      <div class="flex items-center gap-2 px-3.5 pt-3.5">
        <SelectorPeriodo v-model="periodo" :periodos="PERIODOS" aria-label="Periodo del resumen" />
        <span class="mr-auto" />
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

      <form v-if="editando" class="flex items-center gap-2 px-3.5 pt-3" @submit.prevent="guardarNombre">
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

      <!-- Cifra principal: el tiempo que ha escuchado el grupo entero. -->
      <div class="px-3.5 pt-4">
        <p class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <span>{{ etiquetaPeriodo }}</span>
          <button
            type="button"
            class="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/[0.1] hover:text-slate-100"
            :aria-expanded="notaAbierta"
            aria-controls="portada-nota"
            aria-label="Sobre estas cifras"
            data-info-provisional
            @click="notaAbierta = !notaAbierta"
          >
            <GrupoIcono name="info" class="h-3.5 w-3.5" />
          </button>
        </p>
        <p class="mt-1 break-words font-mono text-[26px] font-extrabold leading-none tabular-nums text-white sm:text-3xl" data-total-horas>
          {{ formatearHoras(totalMinutos) }}
        </p>
        <p class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
          <span class="inline-flex items-center gap-1"><GrupoIcono name="users" class="h-3.5 w-3.5" />{{ miembros.length }} {{ miembros.length === 1 ? 'miembro' : 'miembros' }}</span>
          <span class="inline-flex items-center gap-1"><GrupoIcono name="note" class="h-3.5 w-3.5" />{{ totalCanciones }} canciones</span>
        </p>
        <div id="portada-nota" class="desplegable grid" :class="notaAbierta ? 'abierta' : ''" :inert="!notaAbierta">
          <div class="min-h-0 overflow-hidden">
            <p class="mt-2.5 rounded-md bg-white/[0.06] px-3 py-2 text-[11px] leading-relaxed text-slate-300" data-nota-provisional>
              Cifras provisionales: pueden cambiar cuando los demás miembros abran la app y publiquen sus últimas escuchas.
            </p>
          </div>
        </div>
      </div>

      <!-- Podio. Sin mover nodos: el orden visual (2º, 1º, 3º) lo da `order`,
           así las medallas no reinician su animación cuando alguien sube o
           baja de puesto. -->
      <p v-if="filas.length && !podio.length" class="px-3.5 pb-4 pt-3 text-xs text-slate-400">
        No hay escuchas {{ periodo === 'mes' ? 'este mes' : 'esta semana' }}.
      </p>
      <p v-else-if="!filas.length" class="px-3.5 pb-4 pt-3 text-xs text-slate-400">
        Todavía no se ha podido leer la lista de miembros.
      </p>
      <ul v-if="podio.length" class="flex items-end justify-center gap-2 px-3.5 pb-0 pt-4" data-podio>
        <li
          v-for="item in podio"
          :key="item.id"
          class="podio-col flex min-w-0 flex-1 flex-col items-center"
          :style="{ order: ORDEN_PODIO[item.puesto - 1], maxWidth: '8rem' }"
          :data-podio-puesto="item.puesto"
        >
          <span
            class="flex items-center justify-center rounded-full font-bold"
            :class="[item.yo ? 'bg-brand-400 text-black' : 'bg-white/[0.14] text-slate-100', item.puesto === 1 ? 'h-14 w-14 text-lg' : 'h-11 w-11 text-sm']"
          >{{ inicialDe(item.nombre) }}</span>
          <span class="mt-1.5 w-full truncate text-center text-[11px] font-semibold text-white" :title="item.nombre">{{ item.nombre }}</span>
          <span class="font-mono text-[11px] font-bold tabular-nums text-brand-400">{{ formatearHorasCorto(item.minutos) }}</span>
          <span class="barra-podio mt-1.5 flex w-full items-start justify-center rounded-t-lg pt-1.5" :style="{ height: `${item.alto}px` }">
            <Medalla :posicion="item.puesto" tamano="lg" />
          </span>
        </li>
      </ul>

      <!-- Tú respecto al líder, cuando no estás en el podio. -->
      <p v-if="miPuesto" class="mx-3.5 mb-3.5 mt-3 flex items-center justify-between gap-2 rounded-md bg-white/[0.06] px-3 py-2 text-[11px] text-slate-200" data-mi-puesto>
        <span class="min-w-0 truncate font-semibold">Tú · puesto {{ miPuesto.puesto }}</span>
        <span class="shrink-0 font-mono tabular-nums text-slate-400">{{ miPuesto.pct }} % del líder</span>
      </p>
      <div v-else-if="podio.length" class="h-px" />
    </section>

    <!-- ── Miembros ─────────────────────────────────────────────────────── -->
    <section class="px-3 pb-1 pt-4" data-seccion="miembros">
      <div class="mb-2 flex items-center justify-between gap-2 px-0.5">
        <h3 class="sk-eyebrow">Miembros</h3>
        <span class="sk-chip !px-2 !py-0.5 tabular-nums">{{ miembros.length }}</span>
      </div>

      <!-- Sin mover nodos: el orden visual lo da `order`. -->
      <ul v-if="filas.length" class="flex flex-col gap-2">
        <MiembroFicha
          v-for="(item, idx) in filasVisibles"
          :key="item.id"
          :ficha="item"
          :posicion="idx + 1"
          :indice="idx"
          :progreso="aporte.get(item.id) || 0"
          :puede-expulsar="esAdmin && !item.yo"
          :comun="item.yo ? null : comunConMiembro(rankingActual, item.id)"
          :sin-datos-texto="periodo === 'mes' ? 'Sin escuchas este mes' : 'Sin escuchas esta semana'"
          :registro="registroDe(item.id)"
          :descargar="descargarRegistro"
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
    </section>

    <!-- ── Invitar y abandonar ──────────────────────────────────────────── -->
    <footer class="px-3 pb-4 pt-3">
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
 * el número de miembros). De arriba abajo:
 *
 *   · la portada, con el selector Semana / Mes, el tiempo total del grupo, el
 *     podio (top 3) y, si no estás en él, tu puesto respecto al líder; en su
 *     barra, cambiar el nombre (administrador) y actualizar;
 *   · los miembros: cada ficha con su % de escucha común contigo (en la de los
 *     demás) y, tras un icono de información, el registro de funcionalidad de
 *     ese miembro. Plegado, sólo el top 3 y «Ver todos»;
 *   · invitar y abandonar.
 *
 * Es sólo presentación. Invitar y expulsar son cosa del administrador: el botón
 * y la acción de cada ficha sólo salen con `esAdmin`, y el kit lo vuelve a
 * exigir al escribir.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import GrupoIcono from './GrupoIcono.js'
import MiembroFicha from './MiembroFicha.vue'
import Medalla from './Medalla.vue'
import SelectorPeriodo from './SelectorPeriodo.vue'
import { formatearHoras, formatearHorasCorto, inicialDe, proporciones } from '@/lib/gruposResumen'
import { comunConMiembro } from '@/lib/gruposExtras'

const props = defineProps({
  nombre: { type: String, required: true },
  /** [{ id, nombre, yo, admin, desde, minutos }] */
  miembros: { type: Array, default: () => [] },
  /**
   * Una clasificación por periodo: { semana, mes }, cada una con las fichas ya
   * ordenadas por tiempo: [{ id, nombre, yo, minutos, canciones, … }].
   */
  ranking: { type: Object, default: () => ({}) },
  esAdmin: { type: Boolean, default: false },
  puedeInvitar: { type: Boolean, default: true },
  invitando: { type: Boolean, default: false },
  actualizando: { type: Boolean, default: false },
  ultimaSync: { type: String, default: '' },
  /** [{ id, nombre, yo, version, subidoEn, filas, total }] — versión y registro de cada miembro. */
  registros: { type: Array, default: () => [] },
  /** async (id) => ruta del JSON descargado. */
  descargarRegistro: { type: Function, default: async () => '' }
})
const emit = defineEmits(['actualizar', 'invitar', 'abandonar', 'expulsar', 'renombrar'])

const PERIODOS = [
  { id: 'semana', etiqueta: 'Semana' },
  { id: 'mes', etiqueta: 'Mes' }
]
const periodo = ref('semana')
/** Fichas del periodo elegido (la semana o el mes en curso). */
const rankingActual = computed(() => props.ranking[periodo.value] || [])

/** «Esta semana» o el mes en curso («Noviembre de 2026»). */
const etiquetaPeriodo = computed(() => {
  if (periodo.value === 'mes') {
    const m = new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    return m.charAt(0).toUpperCase() + m.slice(1)
  }
  return 'Esta semana'
})

/**
 * Una fila por miembro: primero quienes tienen cifras en el periodo elegido (ya
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

// ── Portada ─────────────────────────────────────────────────────────────────
const totalMinutos = computed(() => filas.value.reduce((s, f) => s + (Number(f.minutos) || 0), 0))
const totalCanciones = computed(() => filas.value.reduce((s, f) => s + (Number(f.canciones) || 0), 0))

/** Alto de la barra del podio: de 36 px (casi sin escucha) a 76 px (el líder). */
const ALTO_MIN = 36
const ALTO_MAX = 76
/** Disposición clásica: el 2º a la izquierda, el 1º en el centro y el 3º a la derecha. */
const ORDEN_PODIO = [1, 0, 2]
const podio = computed(() => {
  const top = filas.value.filter(f => f.minutos > 0).slice(0, 3)
  const lider = top[0]?.minutos || 0
  return top.map((f, i) => ({
    ...f,
    puesto: i + 1,
    alto: Math.round(ALTO_MIN + (ALTO_MAX - ALTO_MIN) * (lider ? f.minutos / lider : 0))
  }))
})
/** Tu puesto y tu parte respecto al líder, sólo si no estás ya en el podio. */
const miPuesto = computed(() => {
  const i = filas.value.findIndex(f => f.yo)
  if (i < 3 || !(filas.value[i].minutos > 0)) return null
  const lider = filas.value[0]?.minutos || 0
  return { puesto: i + 1, pct: lider ? Math.round((filas.value[i].minutos / lider) * 100) : 0 }
})
const notaAbierta = ref(false)

/** Plegado, sólo el top 3 de miembros; el resto sale con «Ver todos». */
const TOP_PLEGADO = 3
const verTodos = ref(false)
const filasVisibles = computed(() => verTodos.value ? filas.value : filas.value.slice(0, TOP_PLEGADO))

/** El registro de funcionalidad de un miembro, o null si aún no ha publicado nada. */
function registroDe (id) {
  return props.registros.find(r => r.id === id) || null
}

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
.portada {
  background:
    radial-gradient(120% 90% at 100% 0%, rgba(30, 215, 96, 0.2), transparent 60%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.03));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07);
}

.barra-podio {
  background: linear-gradient(180deg, rgba(30, 215, 96, 0.34), rgba(30, 215, 96, 0.08));
  transition: height 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}

.podio-col { animation: entrada 0.45s cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes entrada {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.desplegable {
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}
.desplegable.abierta { grid-template-rows: 1fr; }

.girar { animation: girar 0.9s linear infinite; }
@keyframes girar { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .girar, .podio-col { animation: none !important; }
  .barra-podio, .desplegable { transition: none !important; }
}
</style>
