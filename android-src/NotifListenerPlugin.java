package com.skippify.app;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Intent;
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
        JSObject data = new JSObject();
        data.put("enabled", enabled);
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

    /** Opens the system Notification Access settings screen. */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        openNotificationListenerSettings();
        call.resolve();
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

    /** Estado del temporizador: { phase, endAt, sound, bluetoothOff, ... }. */
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
                call.getBoolean("sound", false),
                call.getBoolean("bluetoothOff", false)
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
        SleepTimer.setOptions(
                getContext(),
                call.getBoolean("sound", false),
                call.getBoolean("bluetoothOff", false)
        );
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

    /** Qué deja hacer el sistema con el Bluetooth y qué hay conectado. */
    @PluginMethod
    public void getBluetoothInfo(PluginCall call) {
        call.resolve(toJSObject(SleepTimer.bluetoothInfo(getContext())));
    }

    /** Android 12 pide «Dispositivos cercanos» para poder apagar el Bluetooth. */
    @PluginMethod
    public void requestBluetoothPermission(PluginCall call) {
        if (SleepTimer.needsConnectPermission(getContext())) {
            try {
                ActivityCompat.requestPermissions(
                        getActivity(),
                        new String[] { Manifest.permission.BLUETOOTH_CONNECT },
                        9002
                );
            } catch (Throwable ignored) {
            }
        }
        call.resolve(toJSObject(SleepTimer.bluetoothInfo(getContext())));
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

    private void openNotificationListenerSettings() {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
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
