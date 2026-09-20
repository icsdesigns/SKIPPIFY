<template>
  <div class="sk-stagger space-y-8">

    <!-- ══ Conexión con Spotify ══════════════════════════════════════════════
         Sin cuenta vinculada no hay nada que hacer aquí, así que la pantalla se
         reduce a los tres pasos de la conexión y a una demostración de para qué
         sirve todo esto una vez conectada. -->
    <template v-if="!connected">
      <section class="space-y-4">
        <header class="flex items-center gap-3">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-400/[0.18] text-lg">🔗</span>
          <div class="min-w-0">
            <h2 class="text-xl font-extrabold tracking-tightest text-white">Conecta tu cuenta de Spotify</h2>
            <p class="text-[11px] text-slate-500">Tres pasos. El acceso lo concedes tú y puedes revocarlo cuando quieras.</p>
          </div>
        </header>

        <article class="sk-card overflow-hidden">
          <!-- Paso 1 · crear la aplicación en el panel de Spotify -->
          <div class="border-b border-white/[0.07] p-5">
            <div class="flex items-start gap-3">
              <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-400 text-[11px] font-bold text-black">1</span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-bold text-white">Crea una aplicación en Spotify</p>
                <p class="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Entra en <span class="text-slate-300">developer.spotify.com/dashboard</span>,
                  pulsa <span class="text-slate-300">Create app</span> y ponle el nombre que quieras.
                </p>
              </div>
            </div>
          </div>

          <!-- Paso 2 · pegar la URI de redirección -->
          <div class="border-b border-white/[0.07] p-5">
            <div class="flex items-start gap-3">
              <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-400 text-[11px] font-bold text-black">2</span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-bold text-white">Copia esta URI de redirección en la app</p>
                <p class="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Va en el campo <span class="text-slate-300">Redirect URIs</span>. Tiene que ser exactamente ésta:
                </p>
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <code class="min-w-0 flex-1 break-all rounded-lg bg-black/30 px-2.5 py-2 font-mono text-[11px] text-brand-400">{{ redirectUri() }}</code>
                  <button type="button" class="sk-btn sk-btn-ghost sk-btn-sm shrink-0" @click="copiarRedirect">
                    {{ redirectCopiada ? '¡Copiada!' : 'Copiar' }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Paso 3 · pegar el Client ID y conectar -->
          <div class="p-5">
            <div class="flex items-start gap-3">
              <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-400 text-[11px] font-bold text-black">3</span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-bold text-white">Pega el Client ID y conecta</p>
                <p class="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Lo encuentras en <span class="text-slate-300">Settings</span> de la aplicación que acabas de crear.
                </p>
                <input
                  v-model="clientIdInput"
                  type="text"
                  placeholder="32 caracteres del panel de desarrollador"
                  class="mt-2.5 w-full sk-input px-3 py-2.5 font-mono text-xs text-slate-200 placeholder:text-slate-600"
                >
                <button
                  type="button"
                  class="mt-2.5 w-full sk-btn sk-btn-primary disabled:opacity-50"
                  :disabled="!clientIdInput.trim() || state.connecting"
                  @click="onConnect"
                >
                  {{ state.connecting ? 'Esperando a Spotify…' : 'Conectar con Spotify' }}
                </button>

                <p v-if="state.error" class="mt-2.5 rounded-md bg-rose-500/[0.16] px-3 py-2 text-[11px] text-rose-200">
                  {{ state.error }}
                </p>
              </div>
            </div>
          </div>
        </article>
      </section>

      <!-- ── Demostración: qué se puede hacer una vez conectada ─────────────── -->
      <section class="space-y-4">
        <header class="flex items-center gap-3">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-400/[0.18] text-lg">✨</span>
          <div class="min-w-0">
            <h2 class="text-xl font-extrabold tracking-tightest text-white">Un ejemplo de macro</h2>
            <p class="text-[11px] text-slate-500">Así queda una macro montada. Ésta es sólo una muestra: no se ejecuta.</p>
          </div>
        </header>

        <article class="sk-card p-5">
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
              <p class="mt-2 text-sm font-medium text-slate-100">{{ tramo.icon }} {{ tramo.titulo }}</p>
              <p class="mt-1 text-[11px] leading-relaxed text-slate-500">{{ tramo.detalle }}</p>
            </div>
          </div>

          <p class="mt-4 rounded-xl bg-black/30 px-3.5 py-3 text-xs leading-relaxed text-slate-300">
            Resultado: cada canción nueva de «Descubrimiento semanal» acaba sola en Tus me gusta,
            sin abrir la app. El servicio la ejecuta en segundo plano en cuanto detecta novedades.
          </p>
        </article>
      </section>
    </template>

    <template v-else>
      <!-- ══ 1 · Datos de la cuenta ══════════════════════════════════════════ -->
      <section class="space-y-4">
        <header class="flex flex-wrap items-center gap-3">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-400/[0.18] text-lg">🗂️</span>
          <div class="min-w-0 flex-1">
            <h2 class="text-xl font-extrabold tracking-tightest text-white">Datos de la cuenta</h2>
            <p class="text-[11px] text-slate-500">Lo que Skippify puede leer y escribir con los permisos que le diste.</p>
          </div>
          <button
            type="button"
            class="sk-btn sk-btn-ghost sk-btn-sm shrink-0"
            :disabled="loadingLibrary"
            @click="loadLibrary"
          >
            {{ loadingLibrary ? 'Cargando…' : 'Actualizar' }}
          </button>
        </header>

        <article class="sk-card p-4">
          <!-- Cabecera compacta con el perfil conectado -->
          <div class="flex items-center gap-3">
            <img
              v-if="state.profile?.images?.[0]?.url"
              :src="state.profile.images[0].url"
              alt=""
              class="h-9 w-9 rounded-full object-cover"
            >
            <span v-else class="flex h-9 w-9 items-center justify-center rounded-full bg-brand-400/[0.18] text-base">👤</span>

            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-bold text-white">
                {{ state.profile?.display_name || 'Cuenta conectada' }}
              </p>
              <p class="truncate text-[11px] text-slate-500">
                {{ state.profile?.email || state.profile?.id || '' }}
              </p>
            </div>

            <span v-if="state.profile?.product" class="sk-chip shrink-0">{{ state.profile.product }}</span>
            <button type="button" class="sk-btn sk-btn-ghost sk-btn-sm shrink-0" @click="disconnect">
              Desconectar
            </button>
          </div>

          <!-- Rejilla compacta: un dato por celda, sin párrafos -->
          <div class="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
            <div
              v-for="item in dataCatalog"
              :key="item.key"
              class="rounded-card bg-black/30 px-2 py-2.5 text-center"
              :title="item.detail"
            >
              <p class="text-base leading-none">{{ item.icon }}</p>
              <p class="mt-1.5 font-mono text-sm font-bold text-white">
                {{ item.count === null ? '·' : item.count }}
              </p>
              <p class="mt-0.5 truncate text-[10px] leading-tight text-slate-500">{{ item.short }}</p>
            </div>
          </div>

          <p v-if="libraryError" class="mt-3 rounded-md bg-rose-500/[0.16] px-3 py-2 text-[11px] text-rose-200">
            {{ libraryError }}
          </p>
        </article>
      </section>

      <!-- ══ 2 · Crear una macro ═════════════════════════════════════════════
           Un paso visible cada vez. Enseñar las tres etapas a la vez obligaba a
           leer toda la pantalla para entender por dónde ibas. -->
      <section class="space-y-4">
        <header class="flex items-center gap-3">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-400/[0.18] text-lg">⚡</span>
          <div class="min-w-0">
            <h2 class="text-xl font-extrabold tracking-tightest text-white">Crear una macro</h2>
            <p class="text-[11px] text-slate-500">De dónde salen las canciones, qué se hace con ellas y dónde acaban.</p>
          </div>
        </header>

        <article class="sk-card p-5">
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
              <div class="mt-2.5 grid gap-2 sm:grid-cols-2">
                <button
                  v-for="source in sources"
                  :key="source.type"
                  type="button"
                  class="rounded-xl border p-3 text-left transition-all"
                  :class="draft.source.type === source.type
                    ? 'sk-option-active'
                    : 'sk-option'"
                  @click="pickSource(source)"
                >
                  <p class="text-sm font-bold text-white">{{ source.icon }} {{ source.label }}</p>
                  <p class="mt-1 text-[11px] leading-relaxed text-slate-500">{{ source.detail }}</p>
                </button>
              </div>

              <select
                v-if="selectedSource?.needsPlaylist"
                v-model="draft.source.playlistId"
                class="mt-2.5 w-full sk-input px-3 py-2.5 text-xs text-slate-200"
                @change="syncSourcePlaylistName"
              >
                <option value="">Elige la playlist de origen…</option>
                <option v-for="pl in sourcePlaylists" :key="pl.id" :value="pl.id">
                  {{ pl.name }} ({{ playlistCount(pl) }}){{ pl.writable ? '' : ' · solo lectura' }}
                </option>
              </select>

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
              <div class="mt-2.5 grid gap-2 sm:grid-cols-2">
                <button
                  v-for="action in availableActions"
                  :key="action.type"
                  type="button"
                  class="rounded-xl border p-3 text-left transition-all"
                  :class="draft.action.type === action.type
                    ? 'border-violet-400 bg-violet-400/[0.14] text-white'
                    : 'sk-option'"
                  @click="pickAction(action)"
                >
                  <p class="text-sm font-bold text-white">{{ action.icon }} {{ action.label }}</p>
                  <p class="mt-1 text-[11px] leading-relaxed text-slate-500">{{ action.detail }}</p>
                </button>
              </div>
            </div>

            <!-- ── C · destino ────────────────────────────────────────────── -->
            <div v-else-if="pasoActual === 'target'">
              <p class="sk-eyebrow">¿Dónde acaban?</p>
              <div class="mt-2.5 grid gap-2 sm:grid-cols-2">
                <button
                  v-for="target in availableTargets"
                  :key="target.type"
                  type="button"
                  class="rounded-xl border p-3 text-left transition-all"
                  :class="draft.target.type === target.type
                    ? 'border-sky-400 bg-sky-400/[0.14] text-white'
                    : 'sk-option'"
                  @click="pickTarget(target)"
                >
                  <p class="text-sm font-bold text-white">{{ target.icon }} {{ target.label }}</p>
                </button>
              </div>

              <select
                v-if="selectedTarget?.needsPlaylist"
                v-model="draft.target.playlistId"
                class="mt-2.5 w-full sk-input px-3 py-2.5 text-xs text-slate-200"
                @change="syncTargetPlaylistName"
              >
                <option value="">Elige la playlist de destino…</option>
                <option v-for="pl in writablePlaylists" :key="pl.id" :value="pl.id">
                  {{ pl.name }} ({{ playlistCount(pl) }})
                </option>
              </select>

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

          <!-- Navegación: atrás y siguiente disponibles en todos los pasos -->
          <div class="mt-5 flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-4">
            <button
              type="button"
              class="sk-btn sk-btn-ghost sk-btn-sm"
              :disabled="pasoIdx === 0"
              @click="retroceder"
            >
              ← Atrás
            </button>

            <button
              v-if="pasoIdx > 0"
              type="button"
              class="sk-btn sk-btn-ghost sk-btn-sm"
              @click="reiniciarBorrador"
            >
              Empezar de cero
            </button>

            <button
              v-if="pasoActual !== 'save'"
              type="button"
              class="sk-btn sk-btn-primary sk-btn-sm ml-auto disabled:opacity-40"
              :disabled="!puedeAvanzar"
              @click="avanzar"
            >
              Siguiente →
            </button>

            <button
              v-else
              type="button"
              class="sk-btn sk-btn-primary sk-btn-sm ml-auto disabled:opacity-40"
              :disabled="!!draftError"
              @click="onCreate"
            >
              Guardar macro
            </button>
          </div>
        </article>
      </section>

      <!-- ══ 3 · Tus macros ══════════════════════════════════════════════════ -->
      <section class="space-y-4">
        <header class="flex flex-wrap items-center gap-3">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-400/[0.18] text-lg">📚</span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <h2 class="text-xl font-extrabold tracking-tightest text-white">Tus macros</h2>
              <!-- La explicación larga ocupaba media pantalla: ahora se pide. -->
              <button
                type="button"
                class="flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.03] text-[11px] text-slate-400 transition-colors hover:border-white/25 hover:text-slate-200"
                :aria-expanded="verAyudaMacros"
                aria-label="Cómo se ejecutan las macros"
                @click="verAyudaMacros = !verAyudaMacros"
              >ℹ️</button>
            </div>
            <p class="text-[11px] text-slate-500">{{ macros.length }} macro(s) guardada(s)</p>
          </div>
          <button
            v-if="macros.length"
            type="button"
            class="sk-btn sk-btn-ghost sk-btn-sm shrink-0"
            :disabled="running"
            @click="onRunAll"
          >
            {{ running ? 'Ejecutando…' : 'Ejecutar todas' }}
          </button>
        </header>

        <Transition name="desplegar">
          <p
            v-if="verAyudaMacros"
            class="rounded-xl bg-black/30 px-3.5 py-3 text-[11px] leading-relaxed text-slate-400"
          >
            Las macros marcadas «en segundo plano» las ejecuta el servicio con la app cerrada:
            las de la canción actual en cuanto cambia la canción, y las de lista en un repaso
            cada 15 minutos. El resto se evalúan al pulsar «Ejecutar». Todas recuerdan por dónde
            iban, así que nada se procesa dos veces aunque pasen días entre ejecuciones.
          </p>
        </Transition>

        <p v-if="!macros.length" class="sk-card px-5 py-6 text-center text-xs text-slate-500">
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
            <!-- Etiqueta plegada: lo justo para reconocer la macro de un vistazo -->
            <div class="flex items-center gap-2 p-3">
              <button
                type="button"
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.03] text-[10px] text-slate-400 transition-transform"
                :class="abierta[macro.id] ? 'rotate-90' : ''"
                :aria-expanded="!!abierta[macro.id]"
                :aria-label="abierta[macro.id] ? 'Plegar macro' : 'Desplegar macro'"
                @click="abierta[macro.id] = !abierta[macro.id]"
              >▶</button>

              <button
                type="button"
                class="min-w-0 flex-1 text-left"
                :class="macro.enabled ? '' : 'opacity-60'"
                @click="abierta[macro.id] = !abierta[macro.id]"
              >
                <p class="truncate text-sm font-bold text-white">{{ macro.name }}</p>
                <p class="truncate text-[11px] text-slate-500">{{ describeMacro(macro) }}</p>
              </button>

              <span
                v-if="correEnSegundoPlano(macro)"
                class="hidden shrink-0 items-center gap-1 rounded-full bg-brand-400/[0.18] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-200 sm:inline-flex"
              >
                <span class="h-1 w-1 rounded-full bg-brand-400" />segundo plano
              </span>

              <span class="hidden shrink-0 font-mono text-[10px] text-slate-500 sm:inline">
                {{ ejecuciones(macro) }} ejec.
              </span>

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
              <p
                v-if="!correEnSegundoPlano(macro) && motivoSinSegundoPlano(macro)"
                class="mb-2 text-[10px] leading-relaxed text-amber-300/80"
              >
                Sólo a mano: {{ motivoSinSegundoPlano(macro) }}
              </p>

              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="sk-btn sk-btn-sm bg-sky-400/[0.18] text-sky-100 hover:bg-sky-400/30"
                  :disabled="running"
                  @click="onPreview(macro)"
                >Vista previa</button>
                <button
                  type="button"
                  class="sk-btn sk-btn-sm bg-brand-400/[0.18] text-brand-200 hover:bg-brand-400/30"
                  :disabled="running"
                  @click="onRun(macro)"
                >Ejecutar</button>
                <button
                  type="button"
                  class="sk-btn sk-btn-ghost sk-btn-sm"
                  @click="verHistorial[macro.id] = !verHistorial[macro.id]"
                >{{ verHistorial[macro.id] ? 'Ocultar historial' : 'Historial' }}</button>
                <button
                  type="button"
                  class="sk-btn sk-btn-ghost sk-btn-sm"
                  @click="deleteMacro(macro.id)"
                >Borrar</button>

                <span class="ml-auto font-mono text-[10px] text-slate-500">
                  {{ ejecuciones(macro) }} ejec. · {{ aplicadas(macro) }} canciones
                </span>
              </div>

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
      </section>
    </template>

  </div>
</template>

<script setup>
/**
 * Macros — pantalla en tres bloques: los datos de la cuenta, el asistente que
 * monta una macro y la lista de las guardadas.
 *
 * El asistente enseña UN paso cada vez (origen → acción → destino → guardar)
 * con «Atrás» y «Siguiente» siempre a mano: verlo todo desplegado obligaba a
 * releer la pantalla entera para saber por dónde ibas. Las macros guardadas son
 * etiquetas plegadas por defecto, con su interruptor a la vista.
 */
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useSpotify } from '@/composables/useSpotify'
import {
  useMacros,
  describeMacro,
  validateDraft,
  sourceMeta,
  actionMeta,
  targetMeta,
  MACRO_SOURCES,
  MACRO_ACTIONS,
  MACRO_TARGETS
} from '@/composables/useMacros'

const spotify = useSpotify()
const { state, connected, clientId, setClientId, redirectUri, connect, disconnect, consumeRedirect, cancelConnecting, loadProfile, missingScopes, api, apiPaged } = spotify
const {
  macros, createMacro, deleteMacro, toggleMacro, runMacro, runAllEnabled,
  sincronizarConNativo, refrescarEstadoNativo, correEnSegundoPlano, motivoSinSegundoPlano,
  estadisticasNativas, historialPorDia
} = useMacros()

/** Qué macros están desplegadas. Plegadas por defecto: el objeto nace vacío. */
const abierta = reactive({})
/** Qué macros tienen el historial desplegado. */
const verHistorial = reactive({})
/** La descripción larga de «Tus macros» se pide con el icono de información. */
const verAyudaMacros = ref(false)
const redirectCopiada = ref(false)
let redirectCopiadaTimer = null

/** Muestra de macro para quien todavía no ha vinculado la cuenta. */
const demoMacro = [
  {
    letra: 'A',
    etapa: 'Origen',
    icon: '🆕',
    titulo: 'Novedades de una playlist',
    detalle: '«Descubrimiento semanal», sólo lo que Spotify haya añadido desde la última vez.'
  },
  {
    letra: 'B',
    etapa: 'Acción',
    icon: '📋',
    titulo: 'Copiar',
    detalle: 'Se añaden al destino sin tocar la playlist de origen.'
  },
  {
    letra: 'C',
    etapa: 'Destino',
    icon: '💚',
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

const clientIdInput = ref(clientId.value)
const playlists = ref([])
const library = reactive({ liked: null, recent: null, top: null, following: null })
const loadingLibrary = ref(false)
const libraryError = ref('')
const running = ref(false)
const results = reactive({})

const draft = reactive({
  name: '',
  source: { type: '', playlistId: '', playlistName: '', playlistWritable: null },
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
const readOnlyCount = computed(() => playlists.value.length - writablePlaylists.value.length)

/** «Mover» y «quitar del origen» borran de la playlist de origen. */
const exigeOrigenEscribible = computed(() =>
  draft.action.type === 'move' || draft.action.type === 'remove_from_source')

const sourcePlaylists = computed(() =>
  exigeOrigenEscribible.value ? writablePlaylists.value : playlists.value)

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
  draft.source = { type: '', playlistId: '', playlistName: '', playlistWritable: null }
  draft.action = { type: '' }
  draft.target = { type: '', playlistId: '', playlistName: '', newPlaylistName: '', playlistWritable: null }
  pasoIdx.value = 0
}

// Cambiar de acción añade o quita el paso «destino»: sin esto el índice se
// quedaría apuntando fuera de la lista.
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

const dataCatalog = computed(() => [
  {
    key: 'playlists',
    icon: '🎵',
    short: 'Playlists',
    count: playlists.value.length || null,
    detail: 'Propias y seguidas, con sus canciones. Se pueden leer, ampliar y vaciar.'
  },
  {
    key: 'recent',
    icon: '🕒',
    short: 'Recientes',
    count: library.recent,
    detail: 'Las últimas 50 canciones escuchadas, con la hora exacta de cada una.'
  },
  {
    key: 'liked',
    icon: '💚',
    short: 'Me gusta',
    count: library.liked,
    detail: 'La biblioteca de canciones guardadas. Se pueden añadir y quitar canciones.'
  },
  {
    key: 'top',
    icon: '🏆',
    short: 'Top',
    count: library.top,
    detail: 'Tu ranking personal a corto, medio y largo plazo según Spotify.'
  },
  {
    key: 'following',
    icon: '👥',
    short: 'Artistas',
    count: library.following,
    detail: 'La lista de artistas seguidos, útil para filtrar por procedencia.'
  },
  {
    key: 'player',
    icon: '▶️',
    short: 'Reproductor',
    count: null,
    detail: 'Canción actual, dispositivo activo, cola y control de reproducción (saltar, encolar).'
  }
])

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
  if (!source.needsPlaylist) avanzar()
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

async function onConnect () {
  setClientId(clientIdInput.value)
  await connect()
}

async function copiarRedirect () {
  try {
    await navigator.clipboard.writeText(redirectUri())
    redirectCopiada.value = true
    if (redirectCopiadaTimer) clearTimeout(redirectCopiadaTimer)
    redirectCopiadaTimer = setTimeout(() => { redirectCopiada.value = false }, 2000)
  } catch { /* la Clipboard API no existe fuera de contextos seguros */ }
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
        : 'No hay canciones pendientes ahora mismo.'
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
      : macro.stats.lastResult || 'Sin cambios.')
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

async function loadLibrary () {
  if (!connected.value) return
  loadingLibrary.value = true
  libraryError.value = ''

  try {
    // `/me/playlists` devuelve también las que solo sigues (editoriales, de
    // otras personas). Sobre esas Spotify responde 403 al escribir, así que se
    // marca aquí quién puede modificar cada una y la interfaz lo respeta.
    const profile = state.profile || await loadProfile()
    playlists.value = (await apiPaged('/me/playlists?limit=50', 200))
      .filter(Boolean)
      .map(pl => ({
        ...pl,
        writable: (!!profile?.id && pl.owner?.id === profile.id) || pl.collaborative === true
      }))

    // Sólo interesa el total de cada colección: se pide una página mínima y se
    // lee el campo `total`, en lugar de descargar miles de canciones.
    const [liked, recent, top, following] = await Promise.all([
      api('/me/tracks?limit=1').catch(() => null),
      api('/me/player/recently-played?limit=1').catch(() => null),
      api('/me/top/tracks?limit=1').catch(() => null),
      api('/me/following?type=artist&limit=1').catch(() => null)
    ])

    library.liked = liked?.total ?? null
    library.recent = recent?.items?.length != null ? (recent.total ?? 50) : null
    library.top = top?.total ?? null
    library.following = following?.artists?.total ?? null
  } catch (error) {
    libraryError.value = error?.message || 'No se pudieron cargar tus datos.'
  } finally {
    loadingLibrary.value = false
  }
}

let redirectHandle = null

async function handleRedirect (url) {
  const ok = await consumeRedirect(url)
  if (ok) await loadLibrary()
  return ok
}

/**
 * Comprueba si hay una redirección OAuth esperando en el lado nativo.
 *
 * No basta con el evento spotifyAuthRedirect: si la vista ya estaba montada
 * cuando el usuario volvió del navegador, o el evento se pierde por cualquier
 * motivo, la pantalla se quedaría esperando indefinidamente. Preguntar al
 * volver a primer plano es la red de seguridad.
 */
async function pollPendingRedirect () {
  const NL = window.Capacitor?.Plugins?.NotifListener
  if (!NL?.consumeAuthRedirect) return false
  const pending = await NL.consumeAuthRedirect().catch(() => null)
  if (!pending?.url) return false
  return handleRedirect(pending.url)
}

async function onVisibilityChange () {
  if (document.visibilityState !== 'visible') return
  const handled = await pollPendingRedirect()
  // Se ha vuelto a la app sin traer ningún código: el usuario canceló o cerró
  // el navegador. Liberar el botón en vez de dejarlo girando para siempre.
  if (!handled && !connected.value) cancelConnecting()
}

onMounted(async () => {
  // Vuelta del navegador: en la app llega por evento nativo; en el navegador,
  // en la propia barra de direcciones.
  const NL = window.Capacitor?.Plugins?.NotifListener
  if (NL?.addListener) {
    redirectHandle = await NL.addListener('spotifyAuthRedirect', payload => handleRedirect(payload?.url))
  }
  await pollPendingRedirect()
  document.addEventListener('visibilitychange', onVisibilityChange)

  if (window.location.search.includes('code=') || window.location.search.includes('error=')) {
    await handleRedirect(window.location.href)
    // Limpiar la barra evita reprocesar el mismo `code` al recargar.
    window.history.replaceState({}, '', window.location.pathname + window.location.hash)
  }

  // El servicio pudo refrescar el token con la app cerrada: el bueno es el suyo.
  await spotify.adoptarSesionNativa?.()

  if (connected.value) {
    if (!state.profile) await loadProfile()
    await loadLibrary()
  }

  // Se le pasan las macros al servicio y se recoge lo que haya hecho solo.
  await sincronizarConNativo()
  await refrescarEstadoNativo()
})

onUnmounted(() => {
  if (redirectHandle?.remove) redirectHandle.remove()
  if (redirectCopiadaTimer) clearTimeout(redirectCopiadaTimer)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

watch(connected, async (value) => {
  if (!value) return
  if (!state.profile) await loadProfile()
  await loadLibrary()
})

watch(clientId, (value) => { clientIdInput.value = value })
</script>

<style scoped>
.desplegar-enter-active, .desplegar-leave-active {
  transition: opacity 0.2s ease, max-height 0.25s ease;
  overflow: hidden;
  max-height: 220px;
}
.desplegar-enter-from, .desplegar-leave-to {
  opacity: 0;
  max-height: 0;
}
</style>
