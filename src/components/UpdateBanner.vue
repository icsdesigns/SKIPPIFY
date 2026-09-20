<template>
  <Transition name="modal">
    <div
      v-if="update.shouldPrompt.value"
      class="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
    >
      <div class="sk-card sk-card-lit my-auto w-full max-w-md p-6">
        <div class="mb-4 flex items-center gap-3">
          <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-400 text-xl shadow-glow">⬆️</span>
          <div class="min-w-0">
            <h2 class="truncate text-lg font-extrabold tracking-tight text-white">Actualización disponible</h2>
            <p class="truncate text-[11px] font-bold text-brand-400">Skippify {{ update.latest.value?.version }}</p>
          </div>
        </div>

        <!--
          Lo único que se cuenta aquí son las instrucciones. Android enseña un
          aviso alarmante al instalar fuera de Play Store y ese es el momento en
          que la gente cancela, así que conviene anticiparlo.
        -->
        <p v-if="needsInstallPermission" class="mb-5 text-sm leading-relaxed text-slate-300">
          Android necesita tu permiso para instalar aplicaciones fuera de Play Store.
          Concédeselo a Skippify y vuelve aquí.
        </p>
        <p v-else class="mb-5 text-sm leading-relaxed text-slate-300">
          Al instalar, Android avisará de que la aplicación procede de una fuente
          desconocida. Pulsa <span class="font-bold text-white">«Instalar de todos modos»</span>:
          es segura, va firmada con la misma clave que la versión que ya tienes.
        </p>

        <div class="flex flex-wrap gap-2">
          <button
            v-if="needsInstallPermission"
            class="sk-btn min-w-0 flex-1 bg-amber-400 text-black hover:bg-amber-300"
            @click="update.openInstallSettings()"
          >
            Conceder permiso
          </button>
          <button
            v-else
            class="sk-btn sk-btn-primary min-w-0 flex-1"
            :disabled="update.status.value === 'downloading'"
            @click="run"
          >
            {{ primaryLabel }}
          </button>

          <button
            class="sk-btn sk-btn-ghost sk-btn-sm shrink-0"
            :disabled="update.status.value === 'downloading'"
            @click="update.dismiss()"
          >
            Ahora no
          </button>
        </div>

        <div v-if="update.status.value === 'downloading'" class="mt-4">
          <div class="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.14]">
            <div class="h-full rounded-full bg-brand-400 transition-[width] duration-300" :style="{ width: update.progress.value + '%' }" />
          </div>
        </div>

        <!--
          El error se queda: ocultarlo es exactamente lo que hizo que un fallo de
          red pasara desapercibido durante toda una versión.
        -->
        <p
          v-if="update.status.value === 'error'"
          class="mt-3 text-xs font-semibold text-rose-200"
        >{{ update.error.value }}</p>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useAppUpdate } from '@/composables/useAppUpdate'

const update = useAppUpdate()

/**
 * `error` vale 'PERMISO' cuando el instalador se rechazó por falta del permiso
 * de orígenes desconocidos. No es un fallo: la APK ya está descargada y basta
 * con conceder el permiso y volver a pulsar.
 */
const needsInstallPermission = computed(() => update.error.value === 'PERMISO')

const primaryLabel = computed(() => {
  switch (update.status.value) {
    case 'downloading': return `Descargando… ${update.progress.value}%`
    case 'ready': return 'Instalar'
    case 'installing': return 'Abriendo instalador…'
    case 'error': return 'Reintentar'
    default: return 'Actualizar'
  }
})

function run () {
  // Si ya está en disco de un intento anterior, se salta la descarga.
  if (update.status.value === 'ready') return update.install()
  return update.downloadAndInstall()
}

/**
 * Conceder el permiso ocurre FUERA de la app, en los ajustes del sistema. Al
 * volver hay que releer el estado o el aviso se quedaría ofreciendo «Conceder
 * permiso» para siempre, aunque ya estuviera dado.
 */
function onVisibilityChange () {
  if (document.visibilityState === 'visible') {
    update.recheckInstallPermission()
  }
}

onMounted(() => document.addEventListener('visibilitychange', onVisibilityChange))
onUnmounted(() => document.removeEventListener('visibilitychange', onVisibilityChange))
</script>
