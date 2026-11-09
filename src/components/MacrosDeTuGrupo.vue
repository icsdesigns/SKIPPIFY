<template>
  <FeaturePanel
    title="Macros de tu grupo"
    :subtitle="subtitulo"
    icon-class="bg-violet-400/[0.18] text-violet-200"
  >
    <template #icono><GrupoIcono name="users" class="h-5 w-5" /></template>

    <div class="space-y-3" data-macros-grupo>
      <!-- Consentimiento: apagado por defecto. Sin él no sale nada de tus macros. -->
      <OpcionFila
        plana
        compacta
        tono="violet"
        :activo="compartirMacros"
        titulo="Compartir mis macros"
        detalle="Sólo estructura y nombre; nunca tus playlists."
        data-compartir-macros
      >
        <template #icono><GrupoIcono name="share" class="h-6 w-6" /></template>
        <template #fin>
          <button
            type="button"
            role="switch"
            :aria-checked="compartirMacros"
            aria-label="Compartir mis macros con mis grupos"
            class="sk-switch shrink-0 disabled:opacity-40"
            :class="compartirMacros ? 'border-transparent bg-brand-400' : 'border-transparent bg-white/[0.18]'"
            :disabled="cambiando"
            @click="alternar"
          >
            <span class="sk-switch-knob" :class="compartirMacros ? 'translate-x-6' : 'translate-x-1'" />
          </button>
        </template>
      </OpcionFila>

      <p class="px-1 text-[11px] leading-relaxed text-slate-500">
        Se publica la estructura de tus macros (origen, acción, destino y sus ajustes) y su
        nombre, sólo en tus grupos. Nunca tus playlists, tu cuenta de Spotify ni tu historial.
        Al apagarlo se retira todo lo publicado.
      </p>

      <!-- Sin grupos: invitación a unirse. -->
      <OpcionFila
        v-if="!hasGroups"
        as="button"
        compacta
        color-tesela
        tono="violet"
        class="w-full"
        titulo="Aún no estás en ningún grupo"
        detalle="Únete a uno o crea el tuyo para ver las macros de tus amigos y compartir las tuyas."
        data-macros-sin-grupo
        @click="irAGrupos"
      >
        <template #icono><GrupoIcono name="users" class="h-6 w-6" /></template>
        <template #fin><MacroIcon name="siguiente" class="h-4 w-4 shrink-0 text-slate-500" /></template>
      </OpcionFila>

      <template v-else>
        <p class="sk-eyebrow">Compartidas por tus grupos</p>

        <p
          v-if="aviso"
          class="rounded-md bg-brand-400/[0.14] px-3 py-2 text-[11px] text-brand-100"
          role="status"
        >{{ aviso }}</p>

        <OpcionFila
          v-if="!lista.length"
          plana
          compacta
          titulo="Nadie ha compartido macros todavía"
          detalle="Cuando un miembro active «Compartir mis macros» aparecerán aquí."
        >
          <template #icono><MacroIcon name="playlist" class="h-6 w-6" /></template>
        </OpcionFila>

        <ul v-else class="space-y-2">
          <li v-for="m in lista" :key="m.clave" data-macro-compartida>
            <OpcionFila
              plana
              compacta
              color-tesela
              tono="violet"
              :titulo="m.nombre"
              :detalle="`${m.autor} · ${m.descripcion}`"
            >
              <template #icono><MacroIcon :name="actionMeta(m.action?.type)?.glyph || 'playlist'" class="h-6 w-6" /></template>
            </OpcionFila>
            <div class="mt-1.5 flex items-center justify-between gap-2 px-1">
              <span class="min-w-0 truncate text-[10px] text-slate-500" :title="m.grupos.join(', ')">
                {{ m.grupos.length > 1 ? `${m.grupos.length} grupos` : m.grupos[0] }}
              </span>
              <button
                type="button"
                class="sk-btn sk-btn-ghost sk-btn-sm inline-flex shrink-0 items-center gap-1.5"
                data-clonar
                @click="clonar(m)"
              >
                <GrupoIcono name="copy" class="h-4 w-4" />Clonar
              </button>
            </div>

            <!-- Editor de la copia: tus playlists, no las de quien la compartió. -->
            <div
              v-if="clon && clon.clave === m.clave"
              class="mt-2 space-y-2.5 rounded-xl border border-violet-400/40 bg-black/20 p-3"
              data-clon
            >
              <p class="sk-eyebrow">Personaliza tu copia</p>
              <p class="rounded-lg bg-black/30 px-3 py-2 text-xs leading-relaxed text-slate-300">{{ resumenClon }}</p>

              <label class="block text-[11px] font-semibold text-slate-400" :for="`clon-nombre-${m.clave}`">Nombre</label>
              <input
                :id="`clon-nombre-${m.clave}`"
                v-model="clon.draft.name"
                type="text"
                maxlength="60"
                placeholder="Nombre de la macro"
                class="w-full sk-input px-3 py-2.5 text-xs text-slate-200 placeholder:text-slate-600"
              >

              <template v-if="origenMeta?.needsPlaylist">
                <label class="block text-[11px] font-semibold text-slate-400" :for="`clon-origen-${m.clave}`">Tu playlist de origen</label>
                <select
                  :id="`clon-origen-${m.clave}`"
                  v-model="clon.draft.source.playlistId"
                  class="w-full sk-input px-3 py-2.5 text-xs text-slate-200"
                  @change="syncOrigen"
                >
                  <option value="">Elige una de tus playlists…</option>
                  <option v-for="pl in origenes" :key="pl.id" :value="pl.id">{{ pl.name }}</option>
                </select>
              </template>

              <template v-if="destinoMeta?.needsPlaylist">
                <label class="block text-[11px] font-semibold text-slate-400" :for="`clon-destino-${m.clave}`">Tu playlist de destino</label>
                <select
                  :id="`clon-destino-${m.clave}`"
                  v-model="clon.draft.target.playlistId"
                  class="w-full sk-input px-3 py-2.5 text-xs text-slate-200"
                  @change="syncDestino"
                >
                  <option value="">Elige una de tus playlists…</option>
                  <option v-for="pl in destinos" :key="pl.id" :value="pl.id">{{ pl.name }}</option>
                </select>
              </template>

              <template v-if="destinoMeta?.needsName">
                <label class="block text-[11px] font-semibold text-slate-400" :for="`clon-nueva-${m.clave}`">Nombre de la playlist nueva</label>
                <input
                  :id="`clon-nueva-${m.clave}`"
                  v-model="clon.draft.target.newPlaylistName"
                  type="text"
                  maxlength="60"
                  placeholder="Cómo se llamará"
                  class="w-full sk-input px-3 py-2.5 text-xs text-slate-200 placeholder:text-slate-600"
                >
              </template>

              <p v-if="errorClon" class="text-[11px] text-amber-300">{{ errorClon }}</p>

              <div class="flex justify-end gap-2">
                <button type="button" class="sk-btn sk-btn-ghost sk-btn-sm" @click="clon = null">Cancelar</button>
                <button
                  type="button"
                  class="sk-btn sk-btn-primary sk-btn-sm disabled:opacity-50"
                  :disabled="!!errorClon"
                  data-guardar-clon
                  @click="guardarClon"
                >Guardar copia</button>
              </div>
            </div>
          </li>
        </ul>
      </template>
    </div>
  </FeaturePanel>
</template>

<script setup>
/**
 * «Macros de tu grupo»: las macros que los miembros de tus grupos han compartido
 * (sólo su estructura: ver lib/macrosCompartidas.js) y el conmutador para
 * compartir las tuyas. «Clonar» abre un editor con la estructura de la otra
 * persona y SIN sus playlists: hay que elegir las tuyas (los ids de otra cuenta
 * no valen) antes de guardarla en «Tus macros».
 */
import { computed, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import FeaturePanel from '@/components/FeaturePanel.vue'
import OpcionFila from '@/components/OpcionFila.vue'
import MacroIcon from '@/components/MacroIcon.vue'
import GrupoIcono from '@/components/grupos/GrupoIcono.js'
import { useLocalLeague } from '@/composables/useLocalLeague'
import { actionMeta, createMacro, describeMacro, sourceMeta, targetMeta, validateDraft } from '@/composables/useMacros'
import { borradorDesdeCompartida } from '@/lib/macrosCompartidas'

const props = defineProps({
  /** Tus playlists, con `writable` (propias o colaborativas). */
  playlists: { type: Array, default: () => [] }
})

const router = useRouter()
const { hasGroups, compartirMacros, fijarCompartirMacros, macrosDeMisGrupos } = useLocalLeague()

const lista = computed(() => macrosDeMisGrupos.value)
const subtitulo = computed(() => {
  if (!hasGroups.value) return 'Compártelas con tu grupo y clona las suyas.'
  const n = lista.value.length
  return n ? `${n} macro(s) compartida(s) por tus grupos` : 'Aún no hay macros compartidas.'
})

const cambiando = ref(false)
async function alternar () {
  cambiando.value = true
  try { await fijarCompartirMacros(!compartirMacros.value) } finally { cambiando.value = false }
}

function irAGrupos () {
  router.push('/comunidad')
}

// ── Clonar ──────────────────────────────────────────────────────────────────

const clon = ref(null)
const aviso = ref('')
let avisoTimer = null

function clonar (m) {
  clon.value = { clave: m.clave, draft: reactive(borradorDesdeCompartida(m)) }
}

const origenMeta = computed(() => sourceMeta(clon.value?.draft.source.type))
const destinoMeta = computed(() => targetMeta(clon.value?.draft.target?.type))
const accionMeta = computed(() => actionMeta(clon.value?.draft.action.type))

/** «Mover» y «quitar del origen» borran del origen: sólo sirven tus playlists escribibles. */
const origenes = computed(() => accionMeta.value?.requiresPlaylistSource
  ? props.playlists.filter(pl => pl.writable)
  : props.playlists)
const destinos = computed(() => props.playlists.filter(pl => pl.writable))

function syncOrigen () {
  const d = clon.value?.draft
  const pl = props.playlists.find(p => p.id === d.source.playlistId)
  d.source.playlistName = pl?.name || ''
  d.source.playlistWritable = pl ? pl.writable : null
}

function syncDestino () {
  const d = clon.value?.draft
  const pl = props.playlists.find(p => p.id === d.target.playlistId)
  d.target.playlistName = pl?.name || ''
  d.target.playlistWritable = pl ? pl.writable : null
}

const errorClon = computed(() => (clon.value ? validateDraft(clon.value.draft) : ''))
const resumenClon = computed(() => (clon.value ? describeMacro(clon.value.draft) : ''))

function guardarClon () {
  if (!clon.value || errorClon.value) return
  const d = clon.value.draft
  const macro = createMacro({
    name: d.name,
    source: { ...d.source },
    action: { ...d.action },
    target: accionMeta.value?.needsTarget ? { ...d.target } : null
  })
  clon.value = null
  aviso.value = `Añadida a «Tus macros»: ${macro.name}`
  clearTimeout(avisoTimer)
  avisoTimer = setTimeout(() => { aviso.value = '' }, 5000)
}

onUnmounted(() => clearTimeout(avisoTimer))
</script>
