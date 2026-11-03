<template>
  <div class="sk-stagger space-y-4">
    <!-- Sin grupos va arriba y abierto: es lo primero que necesita quien llega. -->
    <ComunidadInfo v-if="!grupos.length" :sin-grupos="true" />

    <!-- ── Todos los grupos, como paneles plegados en línea ─────────────────
         Al abrir uno, LocalHostPanel monta dentro su detalle. -->
    <PanelGrupo
      v-for="g in grupos"
      :key="g.id"
      :grupo="g"
      :abierto="abiertoId === g.id"
      @alternar="alternar(g.id)"
    />

    <!-- ── Al final, las opciones para añadir otro ──────────────────────── -->
    <section class="sk-card px-4 py-4" data-anadir-grupo>
      <div class="mb-3 flex items-center justify-between gap-2">
        <h2 class="sk-eyebrow">Añadir grupo</h2>
        <span class="sk-chip !px-2 !py-0.5 tabular-nums">{{ grupos.length }} / {{ MAX_GROUPS }}</span>
      </div>
      <div class="grid grid-cols-2 gap-2.5">
        <button
          v-for="opcion in OPCIONES"
          :key="opcion.id"
          type="button"
          class="sk-option rounded-xl border p-3.5 text-left transition-all duration-200 disabled:opacity-40"
          :disabled="lleno"
          :data-nuevo="opcion.id"
          @click="nuevoAbierto = opcion.id"
        >
          <span class="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] text-slate-300">
            <GrupoIcono :name="opcion.icon" class="h-5 w-5" />
          </span>
          <p class="mt-2 text-sm font-bold text-white">{{ opcion.title }}</p>
          <p class="mt-0.5 text-[11px] leading-relaxed text-slate-400">{{ opcion.description }}</p>
        </button>
      </div>
      <p v-if="lleno" class="mt-2.5 text-[11px] text-slate-500">Has llegado al máximo de {{ MAX_GROUPS }} grupos: abandona uno para añadir otro.</p>
    </section>

    <LocalHostPanel v-model:nuevo="nuevoAbierto" :abierto="abiertoId" />

    <!-- Con grupos, al final y plegado. -->
    <ComunidadInfo v-if="grupos.length" :sin-grupos="false" />
  </div>
</template>

<script setup>
/**
 * Grupos — resumen de escucha compartido con grupos de amigos.
 *
 * Antes se llamaba «Liga», «Friendly-Wrapped» y «Comunidad». Los grupos viven en
 * los propios móviles (sin servidor): tus grupos, uno tras otro como paneles
 * plegados (al abrir uno salen sus resultados) y, al final, las opciones para
 * crear uno o unirte a otro.
 */
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import PanelGrupo from '@/components/grupos/PanelGrupo.vue'
import ComunidadInfo from '@/components/grupos/ComunidadInfo.vue'
import GrupoIcono from '@/components/grupos/GrupoIcono.js'
import { formatearHorasCorto } from '@/lib/gruposResumen'
// Los grupos se leen de un módulo ligero, no de useLocalLeague: así el
// desplegable los enseña sin cargar libsodium (ver src/lib/comunidadLocal.js).
import { gruposLocales, pedirGrupoLocal, releerCopiaLocal } from '@/lib/comunidadLocal'

// El núcleo criptográfico arrastra libsodium (WASM): se carga aparte.
const LocalHostPanel = defineAsyncComponent(() => import('@/components/LocalHostPanel.vue'))

/** MAX_GROUPS de useLocalLeague; no se importa aquí por el peso. */
const MAX_GROUPS = 5

/** Hoja de alta: '' cerrada, o la acción elegida ('crear' | 'unirme'). */
const nuevoAbierto = ref('')

const OPCIONES = [
  { id: 'crear', icon: 'plus', title: 'Crear grupo', description: 'Abres uno nuevo y eres su administrador.' },
  { id: 'unirme', icon: 'key', title: 'Unirme', description: 'Con el código de un amigo.' }
]

/** Grupo con el panel abierto (uno a la vez); plegados por defecto. */
const abiertoId = ref('')
function alternar (id) {
  if (abiertoId.value === id) {
    abiertoId.value = ''
    return
  }
  abiertoId.value = id
  pedirGrupoLocal(id)
}

const AVISOS = { joining: 'Esperando a entrar', restoring: 'Restaurando' }

const grupos = computed(() => gruposLocales.value.map(g => ({
  id: g.id,
  nombre: g.nombre,
  aviso: AVISOS[g.estado] || '',
  detalle: [
    g.miembros ? `${g.miembros} ${g.miembros === 1 ? 'miembro' : 'miembros'}` : '',
    g.minutos ? `${formatearHorasCorto(g.minutos)} de escucha` : ''
  ].filter(Boolean).join(' · ')
})))

const lleno = computed(() => grupos.value.length >= MAX_GROUPS)

onMounted(releerCopiaLocal)
</script>
