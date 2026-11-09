<template>
  <div class="rounded-md bg-white/[0.05] px-3 py-3" data-registro-miembro>
    <div class="flex items-center gap-2">
      <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-400/15 text-brand-300">
        <GrupoIcono name="copy" class="h-3.5 w-3.5" />
      </span>
      <p class="min-w-0 flex-1 text-xs font-bold text-white">Registro de funcionalidad</p>
      <!-- La versión va en claro y la ven todos los miembros del grupo. -->
      <span class="sk-chip shrink-0 font-mono" :title="registro?.version ? 'Versión de la app de este miembro' : 'Todavía no ha publicado su versión'">
        {{ registro?.version || 'sin versión' }}
      </span>
    </div>

    <p class="mt-2 text-[11px] leading-relaxed text-slate-400">
      <template v-if="filas > 0">
        Subido {{ cuando(registro.subidoEn) }} · {{ filas }} {{ filas === 1 ? 'fila' : 'filas' }}
      </template>
      <template v-else>Sin registro compartido. Cada miembro decide en Ajustes si lo comparte.</template>
    </p>

    <!--
      La clave es una puerta DE INTERFAZ, no seguridad: el valor está escrito en
      este mismo fichero y los registros ya viajan dentro del grupo, así que
      cualquiera con acceso al código o a los datos del grupo se la salta. Solo
      evita que se descargue un registro ajeno por un toque sin querer. No cifra
      nada y no debe presentarse como protección.
    -->
    <div v-if="filas > 0" class="mt-2.5 flex items-center gap-2">
      <input
        v-model.trim="clave"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        class="sk-input min-w-0 flex-1"
        placeholder="Clave de descarga"
        :aria-label="`Clave de descarga del registro de ${registro.nombre}`"
        data-clave-registros
        @input="error = ''"
      >
      <button
        type="button"
        class="sk-btn sk-btn-primary sk-btn-sm shrink-0"
        :disabled="ocupado"
        :data-descargar="registro.id"
        @click="pedir"
      >
        {{ ocupado ? 'Descargando…' : 'Descargar' }}
      </button>
    </div>
    <p v-if="error" class="mt-2 text-[11px] text-rose-200" role="alert">{{ error }}</p>
    <p v-else-if="mensaje" class="mt-2 break-words text-[11px] font-semibold text-brand-400">{{ mensaje }}</p>
  </div>
</template>

<script setup>
/**
 * «Registro de funcionalidad» de UN miembro, dentro de su ficha: la versión de
 * su app, cuándo subió su registro por última vez, cuántas filas tiene y la
 * descarga como JSON tras escribir la clave. Se abre con el icono de
 * información de la ficha.
 *
 * Es solo presentación: la descarga la hace quien lo monta (`descargar`).
 */
import { computed, ref } from 'vue'
import GrupoIcono from './GrupoIcono.js'

/** Puerta de interfaz (ver el comentario de la plantilla): NO es seguridad. */
const CLAVE_DESCARGA = '1234'

const props = defineProps({
  /** { id, nombre, yo, version, subidoEn, filas, total } o null si aún no se sabe nada. */
  registro: { type: Object, default: null },
  /** async (id) => ruta del fichero guardado. */
  descargar: { type: Function, required: true }
})

const clave = ref('')
const error = ref('')
const mensaje = ref('')
const ocupado = ref(false)

const filas = computed(() => Number(props.registro?.filas) || 0)

function cuando (ms) {
  if (!ms) return ''
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

async function pedir () {
  error.value = ''
  mensaje.value = ''
  if (clave.value !== CLAVE_DESCARGA) {
    error.value = 'Clave incorrecta.'
    return
  }
  ocupado.value = true
  try {
    const ruta = await props.descargar(props.registro.id)
    mensaje.value = `Guardado en ${ruta}.`
  } catch (e) {
    error.value = (e?.message || '').toString().trim() || 'No se pudo descargar el registro.'
  } finally {
    ocupado.value = false
  }
}
</script>
