<template>
  <div class="sk-stagger space-y-4">

    <!-- Guía animada: se abre sola la primera vez; después, desde el icono de
         la cabecera. -->
    <GuiaInteractiva :guia="guiaMacros" />

    <!-- Todos los paneles de la pestaña son plegables y nacen plegados. -->

    <!-- ══ Cuenta de Spotify ═══════════════════════════════════════════════════
         El mismo panel que en Inicio («Vincula tu Spotify» y, ya vinculada, la
         foto, el nombre y el icono de desvincular). Sin invitación a crear
         macros: aquí ya se está en la pestaña. Es él quien gestiona la vuelta
         de Spotify (redirección OAuth) en la app. -->
    <SpotifyCuentaPanel ocultar-invitacion-macros />
    <p v-if="connected && libraryError" class="rounded-md bg-rose-500/[0.16] px-3 py-2 text-[11px] text-rose-200">{{ libraryError }}</p>

    <!-- Sin cuenta vinculada no hay nada que montar: sólo una muestra de para
         qué sirve todo esto una vez conectada. -->
    <template v-if="!connected">
      <!-- ── Demostración: qué se puede hacer una vez conectada ─────────────── -->
      <FeaturePanel
        title="Un ejemplo de macro"
        subtitle="Así queda una macro montada. Ésta es sólo una muestra: no se ejecuta."
        icon-class="bg-violet-400/[0.18] text-violet-200"
      >
        <template #icono><MacroIcon name="novedades" class="h-5 w-5" /></template>

        <div class="grid gap-2.5 sm:grid-cols-3">
          <div
            v-for="tramo in demoMacro"
            :key="tramo.letra"
            class="rounded-card bg-black/30 p-3.5"
          >
            <div class="flex items-center gap-2">
              <span class="flex h-5 w-5 items-center justify-center rounded-full bg-violet-400/[0.22] text-[10px] font-bold text-violet-100">{{ tramo.letra }}</span>
              <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{{ tramo.etapa }}</span>
            </div>
            <p class="mt-2 flex items-center gap-2 text-sm font-medium text-slate-100">
              <MacroIcon :name="tramo.glyph" class="h-5 w-5 shrink-0 text-violet-200" />{{ tramo.titulo }}
            </p>
            <p class="mt-1 text-[11px] leading-relaxed text-slate-500">{{ tramo.detalle }}</p>
          </div>
        </div>

        <p class="mt-4 rounded-xl bg-black/30 px-3.5 py-3 text-xs leading-relaxed text-slate-300">
          Resultado: cada canción nueva de «Descubrimiento semanal» acaba sola en Tus me gusta,
          sin abrir la app. El servicio la ejecuta en segundo plano en cuanto detecta novedades.
        </p>
      </FeaturePanel>
    </template>

    <template v-else>
      <!-- ══ 2 · Crear una macro ═════════════════════════════════════════════
           Un paso visible cada vez. Al cambiar de paso la vista se alinea con la
           parte superior de este panel. -->
      <div ref="panelCrear" class="scroll-mt-20">
        <FeaturePanel
          title="Crear una macro"
          subtitle="De dónde salen las canciones, qué se hace con ellas y dónde acaban."
          icon-class="bg-violet-400/[0.18] text-violet-200"
        >
          <template #icono><MacroIcon name="nueva" class="h-5 w-5" /></template>

          <!-- Guía de etapas: marca la actual y las ya resueltas -->
          <ol class="flex items-center gap-1.5 text-[11px] font-semibold">
            <li
              v-for="(paso, i) in pasos"
              :key="paso.key"
              class="flex flex-1 items-center gap-1.5"
            >
              <span
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] transition-colors"
                :class="i === pasoIdx
                  ? 'border-transparent bg-violet-400 text-black'
                  : (i < pasoIdx
                      ? 'border-transparent bg-brand-400 text-black'
                      : 'border-transparent bg-white/[0.10] text-slate-400')"
              >{{ paso.letter }}</span>
              <span
                class="truncate"
                :class="i === pasoIdx ? 'text-violet-100' : (i < pasoIdx ? 'text-brand-200' : 'text-slate-500')"
              >{{ paso.label }}</span>
              <span v-if="i < pasos.length - 1" class="flex-1 border-t border-dashed border-white/[0.14]" />
            </li>
          </ol>

          <div class="mt-5">
            <!-- ── A · origen ─────────────────────────────────────────────── -->
            <div v-if="pasoActual === 'source'">
              <p class="sk-eyebrow">¿De dónde salen las canciones?</p>
              <div class="mt-2.5 grid gap-2">
                <button
                  v-for="source in sources"
                  :key="source.type"
                  type="button"
                  class="flex items-center gap-3.5 rounded-xl border p-3 text-left transition-all"
                  :class="draft.source.type === source.type ? 'sk-option-active' : 'sk-option'"
                  @click="pickSource(source)"
                >
                  <span
                    class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
                    :class="draft.source.type === source.type ? 'bg-brand-400/[0.22] text-brand-200' : 'bg-white/[0.06] text-slate-300'"
                  ><MacroIcon :name="source.glyph" class="h-8 w-8" /></span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-bold text-white">{{ source.label }}</span>
                    <span class="mt-1 block text-[11px] leading-relaxed text-slate-500">{{ source.detail }}</span>
                  </span>
                </button>
              </div>

              <!-- «Tras N escuchas»: cuántas y en cuánto tiempo, en tarjetas compactas. -->
              <div v-if="selectedSource?.afterPlays" class="mt-3 space-y-2" data-tras-ajustes>
                <p class="sk-eyebrow">¿Cuántas escuchas?</p>
                <OpcionFila
                  plana
                  compacta
                  color-tesela
                  tono="violet"
                  titulo="Escuchas"
                  :detalle="`Se actúa en la escucha ${draft.source.plays} de la misma canción.`"
                >
                  <template #icono><MacroIcon name="escuchas" class="h-6 w-6" /></template>
                  <template #fin>
                    <span class="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        class="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08] text-slate-200 transition-colors hover:bg-white/[0.16] disabled:opacity-30"
                        :disabled="draft.source.plays <= PLAYS_MIN"
                        aria-label="Una escucha menos"
                        data-tras-menos
                        @click="ajustarPlays(-1)"
                      >
                        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12" /></svg>
                      </button>
                      <span class="w-6 text-center font-mono text-sm font-bold text-white" aria-live="polite" data-tras-n>{{ draft.source.plays }}</span>
                      <button
                        type="button"
                        class="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08] text-slate-200 transition-colors hover:bg-white/[0.16] disabled:opacity-30"
                        :disabled="draft.source.plays >= PLAYS_MAX"
                        aria-label="Una escucha más"
                        data-tras-mas
                        @click="ajustarPlays(1)"
                      >
                        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>
                      </button>
                    </span>
                  </template>
                </OpcionFila>

                <p class="sk-eyebrow pt-1">¿En cuánto tiempo?</p>
                <div class="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Ventana de tiempo">
                  <OpcionFila
                    v-for="dias in VENTANAS_DIAS"
                    :key="dias"
                    as="button"
                    role="radio"
                    compacta
                    tono="violet"
                    :aria-checked="draft.source.windowDays === dias"
                    :activo="draft.source.windowDays === dias"
                    :titulo="`${dias} días`"
                    :detalle="dias === 7 ? 'Una semana. Es lo habitual.' : 'Un mes entero de escuchas.'"
                    :data-tras-ventana="dias"
                    @click="draft.source.windowDays = dias"
                  >
                    <template #icono><AjusteIcon name="reloj" class="h-6 w-6" /></template>
                  </OpcionFila>
                </div>
              </div>

              <input
                v-if="selectedSource?.needsPlaylist"
                v-model="busquedaOrigen"
                type="search"
                placeholder="Buscar playlist…"
                aria-label="Buscar playlist de origen"
                class="mt-2.5 w-full sk-input px-3 py-2.5 text-xs text-slate-200 placeholder:text-slate-600"
              >

              <select
                v-if="selectedSource?.needsPlaylist"
                v-model="draft.source.playlistId"
                class="mt-2.5 w-full sk-input px-3 py-2.5 text-xs text-slate-200"
                @change="syncSourcePlaylistName"
              >
                <option value="">Elige la playlist de origen…</option>
                <option v-for="pl in origenesFiltrados" :key="pl.id" :value="pl.id">
                  {{ pl.name }} ({{ playlistCount(pl) }}){{ pl.writable ? '' : ' · solo lectura' }}
                </option>
              </select>

              <p v-if="selectedSource?.needsPlaylist" class="mt-1.5 text-[11px] text-slate-500">
                ¿No ves una playlist?
                <button type="button" class="font-semibold text-brand-300 underline-offset-2 hover:underline" :disabled="loadingPlaylists" @click="loadPlaylists">
                  {{ loadingPlaylists ? 'Actualizando…' : 'Actualizar la lista' }}
                </button>.
                Las que genera Spotify (Descubrimiento semanal, Release Radar) no las deja leer a las apps: cópiala a una playlist tuya.
              </p>

              <p
                v-if="selectedSource?.needsPlaylist && exigeOrigenEscribible && readOnlyCount"
                class="mt-1.5 text-[11px] text-slate-500"
              >
                No aparecen {{ readOnlyCount }} playlist(s) que solo sigues: quitar canciones del
                origen exige que la playlist sea tuya o colaborativa.
              </p>
            </div>

            <!-- ── B · acción ─────────────────────────────────────────────── -->
            <div v-else-if="pasoActual === 'action'">
              <p class="sk-eyebrow">¿Qué se hace con ellas?</p>
              <div class="mt-2.5 grid gap-2">
                <button
                  v-for="action in availableActions"
                  :key="action.type"
                  type="button"
                  class="flex items-center gap-3.5 rounded-xl border p-3 text-left transition-all"
                  :class="draft.action.type === action.type
                    ? 'border-violet-400 bg-violet-400/[0.14] text-white'
                    : 'sk-option'"
                  @click="pickAction(action)"
                >
                  <span
                    class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
                    :class="draft.action.type === action.type ? 'bg-violet-400/[0.25] text-violet-100' : 'bg-white/[0.06] text-slate-300'"
                  ><MacroIcon :name="action.glyph" class="h-8 w-8" /></span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-bold text-white">{{ action.label }}</span>
                    <span class="mt-1 block text-[11px] leading-relaxed text-slate-500">{{ action.detail }}</span>
                  </span>
                </button>
              </div>
            </div>

            <!-- ── C · destino ────────────────────────────────────────────── -->
            <div v-else-if="pasoActual === 'target'">
              <p class="sk-eyebrow">¿Dónde acaban?</p>
              <div class="mt-2.5 grid gap-2">
                <button
                  v-for="target in availableTargets"
                  :key="target.type"
                  type="button"
                  class="flex items-center gap-3.5 rounded-xl border p-3 text-left transition-all"
                  :class="draft.target.type === target.type
                    ? 'border-sky-400 bg-sky-400/[0.14] text-white'
                    : 'sk-option'"
                  @click="pickTarget(target)"
                >
                  <span
                    class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
                    :class="draft.target.type === target.type ? 'bg-sky-400/[0.25] text-sky-100' : 'bg-white/[0.06] text-slate-300'"
                  ><MacroIcon :name="target.glyph" class="h-8 w-8" /></span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-bold text-white">{{ target.label }}</span>
                    <span class="mt-1 block text-[11px] leading-relaxed text-slate-500">{{ target.detail }}</span>
                  </span>
                </button>
              </div>

              <input
                v-if="selectedTarget?.needsPlaylist"
                v-model="busquedaDestino"
                type="search"
                placeholder="Buscar playlist…"
                aria-label="Buscar playlist de destino"
                class="mt-2.5 w-full sk-input px-3 py-2.5 text-xs text-slate-200 placeholder:text-slate-600"
              >

              <select
                v-if="selectedTarget?.needsPlaylist"
                v-model="draft.target.playlistId"
                class="mt-2.5 w-full sk-input px-3 py-2.5 text-xs text-slate-200"
                @change="syncTargetPlaylistName"
              >
                <option value="">Elige la playlist de destino…</option>
                <option v-for="pl in destinosFiltrados" :key="pl.id" :value="pl.id">
                  {{ pl.name }} ({{ playlistCount(pl) }})
                </option>
              </select>

              <p v-if="selectedTarget?.needsPlaylist" class="mt-1.5 text-[11px] text-slate-500">
                ¿No ves una playlist?
                <button type="button" class="font-semibold text-brand-300 underline-offset-2 hover:underline" :disabled="loadingPlaylists" @click="loadPlaylists">
                  {{ loadingPlaylists ? 'Actualizando…' : 'Actualizar la lista' }}
                </button>.
              </p>

              <p v-if="selectedTarget?.needsPlaylist && readOnlyCount" class="mt-1.5 text-[11px] text-slate-500">
                No aparecen {{ readOnlyCount }} playlist(s) que solo sigues: Spotify no deja
                modificar playlists ajenas que no sean colaborativas.
              </p>

              <input
                v-if="selectedTarget?.needsName"
                v-model="draft.target.newPlaylistName"
                type="text"
                maxlength="60"
                placeholder="Nombre de la playlist nueva"
                class="mt-2.5 w-full sk-input px-3 py-2.5 text-xs text-slate-200 placeholder:text-slate-600"
              >
            </div>

            <!-- ── Nombre y confirmación ──────────────────────────────────── -->
            <div v-else>
              <p class="sk-eyebrow">Revisa y ponle nombre</p>

              <p class="mt-2.5 rounded-xl bg-black/30 px-3.5 py-3 text-xs leading-relaxed text-slate-300">
                {{ draftSummary }}
              </p>

              <input
                v-model="draft.name"
                type="text"
                maxlength="60"
                placeholder="Nombre de la macro (opcional)"
                class="mt-2.5 w-full sk-input px-3 py-2.5 text-xs text-slate-200 placeholder:text-slate-600"
              >

              <p v-if="draftError" class="mt-2.5 text-[11px] text-amber-300">{{ draftError }}</p>

              <p v-else-if="needsPremium && lacksPremium" class="mt-2.5 text-[11px] text-amber-300">
                Tu cuenta de Spotify no es Premium: la cola de reproducción responderá «Forbidden»
                al ejecutar esta macro.
              </p>

              <p v-else-if="missingPermissions.length" class="mt-2.5 text-[11px] text-amber-300">
                Tu sesión no incluye {{ missingPermissions.join(', ') }}. Desconecta y vuelve a
                conectar la cuenta antes de ejecutar macros.
              </p>
            </div>
          </div>

          <!-- Navegación sólo con iconos: atrás a la izquierda, reiniciar en el
               centro y siguiente (o guardar) a la derecha. -->
          <div class="mt-5 grid grid-cols-3 items-center border-t border-white/[0.07] pt-4">
            <button
              type="button"
              class="sk-btn sk-btn-ghost flex h-11 w-11 items-center justify-center justify-self-start !p-0 disabled:opacity-30"
              :disabled="pasoIdx === 0"
              aria-label="Paso anterior"
              title="Atrás"
              @click="retroceder"
            >
              <MacroIcon name="atras" class="h-6 w-6" />
            </button>

            <button
              type="button"
              class="sk-btn sk-btn-ghost flex h-11 w-11 items-center justify-center justify-self-center !p-0 disabled:opacity-30"
              :disabled="pasoIdx === 0"
              aria-label="Empezar de cero"
              title="Empezar de cero"
              @click="reiniciarBorrador"
            >
              <MacroIcon name="reiniciar" class="h-6 w-6" />
            </button>

            <button
              v-if="pasoActual !== 'save'"
              type="button"
              class="sk-btn sk-btn-primary flex h-11 w-11 items-center justify-center justify-self-end !p-0 disabled:opacity-40"
              :disabled="!puedeAvanzar"
              aria-label="Siguiente paso"
              title="Siguiente"
              @click="avanzar"
            >
              <MacroIcon name="siguiente" class="h-6 w-6" />
            </button>

            <button
              v-else
              type="button"
              class="sk-btn sk-btn-primary flex h-11 w-11 items-center justify-center justify-self-end !p-0 disabled:opacity-40"
              :disabled="!!draftError"
              aria-label="Guardar macro"
              title="Guardar macro"
              @click="onCreate"
            >
              <MacroIcon name="guardar" class="h-6 w-6" />
            </button>
          </div>
        </FeaturePanel>
      </div>

      <!-- ══ 3 · Tus macros ══════════════════════════════════════════════════ -->
      <FeaturePanel
        title="Tus macros"
        :subtitle="`${macros.length} macro(s) guardada(s)`"
        icon-class="bg-brand-400/[0.18] text-brand-200"
      >
        <template #icono><MacroIcon name="playlist" class="h-5 w-5" /></template>

        <div class="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.03] text-[11px] text-slate-400 transition-colors hover:border-white/25 hover:text-slate-200"
            :aria-expanded="verAyudaMacros"
            aria-label="Cómo se ejecutan las macros"
            @click="verAyudaMacros = !verAyudaMacros"
          >?</button>
          <button
            v-if="macros.length"
            type="button"
            class="sk-btn sk-btn-ghost sk-btn-sm ml-auto shrink-0"
            :disabled="running"
            @click="onRunAll"
          >
            {{ running ? 'Ejecutando…' : 'Ejecutar todas' }}
          </button>
        </div>

        <Transition name="desplegar">
          <p
            v-if="verAyudaMacros"
            class="mb-3 rounded-xl bg-black/30 px-3.5 py-3 text-[11px] leading-relaxed text-slate-400"
          >
            Las macros marcadas «en segundo plano» las ejecuta el servicio con la app cerrada:
            las de la canción actual en cuanto cambia la canción, y las de lista en un repaso
            cada 15 minutos; las de «tras N escuchas» se evalúan con cada cambio de canción. Las de «Ejecución manual» sólo actúan cuando pulsas «Ejecutar» o el
            botón de los auriculares. Todas recuerdan por dónde iban, así que nada se procesa dos
            veces aunque pasen días entre ejecuciones.
          </p>
        </Transition>

        <p v-if="!macros.length" class="rounded-xl bg-black/20 px-5 py-6 text-center text-xs text-slate-500">
          Todavía no has creado ninguna macro.
        </p>

        <ul v-else class="space-y-2">
          <li
            v-for="macro in macros"
            :key="macro.id"
            class="overflow-hidden rounded-xl border transition-colors"
            :class="macro.enabled
              ? 'border-white/[0.07] bg-black/30'
              : 'border-white/[0.07] bg-black/20'"
          >
            <!-- Cabecera compacta (no más alta que «Personalizado»): tesela de 40 px,
                 nombre en una línea con sus marcas como iconos pequeños, descripción
                 en dos líneas como mucho y, a la derecha, el interruptor. Las cifras
                 de ejecuciones viven en el cuerpo desplegado. -->
            <div class="flex items-center gap-3 p-2.5">
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-3 text-left"
                :class="macro.enabled ? '' : 'opacity-60'"
                :aria-expanded="!!abierta[macro.id]"
                :aria-label="abierta[macro.id] ? 'Plegar macro' : 'Desplegar macro'"
                @click="abierta[macro.id] = !abierta[macro.id]"
              >
                <span
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors"
                  :class="macro.enabled ? 'bg-brand-400/[0.22] text-brand-200' : 'bg-white/[0.06] text-slate-300'"
                ><MacroIcon :name="actionMeta(macro.action?.type)?.glyph || 'playlist'" class="h-6 w-6" /></span>

                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-1.5">
                    <span class="min-w-0 truncate text-[13px] font-bold leading-snug text-white">{{ macro.name }}</span>
                    <span
                      v-if="correEnSegundoPlano(macro)"
                      class="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400"
                      title="Se ejecuta en segundo plano"
                      role="img"
                      aria-label="En segundo plano"
                    />
                    <MacroIcon
                      v-if="esManual(macro)"
                      name="manual"
                      class="h-3.5 w-3.5 shrink-0 text-violet-200"
                      title="Manual"
                      role="img"
                      aria-label="Manual"
                    />
                    <FeatureIcon
                      v-if="vinculadaAlBoton(macro)"
                      name="auriculares"
                      class="h-3.5 w-3.5 shrink-0 text-sky-200"
                      title="Vinculada al botón de los auriculares"
                      role="img"
                      aria-label="Vinculada al botón de los auriculares"
                    />
                  </span>
                  <span class="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500 [overflow-wrap:anywhere]">{{ describeMacro(macro) }}</span>
                </span>

                <MacroIcon
                  name="siguiente"
                  class="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200"
                  :class="abierta[macro.id] ? 'rotate-90' : ''"
                />
              </button>

              <!-- Habilitar/deshabilitar sin necesidad de desplegar la macro -->
              <button
                type="button"
                role="switch"
                :aria-checked="macro.enabled"
                class="sk-switch shrink-0"
                :class="macro.enabled ? 'border-transparent bg-brand-400' : 'border-transparent bg-white/[0.18]'"
                :aria-label="macro.enabled ? 'Deshabilitar macro' : 'Habilitar macro'"
                @click="toggleMacro(macro.id)"
              >
                <span class="sk-switch-knob" :class="macro.enabled ? 'translate-x-6' : 'translate-x-1'" />
              </button>
            </div>

            <!-- Etiqueta desplegada -->
            <div v-if="abierta[macro.id]" class="border-t border-white/[0.07] p-3.5">
              <p class="mb-2 flex flex-wrap items-center gap-1.5">
                <span v-if="correEnSegundoPlano(macro)" class="inline-flex items-center gap-1 rounded-full bg-brand-400/[0.18] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-200"><span class="h-1 w-1 rounded-full bg-brand-400" />segundo plano</span>
                <span v-if="esManual(macro)" class="inline-flex rounded-full bg-violet-400/[0.18] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-200">manual</span>
                <span v-if="vinculadaAlBoton(macro)" class="inline-flex items-center gap-1 rounded-full bg-sky-400/[0.18] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-200"><FeatureIcon name="auriculares" class="h-3 w-3" />botón</span>
              </p>
              <p
                v-if="!correEnSegundoPlano(macro) && !esManual(macro) && motivoSinSegundoPlano(macro)"
                class="mb-2 text-[10px] leading-relaxed text-amber-300/80"
              >
                Sólo a mano: {{ motivoSinSegundoPlano(macro) }}
              </p>

              <!-- Cuatro acciones como teselas: icono arriba, nombre debajo. -->
              <div class="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  class="sk-option flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-[11px] font-semibold text-sky-100 disabled:opacity-40"
                  :disabled="running"
                  @click="onPreview(macro)"
                >
                  <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-400/[0.22]"><AjusteIcon name="ojo" class="h-6 w-6" /></span>
                  Vista previa
                </button>
                <button
                  type="button"
                  class="sk-option flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-[11px] font-semibold text-brand-200 disabled:opacity-40"
                  :disabled="running"
                  @click="onRun(macro)"
                >
                  <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-400/[0.22]"><AjusteIcon name="play" class="h-6 w-6" /></span>
                  Ejecutar
                </button>
                <button
                  type="button"
                  class="sk-option flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-[11px] font-semibold text-slate-200"
                  :aria-pressed="!!verHistorial[macro.id]"
                  @click="verHistorial[macro.id] = !verHistorial[macro.id]"
                >
                  <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.08]"><AjusteIcon name="registro" class="h-6 w-6" /></span>
                  {{ verHistorial[macro.id] ? 'Ocultar' : 'Historial' }}
                </button>
                <button
                  type="button"
                  class="sk-option flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-[11px] font-semibold text-rose-200"
                  @click="deleteMacro(macro.id)"
                >
                  <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-400/[0.18]"><MacroIcon name="eliminar" class="h-6 w-6" /></span>
                  Borrar
                </button>
              </div>
              <p class="mt-2 text-right font-mono text-[10px] text-slate-500">
                {{ ejecuciones(macro) }} ejec. · {{ aplicadas(macro) }} canciones
              </p>

              <!--
                Siete días de ejecuciones. Un contador acumulado no sirve para
                saber si la macro está viva: sube igual si lo último que hizo fue
                anteayer. Aquí se ve el día a día, y de dónde vino cada pasada.
              -->
              <div
                v-if="verHistorial[macro.id]"
                class="mt-2.5 rounded-md bg-black/30 p-3"
              >
                <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Últimos 7 días
                </p>

                <p v-if="!historialPorDia(macro).length" class="mt-2 text-[11px] text-slate-500">
                  Sin ejecuciones registradas esta semana.
                </p>

                <ul v-else class="mt-2 space-y-2">
                  <li v-for="dia in historialPorDia(macro)" :key="dia.dia">
                    <div class="flex items-baseline justify-between gap-2">
                      <span class="text-[11px] font-semibold text-slate-300">{{ etiquetaDia(dia.dia) }}</span>
                      <span class="font-mono text-[10px] text-slate-500">
                        {{ dia.ejecuciones }} ejec. · {{ dia.aplicadas }} canciones<template v-if="dia.errores"> · {{ dia.errores }} con error</template>
                      </span>
                    </div>
                    <ul class="mt-1 space-y-0.5">
                      <li
                        v-for="(entrada, i) in dia.entradas"
                        :key="dia.dia + '-' + i"
                        class="flex items-baseline gap-2 text-[10px] leading-relaxed"
                        :class="entrada.status === 2 ? 'text-rose-200/90' : (entrada.status === 0 ? 'text-slate-300' : 'text-slate-500')"
                      >
                        <span class="font-mono text-slate-500">{{ hora(entrada.at) }}</span>
                        <span class="shrink-0 text-slate-500">{{ entrada.origen === 'servicio' ? 'servicio' : 'app' }}</span>
                        <span class="min-w-0 flex-1 truncate">{{ entrada.message }}</span>
                      </li>
                    </ul>
                  </li>
                </ul>
              </div>

              <p
                v-if="!results[macro.id] && ultimaAutomatica(macro)"
                class="mt-2.5 rounded-md bg-black/30 px-3 py-2 text-[11px] text-slate-400"
              >
                {{ ultimaAutomatica(macro) }}
              </p>

              <p
                v-if="results[macro.id]"
                class="mt-2.5 rounded-lg border px-3 py-2 text-[11px]"
                :class="results[macro.id].error
                  ? 'border-transparent bg-rose-500/[0.16] text-rose-200'
                  : 'sk-option text-slate-200'"
              >
                {{ results[macro.id].message }}
              </p>
            </div>
          </li>
        </ul>
      </FeaturePanel>

      <!-- ══ 3b · Macros de tu grupo ═══════════════════════════════════════════
           Las que comparten los miembros de tus grupos, para clonarlas con tus
           propias playlists, y el conmutador para compartir las tuyas. -->
      <MacrosDeTuGrupo :playlists="playlists" />

      <!-- ══ 4 · Botón de los auriculares ════════════════════════════════════ -->
      <!--
        Sólo en la app: quien atiende la pulsación es el servicio nativo, con la
        app cerrada. En el navegador no hay nada que vincular.
      -->
      <FeaturePanel
        v-if="nativeState.disponible && macros.length"
        title="Botón de los auriculares"
        subtitle="Mantén pulsado el botón de función y se ejecuta la macro que elijas."
        icon-class="bg-sky-400/[0.18] text-sky-200"
      >
        <template #icono><FeatureIcon name="auriculares" class="h-5 w-5" /></template>

        <div class="space-y-3">
          <!-- La nota larga del botón vive tras el icono de información. -->
          <div class="flex items-center justify-between gap-2">
            <p class="sk-eyebrow">Macro vinculada</p>
            <button
              type="button"
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors"
              :class="verAyudaBoton ? 'bg-sky-400 text-black' : 'bg-white/[0.08] text-slate-300 hover:bg-white/[0.16]'"
              :aria-expanded="verAyudaBoton"
              aria-controls="ayuda-boton"
              aria-label="Más información sobre el botón de los auriculares"
              title="Más información"
              data-info-boton
              @click="verAyudaBoton = !verAyudaBoton"
            >
              <GrupoIcono name="info" class="h-4 w-4" />
            </button>
          </div>

          <Transition name="desplegar">
            <p
              v-if="verAyudaBoton"
              id="ayuda-boton"
              class="rounded-xl bg-black/30 px-3.5 py-3 text-[11px] leading-relaxed text-slate-400"
            >
              El botón la ejecuta aunque esté pausada. Así puedes tener, por ejemplo,
              «la canción que suena → copiar a una playlist» sólo cuando tú lo pidas,
              sin que se aplique a cada canción. Las pulsaciones cortas (pausa, siguiente)
              siguen yendo a Spotify. Si tus auriculares usan la pulsación larga para su
              propia app (algunos Galaxy Buds o Pixel Buds), cámbiala allí a «asistente de voz».
            </p>
          </Transition>

          <div class="grid gap-2" role="radiogroup" aria-label="Macro vinculada al botón">
            <OpcionFila
              as="button"
              role="radio"
              :aria-checked="!nativeState.boton.macroId"
              tono="sky"
              :activo="!nativeState.boton.macroId"
              titulo="Ninguna"
              detalle="El botón hace lo de siempre."
              :disabled="botonOcupado"
              @click="onVincularBoton('')"
            >
              <template #icono><FeatureIcon name="auriculares" class="h-8 w-8" /></template>
            </OpcionFila>

            <OpcionFila
              v-for="macro in macrosParaBoton"
              :key="macro.id"
              as="button"
              role="radio"
              :aria-checked="nativeState.boton.macroId === macro.id"
              tono="sky"
              :activo="nativeState.boton.macroId === macro.id"
              :tenue="!macro.enabled"
              :titulo="`${macro.name}${macro.enabled ? '' : ' (pausada)'}`"
              :detalle="describeMacro(macro)"
              :disabled="botonOcupado"
              @click="onVincularBoton(macro.id)"
            >
              <template #icono><MacroIcon :name="actionMeta(macro.action?.type)?.glyph || 'playlist'" class="h-8 w-8" /></template>
            </OpcionFila>
          </div>

          <OpcionFila
            v-if="!macrosParaBoton.length"
            plana
            tono="amber"
            titulo="Ninguna macro puede ejecutarse desde el botón"
            :detalle="Object.values(nativeState.boton.noElegibles)[0] || 'El servicio no las admite.'"
          >
            <template #icono><AjusteIcon name="ayuda" class="h-8 w-8 text-amber-200" /></template>
          </OpcionFila>

          <template v-if="nativeState.boton.macroId">
            <!-- Aviso sonoro: seña de que el botón ha ejecutado la macro. -->
            <OpcionFila
              plana
              compacta
              tono="sky"
              :activo="nativeState.boton.sonido"
              titulo="Aviso sonoro"
              detalle="Un tono corto al ejecutarse la macro, como seña de que se ha hecho."
              data-aviso-sonoro
            >
              <template #icono><AjusteIcon name="campana" class="h-6 w-6" /></template>
              <template #fin>
                <button
                  type="button"
                  role="switch"
                  :aria-checked="nativeState.boton.sonido"
                  aria-label="Aviso sonoro al ejecutar la macro del botón"
                  class="sk-switch shrink-0 disabled:opacity-40"
                  :class="nativeState.boton.sonido ? 'border-transparent bg-brand-400' : 'border-transparent bg-white/[0.18]'"
                  :disabled="botonOcupado"
                  @click="onAlternarSonido"
                >
                  <span class="sk-switch-knob" :class="nativeState.boton.sonido ? 'translate-x-6' : 'translate-x-1'" />
                </button>
              </template>
            </OpcionFila>

            <p class="sk-eyebrow pt-1">Cómo se usa</p>
            <div class="grid gap-2">
              <OpcionFila
                plana
                titulo="Mantén pulsado el botón"
                detalle="El de función, el que suele abrir el asistente de voz."
              >
                <template #icono><MacroIcon name="manual" class="h-8 w-8" /></template>
              </OpcionFila>
              <OpcionFila
                plana
                titulo="Elige Skippify · macro"
                detalle="La primera vez Android te preguntará con qué app abrirlo: marca «Siempre»."
              >
                <template #icono><AjusteIcon name="tour" class="h-8 w-8" /></template>
              </OpcionFila>
              <OpcionFila
                plana
                titulo="Mira el aviso"
                detalle="Un aviso en pantalla te dice qué ha hecho la macro. También queda en su historial."
              >
                <template #icono><AjusteIcon name="registro" class="h-8 w-8" /></template>
              </OpcionFila>
            </div>

            <div class="flex justify-end">
              <button
                type="button"
                class="sk-btn sk-btn-sm inline-flex items-center gap-2 bg-sky-400/[0.18] text-sky-100 hover:bg-sky-400/30"
                :disabled="botonOcupado"
                @click="onProbarBoton"
              >
                <AjusteIcon name="play" class="h-4 w-4" />{{ botonOcupado ? 'Ejecutando…' : 'Probar ahora' }}
              </button>
            </div>

            <p
              v-if="botonResultado"
              class="rounded-lg border px-3 py-2 text-[11px]"
              :class="botonResultado.error
                ? 'border-transparent bg-rose-500/[0.16] text-rose-200'
                : 'sk-option text-slate-200'"
            >
              {{ botonResultado.message }}
            </p>
          </template>
        </div>
      </FeaturePanel>
    </template>

  </div>
</template>

<script setup>
/**
 * Macros — pantalla en bloques plegables (todos nacen plegados): la cuenta, el
 * asistente que monta una macro, la lista de las guardadas y el botón de los
 * auriculares.
 *
 * El asistente enseña UN paso cada vez (origen → acción → destino → guardar)
 * con «Atrás» y «Siguiente» siempre a mano: verlo todo desplegado obligaba a
 * releer la pantalla entera para saber por dónde ibas. Las macros guardadas son
 * etiquetas plegadas por defecto, con su interruptor a la vista.
 */
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useSpotify } from '@/composables/useSpotify'
import FeatureIcon from '@/components/FeatureIcon.vue'
import AjusteIcon from '@/components/AjusteIcon.vue'
import OpcionFila from '@/components/OpcionFila.vue'
import FeaturePanel from '@/components/FeaturePanel.vue'
import MacroIcon from '@/components/MacroIcon.vue'
import GrupoIcono from '@/components/grupos/GrupoIcono.js'
import SpotifyCuentaPanel from '@/components/SpotifyCuentaPanel.vue'
import MacrosDeTuGrupo from '@/components/MacrosDeTuGrupo.vue'
import GuiaInteractiva from '@/components/GuiaInteractiva.vue'
import { guiaMacros } from '@/guias'
import { useTour } from '@/composables/useTour'
import {
  useMacros,
  describeMacro,
  validateDraft,
  sourceMeta,
  actionMeta,
  targetMeta,
  MACRO_SOURCES,
  MACRO_ACTIONS,
  MACRO_TARGETS,
  PLAYS_MIN,
  PLAYS_MAX,
  PLAYS_DEFECTO,
  VENTANAS_DIAS
} from '@/composables/useMacros'

const spotify = useSpotify()
const { state, connected, consumeRedirect, loadProfile, missingScopes, api, apiPaged } = spotify
const {
  macros, createMacro, deleteMacro, toggleMacro, runMacro, runAllEnabled,
  sincronizarConNativo, refrescarEstadoNativo, correEnSegundoPlano, motivoSinSegundoPlano,
  estadisticasNativas, historialPorDia,
  nativeState, vincularBoton, fijarSonidoBoton, probarBoton, vinculadaAlBoton
} = useMacros()

// ── Botón de los auriculares ────────────────────────────────────────────────

/** Las macros que el servicio puede ejecutar desde el botón, aunque estén pausadas. */
const macrosParaBoton = computed(() =>
  macros.filter(macro => nativeState.boton.elegibles.includes(macro.id)))

const botonOcupado = ref(false)
const botonResultado = ref(null)

async function onVincularBoton (id) {
  botonOcupado.value = true
  botonResultado.value = null
  await vincularBoton(id)
  botonOcupado.value = false
}

async function onAlternarSonido () {
  botonOcupado.value = true
  await fijarSonidoBoton(!nativeState.boton.sonido)
  botonOcupado.value = false
}

async function onProbarBoton () {
  botonOcupado.value = true
  botonResultado.value = null
  const res = await probarBoton()
  // 0 aplicada · 1 omitida · 2 error (ver MacroRunner.java)
  const error = res.error || (res.status === 2 ? (res.message || 'Error en segundo plano.') : '')
  botonResultado.value = {
    error: !!error,
    message: error || res.message || 'Hecho.'
  }
  botonOcupado.value = false
}

/** Qué macros están desplegadas. Plegadas por defecto: el objeto nace vacío. */
const abierta = reactive({})
/** Qué macros tienen el historial desplegado. */
const verHistorial = reactive({})
/** La descripción larga de «Tus macros» se pide con el icono de información. */
const verAyudaMacros = ref(false)
/** La nota larga del botón de los auriculares, tras su icono de información. */
const verAyudaBoton = ref(false)

/** Muestra de macro para quien todavía no ha vinculado la cuenta. */
const demoMacro = [
  {
    letra: 'A',
    etapa: 'Origen',
    glyph: 'novedades',
    titulo: 'Novedades de una playlist',
    detalle: '«Descubrimiento semanal», sólo lo que Spotify haya añadido desde la última vez.'
  },
  {
    letra: 'B',
    etapa: 'Acción',
    glyph: 'copiar',
    titulo: 'Copiar',
    detalle: 'Se añaden al destino sin tocar la playlist de origen.'
  },
  {
    letra: 'C',
    etapa: 'Destino',
    glyph: 'megusta',
    titulo: 'Tus me gusta',
    detalle: 'Acaban en tu biblioteca de canciones guardadas.'
  }
]

function hora (at) {
  try {
    return new Date(at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function etiquetaDia (iso) {
  const hoy = new Date().toISOString().slice(0, 10)
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (iso === hoy) return 'Hoy'
  if (iso === ayer) return 'Ayer'
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
  } catch {
    return iso
  }
}

const sources = MACRO_SOURCES

const playlists = ref([])
const loadingLibrary = ref(false)
const loadingPlaylists = ref(false)
const libraryError = ref('')
const running = ref(false)
const results = reactive({})

const draft = reactive({
  name: '',
  source: { type: '', playlistId: '', playlistName: '', playlistWritable: null, plays: PLAYS_DEFECTO, windowDays: VENTANAS_DIAS[0] },
  action: { type: '' },
  target: { type: '', playlistId: '', playlistName: '', newPlaylistName: '', playlistWritable: null }
})

/**
 * Permisos que faltan en la sesión actual. Un token emitido antes de que la app
 * pidiera un permiso lo sigue sin tener, y el refresh mantiene los originales:
 * el síntoma es un 403 al ejecutar, no un fallo al iniciar sesión.
 */
const missingPermissions = computed(() => missingScopes() || [])

/** Encolar y controlar la reproducción son endpoints exclusivos de Premium. */
const needsPremium = computed(() => draft.action.type === 'queue' || draft.target.type === 'queue')
const lacksPremium = computed(() => {
  const product = state.profile?.product
  return !!product && product !== 'premium'
})

/** Playlists en las que Spotify permite escribir: propias o colaborativas. */
const writablePlaylists = computed(() => playlists.value.filter(pl => pl.writable))
/** Buscadores de los dos desplegables. Sin acentos ni mayúsculas, como se escribe. */
const busquedaOrigen = ref('')
const busquedaDestino = ref('')

function normalizar (texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

/** Filtra por nombre; la playlist ya elegida se queda siempre, aunque no case. */
function filtrar (lista, busqueda, elegidaId) {
  const q = normalizar(busqueda)
  if (!q) return lista
  return lista.filter(pl => pl.id === elegidaId || normalizar(pl.name).includes(q))
}

const readOnlyCount = computed(() => playlists.value.length - writablePlaylists.value.length)

/** «Mover» y «quitar del origen» borran de la playlist de origen. */
const exigeOrigenEscribible = computed(() =>
  draft.action.type === 'move' || draft.action.type === 'remove_from_source')

const sourcePlaylists = computed(() =>
  exigeOrigenEscribible.value ? writablePlaylists.value : playlists.value)

const origenesFiltrados = computed(() =>
  filtrar(sourcePlaylists.value, busquedaOrigen.value, draft.source.playlistId))
const destinosFiltrados = computed(() =>
  filtrar(writablePlaylists.value, busquedaDestino.value, draft.target.playlistId))

const selectedSource = computed(() => sourceMeta(draft.source.type))
const selectedAction = computed(() => actionMeta(draft.action.type))
const selectedTarget = computed(() => targetMeta(draft.target.type))

const availableActions = computed(() => MACRO_ACTIONS.filter(action => {
  if (!action.requiresPlaylistSource) return true
  return !!selectedSource.value?.needsPlaylist
}))

const availableTargets = computed(() => {
  const allowed = selectedAction.value?.targets || []
  return MACRO_TARGETS.filter(target => allowed.includes(target.type))
})

const draftError = computed(() => validateDraft(draft))
const draftSummary = computed(() => {
  if (!draft.source.type || !draft.action.type) return 'Elige un origen y una acción para ver el resumen.'
  return describeMacro(draft)
})

// ── Asistente por fases ─────────────────────────────────────────────────────

const pasoIdx = ref(0)

/** El paso «destino» sólo existe si la acción elegida lo necesita. */
const pasos = computed(() => {
  const lista = [
    { key: 'source', letter: 'A', label: 'Origen' },
    { key: 'action', letter: 'B', label: 'Acción' }
  ]
  if (selectedAction.value?.needsTarget) lista.push({ key: 'target', letter: 'C', label: 'Destino' })
  lista.push({ key: 'save', letter: '✓', label: 'Guardar' })
  return lista
})

const pasoActual = computed(() => pasos.value[Math.min(pasoIdx.value, pasos.value.length - 1)]?.key || 'source')

/** Qué falta para poder pasar al siguiente paso. */
const puedeAvanzar = computed(() => {
  if (pasoActual.value === 'source') {
    return !!draft.source.type && (!selectedSource.value?.needsPlaylist || !!draft.source.playlistId)
  }
  if (pasoActual.value === 'action') return !!draft.action.type
  if (pasoActual.value === 'target') {
    if (!draft.target.type) return false
    if (selectedTarget.value?.needsPlaylist && !draft.target.playlistId) return false
    if (selectedTarget.value?.needsName && !draft.target.newPlaylistName.trim()) return false
    return true
  }
  return false
})

function avanzar () {
  if (!puedeAvanzar.value) return
  pasoIdx.value = Math.min(pasoIdx.value + 1, pasos.value.length - 1)
}

function retroceder () {
  pasoIdx.value = Math.max(pasoIdx.value - 1, 0)
}

function reiniciarBorrador () {
  draft.name = ''
  draft.source = { type: '', playlistId: '', playlistName: '', playlistWritable: null, plays: PLAYS_DEFECTO, windowDays: VENTANAS_DIAS[0] }
  draft.action = { type: '' }
  draft.target = { type: '', playlistId: '', playlistName: '', newPlaylistName: '', playlistWritable: null }
  pasoIdx.value = 0
}

// Cambiar de acción añade o quita el paso «destino»: sin esto el índice se
// quedaría apuntando fuera de la lista.
/** Panel «Crear una macro»: al cambiar de paso la vista se alinea con su parte superior. */
const panelCrear = ref(null)

watch(pasoIdx, async () => {
  await nextTick()
  panelCrear.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
})

/** ¿Sólo se ejecuta cuando el usuario lo pide? */
function esManual (macro) {
  return macro?.source?.type === 'manual'
}

watch(pasos, (lista) => {
  if (pasoIdx.value > lista.length - 1) pasoIdx.value = lista.length - 1
})

/**
 * Número de canciones de una playlist. Spotify pasó de exponerlo en `tracks` a
 * exponerlo en `items`; se leen las dos para no depender de la versión.
 */
function playlistCount (pl) {
  return pl?.items?.total ?? pl?.tracks?.total ?? 0
}

/**
 * Las macros que gobierna el servicio llevan su cuenta en el lado nativo: es él
 * quien las ejecuta con la app cerrada, así que sus cifras son las buenas.
 */
function ejecuciones (macro) {
  return estadisticasNativas(macro)?.runs ?? macro.stats.runs
}

function aplicadas (macro) {
  return estadisticasNativas(macro)?.applied ?? macro.stats.applied
}

/** Última ejecución automática, para poder comprobar de un vistazo que va. */
function ultimaAutomatica (macro) {
  const st = estadisticasNativas(macro)
  if (!st?.lastRunAt) return ''
  const fecha = new Date(Number(st.lastRunAt))
  if (Number.isNaN(fecha.getTime())) return ''
  const cuando = fecha.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  return st.lastResult ? `${cuando} · ${st.lastResult}` : cuando
}

/** «Tras N escuchas»: una escucha más o menos, dentro de los límites. */
function ajustarPlays (delta) {
  draft.source.plays = Math.min(PLAYS_MAX, Math.max(PLAYS_MIN, (Number(draft.source.plays) || PLAYS_DEFECTO) + delta))
}

function pickSource (source) {
  draft.source.type = source.type
  if (!source.needsPlaylist) {
    draft.source.playlistId = ''
    draft.source.playlistName = ''
    draft.source.playlistWritable = null
  }
  // «Mover» y «quitar del origen» exigen una playlist de origen: si deja de
  // serlo, la acción elegida ya no vale.
  if (selectedAction.value?.requiresPlaylistSource && !source.needsPlaylist) {
    draft.action.type = ''
    draft.target.type = ''
  }
  // Sin playlist que elegir el paso ya está resuelto: se pasa solo al siguiente.
  // «Tras N escuchas» se queda: hay que ajustar cuántas y en cuánto tiempo.
  if (!source.needsPlaylist && !source.afterPlays) avanzar()
}

function pickAction (action) {
  draft.action.type = action.type

  // La playlist de origen puede haber dejado de valer: borrar de ella sólo se
  // puede si es tuya o colaborativa. En ese caso se vuelve al primer paso.
  if (action.requiresPlaylistSource && draft.source.playlistWritable === false) {
    draft.source.playlistId = ''
    draft.source.playlistName = ''
    draft.source.playlistWritable = null
    pasoIdx.value = 0
    return
  }

  if (!action.needsTarget) {
    draft.target.type = ''
  } else if (draft.target.type && !action.targets.includes(draft.target.type)) {
    draft.target.type = ''
  }

  avanzar()
}

function pickTarget (target) {
  draft.target.type = target.type
  if (!target.needsPlaylist || draft.target.playlistWritable === false) {
    draft.target.playlistId = ''
    draft.target.playlistName = ''
    draft.target.playlistWritable = null
  }
  if (!target.needsName) draft.target.newPlaylistName = ''
  // Los destinos que no piden nada más («Tus me gusta», la cola) cierran el paso.
  if (!target.needsPlaylist && !target.needsName) avanzar()
}

function syncSourcePlaylistName () {
  const found = playlists.value.find(pl => pl.id === draft.source.playlistId)
  draft.source.playlistName = found?.name || ''
  draft.source.playlistWritable = found ? found.writable : null
}

function syncTargetPlaylistName () {
  const found = playlists.value.find(pl => pl.id === draft.target.playlistId)
  draft.target.playlistName = found?.name || ''
  draft.target.playlistWritable = found ? found.writable : null
}

function onCreate () {
  if (draftError.value) return
  createMacro({
    name: draft.name,
    source: { ...draft.source },
    action: { ...draft.action },
    target: selectedAction.value?.needsTarget ? { ...draft.target } : null
  })

  reiniciarBorrador()
}

async function onPreview (macro) {
  running.value = true
  const result = await runMacro(macro, { dryRun: true })
  results[macro.id] = {
    error: !!result.error,
    message: result.error
      ? result.error
      : result.matched
        ? `Se procesarían ${result.matched} canción(es)${result.limited ? ' (por tandas, para no agotar el cupo de Spotify)' : ''}: `
          + `${result.tracks.map(t => t.name).slice(0, 5).join(', ')}${result.matched > 5 ? '…' : ''}`
        : result.nota || 'No hay canciones pendientes ahora mismo.'
  }
  running.value = false
}

async function onRun (macro) {
  running.value = true
  const result = await runMacro(macro)
  results[macro.id] = {
    error: !!result.error,
    message: result.error || (result.applied
      ? `Listo: ${result.applied} canción(es) procesadas.`
      : result.nota || macro.stats.lastResult || 'Sin cambios.')
  }
  running.value = false
  await loadLibrary()
}

async function onRunAll () {
  running.value = true
  const summary = await runAllEnabled()
  for (const { macro, result } of summary) {
    results[macro.id] = {
      error: !!result.error,
      message: result.error || (result.applied ? `${result.applied} canción(es).` : 'Sin cambios.')
    }
    // Un resultado que nadie ve no sirve: se despliega la macro que lo produjo.
    abierta[macro.id] = true
  }
  running.value = false
}

/**
 * Relee las playlists de la cuenta. Se llama también al volver a la app: quien
 * acaba de crear o copiar una playlist en Spotify la espera en el desplegable,
 * y la lista se leía sólo al entrar en la pestaña.
 */
async function loadPlaylists () {
  if (!connected.value) return
  loadingPlaylists.value = true
  try {
    // `/me/playlists` devuelve también las que solo sigues (editoriales, de
    // otras personas). Sobre esas Spotify responde 403 al escribir, así que se
    // marca aquí quién puede modificar cada una y la interfaz lo respeta.
    const profile = state.profile || await loadProfile()
    playlists.value = (await apiPaged('/me/playlists?limit=50', 1000))
      .filter(Boolean)
      .map(pl => ({
        ...pl,
        writable: (!!profile?.id && pl.owner?.id === profile.id) || pl.collaborative === true
      }))
    libraryError.value = ''
  } catch (error) {
    libraryError.value = error?.message || 'No se pudieron cargar tus playlists.'
  } finally {
    loadingPlaylists.value = false
  }
}

/**
 * Recarga lo que la pestaña necesita de la cuenta: las playlists del desplegable.
 * (Las cifras de la cuenta —playlists, me gusta— las enseñaba el panel propio
 * de esta pestaña; ahora la cabecera es la del panel de Inicio y no las lleva.)
 */
async function loadLibrary () {
  if (!connected.value) return
  loadingLibrary.value = true
  libraryError.value = ''
  try {
    await loadPlaylists()
  } finally {
    loadingLibrary.value = false
  }
}

/**
 * Vuelta de Spotify. En la app la gestiona el panel de cuenta (evento nativo y
 * redirección pendiente): es la ÚNICA ruta, para no consumir dos veces el mismo
 * código. Aquí queda sólo la del navegador, que llega en la barra de direcciones.
 */
async function onVisibilityChange () {
  if (document.visibilityState !== 'visible') return
  // Vuelta desde Spotify: puede haber playlists nuevas.
  if (connected.value && !loadingPlaylists.value) await loadPlaylists()
}

const tour = useTour()

onMounted(async () => {
  // Primera visita a la pestaña: la guía se abre sola, una única vez. Si el
  // tour de la app está a la vista, espera: dos paneles a la vez no se leen.
  if (!tour.state.open) guiaMacros.autoStart()

  document.addEventListener('visibilitychange', onVisibilityChange)

  if (window.location.search.includes('code=') || window.location.search.includes('error=')) {
    const ok = await consumeRedirect(window.location.href)
    // Limpiar la barra evita reprocesar el mismo `code` al recargar.
    window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    if (ok && !state.profile) await loadProfile()
  }

  if (connected.value) {
    if (!state.profile) await loadProfile()
    await loadLibrary()
  }

  // Se le pasan las macros al servicio y se recoge lo que haya hecho solo.
  await sincronizarConNativo()
  await refrescarEstadoNativo()
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

// Al vincular la cuenta (desde el panel, en la app, o al volver el navegador)
// se cargan el perfil y las playlists.
watch(connected, async (value) => {
  if (!value) return
  if (!state.profile) await loadProfile()
  await loadLibrary()
})</script>

<style scoped>
.desplegar-enter-active, .desplegar-leave-active {
  transition: opacity 0.2s ease, max-height 0.25s ease;
  overflow: hidden;
  max-height: 320px;
}
.desplegar-enter-from, .desplegar-leave-to {
  opacity: 0;
  max-height: 0;
}
</style>
