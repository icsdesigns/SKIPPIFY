package com.skippify.app;

import android.Manifest;
import android.app.AlertDialog;
import android.app.AppOpsManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.InstallSourceInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.TextUtils;
import android.net.Uri;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Capacitor plugin that bridges SpotifyNotificationListener → JavaScript.
 */
@CapacitorPlugin(name = "NotifListener")
public class NotifListenerPlugin extends Plugin
        implements SpotifyNotificationListener.TrackListener {

    private static volatile NotifListenerPlugin sInstance;
    private static volatile String sPendingOpenRoute = "";
    private static volatile String sPendingAuthRedirect = "";

    /** Debe coincidir con el intent-filter del manifiesto y con el redirect URI. */
    private static final String AUTH_REDIRECT_SCHEME = "skippify";

    /** Singleton accessor for MainActivity.onResume(). */
    public static NotifListenerPlugin getInstance() {
        return sInstance;
    }

    @Override
    public void load() {
        sInstance = this;
        SpotifyNotificationListener.setListener(this);
        captureOpenRouteFromIntent();
        captureAuthRedirectFromIntent();

        // On first load, request POST_NOTIFICATIONS if needed (Android 13+)
        requestPostNotificationsIfNeeded();
    }

    /**
     * Sin actividad no hay JS que reciba nada. Soltar el listener hace que el log
     * marque lo que llega a partir de aquí como captado con la app cerrada, que
     * es lo que LigaBackground sube por su cuenta.
     */
    @Override
    protected void handleOnDestroy() {
        SpotifyNotificationListener.clearListener(this);
        super.handleOnDestroy();
    }

    // ── TrackListener callback (called from service thread) ───────────────────
    @Override
    public void onTrack(String track, String artist, String album, long durationMs, boolean isPlaying) {
        JSObject data = new JSObject();
        data.put("track",     track);
        data.put("artist",    artist);

        String event;
        if (TextUtils.isEmpty(track) && TextUtils.isEmpty(artist)) {
            event = "stopped";
        } else {
            event = isPlaying ? "playing" : "paused";
        }
        data.put("event", event);

        if (!TextUtils.isEmpty(album)) {
            data.put("album", album);
        }
        if (durationMs > 0) {
            data.put("duration_ms", durationMs);
        }
        data.put("is_playing", isPlaying);
        data.put("played_at", SpotifyNotificationListener.toIso8601(System.currentTimeMillis()));
        data.put("source",    "notification");
        notifyListeners("spotifyTrack", data, true);
    }

    /**
     * Called by MainActivity.onResume() so we can re-check permission
     * status after the user returns from system settings.
     */
    public void onActivityResumed() {
        captureOpenRouteFromIntent();
        captureAuthRedirectFromIntent();

        boolean enabled = isNotificationListenerEnabled();
        if (enabled) SpotifyNotificationListener.ensureBound(getContext());
        JSObject data = new JSObject();
        data.put("enabled", enabled);
        data.put("connected", SpotifyNotificationListener.isConnected());
        notifyListeners("permissionChanged", data, true);
        emitFeatureConfigChanged();

        String route = consumePendingOpenRouteValue();
        if (!route.isEmpty()) {
            emitOpenRoute(route);
        }

        String redirect = consumePendingAuthRedirectValue();
        if (!redirect.isEmpty()) {
            emitAuthRedirect(redirect);
        }
    }

    public static void notifyFeatureConfigChanged() {
        NotifListenerPlugin instance = sInstance;
        if (instance != null) {
            try {
                instance.emitFeatureConfigChanged();
            } catch (Throwable ignored) {
            }
        }
    }

    // ── Plugin methods callable from JS ───────────────────────────────────────

    /** Returns { enabled: boolean } – whether notification listener access is granted. */
    @PluginMethod
    public void isEnabled(PluginCall call) {
        boolean enabled = isNotificationListenerEnabled();
        JSObject result = new JSObject();
        result.put("enabled", enabled);
        call.resolve(result);
    }

    /**
     * Abre el ajuste del acceso a notificaciones y dice por dónde ha entrado.
     *
     * Primero la ficha del propio Skippify (Android 11+), que deja el
     * interruptor a un toque; si la capa del fabricante no la resuelve, la
     * lista general; y si tampoco, la ficha de la app. `via` deja a la pantalla
     * de bloqueo afinar qué decirle al usuario.
     */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("via", openNotificationListenerSettings());
        call.resolve(result);
    }

    /**
     * Abre «Información de la app» de Skippify: es donde vive el menú de tres
     * puntos con «Permitir ajustes restringidos» en Android 13+.
     */
    @PluginMethod
    public void openAppDetails(PluginCall call) {
        JSObject result = new JSObject();
        result.put("opened", openAppDetailsScreen());
        call.resolve(result);
    }

    /**
     * Qué dispositivo es y cómo se instaló Skippify, para que la pantalla de
     * bloqueo dé el camino exacto en vez de uno genérico.
     *
     * · `rom` / `romVersion`: la capa del fabricante, leída de las propiedades
     *   del sistema que cada una publica (no hay API pública para esto).
     * · `packageSource`: Android 13+ marca las APK abiertas desde un archivo o
     *   una descarga, que son justo las que sufren los «ajustes restringidos».
     * · `restrictedSettings`: el estado real de esa restricción, leído de su
     *   AppOp. «restricted» = el interruptor saldrá bloqueado; «allowed» = ya
     *   se permitió o nunca aplicó; «unknown» = el sistema no deja leerlo.
     */
    @PluginMethod
    public void getDeviceInfo(PluginCall call) {
        JSObject r = new JSObject();
        r.put("manufacturer", nz(Build.MANUFACTURER));
        r.put("brand", nz(Build.BRAND));
        r.put("model", nz(Build.MODEL));
        r.put("sdkInt", Build.VERSION.SDK_INT);
        r.put("release", nz(Build.VERSION.RELEASE));

        String[] rom = detectRom();
        r.put("rom", rom[0]);
        r.put("romVersion", rom[1]);

        r.put("installer", installerPackage());
        r.put("packageSource", packageSource());
        r.put("restrictedSettings", restrictedSettingsState());
        r.put("listenerEnabled", isNotificationListenerEnabled());
        call.resolve(r);
    }

    /**
     * Shows a native Android dialog explaining why the permission is needed,
     * then opens system settings if user accepts.
     */
    @PluginMethod
    public void promptPermission(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            new AlertDialog.Builder(getActivity())
                .setTitle("Acceso a notificaciones")
                .setMessage(
                    "Skippify necesita acceso a las notificaciones de tu dispositivo " +
                    "para detectar automáticamente las canciones que escuchas en Spotify.\n\n" +
                    "En la siguiente pantalla, busca \"Skippify\" y activa el permiso."
                )
                .setPositiveButton("Activar", (dialog, which) -> {
                    openNotificationListenerSettings();
                    call.resolve(new JSObject().put("opened", true));
                })
                .setNegativeButton("Ahora no", (dialog, which) -> {
                    call.resolve(new JSObject().put("opened", false));
                })
                .setCancelable(false)
                .show();
        });
    }

    /**
     * Ensures POST_NOTIFICATIONS runtime permission (Android 13+)
     * and notification listener access are both handled.
     */
    @PluginMethod
    public void ensureAllPermissions(PluginCall call) {
        // 1. POST_NOTIFICATIONS (Android 13+)
        requestPostNotificationsIfNeeded();

        // 2. Notification listener access
        boolean listenerEnabled = isNotificationListenerEnabled();
        boolean batteryOptimizationIgnored = isBatteryOptimizationIgnored();

        JSObject result = new JSObject();
        result.put("listenerEnabled", listenerEnabled);
        result.put("postNotificationsGranted", isPostNotificationsGranted());
        result.put("batteryOptimizationIgnored", batteryOptimizationIgnored);
        call.resolve(result);
    }

    /**
     * Lee el estado de los permisos SIN pedir ninguno.
     *
     * `ensureAllPermissions` dispara la petición de POST_NOTIFICATIONS como
     * efecto secundario, así que no vale para consultar: llamarla en cada
     * arranque hacía saltar el diálogo del sistema al abrir la app. Todo lo que
     * sólo quiera mirar —el banner de ajustes pendientes, el refresco de la
     * pantalla de Configuración— usa esta.
     */
    @PluginMethod
    public void getPermissionsState(PluginCall call) {
        JSObject result = new JSObject();
        result.put("listenerEnabled", isNotificationListenerEnabled());
        result.put("listenerConnected", SpotifyNotificationListener.isConnected());
        result.put("postNotificationsGranted", isPostNotificationsGranted());
        result.put("batteryOptimizationIgnored", isBatteryOptimizationIgnored());
        call.resolve(result);
    }

    /**
     * Excluye la app de la optimización de batería.
     *
     * Se intenta primero el diálogo del sistema (ACTION_REQUEST_IGNORE_BATTERY_
     * OPTIMIZATIONS), que aplica el ajuste ahí mismo con un toque: es lo más
     * parecido a autoaplicarlo que Android permite, porque la exclusión no se
     * puede conceder sin intervención del usuario. Si ese diálogo no existe o
     * la capa del fabricante lo bloquea, se cae a la lista de optimización de
     * batería y, en último término, a la ficha de la aplicación; nunca a los
     * ajustes generales, donde encontrar la opción es una búsqueda a ciegas.
     */
    @PluginMethod
    public void requestIgnoreBatteryOptimization(PluginCall call) {
        if (isBatteryOptimizationIgnored()) {
            JSObject ya = new JSObject();
            ya.put("opened", false);
            ya.put("granted", true);
            ya.put("via", "already-granted");
            call.resolve(ya);
            return;
        }

        String pkg = getContext().getPackageName();
        List<Intent> intentos = new ArrayList<Intent>();
        List<String> etiquetas = new ArrayList<String>();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Intent directo = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            directo.setData(Uri.parse("package:" + pkg));
            intentos.add(directo);
            etiquetas.add("dialog");

            intentos.add(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            etiquetas.add("battery-list");
        }

        Intent ficha = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        ficha.setData(Uri.parse("package:" + pkg));
        intentos.add(ficha);
        etiquetas.add("app-details");

        for (int i = 0; i < intentos.size(); i++) {
            Intent intent = intentos.get(i);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            // resolveActivity evita el ANR silencioso de lanzar un intent que
            // ninguna actividad atiende, que es como se comportan varias capas
            // OEM con el diálogo directo.
            if (intent.resolveActivity(getContext().getPackageManager()) == null) continue;
            try {
                getContext().startActivity(intent);
                JSObject out = new JSObject();
                out.put("opened", true);
                out.put("granted", false);
                out.put("via", etiquetas.get(i));
                call.resolve(out);
                return;
            } catch (Throwable ignored) { /* se prueba el siguiente */ }
        }

        JSObject out = new JSObject();
        out.put("opened", false);
        out.put("granted", false);
        out.put("via", "none");
        call.resolve(out);
    }

    /**
     * Drains any Spotify play/pause/stopped events captured while the WebView was
     * paused or the JS layer was not running.
     */
    @PluginMethod
    public void drainBackgroundEvents(PluginCall call) {
        JSArray out = new JSArray();

        synchronized (SpotifyNotificationListener.sEventFileLock) {
            try {
                File dir = getContext().getFilesDir();
                if (dir != null) {
                    File f = new File(dir, SpotifyNotificationListener.EVENT_LOG_FILE);
                    if (f.exists() && f.isFile()) {
                        int maxLines = 5000;
                        int linesRead = 0;

                        try (BufferedReader reader = new BufferedReader(
                                new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8)
                        )) {
                            String line;
                            while ((line = reader.readLine()) != null) {
                                if (++linesRead > maxLines) break;
                                line = line.trim();
                                if (line.isEmpty()) continue;

                                try {
                                    JSONObject o = new JSONObject(line);
                                    JSObject evt = new JSObject();
                                    if (o.has("played_at")) evt.put("played_at", o.optString("played_at", ""));
                                    if (o.has("event")) evt.put("event", o.optString("event", ""));
                                    if (o.has("track")) evt.put("track", o.optString("track", ""));
                                    if (o.has("artist")) evt.put("artist", o.optString("artist", ""));
                                    if (o.has("album")) evt.put("album", o.optString("album", ""));
                                    if (o.has("duration_ms")) evt.put("duration_ms", o.optLong("duration_ms", 0L));
                                    if (o.has("is_playing")) evt.put("is_playing", o.optBoolean("is_playing", false));
                                    if (o.has("source")) evt.put("source", o.optString("source", ""));
                                    out.put(evt);
                                } catch (Throwable ignored) {
                                }
                            }
                        }
                        //noinspection ResultOfMethodCallIgnored
                        f.delete();
                    }
                }
            } catch (Throwable ignored) {
            }
        }

        JSObject result = new JSObject();
        result.put("events", out);
        call.resolve(result);
    }

    /**
     * Skips the current Spotify track via MediaSession transport controls.
     * Used by the "Saltar duplicadas" feature in JS.
     */
    @PluginMethod
    public void skipTrack(PluginCall call) {
        SpotifyNotificationListener.skipCurrentTrack();
        call.resolve();
    }

    // ── Pestaña «Desarrollo» ──────────────────────────────────────────────────

    /**
     * Estado en vivo del motor de duplicadas: índice, sesión en curso, ajustes y
     * las últimas decisiones con su motivo y latencia.
     */
    @PluginMethod
    public void getDuplicateDiagnostics(PluginCall call) {
        try {
            call.resolve(JSObject.fromJSONObject(DuplicateSkipEngine.get().diagnostics()));
        } catch (Throwable t) {
            call.reject("No se pudo leer el diagnóstico: " + t.getMessage());
        }
    }

    /** Ajusta los parámetros del motor. Cualquier campo omitido se deja igual. */
    @PluginMethod
    public void setDuplicateDevConfig(PluginCall call) {
        DuplicateSkipEngine.setDevConfig(
                getContext(),
                call.getInt("decisionWindowMs"),
                call.getInt("minStableMs"),
                call.getBoolean("pauseToSkip"),
                call.getBoolean("telemetry"),
                call.getBoolean("premute"),
                call.getInt("premuteMaxMs"),
                call.getBoolean("restartOnKeep"),
                call.getInt("unmuteDelayMs")
        );
        resolveDiagnostics(call);
    }

    /** Duplicadas oídas y saltadas desde las 00:00 de hoy. */
    @PluginMethod
    public void getDailyStats(PluginCall call) {
        int[] daily = DuplicateSkipEngine.dailyStats(getContext());
        JSObject result = new JSObject();
        result.put("duplicates", daily[0]);
        result.put("skipped", daily[1]);
        call.resolve(result);
    }

    /**
     * Histórico diario de duplicadas, para los paneles semanales y mensuales.
     * Devuelve `{ days: [{ day: AAAAMMDD, duplicates, skipped }] }`, del día más
     * reciente al más antiguo.
     */
    @PluginMethod
    public void getDailyStatsHistory(PluginCall call) {
        JSObject result = new JSObject();
        JSArray days = new JSArray();
        try {
            String raw = DuplicateSkipEngine.dailyHistory(getContext());
            if (raw != null && !raw.isEmpty()) {
                for (String trozo : raw.split(";")) {
                    String[] partes = trozo.split(":");
                    if (partes.length < 3) continue;
                    try {
                        JSObject dia = new JSObject();
                        dia.put("day", Integer.parseInt(partes[0]));
                        dia.put("duplicates", Integer.parseInt(partes[1]));
                        dia.put("skipped", Integer.parseInt(partes[2]));
                        days.put(dia);
                    } catch (NumberFormatException ignored) {
                    }
                }
            }
        } catch (Throwable ignored) {
        }
        result.put("days", days);
        call.resolve(result);
    }

    // ── Macros en segundo plano ──────────────────────────────────────────────

    /**
     * Deposita la sesión de Spotify en el lado nativo.
     *
     * A partir de aquí el nativo es el ÚNICO que refresca el token. Si
     * refrescaran los dos lados, Spotify puede rotar el refresh token y dejar al
     * otro con uno muerto, cerrando la sesión sin que se entienda por qué.
     */
    @PluginMethod
    public void setSpotifySession(PluginCall call) {
        MacroBackground.guardarSesion(
                getContext(),
                call.getString("clientId"),
                call.getString("accessToken"),
                call.getString("refreshToken"),
                call.getLong("expiresAt", 0L),
                call.getString("scope")
        );
        call.resolve(aJS(MacroBackground.estadoSesion(getContext())));
    }

    /** Estado de la sesión. No devuelve el refresh token: ése no sale de aquí. */
    @PluginMethod
    public void getSpotifySession(PluginCall call) {
        call.resolve(aJS(MacroBackground.estadoSesion(getContext())));
    }

    /** Renueva el access token y devuelve el estado resultante. */
    @PluginMethod
    public void refreshSpotifySession(PluginCall call) {
        call.resolve(aJS(MacroBackground.refrescarSesion(getContext())));
    }

    @PluginMethod
    public void clearSpotifySession(PluginCall call) {
        MacroBackground.borrarSesion(getContext());
        call.resolve();
    }

    /**
     * Sesión anónima de Firebase y grupos de Comunidad, para que el servicio
     * suba las escuchas aunque nadie abra la app. Sin grupos se borra.
     */
    @PluginMethod
    public void setLeagueSync(PluginCall call) {
        JSArray grupos = call.getArray("groupIds");
        if (grupos == null || grupos.length() == 0) {
            LigaBackground.borrar(getContext());
        } else {
            LigaBackground.guardar(
                    getContext(),
                    call.getString("uid"),
                    call.getString("refreshToken"),
                    call.getString("apiKey"),
                    call.getString("projectId"),
                    grupos,
                    call.getString("activeGroupId"),
                    call.getString("origin")
            );
        }
        // Con grupos nuevos (o sin ninguno) la alarma del domingo cambia.
        try {
            LigaResultados.programar(getContext());
        } catch (Throwable ignored) {
        }
        call.resolve(aJS(LigaBackground.estado(getContext())));
    }

    /**
     * La app ya enseña la semana de un grupo. El aviso lo da el servicio, que es
     * quien lleva la cuenta de lo avisado: si ya sonó a las 15:00, no se repite.
     */
    @PluginMethod
    public void notifyLeagueResult(PluginCall call) {
        boolean mostrado = LigaResultados.avisar(
                getContext(),
                call.getString("groupId", ""),
                call.getString("groupName", ""),
                call.getString("revealAt", "")
        );
        JSObject r = new JSObject();
        r.put("shown", mostrado);
        call.resolve(r);
    }

    /** La app sincroniza aquí sus macros cada vez que cambian. */
    @PluginMethod
    public void setBackgroundMacros(PluginCall call) {
        JSArray macros = call.getArray("macros");
        MacroBackground.guardarMacros(getContext(), macros == null ? "[]" : macros.toString());
        call.resolve(estadoDeMacros());
    }

    /**
     * Cuáles gobierna el servicio y qué ha hecho con ellas. Es lo que permite a
     * la pestaña Macros decir «ejecutada en segundo plano hace 3 min» en vez de
     * dejar al usuario adivinando si aquello funciona.
     */
    @PluginMethod
    public void getBackgroundMacroState(PluginCall call) {
        call.resolve(estadoDeMacros());
    }

    /**
     * Ejecuta ahora las macros de canción actual, saltándose la ventana de
     * repetición. Lo llama el botón «Ejecutar» de la app para que exista un
     * único sitio que las ejecuta y, por tanto, un único deduplicado.
     */
    @PluginMethod
    public void runBackgroundMacrosNow(final PluginCall call) {
        final String macroId = call.getString("id");
        new Thread(new Runnable() {
            public void run() {
                try {
                    call.resolve(aJS(MacroBackground.ejecutarAhora(getContext(), macroId)));
                } catch (Throwable t) {
                    call.reject("No se pudieron ejecutar: " + t.getMessage());
                }
            }
        }).start();
    }

    /**
     * Vincula una macro a la pulsación larga del botón de los auriculares, o
     * suelta el vínculo con un id vacío. Devuelve el estado completo de las
     * macros, que ya incluye el del botón.
     */
    @PluginMethod
    public void setHeadsetMacro(PluginCall call) {
        MacroBackground.vincularBoton(getContext(), call.getString("id"));
        call.resolve(estadoDeMacros());
    }

    /** Ejecuta la macro del botón como si se hubiera pulsado. Para «Probar». */
    @PluginMethod
    public void runHeadsetMacroNow(final PluginCall call) {
        new Thread(new Runnable() {
            public void run() {
                try {
                    call.resolve(aJS(MacroBackground.ejecutarBoton(getContext())));
                } catch (Throwable t) {
                    call.reject("No se pudo ejecutar: " + t.getMessage());
                }
            }
        }).start();
    }

    /**
     * JSObject.fromJSONObject declara JSONException, y un método de plugin no
     * puede propagarla. Aquí se traduce a un objeto vacío: el JSON lo construye
     * esta misma clase, así que si algún día fallara sería un error nuestro, no
     * un dato del usuario.
     */
    private JSObject aJS(JSONObject o) {
        try {
            return JSObject.fromJSONObject(o);
        } catch (JSONException e) {
            return new JSObject();
        }
    }

    private JSObject estadoDeMacros() {
        JSObject result = new JSObject();
        result.put("ids", MacroBackground.idsDeSegundoPlano(getContext()));
        result.put("stats", MacroBackground.estadisticas(getContext()));
        result.put("excluidas", MacroBackground.exclusiones(getContext()));
        result.put("boton", aJS(MacroBackground.estadoBoton(getContext())));
        return result;
    }

    /** Restaura los valores por defecto de los ajustes de desarrollo. */
    @PluginMethod
    public void resetDuplicateDevConfig(PluginCall call) {
        DuplicateSkipEngine.resetDevConfig(getContext());
        resolveDiagnostics(call);
    }

    /** Vacía el registro de decisiones (no toca el historial de escuchas). */
    @PluginMethod
    public void clearDuplicateLog(PluginCall call) {
        DuplicateSkipEngine.get().clearTelemetry();
        resolveDiagnostics(call);
    }

    /** Borra TODO el historial de duplicadas. Acción destructiva e irreversible. */
    @PluginMethod
    public void resetDuplicateHistory(PluginCall call) {
        DuplicateSkipEngine.get().resetHistory();
        resolveDiagnostics(call);
    }

    /**
     * Siembra el historial de duplicadas con las escuchas de un respaldo.
     *
     * El motor decide contra su propia base de datos, no contra el almacén de
     * JavaScript, así que sin este puente una canción restaurada desde un
     * respaldo salía en las estadísticas pero nunca se saltaba.
     *
     * Se recibe por lotes: un respaldo largo son miles de escuchas y mandarlas
     * de una vez por el puente de Capacitor se come la memoria.
     */
    @PluginMethod
    public void importDuplicateHistory(PluginCall call) {
        JSArray raw = call.getArray("plays");
        if (raw == null) {
            call.reject("Falta la lista de escuchas");
            return;
        }

        List<DuplicateSkipEngine.ImportedPlay> plays = new ArrayList<>();
        try {
            List<Object> items = raw.toList();
            for (Object item : items) {
                if (!(item instanceof JSONObject)) continue;
                JSONObject o = (JSONObject) item;
                String track = o.optString("track", "");
                String artist = o.optString("artist", "");
                if (track.isEmpty() || artist.isEmpty()) continue;
                plays.add(new DuplicateSkipEngine.ImportedPlay(
                        track,
                        artist,
                        o.optLong("playedAt", 0L),
                        o.optLong("durationMs", 0L)
                ));
            }
        } catch (Exception e) {
            // `toList()` declara JSONException; `reject` sólo admite Exception.
            call.reject("No se pudo leer la lista de escuchas: " + e.getMessage(), e);
            return;
        }

        int imported = DuplicateSkipEngine.get().importPlays(plays);

        JSObject result = new JSObject();
        result.put("received", plays.size());
        result.put("imported", imported);
        call.resolve(result);
    }

    // ── Registro de reproducciones (exportable desde Ajustes) ─────────────────

    /**
     * Una página del registro: una fila por canción reproducida con su
     * decisión, el motivo y los criterios y el calibrado vigentes entonces.
     * Se pide por páginas para no mandar decenas de miles de filas de golpe.
     */
    @PluginMethod
    public void getPlayLog(PluginCall call) {
        int offset = call.getInt("offset", 0);
        int limit = call.getInt("limit", 500);
        JSObject result = new JSObject();
        try {
            result.put("total", PlayLogStore.count(getContext()));
            result.put("rows", new JSArray(PlayLogStore.page(getContext(), offset, Math.min(limit, 2000)).toString()));
            result.put("history", JSObject.fromJSONObject(DuplicateSkipEngine.get().historyInfo()));
            call.resolve(result);
        } catch (Throwable t) {
            call.reject("No se pudo leer el registro: " + t.getMessage());
        }
    }

    /** Vacía el registro de reproducciones (no toca el historial de duplicadas). */
    @PluginMethod
    public void clearPlayLog(PluginCall call) {
        PlayLogStore.clear(getContext());
        call.resolve();
    }

    private void resolveDiagnostics(PluginCall call) {
        try {
            call.resolve(JSObject.fromJSONObject(DuplicateSkipEngine.get().diagnostics()));
        } catch (Throwable t) {
            call.resolve();
        }
    }

    // ── Puente OAuth de Spotify (pestaña «Macros») ────────────────────────────

    /**
     * Abre la pantalla de autorización de Spotify en el navegador del sistema.
     *
     * No se usa la WebView de la app a propósito: Spotify bloquea el login desde
     * WebViews embebidas, y además el flujo PKCE sólo es seguro si las
     * credenciales se teclean en un navegador de verdad.
     */
    @PluginMethod
    public void openExternalUrl(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || url.trim().isEmpty()) {
            call.reject("URL vacía");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url.trim()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve(new JSObject().put("opened", true));
        } catch (Throwable t) {
            call.resolve(new JSObject().put("opened", false));
        }
    }

    /**
     * Devuelve (y consume) la URL de redirección OAuth pendiente. La app vuelve
     * del navegador por deep link y el `code` llega en el intent de la Activity.
     */
    @PluginMethod
    public void consumeAuthRedirect(PluginCall call) {
        JSObject result = new JSObject();
        result.put("url", consumePendingAuthRedirectValue());
        call.resolve(result);
    }

    private void captureAuthRedirectFromIntent() {
        try {
            Intent intent = getActivity() != null ? getActivity().getIntent() : null;
            if (intent == null) return;

            Uri data = intent.getData();
            if (data == null) return;
            if (!AUTH_REDIRECT_SCHEME.equalsIgnoreCase(data.getScheme())) return;

            sPendingAuthRedirect = data.toString();
            // Sin limpiarlo, cada onResume reprocesaría el mismo `code`, que
            // Spotify sólo acepta una vez: el segundo canje fallaría y la
            // sesión parecería rota.
            intent.setData(null);
        } catch (Throwable ignored) {
        }
    }

    private String consumePendingAuthRedirectValue() {
        String url = sPendingAuthRedirect == null ? "" : sPendingAuthRedirect.trim();
        sPendingAuthRedirect = "";
        return url;
    }

    private void emitAuthRedirect(String url) {
        JSObject payload = new JSObject();
        payload.put("url", url == null ? "" : url);
        notifyListeners("spotifyAuthRedirect", payload, true);
    }

    @PluginMethod
    public void consumePendingOpenRoute(PluginCall call) {
        JSObject result = new JSObject();
        result.put("route", consumePendingOpenRouteValue());
        call.resolve(result);
    }

    @PluginMethod
    public void getFeatureConfig(PluginCall call) {
        call.resolve(buildFeatureConfig());
    }

    @PluginMethod
    public void setFeatureConfig(PluginCall call) {
        String listeningMode = call.getString("listeningMode", "custom");
        boolean skipDuplicates = call.getBoolean("skipDuplicates", true);
        String skipDuplicatesInterval = call.getString("skipDuplicatesInterval", "1w");
        boolean silenceAds = call.getBoolean("silenceAds", false);
        List<String> silenceAdsKeywords = parseKeywords(call.getArray("silenceAdsKeywords"));
        boolean customSkipDuplicates = call.getBoolean("customSkipDuplicates", skipDuplicates);
        String customSkipDuplicatesInterval = call.getString("customSkipDuplicatesInterval", skipDuplicatesInterval);

        SpotifyNotificationListener.syncFeatureConfig(
            getContext(),
            listeningMode,
            skipDuplicates,
            skipDuplicatesInterval,
            silenceAds,
            silenceAdsKeywords,
            customSkipDuplicates,
            customSkipDuplicatesInterval
        );

        emitFeatureConfigChanged();
        call.resolve(buildFeatureConfig());
    }

    /**
     * Persists skip-duplicates settings so native background listener can
     * evaluate duplicates even when JS/WebView is not active.
     */
    @PluginMethod
    public void setSkipConfig(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", true);
        String interval = call.getString("interval", "1w");
        SpotifyNotificationListener.configureSkipDuplicates(getContext(), enabled, interval);
        emitFeatureConfigChanged();
        call.resolve();
    }

    /**
     * Persists "silence ads" setting so native listener can mute/unmute
     * media volume when Spotify notifications indicate ads.
     */
    @PluginMethod
    public void setAdsMuteConfig(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        SpotifyNotificationListener.configureSilenceAds(getContext(), enabled);
        emitFeatureConfigChanged();
        call.resolve();
    }

    @PluginMethod
    public void setAdsMuteKeywords(PluginCall call) {
        List<String> keywords = parseKeywords(call.getArray("keywords"));
        SpotifyNotificationListener.configureSilenceAdsKeywords(getContext(), keywords);
        emitFeatureConfigChanged();
        call.resolve();
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    private JSObject buildFeatureConfig() {
        JSObject result = new JSObject();
        result.put("listeningMode", SpotifyNotificationListener.getListeningMode(getContext()));
        result.put("skipDuplicates", SpotifyNotificationListener.isSkipDuplicatesEnabled(getContext()));
        result.put("skipDuplicatesInterval", SpotifyNotificationListener.getSkipDuplicatesInterval(getContext()));
        result.put("customSkipDuplicates", SpotifyNotificationListener.getCustomSkipDuplicates(getContext()));
        result.put("customSkipDuplicatesInterval", SpotifyNotificationListener.getCustomSkipDuplicatesInterval(getContext()));
        result.put("silenceAds", SpotifyNotificationListener.isSilenceAdsEnabled(getContext()));
        result.put("silenceAdsKeywords", toJSArray(SpotifyNotificationListener.getSilenceAdsKeywords(getContext())));
        return result;
    }

    private List<String> parseKeywords(JSArray arr) {
        List<String> out = new ArrayList<>();
        if (arr == null) return out;
        try {
            for (int i = 0; i < arr.length(); i++) {
                String raw = arr.optString(i, "");
                if (raw == null) continue;
                String trimmed = raw.trim();
                if (!trimmed.isEmpty() && !out.contains(trimmed)) {
                    out.add(trimmed);
                }
            }
        } catch (Throwable ignored) {
        }
        return out;
    }

    private JSArray toJSArray(List<String> list) {
        JSArray out = new JSArray();
        if (list == null) return out;
        for (String item : list) {
            if (item != null) {
                out.put(item);
            }
        }
        return out;
    }

    // ── Temporizador de escucha ───────────────────────────────────────────────

    /** Estado del temporizador: { phase, endAt, sound, ... }. */
    @PluginMethod
    public void getSleepTimer(PluginCall call) {
        call.resolve(toJSObject(SleepTimer.state(getContext())));
    }

    @PluginMethod
    public void startSleepTimer(PluginCall call) {
        long durationMs = longArg(call, "durationMs");
        if (durationMs < 60_000L) {
            call.reject("La duración mínima es un minuto.");
            return;
        }
        SleepTimer.start(
                getContext(),
                durationMs,
                call.getBoolean("sound", false)
        );
        call.resolve(toJSObject(SleepTimer.state(getContext())));
    }

    @PluginMethod
    public void extendSleepTimer(PluginCall call) {
        SleepTimer.extend(getContext(), longArg(call, "deltaMs"));
        call.resolve(toJSObject(SleepTimer.state(getContext())));
    }

    @PluginMethod
    public void setSleepTimerOptions(PluginCall call) {
        SleepTimer.setOptions(getContext(), call.getBoolean("sound", false));
        call.resolve(toJSObject(SleepTimer.state(getContext())));
    }

    @PluginMethod
    public void cancelSleepTimer(PluginCall call) {
        SleepTimer.cancel(getContext());
        call.resolve(toJSObject(SleepTimer.state(getContext())));
    }

    /** Hace sonar el aviso de fin, para que el usuario sepa qué va a oír. */
    @PluginMethod
    public void testSleepTimerSound(PluginCall call) {
        final android.content.Context app = getContext().getApplicationContext();
        new Thread(() -> SleepTimer.playChime(app), "skippify-chime").start();
        call.resolve();
    }

    static void notifySleepTimerChanged(JSONObject state) {
        NotifListenerPlugin instance = sInstance;
        if (instance == null) return;
        try {
            instance.notifyListeners("sleepTimerChanged", toJSObject(state), true);
        } catch (Throwable ignored) {
        }
    }

    /**
     * `PluginCall.getLong()` sólo acepta valores que ya sean Long, y un número
     * de JS que cabe en un int llega como Integer: se leería el valor por
     * defecto. Por eso se lee a mano.
     */
    private static long longArg(PluginCall call, String name) {
        try {
            return call.getData().optLong(name, 0L);
        } catch (Throwable ignored) {
            return 0L;
        }
    }

    private static JSObject toJSObject(JSONObject json) {
        try {
            return JSObject.fromJSONObject(json);
        } catch (JSONException e) {
            return new JSObject();
        }
    }

    private void emitFeatureConfigChanged() {
        notifyListeners("featureConfigChanged", buildFeatureConfig(), true);
    }

    private void emitOpenRoute(String route) {
        JSObject payload = new JSObject();
        payload.put("route", route == null ? "" : route);
        notifyListeners("openRoute", payload, true);
    }

    private void captureOpenRouteFromIntent() {
        try {
            Intent intent = getActivity() != null ? getActivity().getIntent() : null;
            if (intent == null) return;

            String route = intent.getStringExtra(SkippifyForegroundService.EXTRA_OPEN_ROUTE);
            if (route == null || route.trim().isEmpty()) return;

            sPendingOpenRoute = route.trim();
            intent.removeExtra(SkippifyForegroundService.EXTRA_OPEN_ROUTE);
        } catch (Throwable ignored) {
        }
    }

    private String consumePendingOpenRouteValue() {
        String route = sPendingOpenRoute == null ? "" : sPendingOpenRoute.trim();
        sPendingOpenRoute = "";
        return route;
    }

    private boolean isNotificationListenerEnabled() {
        String flat = Settings.Secure.getString(
                getContext().getContentResolver(), "enabled_notification_listeners");
        return !TextUtils.isEmpty(flat) && flat.contains(getContext().getPackageName());
    }

    /** @return "detail" | "list" | "app-details" | "none" */
    private String openNotificationListenerSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                Intent detail = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS);
                detail.putExtra(
                        Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                        new ComponentName(getContext(), SpotifyNotificationListener.class).flattenToString());
                detail.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                // Algunas capas declaran la acción pero no la resuelven: se
                // comprueba antes para no acabar en una pantalla vacía.
                if (detail.resolveActivity(getContext().getPackageManager()) != null) {
                    getContext().startActivity(detail);
                    return "detail";
                }
            } catch (Throwable ignored) {
            }
        }
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            return "list";
        } catch (Throwable ignored) {
        }
        return openAppDetailsScreen() ? "app-details" : "none";
    }

    private boolean openAppDetailsScreen() {
        try {
            Intent app = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            app.setData(Uri.parse("package:" + getContext().getPackageName()));
            app.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(app);
            return true;
        } catch (Throwable ignored) {
            return false;
        }
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    /** Lee una propiedad del sistema (lo que da `getprop`) sin permisos. */
    private static String sysProp(String key) {
        try {
            Class<?> sp = Class.forName("android.os.SystemProperties");
            Object v = sp.getMethod("get", String.class).invoke(null, key);
            return v == null ? "" : v.toString().trim();
        } catch (Throwable ignored) {
            return "";
        }
    }

    /** { capa, versión } según las propiedades que publica cada fabricante. */
    private static String[] detectRom() {
        String v;
        if (!(v = sysProp("ro.mi.os.version.name")).isEmpty()) return new String[] { "hyperos", v };
        if (!(v = sysProp("ro.miui.ui.version.name")).isEmpty()) return new String[] { "miui", v };
        if (!(v = sysProp("ro.build.version.oneui")).isEmpty()) return new String[] { "oneui", v };
        if (!(v = sysProp("ro.build.version.magic")).isEmpty()) return new String[] { "magicos", v };
        if (!(v = sysProp("ro.build.version.emui")).isEmpty()) return new String[] { "emui", v };
        if (!(v = sysProp("ro.build.version.realmeui")).isEmpty()) return new String[] { "realmeui", v };
        if (!(v = sysProp("ro.build.version.opporom")).isEmpty()) return new String[] { "coloros", v };
        if (!(v = sysProp("ro.oxygen.version")).isEmpty()) return new String[] { "oxygenos", v };
        if (!(v = sysProp("ro.vivo.os.version")).isEmpty()) {
            String name = sysProp("ro.vivo.os.name").toLowerCase(Locale.ROOT);
            return new String[] { name.contains("origin") ? "originos" : "funtouch", v };
        }
        if ("samsung".equalsIgnoreCase(Build.MANUFACTURER)) return new String[] { "oneui", "" };
        return new String[] { "", "" };
    }

    private String installerPackage() {
        try {
            PackageManager pm = getContext().getPackageManager();
            String pkg = getContext().getPackageName();
            String inst;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                InstallSourceInfo info = pm.getInstallSourceInfo(pkg);
                inst = info.getInstallingPackageName();
            } else {
                inst = pm.getInstallerPackageName(pkg);
            }
            return inst == null ? "" : inst;
        } catch (Throwable ignored) {
            return "";
        }
    }

    /** "local-file" | "downloaded-file" | "store" | "other" | "unspecified" | "" */
    private String packageSource() {
        if (Build.VERSION.SDK_INT < 33) return "";
        try {
            int src = getContext().getPackageManager()
                    .getInstallSourceInfo(getContext().getPackageName()).getPackageSource();
            switch (src) {
                case PackageInstallerSource.LOCAL_FILE: return "local-file";
                case PackageInstallerSource.DOWNLOADED_FILE: return "downloaded-file";
                case PackageInstallerSource.STORE: return "store";
                case PackageInstallerSource.OTHER: return "other";
                default: return "unspecified";
            }
        } catch (Throwable ignored) {
            return "";
        }
    }

    /** Valores de `PackageInstaller.PACKAGE_SOURCE_*` (API 33). */
    private static final class PackageInstallerSource {
        static final int OTHER = 1;
        static final int STORE = 2;
        static final int DOWNLOADED_FILE = 3;
        static final int LOCAL_FILE = 4;
    }

    /** "restricted" | "allowed" | "unknown" | "n/a" (antes de Android 13). */
    private String restrictedSettingsState() {
        if (Build.VERSION.SDK_INT < 33) return "n/a";
        try {
            AppOpsManager aom = (AppOpsManager) getContext().getSystemService(android.content.Context.APP_OPS_SERVICE);
            if (aom == null) return "unknown";
            // OPSTR_ACCESS_RESTRICTED_SETTINGS es @hide, pero el AppOp existe
            // desde Android 13 y la propia app puede consultar el suyo.
            int mode = aom.unsafeCheckOpNoThrow(
                    "android:access_restricted_settings",
                    getContext().getApplicationInfo().uid,
                    getContext().getPackageName());
            if (mode == AppOpsManager.MODE_ERRORED || mode == AppOpsManager.MODE_IGNORED) return "restricted";
            return "allowed";
        } catch (Throwable ignored) {
            return "unknown";
        }
    }

    private boolean isPostNotificationsGranted() {
        if (Build.VERSION.SDK_INT < 33) return true; // Not needed below Android 13
        return ContextCompat.checkSelfPermission(
                getContext(), Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean isBatteryOptimizationIgnored() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        try {
            PowerManager pm = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        } catch (Throwable ignored) {
            return false;
        }
    }

    private void requestPostNotificationsIfNeeded() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (isPostNotificationsGranted()) return;
        try {
            ActivityCompat.requestPermissions(
                    getActivity(),
                    new String[] { Manifest.permission.POST_NOTIFICATIONS },
                    9001
            );
        } catch (Throwable ignored) {
        }
    }
}
