package com.skippify.app;

import android.app.Notification;
import android.content.ComponentName;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.os.SystemClock;
import android.util.Log;

import org.json.JSONObject;
import org.json.JSONArray;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

import androidx.annotation.Nullable;

/**
 * Escucha las notificaciones de Spotify (com.spotify.music) y reenvía los
 * metadatos a la capa JS.
 *
 * Responsabilidades de esta clase: extraer metadatos, mantener el
 * MediaController, silenciar anuncios, persistir el log crudo de eventos y
 * emitir a JS.
 *
 * La decisión de saltar canciones duplicadas NO vive aquí: la lleva por
 * completo {@link DuplicateSkipEngine}, al que esta clase alimenta con
 * observaciones y al que expone el transporte del MediaSession.
 */
public class SpotifyNotificationListener extends NotificationListenerService
        implements DuplicateSkipEngine.Transport {

    private static final String PREFS_NAME = "skippify-native-features";
    private static final String PREF_SKIP_DUPLICATES = "skipDuplicates";
    private static final String PREF_SKIP_INTERVAL = "skipDuplicatesInterval";
    private static final String PREF_SILENCE_ADS = "silenceAds";
    private static final String PREF_SKIP_ADS_LEGACY = "skipAds";
    private static final String PREF_SILENCE_ADS_KEYWORDS = "silenceAdsKeywords";
    private static final String PREF_LISTENING_MODE = "listeningMode";
    private static final String PREF_CUSTOM_SKIP_DUPLICATES = "customSkipDuplicates";
    private static final String PREF_CUSTOM_SKIP_INTERVAL = "customSkipDuplicatesInterval";
    private static final String PREF_ADS_MUTED = "adsMuted";
    private static final String PREF_ADS_PRE_VOLUME = "adsPreVolume";

    private static final String MODE_DISCOVERY = "discovery";
    private static final String MODE_CASUAL = "casual";
    private static final String MODE_CUSTOM = "custom";
    private static final List<String> DEFAULT_AD_KEYWORDS =
            Arrays.asList("publicidad", "anuncio", "anuncios");

    private static final String TAG = "SkippifyListener";
    private static final String SPOTIFY_PKG = "com.spotify.music";

    static final String EVENT_LOG_FILE = "skippify-spotify-events.ndjson";
    private static final long EVENT_LOG_MAX_BYTES = 2L * 1024L * 1024L;
    static final Object sEventFileLock = new Object();

    /**
     * Árbitro de silenciado. Antes había un único flag booleano compartido: si
     * el silenciador de anuncios y el motor de duplicadas coincidían, el que
     * terminaba primero devolvía el volumen mientras el otro seguía creyendo
     * tener el mando (o peor: el segundo guardaba 0 como "volumen previo").
     * Ahora el volumen se guarda al pasar de cero a un motivo y sólo se
     * restaura cuando no queda ninguno.
     */
    private static final Set<String> sMuteReasons = new HashSet<>();
    private static final Object sMuteLock = new Object();
    private static volatile int sPreMuteVolume = -1;

    static final String MUTE_REASON_ADS = "ads";
    static final String MUTE_REASON_DUPLICATE = "dup";

    public interface TrackListener {
        void onTrack(String track, String artist, @Nullable String album, long durationMs, boolean isPlaying);
    }

    private static volatile TrackListener sListener;
    static volatile SpotifyNotificationListener sServiceInstance;

    private static volatile Snapshot sLastSnapshot;
    private static volatile String sLastEmittedKey;
    private static volatile long sLastEmittedUptimeMs;

    // volatile: se leen/escriben desde hilos binder (onNotificationPosted) y
    // desde el hilo principal (callbacks del MediaController y sondas del motor).
    private volatile MediaSession.Token mLastToken;
    private volatile MediaController mController;

    private final MediaController.Callback mControllerCallback = new MediaController.Callback() {
        @Override
        public void onPlaybackStateChanged(PlaybackState state) {
            emitFromController();
        }

        @Override
        public void onMetadataChanged(MediaMetadata metadata) {
            emitFromController();
        }
    };

    private static final class Snapshot {
        final String track;
        final String artist;
        final String album;
        final long durationMs;
        final boolean isPlaying;
        final long capturedAtUptimeMs;
        final long capturedAtEpochMs;

        Snapshot(String track, String artist, @Nullable String album, long durationMs,
                 boolean isPlaying, long capturedAtUptimeMs, long capturedAtEpochMs) {
            this.track = track;
            this.artist = artist;
            this.album = album;
            this.durationMs = durationMs;
            this.isPlaying = isPlaying;
            this.capturedAtUptimeMs = capturedAtUptimeMs;
            this.capturedAtEpochMs = capturedAtEpochMs;
        }

        String key() {
            return (track + "|" + artist + "|" + (album == null ? "" : album)
                    + "|" + durationMs + "|" + (isPlaying ? "1" : "0")).trim();
        }
    }

    // ── Transporte para DuplicateSkipEngine ───────────────────────────────────
    // El motor SIEMPRE lee de aquí, nunca de la notificación: es la única fuente
    // que refleja lo que suena en este instante.

    @Override
    public String liveTrack() {
        try {
            MediaController c = mController;
            if (c == null) return "";
            MediaMetadata md = c.getMetadata();
            return md == null ? "" : safeTrim(md.getString(MediaMetadata.METADATA_KEY_TITLE));
        } catch (Throwable ignored) {
            return "";
        }
    }

    @Override
    public String liveArtist() {
        try {
            MediaController c = mController;
            if (c == null) return "";
            MediaMetadata md = c.getMetadata();
            if (md == null) return "";
            String artist = md.getString(MediaMetadata.METADATA_KEY_ARTIST);
            if (isNullOrEmpty(artist)) artist = md.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST);
            return safeTrim(artist);
        } catch (Throwable ignored) {
            return "";
        }
    }

    @Override
    public long liveDurationMs() {
        try {
            MediaController c = mController;
            if (c == null) return 0L;
            MediaMetadata md = c.getMetadata();
            return md == null ? 0L : md.getLong(MediaMetadata.METADATA_KEY_DURATION);
        } catch (Throwable ignored) {
            return 0L;
        }
    }

    /**
     * Posición extrapolada. {@code getPosition()} devuelve la del ÚLTIMO update,
     * no la actual: sin extrapolar, una canción muy avanzada parece recién
     * empezada y se colaba por la ventana de decisión.
     */
    @Override
    public long positionMs() {
        try {
            MediaController c = mController;
            if (c == null) return -1L;
            PlaybackState state = c.getPlaybackState();
            if (state == null) return -1L;

            long pos = state.getPosition();
            if (pos < 0L) return -1L;

            long updatedAtMs = state.getLastPositionUpdateTime();
            if (state.getState() == PlaybackState.STATE_PLAYING && updatedAtMs > 0L) {
                float speed = state.getPlaybackSpeed();
                if (speed <= 0f) speed = 1f;
                long elapsedMs = SystemClock.elapsedRealtime() - updatedAtMs;
                if (elapsedMs > 0L) pos += (long) (elapsedMs * speed);
            }
            return pos;
        } catch (Throwable ignored) {
            return -1L;
        }
    }

    @Override
    public boolean isPlaying() {
        try {
            MediaController c = mController;
            if (c == null) return false;
            PlaybackState state = c.getPlaybackState();
            return state != null && state.getState() == PlaybackState.STATE_PLAYING;
        } catch (Throwable ignored) {
            return false;
        }
    }

    @Override
    public void skipToNext() {
        try {
            MediaController c = mController;
            if (c != null) c.getTransportControls().skipToNext();
        } catch (Throwable ignored) {
        }
    }

    @Override
    public void pause() {
        try {
            MediaController c = mController;
            if (c != null) c.getTransportControls().pause();
        } catch (Throwable ignored) {
        }
    }

    @Override
    public void play() {
        try {
            MediaController c = mController;
            if (c != null) c.getTransportControls().play();
        } catch (Throwable ignored) {
        }
    }

    /**
     * Silenciado del motor de duplicadas. Va por el árbitro compartido para no
     * pisarse con el silenciador de anuncios.
     */
    @Override
    public void setDuplicateMute(boolean muted) {
        if (muted) {
            acquireMute(getApplicationContext(), MUTE_REASON_DUPLICATE);
        } else {
            releaseMute(getApplicationContext(), MUTE_REASON_DUPLICATE);
        }
    }

    /**
     * Rebobina la pista. Se usa para devolver el fragmento que se silenció
     * mientras se decidía si la canción era duplicada.
     */
    @Override
    public void seekTo(long positionMs) {
        try {
            MediaController c = mController;
            if (c != null) c.getTransportControls().seekTo(Math.max(0L, positionMs));
        } catch (Throwable ignored) {
        }
    }

    /** Salto manual solicitado desde JS. Sin verificación: lo pide el usuario. */
    static void skipCurrentTrack() {
        SpotifyNotificationListener svc = sServiceInstance;
        if (svc != null) svc.skipToNext();
    }

    // ── Fechas ────────────────────────────────────────────────────────────────

    private static final Object sIsoLock = new Object();
    private static final SimpleDateFormat sIso8601 = buildIso8601();

    private static SimpleDateFormat buildIso8601() {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        return sdf;
    }

    static String toIso8601(long epochMs) {
        synchronized (sIsoLock) {
            return sIso8601.format(new Date(epochMs));
        }
    }

    /** Devuelve el epoch en ms, o 0 si la cadena no es una fecha ISO válida. */
    static long fromIso8601Ms(@Nullable String iso) {
        if (iso == null || iso.trim().isEmpty()) return 0L;
        synchronized (sIsoLock) {
            try {
                Date d = sIso8601.parse(iso.trim());
                return d == null ? 0L : d.getTime();
            } catch (Throwable ignored) {
                return 0L;
            }
        }
    }

    // ── Configuración de funciones ────────────────────────────────────────────

    static void configureSkipDuplicates(android.content.Context context, boolean enabled, @Nullable String interval) {
        if (context == null) return;
        try {
            android.content.SharedPreferences sp = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            String sanitizedInterval = sanitizeInterval(interval);
            android.content.SharedPreferences.Editor editor = sp.edit()
                    .putBoolean(PREF_SKIP_DUPLICATES, enabled)
                    .putString(PREF_SKIP_INTERVAL, sanitizedInterval);

            if (MODE_CUSTOM.equals(getListeningMode(context))) {
                editor.putBoolean(PREF_CUSTOM_SKIP_DUPLICATES, enabled);
                editor.putString(PREF_CUSTOM_SKIP_INTERVAL, sanitizedInterval);
            }

            editor.apply();
        } catch (Throwable ignored) {
        }

        // force = true: hay que refrescar la notificación persistente para que
        // muestre el modo activo recién guardado.
        SkippifyForegroundService.start(context, true);
    }

    static void configureSilenceAds(android.content.Context context, boolean enabled) {
        if (context == null) return;
        try {
            context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                    .edit().putBoolean(PREF_SILENCE_ADS, enabled).apply();
        } catch (Throwable ignored) {
        }

        if (!enabled) restoreMediaVolumeIfNeeded(context);
        SkippifyForegroundService.start(context, true);
    }

    static void configureSilenceAdsKeywords(android.content.Context context, @Nullable List<String> keywords) {
        if (context == null) return;
        try {
            context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                    .edit().putString(PREF_SILENCE_ADS_KEYWORDS, serializeKeywords(keywords)).apply();
        } catch (Throwable ignored) {
        }
        SkippifyForegroundService.start(context, true);
    }

    static void configureListeningMode(android.content.Context context, @Nullable String modeRaw) {
        if (context == null) return;

        String mode = sanitizeListeningMode(modeRaw);

        try {
            android.content.SharedPreferences sp = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            String currentMode = sanitizeListeningMode(sp.getString(PREF_LISTENING_MODE, MODE_CUSTOM));

            boolean customSkipDuplicates = sp.getBoolean(
                    PREF_CUSTOM_SKIP_DUPLICATES,
                    sp.getBoolean(PREF_SKIP_DUPLICATES, true)
            );
            String customSkipInterval = sanitizeInterval(
                    sp.getString(PREF_CUSTOM_SKIP_INTERVAL, sp.getString(PREF_SKIP_INTERVAL, "1w"))
            );

            if (MODE_CUSTOM.equals(currentMode)) {
                customSkipDuplicates = sp.getBoolean(PREF_SKIP_DUPLICATES, true);
                customSkipInterval = sanitizeInterval(sp.getString(PREF_SKIP_INTERVAL, "1w"));
            }

            boolean silenceAds = sp.getBoolean(PREF_SILENCE_ADS, sp.getBoolean(PREF_SKIP_ADS_LEGACY, false));

            syncFeatureConfig(
                    context,
                    mode,
                    sp.getBoolean(PREF_SKIP_DUPLICATES, true),
                    sp.getString(PREF_SKIP_INTERVAL, "1w"),
                    silenceAds,
                    getSilenceAdsKeywords(context),
                    customSkipDuplicates,
                    customSkipInterval
            );
        } catch (Throwable ignored) {
        }
    }

    static void syncFeatureConfig(
            android.content.Context context,
            @Nullable String modeRaw,
            boolean skipDuplicates,
            @Nullable String skipIntervalRaw,
            boolean silenceAds,
            @Nullable List<String> silenceAdsKeywords,
            boolean customSkipDuplicates,
            @Nullable String customSkipIntervalRaw
    ) {
        if (context == null) return;

        String mode = sanitizeListeningMode(modeRaw);
        String skipInterval = sanitizeInterval(skipIntervalRaw);
        String customSkipInterval = sanitizeInterval(customSkipIntervalRaw);

        try {
            android.content.SharedPreferences sp = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            android.content.SharedPreferences.Editor editor = sp.edit()
                    .putString(PREF_LISTENING_MODE, mode)
                    .putBoolean(PREF_SILENCE_ADS, silenceAds)
                    .putString(PREF_SILENCE_ADS_KEYWORDS, serializeKeywords(silenceAdsKeywords))
                    .putBoolean(PREF_CUSTOM_SKIP_DUPLICATES, customSkipDuplicates)
                    .putString(PREF_CUSTOM_SKIP_INTERVAL, customSkipInterval);

            if (MODE_DISCOVERY.equals(mode)) {
                editor.putBoolean(PREF_SKIP_DUPLICATES, true);
                editor.putString(PREF_SKIP_INTERVAL, "1y");
            } else if (MODE_CASUAL.equals(mode)) {
                editor.putBoolean(PREF_SKIP_DUPLICATES, false);
                editor.putString(PREF_SKIP_INTERVAL, skipInterval);
            } else {
                editor.putBoolean(PREF_SKIP_DUPLICATES, customSkipDuplicates);
                editor.putString(PREF_SKIP_INTERVAL, customSkipInterval);
            }

            editor.apply();
        } catch (Throwable ignored) {
        }

        if (!silenceAds) restoreMediaVolumeIfNeeded(context);
        WidgetsSkippify.actualizarModo(context);
        SkippifyForegroundService.start(context, true);
    }

    static String getListeningMode(@Nullable android.content.Context context) {
        if (context == null) return MODE_CUSTOM;
        try {
            return sanitizeListeningMode(context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                    .getString(PREF_LISTENING_MODE, MODE_CUSTOM));
        } catch (Throwable ignored) {
            return MODE_CUSTOM;
        }
    }

    static boolean isSkipDuplicatesEnabled(@Nullable android.content.Context context) {
        if (context == null) return true;
        try {
            return context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                    .getBoolean(PREF_SKIP_DUPLICATES, true);
        } catch (Throwable ignored) {
            return true;
        }
    }

    static String getSkipDuplicatesInterval(@Nullable android.content.Context context) {
        if (context == null) return "1w";
        try {
            return sanitizeInterval(context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                    .getString(PREF_SKIP_INTERVAL, "1w"));
        } catch (Throwable ignored) {
            return "1w";
        }
    }

    static boolean getCustomSkipDuplicates(@Nullable android.content.Context context) {
        if (context == null) return true;
        try {
            android.content.SharedPreferences sp = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            return sp.getBoolean(PREF_CUSTOM_SKIP_DUPLICATES, sp.getBoolean(PREF_SKIP_DUPLICATES, true));
        } catch (Throwable ignored) {
            return true;
        }
    }

    static String getCustomSkipDuplicatesInterval(@Nullable android.content.Context context) {
        if (context == null) return "1w";
        try {
            android.content.SharedPreferences sp = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            return sanitizeInterval(sp.getString(PREF_CUSTOM_SKIP_INTERVAL, sp.getString(PREF_SKIP_INTERVAL, "1w")));
        } catch (Throwable ignored) {
            return "1w";
        }
    }

    static boolean isSilenceAdsEnabled(@Nullable android.content.Context context) {
        if (context == null) return false;
        try {
            android.content.SharedPreferences sp = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            if (sp.contains(PREF_SILENCE_ADS)) return sp.getBoolean(PREF_SILENCE_ADS, false);
            return sp.getBoolean(PREF_SKIP_ADS_LEGACY, false);
        } catch (Throwable ignored) {
            return false;
        }
    }

    static List<String> getSilenceAdsKeywords(@Nullable android.content.Context context) {
        if (context == null) return new ArrayList<>(DEFAULT_AD_KEYWORDS);
        try {
            return deserializeKeywords(context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                    .getString(PREF_SILENCE_ADS_KEYWORDS, ""));
        } catch (Throwable ignored) {
            return new ArrayList<>(DEFAULT_AD_KEYWORDS);
        }
    }

    private boolean isSilenceAdsEnabled() {
        return isSilenceAdsEnabled(getApplicationContext());
    }

    private static String sanitizeListeningMode(@Nullable String modeRaw) {
        String mode = safeTrim(modeRaw).toLowerCase(Locale.ROOT);
        if (MODE_DISCOVERY.equals(mode) || MODE_CASUAL.equals(mode) || MODE_CUSTOM.equals(mode)) {
            return mode;
        }
        return MODE_CUSTOM;
    }

    private static String sanitizeInterval(@Nullable String intervalRaw) {
        String interval = safeTrim(intervalRaw).toLowerCase(Locale.ROOT);
        return interval.isEmpty() ? "1w" : interval;
    }

    // ── Silenciado de anuncios ────────────────────────────────────────────────

    private static void persistAdMuteState(@Nullable android.content.Context context, boolean muted, int preVolume) {
        if (context == null) return;
        try {
            context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                    .edit()
                    .putBoolean(PREF_ADS_MUTED, muted)
                    .putInt(PREF_ADS_PRE_VOLUME, preVolume)
                    .apply();
        } catch (Throwable ignored) {
        }
    }

    /**
     * Restaura el volumen si el proceso murió con el audio silenciado. El estado
     * se guarda en SharedPreferences porque los flags estáticos se pierden al
     * morir el proceso y el usuario se quedaba sin sonido.
     */
    static void restorePersistedAdMuteIfNeeded(@Nullable android.content.Context context) {
        if (context == null) return;
        try {
            android.content.SharedPreferences sp = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            if (!sp.getBoolean(PREF_ADS_MUTED, false)) return;

            synchronized (sMuteLock) {
                // Se adopta el estado huérfano para poder deshacerlo por el
                // camino normal, con el volumen previo que quedó persistido.
                sMuteReasons.add("recuperacion");
                sPreMuteVolume = sp.getInt(PREF_ADS_PRE_VOLUME, -1);
            }
            releaseMute(context, "recuperacion");
        } catch (Throwable ignored) {
        }
    }

    /** Silencia el audio multimedia por un motivo concreto. Idempotente. */
    static void acquireMute(@Nullable android.content.Context context, String reason) {
        if (context == null || reason == null) return;
        boolean shouldMute;
        synchronized (sMuteLock) {
            shouldMute = sMuteReasons.isEmpty();
            sMuteReasons.add(reason);
        }
        if (!shouldMute) return;

        try {
            AudioManager am = (AudioManager) context.getSystemService(AUDIO_SERVICE);
            if (am == null) return;
            int current = am.getStreamVolume(AudioManager.STREAM_MUSIC);
            // No guardar 0 como "volumen previo": si dos silenciados encadenan y
            // el primero ya bajó el volumen, se perdería el nivel original.
            if (current > 0) {
                synchronized (sMuteLock) { sPreMuteVolume = current; }
                am.setStreamVolume(AudioManager.STREAM_MUSIC, 0, 0);
            }
            persistAdMuteState(context, true, sPreMuteVolume);
        } catch (Throwable ignored) {
        }
    }

    /** Retira un motivo de silenciado; el volumen vuelve al quedarse sin ninguno. */
    static void releaseMute(@Nullable android.content.Context context, String reason) {
        if (context == null || reason == null) return;
        boolean shouldRestore;
        int restore;
        synchronized (sMuteLock) {
            if (!sMuteReasons.remove(reason)) return;
            shouldRestore = sMuteReasons.isEmpty();
            restore = sPreMuteVolume;
        }
        if (!shouldRestore) return;

        try {
            AudioManager am = (AudioManager) context.getSystemService(AUDIO_SERVICE);
            if (am != null) {
                int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                // Si no se conoce el nivel previo, dejarlo a un tercio del máximo
                // en vez de a 0 (antes la app podía dejar el móvil mudo).
                if (restore <= 0) restore = Math.max(1, max / 3);
                if (restore > max) restore = max;
                am.setStreamVolume(AudioManager.STREAM_MUSIC, restore, 0);
            }
        } catch (Throwable ignored) {
        } finally {
            synchronized (sMuteLock) { sPreMuteVolume = -1; }
            persistAdMuteState(context, false, -1);
        }
    }

    /** Retira todos los motivos. Se usa al desconectar o al parar la música. */
    static void releaseAllMutes(@Nullable android.content.Context context) {
        String[] reasons;
        synchronized (sMuteLock) {
            reasons = sMuteReasons.toArray(new String[0]);
        }
        for (String reason : reasons) releaseMute(context, reason);
    }

    private static void restoreMediaVolumeIfNeeded(@Nullable android.content.Context context) {
        releaseMute(context, MUTE_REASON_ADS);
    }

    private void applyAdMuteState(boolean adPlaying) {
        if (!isSilenceAdsEnabled() || !adPlaying) {
            releaseMute(getApplicationContext(), MUTE_REASON_ADS);
            return;
        }
        acquireMute(getApplicationContext(), MUTE_REASON_ADS);
    }

    private boolean containsAdKeyword(@Nullable String raw) {
        String normalized = DuplicateSkipEngine.normalizeForMatch(raw);
        if (normalized.isEmpty()) return false;

        for (String kw : getSilenceAdsKeywords(getApplicationContext())) {
            String token = DuplicateSkipEngine.normalizeForMatch(kw);
            if (!token.isEmpty() && normalized.contains(token)) return true;
        }
        return false;
    }

    private boolean isAdFromExtras(@Nullable Bundle extras) {
        if (extras == null) return false;
        if (containsAdKeyword(asString(extras.getCharSequence(Notification.EXTRA_TITLE)))) return true;
        if (containsAdKeyword(asString(extras.getCharSequence(Notification.EXTRA_TEXT)))) return true;
        if (containsAdKeyword(asString(extras.getCharSequence(Notification.EXTRA_SUB_TEXT)))) return true;
        if (containsAdKeyword(asString(extras.getCharSequence(Notification.EXTRA_BIG_TEXT)))) return true;
        try {
            CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
            if (lines != null) {
                for (CharSequence cs : lines) {
                    if (containsAdKeyword(asString(cs))) return true;
                }
            }
        } catch (Throwable ignored) {
        }
        return false;
    }

    // ── Ciclo de vida del servicio ────────────────────────────────────────────

    /** Suelta el listener sólo si sigue siendo ése (una actividad nueva ya pudo poner el suyo). */
    public static void clearListener(TrackListener l) {
        if (sListener == l) sListener = null;
    }

    public static void setListener(TrackListener l) {
        sListener = l;

        // Si el servicio capturó una canción antes de que JS estuviera listo,
        // se reproduce una vez (sólo si es razonablemente reciente).
        Snapshot snap = sLastSnapshot;
        if (l != null && snap != null) {
            long ageMs = SystemClock.uptimeMillis() - snap.capturedAtUptimeMs;
            if (ageMs >= 0 && ageMs <= 15000) {
                l.onTrack(snap.track, snap.artist, snap.album, snap.durationMs, snap.isPlaying);
            }
        }
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        sServiceInstance = this;

        // Mantiene vivo el proceso en OEMs agresivos (Samsung One UI, etc.).
        SkippifyForegroundService.start(getApplicationContext(), true);

        // Engancha el motor y arranca la carga del índice en segundo plano:
        // cuando llegue la primera canción la consulta ya será O(1) en memoria.
        DuplicateSkipEngine.get().attach(getApplicationContext(), this);

        restorePersistedAdMuteIfNeeded(getApplicationContext());

        // Si el proceso murió con un temporizador en marcha, se retoma aquí.
        SleepTimer.resume(getApplicationContext());

        // Al (re)conectar, Spotify puede estar ya sonando y la notificación ya
        // existir: se consultan las activas para engancharse al MediaSession.
        try {
            StatusBarNotification[] active = getActiveNotifications();
            if (active == null) return;

            for (StatusBarNotification sbn : active) {
                if (sbn == null) continue;
                if (!SPOTIFY_PKG.equals(sbn.getPackageName())) continue;

                Notification n = sbn.getNotification();
                if (n == null) continue;

                ensureMediaController(n.extras);

                Extracted extracted = extractMetadata(n, n.extras);
                if (extracted == null) continue;
                if (extracted.track.isEmpty() || extracted.track.equalsIgnoreCase("Spotify")) continue;

                Snapshot snap = new Snapshot(
                        extracted.track, extracted.artist, extracted.album,
                        extracted.durationMs, extracted.isPlaying,
                        SystemClock.uptimeMillis(), System.currentTimeMillis()
                );
                sLastSnapshot = snap;
                observeForDuplicates(snap, "listener_connected");

                persistEvent(snap, "listener_connected");

                sLastEmittedKey = snap.key();
                sLastEmittedUptimeMs = snap.capturedAtUptimeMs;

                TrackListener l = sListener;
                if (l != null) {
                    l.onTrack(snap.track, snap.artist, snap.album, snap.durationMs, snap.isPlaying);
                }

                break;
            }
        } catch (Throwable ignored) {
        }
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        DuplicateSkipEngine.get().detach();
        sServiceInstance = null;
        // Sin listener no hay quien deshaga un silenciado: se sueltan todos.
        releaseAllMutes(getApplicationContext());

        // Reenganche best-effort: algunos OEMs desconectan el listener bajo
        // presión de memoria/batería. requestRebind pide reconectar.
        try {
            NotificationListenerService.requestRebind(
                    new ComponentName(getApplicationContext(), SpotifyNotificationListener.class)
            );
        } catch (Throwable ignored) {
        }
    }

    // ── Entrada de eventos ────────────────────────────────────────────────────

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        if (!SPOTIFY_PKG.equals(sbn.getPackageName())) return;

        // Cinturón y tirantes: asegura el servicio en primer plano siempre que
        // llega una notificación de Spotify (cubre casos en que fue matado).
        SkippifyForegroundService.start(getApplicationContext());

        Notification n = sbn.getNotification();
        if (n == null) return;

        Bundle extras = n.extras;

        // Engancharse al MediaSession para recibir cambios de play/pausa aunque
        // Spotify no publique una notificación nueva.
        ensureMediaController(extras);

        Extracted extracted = extractMetadata(n, extras);
        if (extracted == null) return;

        boolean adInNotification = isAdFromExtras(extras)
                || containsAdKeyword(extracted.track)
                || containsAdKeyword(extracted.artist)
                || containsAdKeyword(extracted.album);

        // Algunas combinaciones Spotify/OEM reportan metadatos antes que un
        // estado de reproducción fiable: si el controller ya dice PLAYING, se
        // toma como tal.
        if (!extracted.isPlaying && isPlaying()) {
            extracted = new Extracted(extracted.track, extracted.artist, extracted.album,
                    extracted.durationMs, true);
        }

        applyAdMuteState(adInNotification && extracted.isPlaying);

        if (extracted.track.isEmpty() || extracted.track.equalsIgnoreCase("Spotify")) return;

        Snapshot snap = new Snapshot(
                extracted.track, extracted.artist, extracted.album,
                extracted.durationMs, extracted.isPlaying,
                SystemClock.uptimeMillis(), System.currentTimeMillis()
        );

        sLastSnapshot = snap;

        // La notificación es sólo un disparador. El motor relee el MediaSession
        // por su cuenta, así que un nombre obsoleto aquí no puede provocar un
        // salto sobre la canción equivocada.
        boolean skipped = observeForDuplicates(snap, "notification");
        if (skipped) return;

        // Antirrebote: Spotify republica la notificación de la misma canción muy
        // a menudo (refresco de UI, carga de carátula...). Sólo interesa emitir
        // cuando cambia algo real: canción nueva o play/pausa.
        String key = snap.key();
        if (key.equals(sLastEmittedKey)) return;

        persistEvent(snap, "notification");

        sLastEmittedKey = key;
        sLastEmittedUptimeMs = snap.capturedAtUptimeMs;

        // Macros de «la canción que suena ahora». Se disparan aquí, con la app
        // cerrada o abierta, porque este es el instante en que la canción cambia
        // de verdad. No bloquea: se limita a encolar en su propio hilo.
        try {
            MacroBackground.alCambiarDeCancion(getApplicationContext(), snap.isPlaying);
        } catch (Throwable t) {
            Log.w(TAG, "no se pudieron lanzar las macros de segundo plano", t);
        }

        TrackListener l = sListener;
        if (l == null) return;
        l.onTrack(snap.track, snap.artist, snap.album, snap.durationMs, snap.isPlaying);
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        if (sbn == null) return;

        // Desde Android 14 el usuario puede descartar la notificación de un
        // servicio en primer plano. Si se va, Android puede degradar el proceso
        // y dejaríamos de detectar reproducciones: se vuelve a publicar en el
        // acto.
        if (getPackageName().equals(sbn.getPackageName())
                && sbn.getId() == SkippifyForegroundService.NOTIF_ID) {
            Log.i(TAG, "notificación persistente descartada: se restablece");
            SkippifyForegroundService.start(getApplicationContext(), true);
            return;
        }

        if (!SPOTIFY_PKG.equals(sbn.getPackageName())) return;

        restoreMediaVolumeIfNeeded(getApplicationContext());
        emitStopped();
    }

    private void ensureMediaController(@Nullable Bundle extras) {
        if (extras == null) return;
        try {
            MediaSession.Token token = extras.getParcelable(Notification.EXTRA_MEDIA_SESSION);
            if (token == null) return;

            if (mLastToken != null && mLastToken.equals(token) && mController != null) return;

            if (mController != null) {
                try {
                    mController.unregisterCallback(mControllerCallback);
                } catch (Throwable ignored) {
                }
            }

            mLastToken = token;
            mController = new MediaController(getApplicationContext(), token);
            try {
                // El Handler debe ir sobre un hilo con Looper: onNotificationPosted
                // corre en un hilo binder (sin Looper), y sin Handler el callback
                // no se dispara nunca ⇒ se perderían las transiciones pausa→play.
                mController.registerCallback(mControllerCallback, new Handler(Looper.getMainLooper()));
            } catch (Throwable ignored) {
            }

            emitFromController();
        } catch (Throwable ignored) {
        }
    }

    private void emitFromController() {
        MediaController controller = mController;
        if (controller == null) return;

        try {
            MediaMetadata md = controller.getMetadata();
            PlaybackState ps = controller.getPlaybackState();

            String title = null;
            String artist = null;
            String album = null;
            long durationMs = 0L;

            if (md != null) {
                title = md.getString(MediaMetadata.METADATA_KEY_TITLE);
                artist = md.getString(MediaMetadata.METADATA_KEY_ARTIST);
                if (isNullOrEmpty(artist)) artist = md.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST);
                album = md.getString(MediaMetadata.METADATA_KEY_ALBUM);
                durationMs = md.getLong(MediaMetadata.METADATA_KEY_DURATION);
            }

            boolean playing = ps != null && ps.getState() == PlaybackState.STATE_PLAYING;
            String trackTrim = safeTrim(title);
            if (trackTrim.isEmpty()) return;

            boolean adFromMetadata = containsAdKeyword(trackTrim)
                    || containsAdKeyword(artist)
                    || containsAdKeyword(album);
            applyAdMuteState(adFromMetadata && playing);

            Snapshot snap = new Snapshot(
                    trackTrim, safeTrim(artist), safeTrim(album), durationMs, playing,
                    SystemClock.uptimeMillis(), System.currentTimeMillis()
            );

            sLastSnapshot = snap;

            boolean skipped = observeForDuplicates(snap, "media_session");
            if (skipped) return;

            String key = snap.key();
            if (key.equals(sLastEmittedKey)) return;

            persistEvent(snap, "media_session");

            sLastEmittedKey = key;
            sLastEmittedUptimeMs = snap.capturedAtUptimeMs;

            TrackListener l = sListener;
            if (l == null) return;
            l.onTrack(snap.track, snap.artist, snap.album, snap.durationMs, snap.isPlaying);
        } catch (Throwable ignored) {
        }
    }

    private void emitStopped() {
        restoreMediaVolumeIfNeeded(getApplicationContext());
        long now = SystemClock.uptimeMillis();
        Snapshot snap = new Snapshot("", "", null, 0L, false, now, System.currentTimeMillis());
        sLastSnapshot = snap;

        // Cierra la sesión abierta en el motor y consolida su escucha si llegó
        // al umbral.
        observeForDuplicates(snap, "notification");
        persistEvent(snap, "notification");

        TrackListener l = sListener;
        if (l == null) return;

        String key = "STOP";
        if (key.equals(sLastEmittedKey) && (now - sLastEmittedUptimeMs) < 2000) return;
        sLastEmittedKey = key;
        sLastEmittedUptimeMs = now;
        l.onTrack("", "", null, 0L, false);
    }

    /**
     * Alimenta al motor de duplicadas. Devuelve true si la canción se ha saltado,
     * en cuyo caso no debe emitirse a JS (si no, quedaría contabilizada).
     */
    private boolean observeForDuplicates(Snapshot snap, String source) {
        try {
            DuplicateSkipEngine.Decision decision = DuplicateSkipEngine.get().observe(
                    new DuplicateSkipEngine.Observation(
                            snap.track, snap.artist, snap.durationMs, snap.isPlaying,
                            positionMs(), source
                    )
            );
            return decision != null && decision.skipped;
        } catch (Throwable t) {
            // El motor jamás debe tumbar el listener.
            Log.w(TAG, "motor de duplicadas ha fallado", t);
            return false;
        }
    }

    // ── Persistencia del log crudo (lo drena JS para estadísticas) ────────────

    private void persistEvent(Snapshot snap, String source) {
        if (snap == null) return;

        try {
            JSONObject obj = new JSONObject();
            obj.put("track", safeTrim(snap.track));
            obj.put("artist", safeTrim(snap.artist));
            if (!isNullOrEmpty(snap.album)) obj.put("album", safeTrim(snap.album));
            if (snap.durationMs > 0) obj.put("duration_ms", snap.durationMs);
            obj.put("is_playing", snap.isPlaying);

            String event;
            if (isNullOrEmpty(snap.track) && isNullOrEmpty(snap.artist)) {
                event = "stopped";
            } else {
                event = snap.isPlaying ? "playing" : "paused";
            }
            obj.put("event", event);
            obj.put("played_at", toIso8601(snap.capturedAtEpochMs));
            obj.put("source", source == null ? "notification" : source);
            // ¿Había una app viva recibiendo esto en directo? Lo que sí la tenía
            // lo registra JS y lo sube él; LigaBackground sólo sube el resto.
            obj.put("js", sListener != null);

            appendJsonLine(getApplicationContext(), obj);
            // El log de arriba lo vacía la app al abrirse; el widget «Tu semana»
            // necesita la semana entera, así que lleva su propia copia.
            RegistroSemanal.anotar(getApplicationContext(), obj);
            WidgetsSkippify.actualizarSemana(getApplicationContext());
        } catch (Throwable ignored) {
        }
    }

    private static void appendJsonLine(android.content.Context context, JSONObject obj) {
        if (context == null || obj == null) return;
        synchronized (sEventFileLock) {
            try {
                File dir = context.getFilesDir();
                if (dir == null) return;

                File f = new File(dir, EVENT_LOG_FILE);
                // Rotación simple: se descarta el fichero si crece demasiado.
                if (f.exists() && f.length() > EVENT_LOG_MAX_BYTES) {
                    //noinspection ResultOfMethodCallIgnored
                    f.delete();
                }

                try (FileOutputStream fos = new FileOutputStream(f, true)) {
                    fos.write((obj.toString() + "\n").getBytes(StandardCharsets.UTF_8));
                    fos.flush();
                }
            } catch (Throwable ignored) {
            }
        }
    }

    // ── Extracción de metadatos ───────────────────────────────────────────────

    private static final class Extracted {
        final String track;
        final String artist;
        final String album;
        final long durationMs;
        final boolean isPlaying;

        Extracted(String track, String artist, @Nullable String album, long durationMs, boolean isPlaying) {
            this.track = safeTrim(track);
            this.artist = safeTrim(artist);
            this.album = safeTrim(album);
            this.durationMs = durationMs;
            this.isPlaying = isPlaying;
        }
    }

    @Nullable
    private Extracted extractMetadata(Notification n, @Nullable Bundle extras) {
        // 1) Metadatos del MediaSession (la mejor fuente).
        Extracted fromSession = extractFromMediaSession(extras);
        if (fromSession != null && !fromSession.track.isEmpty()) {
            if (fromSession.artist.isEmpty() || isNullOrEmpty(fromSession.album)) {
                Extracted fromExtras = extractFromExtras(n, extras);
                if (fromExtras != null) {
                    String artist = fromSession.artist.isEmpty() ? fromExtras.artist : fromSession.artist;
                    String album = isNullOrEmpty(fromSession.album) ? fromExtras.album : fromSession.album;
                    return new Extracted(fromSession.track, artist, album,
                            fromSession.durationMs, fromSession.isPlaying);
                }
            }
            return fromSession;
        }

        // 2) Respaldo: extras de la notificación.
        Extracted fromExtras = extractFromExtras(n, extras);
        if (fromExtras != null && !fromExtras.track.isEmpty()) return fromExtras;

        return null;
    }

    @Nullable
    private Extracted extractFromMediaSession(@Nullable Bundle extras) {
        if (extras == null) return null;

        try {
            MediaSession.Token token = extras.getParcelable(Notification.EXTRA_MEDIA_SESSION);
            if (token == null) return null;

            // Reutilizar el controller cacheado: antes se instanciaba uno nuevo
            // en CADA notificación de Spotify (varias por canción), con todo el
            // coste de IPC que eso conlleva.
            MediaController cached = mController;
            MediaController controller = (cached != null && token.equals(mLastToken))
                    ? cached
                    : new MediaController(getApplicationContext(), token);
            MediaMetadata md = controller.getMetadata();
            PlaybackState ps = controller.getPlaybackState();

            String title = null;
            String artist = null;
            String album = null;
            long durationMs = 0L;

            if (md != null) {
                title = md.getString(MediaMetadata.METADATA_KEY_TITLE);
                artist = md.getString(MediaMetadata.METADATA_KEY_ARTIST);
                if (isNullOrEmpty(artist)) artist = md.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST);
                album = md.getString(MediaMetadata.METADATA_KEY_ALBUM);
                durationMs = md.getLong(MediaMetadata.METADATA_KEY_DURATION);
            }

            boolean playing = ps != null && ps.getState() == PlaybackState.STATE_PLAYING;

            String trackTrim = safeTrim(title);
            if (trackTrim.isEmpty()) return null;

            return new Extracted(trackTrim, safeTrim(artist), album, durationMs, playing);
        } catch (Throwable ignored) {
            // Algunos OEMs/builds de Spotify lanzan excepciones inesperadas aquí.
            return null;
        }
    }

    @Nullable
    private static Extracted extractFromExtras(Notification n, @Nullable Bundle extras) {
        if (extras == null) return null;

        String track = asString(extras.getCharSequence(Notification.EXTRA_TITLE));
        String text = asString(extras.getCharSequence(Notification.EXTRA_TEXT));
        String subText = asString(extras.getCharSequence(Notification.EXTRA_SUB_TEXT));
        String bigText = asString(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));

        CharSequence[] lines = null;
        try {
            lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        } catch (Throwable ignored) {
        }

        ParsedArtistAlbum parsed = parseArtistAlbum(text);
        String artist = parsed.artist;
        String album = parsed.album;

        if (isNullOrEmpty(artist) && lines != null && lines.length > 0) {
            // A menudo la primera línea es el artista.
            ParsedArtistAlbum parsedLine = parseArtistAlbum(asString(lines[0]));
            artist = parsedLine.artist;
            if (isNullOrEmpty(album)) album = parsedLine.album;

            if (isNullOrEmpty(album) && lines.length > 1) {
                album = safeTrim(asString(lines[1]));
            }
        }

        if (isNullOrEmpty(album)) album = safeTrim(subText);

        if (isNullOrEmpty(artist)) {
            ParsedArtistAlbum parsedBig = parseArtistAlbum(bigText);
            artist = parsedBig.artist;
            if (isNullOrEmpty(album)) album = parsedBig.album;
        }

        // Sin estado del MediaSession no se puede inferir play/pausa con fiabilidad.
        return new Extracted(track, artist, album, 0L, false);
    }

    private static final class ParsedArtistAlbum {
        final String artist;
        final String album;

        ParsedArtistAlbum(String artist, String album) {
            this.artist = safeTrim(artist);
            this.album = safeTrim(album);
        }
    }

    private static ParsedArtistAlbum parseArtistAlbum(@Nullable String raw) {
        String text = safeTrim(raw);
        if (text.isEmpty()) return new ParsedArtistAlbum("", "");

        // Patrones habituales: "Artista" o "Artista • Álbum" / "Artista · Álbum".
        for (String sep : new String[] { " • ", " · ", " - ", " – ", " — " }) {
            int idx = text.indexOf(sep);
            if (idx > 0 && idx < text.length() - sep.length()) {
                return new ParsedArtistAlbum(text.substring(0, idx), text.substring(idx + sep.length()));
            }
        }

        return new ParsedArtistAlbum(text, "");
    }

    private static String asString(@Nullable CharSequence cs) {
        return cs == null ? "" : cs.toString();
    }

    // ── Palabras clave de anuncios ────────────────────────────────────────────

    private static List<String> deserializeKeywords(@Nullable String raw) {
        List<String> out = new ArrayList<>();
        if (raw == null || raw.trim().isEmpty()) {
            out.addAll(DEFAULT_AD_KEYWORDS);
            return out;
        }

        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                String kw = DuplicateSkipEngine.normalizeForMatch(arr.optString(i, ""));
                if (!kw.isEmpty() && !out.contains(kw)) out.add(kw);
            }
        } catch (Throwable ignored) {
        }

        for (String kw : DEFAULT_AD_KEYWORDS) {
            String norm = DuplicateSkipEngine.normalizeForMatch(kw);
            if (!norm.isEmpty() && !out.contains(norm)) out.add(norm);
        }
        return out;
    }

    private static String serializeKeywords(@Nullable List<String> keywords) {
        JSONArray arr = new JSONArray();
        List<String> base = keywords == null ? DEFAULT_AD_KEYWORDS : keywords;
        List<String> unique = new ArrayList<>();

        for (String kw : base) {
            String norm = DuplicateSkipEngine.normalizeForMatch(kw);
            if (!norm.isEmpty() && !unique.contains(norm)) unique.add(norm);
        }

        for (String kw : DEFAULT_AD_KEYWORDS) {
            String norm = DuplicateSkipEngine.normalizeForMatch(kw);
            if (!norm.isEmpty() && !unique.contains(norm)) unique.add(norm);
        }

        for (String kw : unique) arr.put(kw);

        return arr.toString();
    }

    private static boolean isNullOrEmpty(@Nullable String s) {
        return s == null || s.trim().isEmpty();
    }

    private static String safeTrim(@Nullable String s) {
        return s == null ? "" : s.trim();
    }
}
