package com.skippify.app;

import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;

import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayDeque;
import java.util.Calendar;
import java.util.Deque;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Motor de saltado de canciones duplicadas.
 *
 * Reemplaza al sistema anterior, que fallaba por tres motivos estructurales:
 *
 *  1. PAUSAS INDETERMINADAS. El sistema pausaba la reproducción ANTES de saber
 *     si la canción era duplicada, para ganar tiempo mientras consultaba el
 *     historial, y luego la reanudaba. El reanudado dependía de un único slot
 *     estático compartido y de un "failsafe" cuya condición de vencimiento
 *     estaba invertida (si el temporizador llegaba tarde, limpiaba el estado
 *     SIN reanudar), así que cualquier solape dejaba Spotify pausado para
 *     siempre. Aquí no se pausa nunca: la decisión es síncrona y O(1).
 *
 *  2. SALTOS TARDÍOS / DE LA CANCIÓN EQUIVOCADA. La decisión se disparaba desde
 *     la notificación de Spotify, que llega tarde y con metadatos obsoletos
 *     cuando hay varios saltos seguidos, y la orden `skipToNext()` se emitía a
 *     ciegas sobre "lo que esté sonando ahora". Aquí la notificación es sólo un
 *     disparador: los datos SIEMPRE se releen en vivo del MediaSession, la
 *     sesión se autoexamina con sondas propias temporizadas (no dependemos de
 *     la cadencia de Spotify) y se reverifica la identidad de la pista justo
 *     antes de emitir el salto.
 *
 *  3. BÚSQUEDA LENTA. El camino de consulta acababa recorriendo linealmente una
 *     lista de hasta 6000 reproducciones y releyendo ficheros NDJSON de varios
 *     MB desde un hilo binder. Aquí el índice vive entero en memoria
 *     (HashMap → K marcas de tiempo más recientes por canción), se carga una
 *     sola vez en segundo plano y la consulta caliente no toca disco jamás.
 *
 * SILENCIADO PREVIO (v3.2). Por muy rápida que sea la decisión, siempre se oía
 * la franja inicial de la duplicada: el retardo lo imponen Spotify y el
 * MediaSession, no nosotros. Ahora la reproducción se silencia en cuanto
 * arranca una canción sin decidir y se libera al cerrar la decisión. Si resulta
 * NO ser duplicada, además se rebobina a 0 para devolver el fragmento perdido.
 */
final class DuplicateSkipEngine {

    static final String TAG = "SkippifyDup";

    private static final String PREFS_NAME = "skippify-native-features";
    private static final String PREF_SKIP_DUPLICATES = "skipDuplicates";
    private static final String PREF_SKIP_INTERVAL = "skipDuplicatesInterval";

    // ── Ajustes de la pestaña «Calibración» ───────────────────────────────────
    static final String PREF_DEV_DECISION_WINDOW_MS = "devDecisionWindowMs";
    static final String PREF_DEV_MIN_STABLE_MS = "devMinStableMs";
    static final String PREF_DEV_PAUSE_TO_SKIP = "devPauseToSkip";
    static final String PREF_DEV_TELEMETRY = "devTelemetry";
    static final String PREF_DEV_PREMUTE = "devPremute";
    static final String PREF_DEV_PREMUTE_MAX_MS = "devPremuteMaxMs";
    static final String PREF_DEV_RESTART_ON_KEEP = "devRestartOnKeep";
    static final String PREF_DEV_UNMUTE_DELAY_MS = "devUnmuteDelayMs";

    static final int DEF_DECISION_WINDOW_MS = 5000;
    static final int DEF_MIN_STABLE_MS = 400;
    static final boolean DEF_PAUSE_TO_SKIP = false;
    static final boolean DEF_TELEMETRY = true;
    static final boolean DEF_PREMUTE = true;
    static final int DEF_PREMUTE_MAX_MS = 2500;
    static final boolean DEF_RESTART_ON_KEEP = true;
    static final int DEF_UNMUTE_DELAY_MS = 350;

    /** Margen bajo el inicio de la sesión: nada posterior cuenta como escucha previa. */
    private static final long CURRENT_SESSION_GUARD_MS = 2500L;
    /** Cuánto debe sonar una canción para que quede registrada como "ya escuchada". */
    private static final double MIN_PLAY_RATIO = 0.25;
    private static final long MIN_PLAY_MS = 20_000L;
    private static final long MAX_PLAY_MS = 90_000L;
    /** Antigüedad máxima del historial que se carga en memoria. */
    private static final long INDEX_HORIZON_MS = 400L * 86_400_000L;
    /** Marcas de tiempo guardadas por canción (basta con las más recientes). */
    private static final int INDEX_SLOTS = 3;

    private static final long SKIP_VERIFY_RETRY_DELAY_MS = 350L;
    private static final long PAUSE_TO_SKIP_MAX_HOLD_MS = 4000L;
    /**
     * Reintentos de la reanudación tras «Pausar antes de saltar». Se insiste
     * hasta confirmar que vuelve a sonar: un `play()` de más no hace nada, pero
     * un `play()` de menos deja la música parada sin que nadie lo repare.
     */
    private static final long[] RESUME_RETRY_DELAYS_MS = { 400L, 900L, 1600L, 2600L, 4200L };
    /** Margen que se le da al PlaybackState para publicar el estado real. */
    private static final long PAUSE_STATE_SETTLE_MS = 350L;
    private static final int TELEMETRY_MAX = 120;

    /**
     * Por debajo de este silencio no merece la pena rebobinar: el usuario no ha
     * perdido nada audible y un seek(0) espurio sí se nota.
     */
    private static final long RESTART_MIN_MUTE_MS = 220L;

    private static final String DB_NAME = "skippify-duplicate-history.db";
    private static final String TABLE = "duplicate_plays";
    /** Historial heredado de versiones anteriores; se importa una sola vez. */
    private static final String LEGACY_DUP_FILE = "skippify-spotify-dup-history.ndjson";
    private static final String LEGACY_EVENT_FILE = "skippify-spotify-events.ndjson";

    // ── Contadores del día (para la notificación persistente) ─────────────────
    private static final String PREF_DAY_STAMP = "statsDayStamp";
    private static final String PREF_DAY_DUPLICATES = "statsDayDuplicates";
    private static final String PREF_DAY_SKIPPED = "statsDaySkipped";

    /**
     * Histórico diario, para los paneles que hablan de semanas o meses.
     *
     * Los contadores de arriba se reinician cada medianoche, así que por sí solos
     * no permiten decir «duplicadas de esta semana». Aquí se conserva una línea
     * por día en un formato compacto —`AAAAMMDD:duplicadas:saltadas`, separadas
     * por `;`— porque son cuatro cifras al día y montar una tabla nueva en la
     * base de datos para eso sería desproporcionado.
     */
    private static final String PREF_DAY_HISTORY = "statsDayHistory";
    /** Días que se conservan. Suficiente para comparaciones interanuales. */
    private static final int DAY_HISTORY_LIMIT = 400;

    // ── Contrato con la capa de reproducción ──────────────────────────────────

    /** Acceso en vivo al MediaSession. Lo implementa SpotifyNotificationListener. */
    interface Transport {
        /** Título en vivo del MediaSession, o "" si no se conoce. */
        String liveTrack();
        /** Artista en vivo del MediaSession, o "" si no se conoce. */
        String liveArtist();
        /** Duración en vivo en ms, o 0 si no se conoce. */
        long liveDurationMs();
        /** Posición extrapolada en ms, o -1 si no se conoce. */
        long positionMs();
        boolean isPlaying();
        void skipToNext();
        void pause();
        void play();
        /** Silencia/restaura el volumen multimedia con arbitraje entre funciones. */
        void setDuplicateMute(boolean muted);
        /** Rebobina la pista actual. Se usa para devolver el fragmento silenciado. */
        void seekTo(long positionMs);
    }

    /** Una observación del estado de reproducción, ya sea de notificación o sonda. */
    static final class Observation {
        final String track;
        final String artist;
        final long durationMs;
        final boolean isPlaying;
        final long positionMs;
        final long epochMs;
        final long uptimeMs;
        final String source;

        Observation(String track, String artist, long durationMs, boolean isPlaying,
                    long positionMs, String source) {
            this.track = safeTrim(track);
            this.artist = safeTrim(artist);
            this.durationMs = durationMs;
            this.isPlaying = isPlaying;
            this.positionMs = positionMs;
            this.epochMs = System.currentTimeMillis();
            this.uptimeMs = SystemClock.uptimeMillis();
            this.source = safeTrim(source);
        }
    }

    /** Resultado de evaluar una observación. */
    static final class Decision {
        final boolean skipped;
        final String reason;

        Decision(boolean skipped, String reason) {
            this.skipped = skipped;
            this.reason = reason;
        }
    }

    private static final Decision KEEP_DISABLED = new Decision(false, "disabled");

    // ── Estado ────────────────────────────────────────────────────────────────

    private static final DuplicateSkipEngine INSTANCE = new DuplicateSkipEngine();

    static DuplicateSkipEngine get() {
        return INSTANCE;
    }

    private DuplicateSkipEngine() {}

    private volatile Context mContext;
    private volatile Transport mTransport;
    private final Handler mHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService mWriter = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "SkippifyDupWriter");
        t.setDaemon(true);
        return t;
    });

    /** Índice en memoria: clave canónica → marcas de tiempo más recientes (desc). */
    private final Map<String, long[]> mIndex = new HashMap<>();
    private final Object mIndexLock = new Object();
    private volatile boolean mIndexReady = false;
    private volatile boolean mIndexLoading = false;
    private volatile long mIndexLoadMs = -1L;

    private final Object mSessionLock = new Object();
    private String mSessionKey = "";
    private long mSessionGeneration = 0L;
    private long mSessionStartedEpochMs = 0L;
    private long mSessionStartedUptimeMs = 0L;
    private boolean mSessionDecided = true;
    private boolean mSessionCommitted = true;
    private boolean mSessionSuppressCommit = false;
    private long mSessionPlayedMs = 0L;
    private long mSessionPlayingSinceMs = 0L;
    private String mSessionTrack = "";
    private String mSessionArtist = "";
    private long mSessionDurationMs = 0L;

    // Silenciado previo. Se pide dentro del lock de sesión pero se APLICA fuera:
    // tocar el AudioManager con el lock cogido invita a bloqueos cruzados.
    private boolean mPremutePending = false;
    private boolean mPremuteActive = false;
    private long mPremuteGeneration = -1L;
    private long mPremuteStartedUptimeMs = 0L;
    // Como mucho un silenciado por sesión: sin esto, re-evaluar la petición en
    // cada observación podría volver a silenciar una pista ya restaurada.
    private boolean mSessionPremuteDone = false;
    // Cada silenciado y cada restauración avanzan la época. Las restauraciones
    // diferidas comprueban que siguen siendo las suyas: si entretanto se ha
    // vuelto a silenciar (cambio de pista), la vieja ya no debe subir el volumen.
    private long mMuteEpoch = 0L;

    // Pausa del método heredado «Pausar antes de saltar». Sólo se pone a true
    // dentro de issueSkip() y sólo si el ajuste está activo, así que cualquier
    // reanudación de este motor se puede rastrear hasta esa función.
    private volatile boolean mPauseHoldActive = false;
    private volatile long mPauseHoldStartedUptimeMs = 0L;

    private final Deque<JSONObject> mTelemetry = new ArrayDeque<>();
    private final Object mTelemetryLock = new Object();
    private volatile long mSkipCount = 0L;
    private volatile long mCommitCount = 0L;

    private volatile DbHelper mDbHelper;
    private volatile boolean mDbFailed = false;

    // ── Ciclo de vida ─────────────────────────────────────────────────────────

    void attach(Context context, Transport transport) {
        if (context != null) mContext = context.getApplicationContext();
        if (transport != null) mTransport = transport;
        loadIndexAsync();
    }

    void detach() {
        // Último intento de deshacer una pausa heredada antes de soltar el
        // transporte: pasado este punto ya no habrá quien la repare.
        if (mPauseHoldActive) resumeSafely("detach");
        mPauseHoldActive = false;
        // Nunca dejar el volumen a 0 al perder el transporte.
        releasePremute(false, "detach");
        // Cierra la sesión viva para que su escucha se consolide si procede.
        observe(new Observation("", "", 0L, false, -1L, "detached"));
        mTransport = null;
    }

    // ── Camino caliente ───────────────────────────────────────────────────────

    /**
     * Procesa una observación: mantiene la sesión de reproducción al día, decide
     * (una sola vez por sesión) si la canción es duplicada y, en tal caso, emite
     * el salto con verificación de identidad.
     */
    Decision observe(@Nullable Observation obs) {
        if (obs == null) return KEEP_DISABLED;

        Context ctx = mContext;
        if (ctx == null) return KEEP_DISABLED;

        String key = keyOf(obs.track, obs.artist);
        long lookupStartNs;
        long lookupNs = 0L;
        long generation;
        long sessionAgeMs;
        String reason;
        boolean doSkip = false;
        boolean decisionJustClosed = false;
        boolean takePremute = false;
        boolean duplicateSeen = false;
        boolean sessionChanged = false;

        synchronized (mSessionLock) {
            if (!key.equals(mSessionKey)) {
                sessionChanged = true;
                closeSessionLocked(obs.uptimeMs);
                openSessionLocked(key, obs, ctx);
            } else {
                accumulateLocked(obs.isPlaying, obs.uptimeMs);
                updateSessionMetaLocked(obs);
                maybeCommitLocked(obs.uptimeMs);
            }

            generation = mSessionGeneration;
            sessionAgeMs = obs.uptimeMs - mSessionStartedUptimeMs;
            boolean wasDecided = mSessionDecided;

            // ── Decisión (como mucho una vez por sesión) ──────────────────────
            if (key.isEmpty()) {
                reason = "sin_metadatos";
            } else if (!isSkipEnabled(ctx)) {
                reason = "funcion_desactivada";
            } else if (!obs.isPlaying) {
                reason = "pausado";
            } else if (mSessionDecided) {
                reason = "ya_decidido";
            } else if (sessionAgeMs < devMinStableMs(ctx)) {
                // Todavía puede llegar metadato más fresco: no se cierra la
                // decisión, la sonda temporizada volverá a preguntar.
                reason = "estabilizando";
            } else if (obs.positionMs < 0L) {
                // Sin posición fiable no se puede distinguir "recién empezada"
                // de "reanudada a mitad": nunca se salta a ciegas.
                mSessionDecided = true;
                reason = "sin_posicion";
            } else if (obs.positionMs > devDecisionWindowMs(ctx)) {
                mSessionDecided = true;
                reason = "fuera_de_ventana";
                // Aunque ya no se pueda saltar, la consulta es O(1) en memoria:
                // se hace igualmente para que el contador diario refleje las
                // duplicadas que se escaparon (es justo lo que se calibra).
                duplicateSeen = mIndexReady && isDuplicateLocked(ctx, key, obs);
            } else if (!mIndexReady) {
                // El índice sigue cargando: se reintenta, no se cierra.
                reason = "indice_cargando";
            } else {
                lookupStartNs = System.nanoTime();
                boolean hit = isDuplicateLocked(ctx, key, obs);
                lookupNs = System.nanoTime() - lookupStartNs;

                mSessionDecided = true;
                if (hit) {
                    // Una canción saltada no se anota como escuchada: si no, la
                    // próxima vez seguiría contando como "ya la oíste".
                    mSessionSuppressCommit = true;
                    mSessionCommitted = true;
                    doSkip = true;
                    duplicateSeen = true;
                    reason = "duplicada";
                } else {
                    reason = "no_duplicada";
                }
            }

            decisionJustClosed = !wasDecided && mSessionDecided;

            // El silenciado previo se re-evalúa en CADA observación mientras la
            // decisión siga abierta, no sólo al abrir la sesión. En el instante
            // del cambio de pista Spotify suele reportar todavía estado «no
            // reproduciendo», posición -1 o la posición de la canción anterior
            // (fuera de ventana): con una única oportunidad el silenciado se
            // perdía justo en esos casos, y de ahí que sólo funcionara a veces.
            if (!mSessionDecided) requestPremuteLocked(ctx, obs);
            takePremute = consumePremuteRequestLocked();
        }

        // El AudioManager y el MediaController se tocan SIEMPRE fuera del lock.
        // Al cambiar de pista el silenciado heredado no se corta a ciegas: si la
        // pista nueva sigue en decisión (o ya se ha juzgado duplicada) se
        // traspasa a la nueva generación, de modo que el hueco entre una canción
        // y otra siga mudo. Sólo cuando no procede mantenerlo se devuelve el
        // sonido, para que el failsafe de la pista anterior no siga contando
        // sobre una canción que ya no suena.
        if (sessionChanged && !rehomePremute(ctx, generation, obs, doSkip)) {
            releasePremute(false, "cambio_de_pista");
        }
        if (takePremute) applyPremute(generation);

        if (duplicateSeen) bumpDailyCounters(ctx, true, doSkip);

        if (doSkip) {
            mSkipCount++;
            issueSkip(key, generation, obs);
        } else {
            if (decisionJustClosed) {
                // Decisión cerrada sin salto: se devuelve el sonido y, si se
                // silenció algo audible desde el arranque de la pista, se
                // rebobina para no robarle al usuario ese fragmento.
                boolean restart = devRestartOnKeep(ctx)
                        && obs.positionMs >= 0L
                        && obs.positionMs <= devDecisionWindowMs(ctx);
                releasePremute(restart, reason);
            } else if (isDecisionPending(generation) && sessionAgeMs < devDecisionWindowMs(ctx)) {
                // Decisión aún abierta ("estabilizando" / "indice_cargando"): se
                // reprograma la sonda. El límite por antigüedad de sesión acota el
                // número de reintentos — pasada la ventana ya no se salta nunca,
                // así que seguir sondeando sólo gastaría batería.
                scheduleProbe(generation, devMinStableMs(ctx));
            }
        }

        recordTelemetry(obs, key, reason, doSkip, sessionAgeMs, lookupNs);
        return new Decision(doSkip, reason);
    }

    /** Consulta al índice. Debe llamarse con {@link #mSessionLock} cogido. */
    private boolean isDuplicateLocked(Context ctx, String key, Observation obs) {
        long intervalMs = parseIntervalMs(skipInterval(ctx));
        long cutoffMs = obs.epochMs - intervalMs;
        long beforeMs = mSessionStartedEpochMs - CURRENT_SESSION_GUARD_MS;
        return indexHasPlayBetween(key, cutoffMs, beforeMs);
    }

    private boolean isDecisionPending(long generation) {
        synchronized (mSessionLock) {
            return generation == mSessionGeneration && !mSessionDecided && !mSessionKey.isEmpty();
        }
    }

    // ── Sesión de reproducción ────────────────────────────────────────────────

    private void openSessionLocked(String key, Observation obs, Context ctx) {
        mSessionKey = key;
        mSessionGeneration++;
        mSessionStartedEpochMs = obs.epochMs;
        mSessionStartedUptimeMs = obs.uptimeMs;
        mSessionDecided = key.isEmpty();
        mSessionCommitted = key.isEmpty();
        mSessionSuppressCommit = false;
        mSessionPlayedMs = 0L;
        mSessionPlayingSinceMs = 0L;
        mSessionTrack = obs.track;
        mSessionArtist = obs.artist;
        mSessionDurationMs = obs.durationMs;
        mSessionPremuteDone = false;
        mPremutePending = false;
        accumulateLocked(obs.isPlaying, obs.uptimeMs);

        if (!mSessionDecided) {
            long generation = mSessionGeneration;

            // El silenciado previo ya no se pide aquí: lo pide observe() una vez
            // evaluada la decisión, y lo reintenta en cada observación mientras
            // la decisión de esta sesión siga abierta.

            // Sondas propias: la decisión no depende de que Spotify vuelva a
            // emitir. La primera da tiempo a que el MediaSession se estabilice;
            // la segunda cubre el caso de metadatos que llegan con retraso.
            scheduleProbe(generation, devMinStableMs(ctx));
            scheduleProbe(generation, devMinStableMs(ctx) * 3L);
        }
    }

    private void closeSessionLocked(long nowUptimeMs) {
        if (mSessionKey.isEmpty()) return;
        accumulateLocked(false, nowUptimeMs);
        maybeCommitLocked(nowUptimeMs);
    }

    private void accumulateLocked(boolean playing, long nowUptimeMs) {
        if (playing) {
            if (mSessionPlayingSinceMs <= 0L) mSessionPlayingSinceMs = nowUptimeMs;
            return;
        }
        if (mSessionPlayingSinceMs > 0L) {
            mSessionPlayedMs += Math.max(0L, nowUptimeMs - mSessionPlayingSinceMs);
            mSessionPlayingSinceMs = 0L;
        }
    }

    private void updateSessionMetaLocked(Observation obs) {
        if (mSessionDurationMs <= 0L && obs.durationMs > 0L) mSessionDurationMs = obs.durationMs;
        if (mSessionTrack.isEmpty()) mSessionTrack = obs.track;
        if (mSessionArtist.isEmpty()) mSessionArtist = obs.artist;
    }

    private long playedMsLocked(long nowUptimeMs) {
        long total = mSessionPlayedMs;
        if (mSessionPlayingSinceMs > 0L) {
            total += Math.max(0L, nowUptimeMs - mSessionPlayingSinceMs);
        }
        return total;
    }

    private static long requiredPlayMs(long durationMs) {
        if (durationMs <= 0L) return MIN_PLAY_MS;
        long required = (long) (durationMs * MIN_PLAY_RATIO);
        if (required < MIN_PLAY_MS) required = MIN_PLAY_MS;
        if (required > MAX_PLAY_MS) required = MAX_PLAY_MS;
        return required;
    }

    /** Anota la escucha una única vez por reproducción, y sólo si sonó lo bastante. */
    private void maybeCommitLocked(long nowUptimeMs) {
        if (mSessionCommitted || mSessionSuppressCommit) return;
        if (mSessionKey.isEmpty()) return;

        long playedMs = playedMsLocked(nowUptimeMs);
        if (playedMs < requiredPlayMs(mSessionDurationMs)) return;

        mSessionCommitted = true;
        mCommitCount++;

        final String key = mSessionKey;
        final String track = mSessionTrack;
        final String artist = mSessionArtist;
        final long durationMs = mSessionDurationMs;
        final long playedAtMs = mSessionStartedEpochMs;

        // El índice se actualiza en el acto (la consulta caliente lo usa);
        // la escritura en disco se hace fuera del hilo de reproducción.
        indexPut(key, playedAtMs);
        mWriter.execute(() -> insertRow(key, track, artist, durationMs, playedAtMs, playedMs));

        Log.d(TAG, "commit key=" + key + " playedMs=" + playedMs);
    }

    // ── Silenciado previo ─────────────────────────────────────────────────────

    /**
     * Pide el silenciado previo si procede para la observación actual. Se llama
     * en cada observación con la decisión abierta: la primera lectura tras un
     * cambio de pista llega a menudo sin posición fiable, con estado «pausado»
     * o con la posición de la canción anterior, y esperar a la siguiente es lo
     * que hace que el silenciado sea consistente en vez de ocasional.
     *
     * Debe llamarse con {@link #mSessionLock} cogido.
     */
    private void requestPremuteLocked(Context ctx, Observation obs) {
        if (mSessionPremuteDone || mPremutePending) return;
        if (mSessionKey.isEmpty()) return;

        // Una reanudación a mitad no debe silenciarse (ni mucho menos
        // rebobinarse), y sin posición fiable tampoco se salta, así que
        // silenciar sería puro perjuicio.
        if (!obs.isPlaying) return;
        if (!isSkipEnabled(ctx) || !devPremute(ctx)) return;
        if (obs.positionMs < 0L || obs.positionMs > devDecisionWindowMs(ctx)) return;

        mPremutePending = true;
    }

    private boolean consumePremuteRequestLocked() {
        if (!mPremutePending) return false;
        mPremutePending = false;
        mSessionPremuteDone = true;
        return true;
    }

    /**
     * Traspasa un silenciado vivo a la sesión recién abierta en lugar de
     * cortarlo. Es el caso típico justo después de un salto: la pista siguiente
     * empieza mientras aún estamos mudos y, si se devolviera el sonido para
     * volver a quitarlo acto seguido, se colaría el arranque audible que
     * precisamente se quiere camuflar.
     *
     * Devuelve false si no procede mantenerlo; entonces quien llama debe
     * devolver el sonido.
     */
    private boolean rehomePremute(Context ctx, long generation, Observation obs, boolean doSkip) {
        if (!obs.isPlaying || !isSkipEnabled(ctx) || !devPremute(ctx)) return false;

        long elapsedMs;
        synchronized (mSessionLock) {
            if (!mPremuteActive) return false;
            if (generation != mSessionGeneration) return false;
            // Con la decisión ya cerrada sólo se mantiene si vamos a saltar: en
            // cualquier otro caso el sonido tiene que volver ya.
            if (mSessionDecided && !doSkip) return false;

            mPremuteGeneration = generation;
            mSessionPremuteDone = true;
            mPremutePending = false;
            elapsedMs = SystemClock.uptimeMillis() - mPremuteStartedUptimeMs;
        }

        // El failsafe anterior estaba atado a la generación vieja y ya no puede
        // dispararse: hay que renovarlo con lo que quede del presupuesto.
        schedulePremuteFailsafe(generation, devPremuteMaxMs(ctx) - elapsedMs);
        recordTelemetryEvent("silencio_traspasado", "", "cambio_de_pista");
        return true;
    }

    /**
     * Silencia la reproducción mientras se decide. El failsafe es obligatorio:
     * cualquier camino que no cierre la decisión (proceso muerto, transporte
     * perdido, Spotify que deja de emitir) dejaría el móvil mudo.
     */
    private void applyPremute(long generation) {
        Transport t = mTransport;
        if (t == null) return;

        synchronized (mSessionLock) {
            if (mPremuteActive) {
                // Ya mudos (silenciado traspasado desde la pista anterior): sólo
                // hay que anclarlo a esta generación, no volver a tocar el volumen.
                mPremuteGeneration = generation;
                return;
            }
            mPremuteActive = true;
            mPremuteGeneration = generation;
            mPremuteStartedUptimeMs = SystemClock.uptimeMillis();
            // Invalida cualquier restauración diferida que siguiera en la cola.
            mMuteEpoch++;
        }

        try {
            t.setDuplicateMute(true);
        } catch (Throwable ignored) {
        }
        recordTelemetryEvent("silenciada", "", "esperando_decision");

        schedulePremuteFailsafe(generation, devPremuteMaxMs(mContext));
    }

    /**
     * Programa la vuelta del sonido pase lo que pase. Es obligatorio: cualquier
     * camino que no cierre la decisión (proceso muerto, transporte perdido,
     * Spotify que deja de emitir) dejaría el móvil mudo.
     */
    private void schedulePremuteFailsafe(long generation, long holdMs) {
        mHandler.postDelayed(() -> {
            // Vencido el plazo se devuelve el sonido pase lo que pase. Sin
            // rebobinar: no sabemos si la decisión llegará ni qué sonará ya.
            if (isPremuteActiveFor(generation)) {
                Log.w(TAG, "silenciado previo vencido: se restaura el volumen");
                releasePremuteIfGeneration(generation, false, "failsafe");
            }
        }, Math.max(500L, holdMs));
    }

    private boolean isMuteEpoch(long epoch) {
        synchronized (mSessionLock) {
            return mMuteEpoch == epoch;
        }
    }

    private boolean isPremuteActiveFor(long generation) {
        synchronized (mSessionLock) {
            return mPremuteActive && mPremuteGeneration == generation;
        }
    }

    /**
     * Variante para callbacks diferidos. Sin el filtro por generación, el
     * "restaurar sonido" programado tras un salto podía llegar cuando la pista
     * SIGUIENTE ya se había silenciado, y la dejaba sonar sin filtrar.
     */
    private void releasePremuteIfGeneration(long generation, boolean restart, String reason) {
        if (!isPremuteActiveFor(generation)) return;
        releasePremute(restart, reason);
    }

    /**
     * Devuelve el sonido. Si {@code restart} y el silencio duró lo bastante como
     * para haberse notado, rebobina la pista a 0 para no perder el principio.
     */
    private void releasePremute(boolean restart, String reason) {
        boolean wasActive;
        long mutedForMs;
        final long epoch;
        synchronized (mSessionLock) {
            wasActive = mPremuteActive;
            mutedForMs = wasActive ? SystemClock.uptimeMillis() - mPremuteStartedUptimeMs : 0L;
            mPremuteActive = false;
            mPremuteGeneration = -1L;
            mPremuteStartedUptimeMs = 0L;
            // La época sólo avanza si realmente había algo silenciado: hacerlo
            // en una llamada inocua invalidaría la restauración ya encolada de
            // otro silenciado y el volumen se quedaría a cero para siempre.
            epoch = wasActive ? ++mMuteEpoch : mMuteEpoch;
        }
        if (!wasActive) return;

        Transport t = mTransport;
        if (t == null) return;

        boolean doRestart = restart && mutedForMs >= RESTART_MIN_MUTE_MS;

        mHandler.post(() -> {
            Transport live = mTransport;
            if (live == null) return;
            // Si entretanto se ha vuelto a silenciar (la pista siguiente ya está
            // en decisión), esta restauración es de otro silenciado: subir ahora
            // el volumen destaparía justo lo que se acaba de silenciar.
            if (!isMuteEpoch(epoch)) return;

            if (doRestart) {
                // Primero rebobinar y luego devolver el volumen: al revés se oiría
                // un instante del punto en el que estaba antes del seek.
                try { live.seekTo(0L); } catch (Throwable ignored) {}
                recordTelemetryEvent("pista_reiniciada", "", reason);
            }

            long delayMs = doRestart ? Math.max(120L, devUnmuteDelayMs(mContext)) : 0L;
            mHandler.postDelayed(() -> {
                Transport t2 = mTransport;
                if (t2 == null) return;
                if (!isMuteEpoch(epoch)) return;
                try { t2.setDuplicateMute(false); } catch (Throwable ignored) {}
                recordTelemetryEvent("sonido_restaurado", "", reason);
            }, delayMs);
        });
    }

    // ── Emisión del salto ─────────────────────────────────────────────────────

    /**
     * Emite el salto verificando que la pista que suena AHORA sigue siendo la que
     * se juzgó duplicada. Sin esta comprobación, un metadato retrasado hacía que
     * la orden cayera sobre la canción siguiente (el bug de "salta la que no es").
     * La verificación ya no es opcional: desactivarla sólo servía para reproducir
     * el fallo antiguo.
     */
    private void issueSkip(String expectedKey, long generation, Observation obs) {
        Transport transport = mTransport;
        if (transport == null) {
            releasePremute(false, "sin_transporte");
            return;
        }

        Context ctx = mContext;
        boolean pauseFirst = devPauseToSkip(ctx);

        mHandler.post(() -> {
            Transport t = mTransport;
            if (t == null) {
                releasePremute(false, "sin_transporte");
                return;
            }

            if (!expectedKey.equals(liveKey(t))) {
                Log.i(TAG, "skip abortado: la pista viva ya no coincide (" + expectedKey + ")");
                recordTelemetryEvent("salto_abortado", expectedKey, "pista_cambiada");
                // La pista que suena ya no es la juzgada: devolver el sonido sin
                // rebobinar, porque no es la canción que silenciamos.
                releasePremute(false, "salto_abortado");
                return;
            }

            if (pauseFirst) {
                // Modo heredado, desactivado por defecto. La reanudación se
                // vigila hasta confirmarla (ver scheduleResumeWatchdog).
                mPauseHoldActive = true;
                mPauseHoldStartedUptimeMs = SystemClock.uptimeMillis();
                recordTelemetryEvent("pausa_previa", expectedKey, "pausar_antes_de_saltar");
                try { t.pause(); } catch (Throwable ignored) {}
                scheduleResumeWatchdog("tras_pausa");
            }

            try { t.skipToNext(); } catch (Throwable ignored) {}
            Log.i(TAG, "skip emitido key=" + expectedKey
                    + " posMs=" + obs.positionMs
                    + " latenciaMs=" + (SystemClock.uptimeMillis() - obs.uptimeMs));

            if (pauseFirst) {
                scheduleResumeWatchdog("tras_salto");
            }

            // Reintento: algunas versiones de Spotify ignoran el primer
            // skipToNext() si llega mientras se está cargando la pista.
            mHandler.postDelayed(() -> {
                Transport t2 = mTransport;
                if (t2 == null) {
                    releasePremute(false, "sin_transporte");
                    return;
                }
                if (expectedKey.equals(liveKey(t2)) && isSameGeneration(generation)) {
                    try { t2.skipToNext(); } catch (Throwable ignored) {}
                    Log.i(TAG, "skip reintentado key=" + expectedKey);
                }
                // El salto ya se ha materializado (o se ha reintentado): a
                // partir de aquí lo que suena es la pista siguiente, que abrirá
                // su propia sesión y su propio silenciado si procede.
                mHandler.postDelayed(
                        () -> releasePremuteIfGeneration(generation, false, "tras_salto"),
                        Math.max(0L, devUnmuteDelayMs(mContext))
                );
            }, SKIP_VERIFY_RETRY_DELAY_MS);
        });
    }

    /**
     * Reanuda tras «Pausar antes de saltar» y NO se fía de un solo intento.
     *
     * El fallo que dejaba la música parada a mitad de canción estaba aquí: se
     * reanudaba sólo `if (!isPlaying())`, y `isPlaying()` lee el último
     * PlaybackState PUBLICADO, no el real. Justo después de pedir la pausa ese
     * estado todavía dice PLAYING durante unos milisegundos, así que la guarda
     * daba por reanudado lo que seguía pausándose y no se volvía a mirar: la
     * pausa se quedaba puesta indefinidamente.
     *
     * Ahora la reanudación se reintenta hasta confirmar que suena, o hasta
     * agotar el plazo de seguridad. `play()` sobre algo que ya suena no hace
     * nada, de modo que insistir es inofensivo.
     */
    private void scheduleResumeWatchdog(String reason) {
        for (long delay : RESUME_RETRY_DELAYS_MS) {
            mHandler.postDelayed(() -> resumeSafely(reason), delay);
        }
    }

    private void resumeSafely(String reason) {
        if (!mPauseHoldActive) return;

        Transport t = mTransport;
        if (t == null) return;

        boolean playing;
        try {
            playing = t.isPlaying();
        } catch (Throwable ignored) {
            playing = false;
        }

        // Sólo se da por resuelto cuando el estado publicado dice que suena, y
        // nunca antes de que le haya dado tiempo a refrescarse.
        long heldMs = SystemClock.uptimeMillis() - mPauseHoldStartedUptimeMs;
        if (playing && heldMs >= PAUSE_STATE_SETTLE_MS) {
            mPauseHoldActive = false;
            recordTelemetryEvent("reanudado", "", reason);
            return;
        }

        if (heldMs > PAUSE_TO_SKIP_MAX_HOLD_MS) {
            // Vencido el plazo se deja de insistir, pero con un último intento:
            // quedarse pausado es peor que un play() de más.
            mPauseHoldActive = false;
            try { t.play(); } catch (Throwable ignored) {}
            recordTelemetryEvent("reanudado", "", reason + "_ultimo_intento");
            return;
        }

        try {
            t.play();
            Log.d(TAG, "reanudado (" + reason + ")");
        } catch (Throwable ignored) {
        }
    }

    private boolean isSameGeneration(long generation) {
        synchronized (mSessionLock) {
            return generation == mSessionGeneration;
        }
    }

    private static String liveKey(Transport t) {
        try {
            return keyOf(t.liveTrack(), t.liveArtist());
        } catch (Throwable ignored) {
            return "";
        }
    }

    // ── Sondas ────────────────────────────────────────────────────────────────

    /**
     * Relee el MediaSession pasado un retardo y vuelve a evaluar. Es lo que hace
     * que el sistema no dependa de cuándo Spotify decida refrescar su
     * notificación: el disparo lo controlamos nosotros.
     */
    private void scheduleProbe(long generation, long delayMs) {
        mHandler.postDelayed(() -> {
            if (!isDecisionPending(generation)) return;

            Transport t = mTransport;
            if (t == null) return;

            try {
                String track = t.liveTrack();
                String artist = t.liveArtist();
                if (keyOf(track, artist).isEmpty()) return;

                observe(new Observation(
                        track,
                        artist,
                        t.liveDurationMs(),
                        t.isPlaying(),
                        t.positionMs(),
                        "sonda"
                ));
            } catch (Throwable ignored) {
            }
        }, Math.max(0L, delayMs));
    }

    // ── Contadores diarios ────────────────────────────────────────────────────

    /** Día local en formato AAAAMMDD. Cambia exactamente a las 00:00. */
    private static int todayStamp() {
        Calendar c = Calendar.getInstance();
        return c.get(Calendar.YEAR) * 10000
                + (c.get(Calendar.MONTH) + 1) * 100
                + c.get(Calendar.DAY_OF_MONTH);
    }

    private void bumpDailyCounters(@Nullable Context ctx, boolean duplicate, boolean skipped) {
        SharedPreferences sp = prefs(ctx);
        if (sp == null) return;
        try {
            int today = todayStamp();
            int stored = sp.getInt(PREF_DAY_STAMP, 0);
            boolean mismoDia = stored == today;
            if (!mismoDia) {
                // Cambió el día: lo que había se guarda en el histórico antes de
                // ponerse a cero, que es lo que permite hablar de «esta semana».
                archiveDay(sp, stored, sp.getInt(PREF_DAY_DUPLICATES, 0), sp.getInt(PREF_DAY_SKIPPED, 0));
            }
            int duplicates = mismoDia ? sp.getInt(PREF_DAY_DUPLICATES, 0) : 0;
            int skips = mismoDia ? sp.getInt(PREF_DAY_SKIPPED, 0) : 0;

            if (duplicate) duplicates++;
            if (skipped) skips++;

            sp.edit()
                    .putInt(PREF_DAY_STAMP, today)
                    .putInt(PREF_DAY_DUPLICATES, duplicates)
                    .putInt(PREF_DAY_SKIPPED, skips)
                    .apply();
        } catch (Throwable ignored) {
            return;
        }
        // La notificación persistente muestra estos contadores.
        SkippifyForegroundService.refresh(ctx);
    }

    /**
     * Vuelca el día que se cierra en el histórico antes de reiniciar contadores.
     * Se llama con el sello y los totales del día ANTERIOR, nunca con los de hoy.
     */
    private static void archiveDay(SharedPreferences sp, int stamp, int duplicates, int skipped) {
        if (stamp <= 0 || (duplicates <= 0 && skipped <= 0)) return;
        try {
            String previo = sp.getString(PREF_DAY_HISTORY, "");
            StringBuilder sb = new StringBuilder();
            int guardados = 0;
            // Se reescribe sin el día que llega (por si ya estaba) y recortando
            // por el final, que es donde viven las entradas más antiguas.
            sb.append(stamp).append(':').append(duplicates).append(':').append(skipped);
            guardados++;
            if (previo != null && !previo.isEmpty()) {
                for (String trozo : previo.split(";")) {
                    if (trozo.isEmpty()) continue;
                    if (trozo.startsWith(stamp + ":")) continue;
                    if (guardados >= DAY_HISTORY_LIMIT) break;
                    sb.append(';').append(trozo);
                    guardados++;
                }
            }
            sp.edit().putString(PREF_DAY_HISTORY, sb.toString()).apply();
        } catch (Throwable ignored) {
        }
    }

    /**
     * Histórico diario en crudo, incluido el día en curso.
     * Formato: `AAAAMMDD:duplicadas:saltadas` separado por `;`, del más reciente
     * al más antiguo.
     */
    static String dailyHistory(@Nullable Context ctx) {
        SharedPreferences sp = prefs(ctx);
        if (sp == null) return "";
        try {
            String previo = sp.getString(PREF_DAY_HISTORY, "");
            int[] hoy = dailyStats(ctx);
            if (hoy[0] <= 0 && hoy[1] <= 0) return previo == null ? "" : previo;
            String cabeza = todayStamp() + ":" + hoy[0] + ":" + hoy[1];
            return (previo == null || previo.isEmpty()) ? cabeza : (cabeza + ";" + previo);
        } catch (Throwable ignored) {
            return "";
        }
    }

    /** {duplicadas, saltadas} de hoy. Devuelve ceros si el sello es de otro día. */
    static int[] dailyStats(@Nullable Context ctx) {
        SharedPreferences sp = prefs(ctx);
        if (sp == null) return new int[] { 0, 0 };
        try {
            if (sp.getInt(PREF_DAY_STAMP, 0) != todayStamp()) return new int[] { 0, 0 };
            return new int[] {
                    Math.max(0, sp.getInt(PREF_DAY_DUPLICATES, 0)),
                    Math.max(0, sp.getInt(PREF_DAY_SKIPPED, 0))
            };
        } catch (Throwable ignored) {
            return new int[] { 0, 0 };
        }
    }

    // ── Índice en memoria ─────────────────────────────────────────────────────

    private void indexPut(String key, long playedAtMs) {
        if (key == null || key.isEmpty() || playedAtMs <= 0L) return;
        synchronized (mIndexLock) {
            long[] slots = mIndex.get(key);
            if (slots == null) {
                slots = new long[INDEX_SLOTS];
                slots[0] = playedAtMs;
                mIndex.put(key, slots);
                return;
            }
            // Inserción ordenada descendente en un vector de 3 posiciones.
            for (int i = 0; i < INDEX_SLOTS; i++) {
                if (playedAtMs > slots[i]) {
                    for (int j = INDEX_SLOTS - 1; j > i; j--) slots[j] = slots[j - 1];
                    slots[i] = playedAtMs;
                    return;
                }
            }
        }
    }

    /**
     * ¿Hubo alguna escucha en [fromMs, toMs)? Guardar sólo las marcas más
     * recientes es suficiente: cualquier escucha dentro de la ventana sería más
     * reciente que las descartadas, así que ocuparía una de las posiciones.
     */
    private boolean indexHasPlayBetween(String key, long fromMs, long toMs) {
        if (toMs <= fromMs) return false;
        synchronized (mIndexLock) {
            long[] slots = mIndex.get(key);
            if (slots == null) return false;
            for (long ts : slots) {
                if (ts <= 0L) break;
                if (ts >= fromMs && ts < toMs) return true;
            }
        }
        return false;
    }

    private void loadIndexAsync() {
        if (mIndexReady || mIndexLoading) return;
        synchronized (mIndexLock) {
            if (mIndexReady || mIndexLoading) return;
            mIndexLoading = true;
        }

        Thread t = new Thread(() -> {
            long startedMs = SystemClock.uptimeMillis();
            int rows = 0;
            try {
                Context ctx = mContext;
                if (ctx != null) {
                    importLegacyHistoryIfNeeded(ctx);
                    rows = loadIndexFromDb();
                }
            } catch (Throwable e) {
                Log.w(TAG, "carga del índice fallida", e);
            } finally {
                mIndexLoadMs = SystemClock.uptimeMillis() - startedMs;
                mIndexReady = true;
                mIndexLoading = false;
                Log.i(TAG, "índice listo filas=" + rows + " ms=" + mIndexLoadMs);
            }
        }, "SkippifyDupIndex");
        t.setDaemon(true);
        t.start();
    }

    private int loadIndexFromDb() {
        Context ctx = mContext;
        if (ctx == null) return 0;

        DbHelper helper = dbHelper(ctx);
        if (helper == null) return 0;

        long horizonMs = System.currentTimeMillis() - INDEX_HORIZON_MS;
        int rows = 0;
        Cursor cursor = null;
        try {
            SQLiteDatabase db = helper.getWritableDatabase();
            if (db == null) return 0;

            // Poda de historial fuera de horizonte: mantiene la BD y el índice acotados.
            try {
                db.delete(TABLE, "played_at_epoch < ?", new String[] { String.valueOf(horizonMs) });
            } catch (Throwable ignored) {
            }

            cursor = db.rawQuery(
                    "SELECT track_key, played_at_epoch FROM " + TABLE
                            + " WHERE played_at_epoch >= ? ORDER BY played_at_epoch ASC",
                    new String[] { String.valueOf(horizonMs) }
            );
            while (cursor != null && cursor.moveToNext()) {
                indexPut(cursor.getString(0), cursor.getLong(1));
                rows++;
            }
        } catch (Throwable e) {
            mDbFailed = true;
            Log.w(TAG, "lectura del índice fallida", e);
        } finally {
            closeQuietly(cursor);
        }
        return rows;
    }

    // ── Persistencia ──────────────────────────────────────────────────────────

    private static final class DbHelper extends SQLiteOpenHelper {
        DbHelper(Context context) {
            super(context, DB_NAME, null, 2);
        }

        @Override
        public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE IF NOT EXISTS " + TABLE + " ("
                    + "id INTEGER PRIMARY KEY AUTOINCREMENT,"
                    + "track_key TEXT NOT NULL,"
                    + "track TEXT,"
                    + "artist TEXT,"
                    + "duration_ms INTEGER,"
                    + "played_at_epoch INTEGER NOT NULL,"
                    + "played_ms INTEGER"
                    + ")");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_dup_key_time ON " + TABLE
                    + "(track_key, played_at_epoch DESC)");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_dup_time ON " + TABLE
                    + "(played_at_epoch DESC)");
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            // El esquema anterior guardaba track/artista por separado; se
            // reconstruye desde los NDJSON, que siguen en disco.
            db.execSQL("DROP TABLE IF EXISTS " + TABLE);
            onCreate(db);
        }

        @Override
        public void onDowngrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            onUpgrade(db, oldVersion, newVersion);
        }
    }

    @Nullable
    private DbHelper dbHelper(@Nullable Context context) {
        if (context == null) return null;
        DbHelper helper = mDbHelper;
        if (helper != null) return helper;
        synchronized (this) {
            if (mDbHelper == null) {
                try {
                    mDbHelper = new DbHelper(context.getApplicationContext());
                } catch (Throwable e) {
                    mDbFailed = true;
                    Log.w(TAG, "no se pudo abrir la BD", e);
                }
            }
            return mDbHelper;
        }
    }

    private void insertRow(String key, String track, String artist,
                           long durationMs, long playedAtMs, long playedMs) {
        Context ctx = mContext;
        DbHelper helper = dbHelper(ctx);
        if (helper == null) return;
        try {
            SQLiteDatabase db = helper.getWritableDatabase();
            if (db == null) return;

            ContentValues values = new ContentValues();
            values.put("track_key", key);
            values.put("track", safeTrim(track));
            values.put("artist", safeTrim(artist));
            values.put("duration_ms", durationMs);
            values.put("played_at_epoch", playedAtMs);
            values.put("played_ms", playedMs);
            db.insert(TABLE, null, values);
        } catch (Throwable e) {
            mDbFailed = true;
            Log.w(TAG, "inserción fallida", e);
        }
    }

    /**
     * Importa una sola vez el historial NDJSON de versiones anteriores. Después
     * de esto los ficheros ya no se leen nunca en el camino de decisión.
     */
    private void importLegacyHistoryIfNeeded(Context ctx) {
        DbHelper helper = dbHelper(ctx);
        if (helper == null) return;

        File dir = ctx.getFilesDir();
        if (dir == null) return;

        Cursor cursor = null;
        try {
            SQLiteDatabase db = helper.getWritableDatabase();
            if (db == null) return;

            cursor = db.rawQuery("SELECT 1 FROM " + TABLE + " LIMIT 1", null);
            boolean hasRows = cursor != null && cursor.moveToFirst();
            closeQuietly(cursor);
            cursor = null;
            if (hasRows) return;

            int imported = 0;
            db.beginTransaction();
            try {
                for (String fileName : new String[] { LEGACY_DUP_FILE, LEGACY_EVENT_FILE }) {
                    File f = new File(dir, fileName);
                    if (!f.exists() || !f.isFile()) continue;
                    imported += importLegacyFile(db, f);
                }
                db.setTransactionSuccessful();
            } finally {
                try { db.endTransaction(); } catch (Throwable ignored) {}
            }
            Log.i(TAG, "historial heredado importado filas=" + imported);
        } catch (Throwable e) {
            Log.w(TAG, "importación del historial heredado fallida", e);
        } finally {
            closeQuietly(cursor);
        }
    }

    private int importLegacyFile(SQLiteDatabase db, File file) {
        int count = 0;
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                if (line.isEmpty()) continue;

                JSONObject o;
                try {
                    o = new JSONObject(line);
                } catch (Throwable ignored) {
                    continue;
                }

                if (!"playing".equalsIgnoreCase(safeTrim(o.optString("event", "")))) continue;

                String track = o.optString("track", "");
                String artist = o.optString("artist", "");
                String key = keyOf(track, artist);
                if (key.isEmpty()) continue;

                long playedAtMs = parseIso8601(o.optString("played_at", ""));
                if (playedAtMs <= 0L) continue;

                ContentValues values = new ContentValues();
                values.put("track_key", key);
                values.put("track", safeTrim(track));
                values.put("artist", safeTrim(artist));
                values.put("duration_ms", o.optLong("duration_ms", 0L));
                values.put("played_at_epoch", playedAtMs);
                values.put("played_ms", o.optLong("ms_played", 0L));
                db.insert(TABLE, null, values);
                count++;
            }
        } catch (Throwable ignored) {
        }
        return count;
    }

    // ── Telemetría para la pestaña «Calibración» ──────────────────────────────

    private void recordTelemetry(Observation obs, String key, String reason,
                                 boolean skipped, long sessionAgeMs, long lookupNs) {
        if (!devTelemetry(mContext)) return;
        // Las observaciones sin nada que decidir generarían muchísimo ruido.
        if ("ya_decidido".equals(reason) || "pausado".equals(reason)) return;

        try {
            JSONObject o = new JSONObject();
            o.put("at", System.currentTimeMillis());
            o.put("track", obs.track);
            o.put("artist", obs.artist);
            o.put("key", key);
            o.put("action", skipped ? "saltada" : "conservada");
            o.put("reason", reason);
            o.put("source", obs.source);
            o.put("positionMs", obs.positionMs);
            o.put("sessionAgeMs", sessionAgeMs);
            o.put("lookupUs", lookupNs / 1000L);
            o.put("indexReady", mIndexReady);
            pushTelemetry(o);
        } catch (Throwable ignored) {
        }
    }

    private void recordTelemetryEvent(String action, String key, String reason) {
        if (!devTelemetry(mContext)) return;
        try {
            JSONObject o = new JSONObject();
            o.put("at", System.currentTimeMillis());
            o.put("key", key);
            o.put("action", action);
            o.put("reason", reason);
            o.put("source", "transporte");
            pushTelemetry(o);
        } catch (Throwable ignored) {
        }
    }

    private void pushTelemetry(JSONObject o) {
        synchronized (mTelemetryLock) {
            mTelemetry.addFirst(o);
            while (mTelemetry.size() > TELEMETRY_MAX) mTelemetry.removeLast();
        }
    }

    /** Instantánea de estado + últimas decisiones, para la pestaña «Calibración». */
    JSONObject diagnostics() {
        JSONObject out = new JSONObject();
        try {
            Context ctx = mContext;
            int indexSize;
            synchronized (mIndexLock) {
                indexSize = mIndex.size();
            }

            out.put("indexReady", mIndexReady);
            out.put("indexSize", indexSize);
            out.put("indexLoadMs", mIndexLoadMs);
            out.put("dbFailed", mDbFailed);
            out.put("skipCount", mSkipCount);
            out.put("commitCount", mCommitCount);
            out.put("attached", mTransport != null);

            int[] daily = dailyStats(ctx);
            JSONObject today = new JSONObject();
            today.put("duplicates", daily[0]);
            today.put("skipped", daily[1]);
            out.put("today", today);

            synchronized (mSessionLock) {
                JSONObject session = new JSONObject();
                session.put("key", mSessionKey);
                session.put("track", mSessionTrack);
                session.put("artist", mSessionArtist);
                session.put("decided", mSessionDecided);
                session.put("committed", mSessionCommitted);
                session.put("muted", mPremuteActive);
                session.put("playedMs", playedMsLocked(SystemClock.uptimeMillis()));
                session.put("requiredMs", requiredPlayMs(mSessionDurationMs));
                out.put("session", session);
            }

            JSONObject cfg = new JSONObject();
            cfg.put("skipDuplicates", isSkipEnabled(ctx));
            cfg.put("interval", skipInterval(ctx));
            cfg.put("decisionWindowMs", devDecisionWindowMs(ctx));
            cfg.put("minStableMs", devMinStableMs(ctx));
            cfg.put("pauseToSkip", devPauseToSkip(ctx));
            cfg.put("telemetry", devTelemetry(ctx));
            cfg.put("premute", devPremute(ctx));
            cfg.put("premuteMaxMs", devPremuteMaxMs(ctx));
            cfg.put("restartOnKeep", devRestartOnKeep(ctx));
            cfg.put("unmuteDelayMs", devUnmuteDelayMs(ctx));
            out.put("config", cfg);

            JSONArray log = new JSONArray();
            synchronized (mTelemetryLock) {
                for (JSONObject entry : mTelemetry) log.put(entry);
            }
            out.put("log", log);
        } catch (Throwable ignored) {
        }
        return out;
    }

    void clearTelemetry() {
        synchronized (mTelemetryLock) {
            mTelemetry.clear();
        }
    }

    /** Borra todo el historial de duplicadas (BD + índice). Acción destructiva. */
    /** Una escucha venida de un respaldo, sin más datos que los imprescindibles. */
    static final class ImportedPlay {
        final String track;
        final String artist;
        final long playedAtMs;
        final long durationMs;

        ImportedPlay(String track, String artist, long playedAtMs, long durationMs) {
            this.track = track;
            this.artist = artist;
            this.playedAtMs = playedAtMs;
            this.durationMs = durationMs;
        }
    }

    /**
     * Siembra el historial con escuchas restauradas desde un respaldo.
     *
     * Las canciones importadas vivían sólo en el almacén de JavaScript, mientras
     * que la decisión de saltar se toma contra esta base de datos. Por eso una
     * canción reimportada no se saltaba nunca: aparecía en las estadísticas como
     * escuchada, pero para el motor no existía.
     *
     * NO se filtra por tiempo reproducido, a propósito. Una escucha sólo llega a
     * anotarse si superó `requiredPlayMs()` en su momento, así que estar en el
     * respaldo ya es prueba de que pasó el umbral; volver a exigirlo aquí
     * descartaría escuchas legítimas cuyo `ms_played` no se conservó.
     *
     * @return cuántas filas nuevas se han anotado.
     */
    int importPlays(@Nullable java.util.List<ImportedPlay> plays) {
        if (plays == null || plays.isEmpty()) return 0;

        Context ctx = mContext;
        DbHelper helper = dbHelper(ctx);
        if (helper == null) return 0;

        final long now = System.currentTimeMillis();
        final long oldest = now - INDEX_HORIZON_MS;
        // Un margen de un día absorbe relojes desajustados sin colar futuros absurdos.
        final long newest = now + 86_400_000L;
        int inserted = 0;

        try {
            SQLiteDatabase db = helper.getWritableDatabase();
            if (db == null) return 0;

            // Una transacción para todo: importar miles de filas sueltas tarda
            // segundos, y aquí el usuario está esperando delante de la pantalla.
            db.beginTransaction();
            try {
                for (ImportedPlay play : plays) {
                    if (play == null) continue;

                    String key = keyOf(play.track, play.artist);
                    if (key.isEmpty()) continue;
                    if (play.playedAtMs <= 0L || play.playedAtMs < oldest || play.playedAtMs > newest) continue;
                    // Reimportar el mismo respaldo dos veces no debe duplicar nada.
                    if (playAlreadyStored(db, key, play.playedAtMs)) continue;

                    ContentValues values = new ContentValues();
                    values.put("track_key", key);
                    values.put("track", safeTrim(play.track));
                    values.put("artist", safeTrim(play.artist));
                    values.put("duration_ms", Math.max(0L, play.durationMs));
                    values.put("played_at_epoch", play.playedAtMs);
                    // -1 distingue lo importado de lo medido en el propio móvil.
                    values.put("played_ms", -1L);
                    db.insert(TABLE, null, values);

                    indexPut(key, play.playedAtMs);
                    inserted++;
                }
                db.setTransactionSuccessful();
            } finally {
                db.endTransaction();
            }
        } catch (Throwable e) {
            mDbFailed = true;
            Log.w(TAG, "importación de historial fallida", e);
            return inserted;
        }

        Log.i(TAG, "historial importado filas=" + inserted + " de " + plays.size());
        return inserted;
    }

    /** ¿Está ya anotada esa escucha exacta? El índice de la tabla lo hace barato. */
    private boolean playAlreadyStored(SQLiteDatabase db, String key, long playedAtMs) {
        Cursor c = null;
        try {
            c = db.query(TABLE, new String[]{ "id" },
                    "track_key=? AND played_at_epoch=?",
                    new String[]{ key, Long.toString(playedAtMs) },
                    null, null, null, "1");
            return c != null && c.moveToFirst();
        } catch (Throwable ignored) {
            // Ante la duda se inserta: una fila repetida no cambia la decisión,
            // pero perder una escucha sí dejaría de saltar una duplicada.
            return false;
        } finally {
            if (c != null) {
                try { c.close(); } catch (Throwable ignored) { }
            }
        }
    }

    void resetHistory() {
        synchronized (mIndexLock) {
            mIndex.clear();
        }
        mWriter.execute(() -> {
            try {
                DbHelper helper = dbHelper(mContext);
                if (helper == null) return;
                SQLiteDatabase db = helper.getWritableDatabase();
                if (db != null) db.delete(TABLE, null, null);
                Log.i(TAG, "historial de duplicadas borrado");
            } catch (Throwable e) {
                Log.w(TAG, "borrado del historial fallido", e);
            }
        });
    }

    // ── Configuración ─────────────────────────────────────────────────────────

    @Nullable
    private static SharedPreferences prefs(@Nullable Context ctx) {
        if (ctx == null) return null;
        try {
            return ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static boolean isSkipEnabled(@Nullable Context ctx) {
        SharedPreferences sp = prefs(ctx);
        return sp == null || sp.getBoolean(PREF_SKIP_DUPLICATES, true);
    }

    private static String skipInterval(@Nullable Context ctx) {
        SharedPreferences sp = prefs(ctx);
        if (sp == null) return "1w";
        String raw = safeTrim(sp.getString(PREF_SKIP_INTERVAL, "1w")).toLowerCase(Locale.ROOT);
        return raw.isEmpty() ? "1w" : raw;
    }

    static int devDecisionWindowMs(@Nullable Context ctx) {
        SharedPreferences sp = prefs(ctx);
        if (sp == null) return DEF_DECISION_WINDOW_MS;
        return clamp(sp.getInt(PREF_DEV_DECISION_WINDOW_MS, DEF_DECISION_WINDOW_MS), 1000, 30_000);
    }

    static int devMinStableMs(@Nullable Context ctx) {
        SharedPreferences sp = prefs(ctx);
        if (sp == null) return DEF_MIN_STABLE_MS;
        return clamp(sp.getInt(PREF_DEV_MIN_STABLE_MS, DEF_MIN_STABLE_MS), 0, 5000);
    }

    static boolean devPauseToSkip(@Nullable Context ctx) {
        SharedPreferences sp = prefs(ctx);
        return sp == null ? DEF_PAUSE_TO_SKIP
                : sp.getBoolean(PREF_DEV_PAUSE_TO_SKIP, DEF_PAUSE_TO_SKIP);
    }

    static boolean devTelemetry(@Nullable Context ctx) {
        SharedPreferences sp = prefs(ctx);
        return sp == null ? DEF_TELEMETRY : sp.getBoolean(PREF_DEV_TELEMETRY, DEF_TELEMETRY);
    }

    static boolean devPremute(@Nullable Context ctx) {
        SharedPreferences sp = prefs(ctx);
        return sp == null ? DEF_PREMUTE : sp.getBoolean(PREF_DEV_PREMUTE, DEF_PREMUTE);
    }

    static int devPremuteMaxMs(@Nullable Context ctx) {
        SharedPreferences sp = prefs(ctx);
        if (sp == null) return DEF_PREMUTE_MAX_MS;
        return clamp(sp.getInt(PREF_DEV_PREMUTE_MAX_MS, DEF_PREMUTE_MAX_MS), 500, 8000);
    }

    static boolean devRestartOnKeep(@Nullable Context ctx) {
        SharedPreferences sp = prefs(ctx);
        return sp == null ? DEF_RESTART_ON_KEEP
                : sp.getBoolean(PREF_DEV_RESTART_ON_KEEP, DEF_RESTART_ON_KEEP);
    }

    static int devUnmuteDelayMs(@Nullable Context ctx) {
        SharedPreferences sp = prefs(ctx);
        if (sp == null) return DEF_UNMUTE_DELAY_MS;
        return clamp(sp.getInt(PREF_DEV_UNMUTE_DELAY_MS, DEF_UNMUTE_DELAY_MS), 0, 2000);
    }

    static void setDevConfig(@Nullable Context ctx, @Nullable Integer decisionWindowMs,
                             @Nullable Integer minStableMs, @Nullable Boolean pauseToSkip,
                             @Nullable Boolean telemetry, @Nullable Boolean premute,
                             @Nullable Integer premuteMaxMs, @Nullable Boolean restartOnKeep,
                             @Nullable Integer unmuteDelayMs) {
        SharedPreferences sp = prefs(ctx);
        if (sp == null) return;
        SharedPreferences.Editor e = sp.edit();
        if (decisionWindowMs != null) e.putInt(PREF_DEV_DECISION_WINDOW_MS, clamp(decisionWindowMs, 1000, 30_000));
        if (minStableMs != null) e.putInt(PREF_DEV_MIN_STABLE_MS, clamp(minStableMs, 0, 5000));
        if (pauseToSkip != null) e.putBoolean(PREF_DEV_PAUSE_TO_SKIP, pauseToSkip);
        if (telemetry != null) e.putBoolean(PREF_DEV_TELEMETRY, telemetry);
        if (premute != null) e.putBoolean(PREF_DEV_PREMUTE, premute);
        if (premuteMaxMs != null) e.putInt(PREF_DEV_PREMUTE_MAX_MS, clamp(premuteMaxMs, 500, 8000));
        if (restartOnKeep != null) e.putBoolean(PREF_DEV_RESTART_ON_KEEP, restartOnKeep);
        if (unmuteDelayMs != null) e.putInt(PREF_DEV_UNMUTE_DELAY_MS, clamp(unmuteDelayMs, 0, 2000));
        e.apply();

        // Apagar el silenciado en caliente no debe dejar el móvil mudo.
        if (premute != null && !premute) {
            INSTANCE.releasePremute(false, "premute_desactivado");
        }
    }

    static void resetDevConfig(@Nullable Context ctx) {
        SharedPreferences sp = prefs(ctx);
        if (sp == null) return;
        sp.edit()
                .remove(PREF_DEV_DECISION_WINDOW_MS)
                .remove(PREF_DEV_MIN_STABLE_MS)
                .remove(PREF_DEV_PAUSE_TO_SKIP)
                .remove(PREF_DEV_TELEMETRY)
                .remove(PREF_DEV_PREMUTE)
                .remove(PREF_DEV_PREMUTE_MAX_MS)
                .remove(PREF_DEV_RESTART_ON_KEEP)
                .remove(PREF_DEV_UNMUTE_DELAY_MS)
                .apply();
    }

    private static int clamp(int value, int min, int max) {
        return value < min ? min : (value > max ? max : value);
    }

    // ── Normalización de claves ───────────────────────────────────────────────

    /** Clave canónica de una reproducción: canción + artista principal. */
    static String keyOf(@Nullable String track, @Nullable String artist) {
        String t = canonicalTrackTitle(track);
        String a = primaryArtistKey(artist);
        if (t.isEmpty() || a.isEmpty()) return "";
        return t + "|" + a;
    }

    static String canonicalTrackTitle(@Nullable String raw) {
        String track = normalizeForMatch(raw);
        if (track.isEmpty()) return "";

        track = track
                .replaceAll("\\b(feat|featuring|ft)\\b.*$", "")
                .replaceAll("\\b(remaster|remastered)(\\s+\\d{2,4})?$", "")
                .replaceAll("\\b(live|mono|stereo|instrumental|acoustic|karaoke|commentary)$", "")
                .replaceAll("\\b(radio edit|edit|mix|version)$", "")
                .trim();

        return track.replaceAll("\\s+", " ").trim();
    }

    static String primaryArtistKey(@Nullable String raw) {
        // El corte por separadores se hace ANTES de normalizar: normalizeForMatch
        // convierte "," "&" ";" en espacios, así que después ya no casarían.
        String artist = safeTrim(raw);
        if (artist.isEmpty()) return "";

        String lower = artist.toLowerCase(Locale.ROOT);
        int cut = -1;
        for (String sep : new String[] { ",", "&", ";", " feat", " ft.", " ft ", " con " }) {
            int idx = lower.indexOf(sep);
            if (idx > 0 && (cut < 0 || idx < cut)) cut = idx;
        }
        if (cut > 0) artist = artist.substring(0, cut);

        String normalized = normalizeForMatch(artist);
        if (normalized.isEmpty()) return "";

        String primary = normalized.split("\\b(?:and|with|x|y)\\b", 2)[0].trim();
        // Un nombre que EMPIEZA por un conector ("Y La Bamba") dejaba la clave
        // vacía y dos artistas distintos colisionaban ⇒ falsos positivos.
        return primary.isEmpty() ? normalized : primary;
    }

    static String normalizeForMatch(@Nullable String raw) {
        String text = safeTrim(raw);
        if (text.isEmpty()) return "";

        text = Normalizer.normalize(text, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^\\p{Alnum}]+", " ")
                .trim();

        return text.replaceAll("\\s+", " ");
    }

    static long parseIntervalMs(@Nullable String intervalRaw) {
        String interval = safeTrim(intervalRaw).toLowerCase(Locale.ROOT);
        if (interval.isEmpty()) return 7L * 86_400_000L;

        int n = 1;
        try {
            String num = interval.replaceAll("[^0-9]", "");
            if (!num.isEmpty()) n = Math.max(1, Integer.parseInt(num));
        } catch (Throwable ignored) {
            n = 1;
        }

        if (interval.endsWith("h")) return n * 3_600_000L;
        if (interval.endsWith("d")) return n * 86_400_000L;
        if (interval.endsWith("w")) return n * 7L * 86_400_000L;
        if (interval.endsWith("m")) return n * 30L * 86_400_000L;
        if (interval.endsWith("y")) return n * 365L * 86_400_000L;
        return 7L * 86_400_000L;
    }

    private static long parseIso8601(@Nullable String iso) {
        return SpotifyNotificationListener.fromIso8601Ms(iso);
    }

    private static void closeQuietly(@Nullable Cursor cursor) {
        if (cursor == null) return;
        try {
            cursor.close();
        } catch (Throwable ignored) {
        }
    }

    private static String safeTrim(@Nullable String s) {
        return s == null ? "" : s.trim();
    }
}
