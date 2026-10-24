<template>
  <nav class="sk-card overflow-hidden" aria-label="Grupos de Comunidad">
    <!-- Ruta actual. Plegado, el árbol se queda en esta línea: dice dónde estás
         sin quitarle sitio al grupo, que es lo que se viene a mirar. -->
    <button
      type="button"
      class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
      :aria-expanded="abierto"
      aria-controls="comunidad-arbol"
      @click="alternar"
    >
      <span class="min-w-0 flex-1">
        <span class="sk-eyebrow block">Estás en</span>
        <ol class="mt-0.5 flex min-w-0 items-center gap-1 text-sm font-bold" data-migas>
          <li class="shrink-0 text-slate-300">{{ raizActual?.titulo }}</li>
          <li class="shrink-0 text-slate-600" aria-hidden="true">
            <GrupoIcono name="chevron" class="h-3.5 w-3.5" />
          </li>
          <li class="min-w-0 truncate" :class="grupoActual ? 'text-white' : 'text-slate-500'">
            {{ grupoActual ? grupoActual.nombre : 'Sin grupo' }}
          </li>
        </ol>
      </span>
      <span class="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-slate-400">
        {{ abierto ? 'Ocultar' : 'Cambiar' }}
        <GrupoIcono
          name="chevron"
          class="h-4 w-4 transition-transform duration-200"
          :class="abierto ? '-rotate-90' : 'rotate-90'"
        />
      </span>
    </button>

    <div v-show="abierto" id="comunidad-arbol" class="border-t border-white/[0.07] p-2">
      <ul aria-label="Modos y grupos">
        <li
          v-for="raiz in raices"
          :key="raiz.id"
          class="mt-1 first:mt-0"
        >
          <!-- Raíz: el modo. La fila lleva a ese modo (al último grupo abierto en
               él); la flecha sólo despliega sus grupos, para saltar directamente
               a uno de ellos sin pasar antes por el modo. -->
          <div
            class="flex items-center rounded-md transition-colors"
            :class="raiz.id === modo ? 'bg-white/[0.06]' : 'hover:bg-white/[0.05]'"
          >
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-2.5 text-left"
              :aria-current="raiz.id === modo && !grupoActual ? 'location' : undefined"
              :data-raiz="raiz.id"
              @click="tocarRaiz(raiz.id)"
            >
              <span
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                :class="raiz.id === modo ? 'bg-brand-400/25 text-brand-200' : 'bg-white/[0.08] text-slate-400'"
              >
                <GrupoIcono :name="raiz.icono" class="h-[18px] w-[18px]" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-bold" :class="raiz.id === modo ? 'text-white' : 'text-slate-300'">{{ raiz.titulo }}</span>
                <span class="block truncate text-[11px] text-slate-500">{{ raiz.nota || resumenRaiz(raiz) }}</span>
              </span>
              <span class="sk-chip shrink-0 !px-2 !py-0.5 tabular-nums">{{ raiz.grupos.length }} / {{ raiz.max }}</span>
            </button>
            <button
              type="button"
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:text-slate-200"
              :aria-expanded="expandida(raiz.id)"
              :aria-label="`${expandida(raiz.id) ? 'Plegar' : 'Desplegar'} los grupos de ${raiz.titulo}`"
              :data-desplegar="raiz.id"
              @click="alternarRaiz(raiz.id)"
            >
              <GrupoIcono
                name="chevron"
                class="h-4 w-4 transition-transform duration-200"
                :class="expandida(raiz.id) ? 'rotate-90' : ''"
              />
            </button>
          </div>

          <!-- Hijos: los grupos del modo y, al final, la entrada a uno nuevo. La
               línea de la izquierda es la rama: une los grupos con su modo. -->
          <ul
            v-if="expandida(raiz.id)"


            class="mb-1 ml-[29px] mt-1 space-y-1 border-l border-white/[0.09] pl-2.5"
          >
            <li v-for="g in raiz.grupos" :key="g.id">
              <button
                type="button"
                class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors"
                :class="esActual(raiz.id, g.id)
                  ? 'bg-brand-400/[0.12] ring-1 ring-brand-400/60'
                  : 'hover:bg-white/[0.06]'"
                :aria-current="esActual(raiz.id, g.id) ? 'location' : undefined"
                :data-grupo="g.id"
                @click="$emit('grupo', raiz.id, g.id)"
              >
                <!-- Punto lleno: aquí estás. Hueco: el último abierto de ese modo,
                     al que se vuelve al cambiar de modo. -->
                <span
                  class="h-2 w-2 shrink-0 rounded-full"
                  :class="esActual(raiz.id, g.id)
                    ? 'bg-brand-400'
                    : g.id === raiz.activoId ? 'ring-[1.5px] ring-inset ring-slate-400' : 'bg-white/[0.14]'"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold" :class="esActual(raiz.id, g.id) ? 'text-white' : 'text-slate-200'" :title="g.nombre">{{ g.nombre }}</span>
                  <span v-if="g.aviso" class="block truncate text-[11px] text-sky-300">{{ g.aviso }}</span>
                  <span v-else-if="g.detalle" class="block truncate text-[11px] text-slate-500">{{ g.detalle }}</span>
                </span>
              </button>
            </li>
            <li>
              <button
                type="button"
                class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
                :data-alta="raiz.id"
                @click="$emit('alta', raiz.id)"
              >
                <GrupoIcono name="plus" class="h-3.5 w-3.5 shrink-0" />
                <span class="text-[13px] font-semibold">{{ raiz.grupos.length ? 'Crear o unirme a otro' : 'Crear o unirme a un grupo' }}</span>
              </button>
            </li>
          </ul>
        </li>
      </ul>
    </div>
  </nav>
</template>

<script setup>
/**
 * Árbol de Comunidad: los dos modos como raíces y sus grupos como hijos.
 *
 * Antes cada modo pintaba su propia lista y sólo se veían los grupos del modo
 * elegido, así que no se percibía la jerarquía ni se podía saltar de un grupo
 * con servidor a uno sin servidor. Este componente sólo pinta y avisa: quien lo
 * usa decide qué hacer con cada toque, porque cada modo tiene su composable.
 */
import { computed, reactive, ref, watch } from 'vue'
import GrupoIcono from './GrupoIcono.js'

const props = defineProps({
  modo: { type: String, required: true },
  /** [{ id, titulo, icono, max, activoId, nota?, grupos: [{ id, nombre, detalle?, aviso? }] }] */
  raices: { type: Array, required: true }
})
const emit = defineEmits(['modo', 'grupo', 'alta'])

const ABIERTO_KEY = 'skippify-community-tree-open'
function abiertoInicial () {
  try { return localStorage.getItem(ABIERTO_KEY) !== '0' } catch { return true }
}
const abierto = ref(abiertoInicial())
function alternar () {
  abierto.value = !abierto.value
  try { localStorage.setItem(ABIERTO_KEY, abierto.value ? '1' : '0') } catch { /* sin almacenamiento */ }
}

// Al entrar sólo se despliega el modo en el que estás: con cinco grupos por
// modo, los dos abiertos llenaban la pantalla del móvil antes de llegar al grupo.
const desplegadas = reactive(new Set([props.modo]))
watch(() => props.modo, (m) => desplegadas.add(m))
const expandida = (id) => desplegadas.has(id)

function alternarRaiz (id) {
  if (desplegadas.has(id)) desplegadas.delete(id)
  else desplegadas.add(id)
}

function tocarRaiz (id) {
  if (id !== props.modo) emit('modo', id)
  else alternarRaiz(id)
}

const raizActual = computed(() => props.raices.find(r => r.id === props.modo) || props.raices[0])
const grupoActual = computed(() => raizActual.value?.grupos.find(g => g.id === raizActual.value.activoId) || null)
const esActual = (raizId, grupoId) => raizId === props.modo && grupoId === raizActual.value?.activoId

/** «2 grupos · Los del garaje»: en el modo que no es el actual, a qué grupo se volvería. */
function resumenRaiz (raiz) {
  const n = raiz.grupos.length
  if (!n) return 'Ningún grupo todavía'
  const ultimo = raiz.id !== props.modo ? raiz.grupos.find(g => g.id === raiz.activoId) : null
  return [`${n} ${n === 1 ? 'grupo' : 'grupos'}`, ultimo?.nombre].filter(Boolean).join(' · ')
}
</script>
