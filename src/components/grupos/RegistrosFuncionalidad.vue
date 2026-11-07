<template>
  <div data-registros-funcionalidad>
    <p v-if="!registros.length" class="text-xs text-slate-500">
      Aparecerán los miembros cuando se sincronice el grupo.
    </p>

    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="r in registros"
        :key="r.id"
        class="rounded-card bg-white/[0.04] px-3 py-2.5"
        :class="r.yo ? 'ring-1 ring-inset ring-brand-400/30' : ''"
      >
        <div class="flex items-center gap-2">
          <span class="min-w-0 flex-1 truncate text-sm font-semibold text-white">
            {{ r.nombre }}<span v-if="r.yo" class="ml-1 text-[11px] font-normal text-slate-500">(tú)</span>
          </span>
          <!-- La versión va en claro y la ven todos los miembros del grupo. -->
          <span class="sk-chip font-mono" :title="r.version ? 'Versión de la app de este miembro' : 'Todavía no ha publicado su versión'">
            {{ r.version || 'sin versión' }}
          </span>
        </div>
        <p class="mt-1 text-[11px] text-slate-400">
          <template v-if="r.filas > 0">
            Registro subido {{ cuando(r.subidoEn) }} · {{ r.filas }} {{ r.filas === 1 ? 'fila' : 'filas' }}
          </template>
          <template v-else>Sin registro compartido</template>
        </p>
        <button
          v-if="r.filas > 0"
          type="button"
          class="sk-btn sk-btn-ghost sk-btn-sm mt-2"
          :disabled="ocupado"
          :data-descargar="r.id"
          @click="pedir(r.id)"
        >
          Descargar
        </button>
      </li>
    </ul>

    <!--
      La clave es una puerta DE INTERFAZ, no seguridad: el valor está escrito en
      este mismo fichero y los registros ya viajan dentro del grupo, así que
      cualquiera con acceso al código o a los datos del grupo se la salta. Solo
      evita que se descargue un registro ajeno por un toque sin querer. No cifra
      nada y no debe presentarse como protección.
    -->
    <div v-if="hayRegistros" class="mt-3 border-t border-white/[0.07] pt-3">
      <label class="block">
        <span class="sk-eyebrow">Clave de descarga</span>
        <input
          v-model.trim="clave"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          class="sk-input mt-1.5"
          placeholder="Clave para descargar"
          data-clave-registros
          @input="error = ''"
        >
      </label>
      <button
        type="button"
        class="sk-btn sk-btn-primary sk-btn-sm mt-2 w-full"
        :disabled="ocupado"
        data-descargar-todos
        @click="pedir(null)"
      >
        {{ ocupado ? 'Descargando…' : 'Descargar todos' }}
      </button>
      <p v-if="error" class="mt-2 text-[11px] text-rose-200" role="alert">{{ error }}</p>
      <p v-else-if="mensaje" class="mt-2 text-[11px] font-semibold text-brand-400">{{ mensaje }}</p>
    </div>

    <p class="mt-3 text-[11px] leading-relaxed text-slate-500">
      Cada miembro decide en Ajustes si comparte su registro. Contiene los títulos y artistas
      de sus canciones. Se actualiza como mucho cada pocas horas.
    </p>
  </div>
</template>

<script setup>
/**
 * «Registros de funcionalidad» de un grupo: cada miembro con la versión de su
 * app, cuándo subió su registro por última vez y cuántas filas tiene, y la
 * descarga como JSON (de uno o de todos) tras escribir la clave.
 *
 * Es solo presentación: la descarga la hace quien lo monta (`descargar`).
 */
import { computed, ref } from 'vue'

/** Puerta de interfaz (ver el comentario de la plantilla): NO es seguridad. */
const CLAVE_DESCARGA = '1234'

const props = defineProps({
  /** [{ id, nombre, yo, version, subidoEn, filas, total }] */
  registros: { type: Array, default: () => [] },
  /** async (id | null) => ruta del fichero guardado. */
  descargar: { type: Function, required: true }
})

const clave = ref('')
const error = ref('')
const mensaje = ref('')
const ocupado = ref(false)

const hayRegistros = computed(() => props.registros.some(r => r.filas > 0))

function cuando (ms) {
  if (!ms) return ''
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

async function pedir (id) {
  error.value = ''
  mensaje.value = ''
  if (clave.value !== CLAVE_DESCARGA) {
    error.value = 'Clave incorrecta.'
    return
  }
  ocupado.value = true
  try {
    const ruta = await props.descargar(id)
    mensaje.value = `Guardado en ${ruta}.`
  } catch (e) {
    error.value = (e?.message || '').toString().trim() || 'No se pudo descargar el registro.'
  } finally {
    ocupado.value = false
  }
}
</script>
