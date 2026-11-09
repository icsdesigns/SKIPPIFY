package com.skippify.app;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.util.Log;

import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Registro persistente de cada reproducción que ve el motor de duplicadas.
 *
 * El historial de duplicadas (`duplicate_plays`) sólo guarda las escuchas que
 * superaron el umbral, y la telemetría de la pestaña «Calibración» vive en
 * memoria y se pierde con el proceso. Ninguna de las dos permite responder a
 * «¿por qué esta canción no se saltó?», porque no recuerdan qué criterios y
 * qué ajustes de calibrado estaban activos en ese momento. Aquí se guarda UNA
 * fila por reproducción con la decisión, su motivo y esa configuración.
 *
 * Vive en una base de datos propia, no en la del historial: subir la versión de
 * aquélla dispararía su `onUpgrade`, que la borra entera.
 *
 * Versión 2: cada fila lleva además la medición de fundido (FundidoDetector) y
 * el id de la «sesión de escucha» a la que pertenece, y hay una tabla nueva,
 * `listening_sessions`, con esas sesiones y la respuesta del usuario a «¿has
 * estado escuchando con fundido?». Las bases de la versión 1 se amplían con
 * ALTER TABLE ADD COLUMN, sin borrar nada.
 */
final class PlayLogStore {

    private static final String TAG = "SkippifyPlayLog";
    private static final String DB_NAME = "skippify-play-log.db";
    private static final String TABLE = "play_log";
    private static final String SESSIONS = "listening_sessions";
    private static final int DB_VERSION = 2;

    /** Antigüedad máxima conservada. */
    private static final long RETENTION_MS = 400L * 86_400_000L;
    /** Tope de filas: más allá se descartan las más antiguas. */
    private static final int MAX_ROWS = 60_000;
    /** Cada cuántas inserciones se aplica la poda. */
    private static final int PRUNE_EVERY = 200;

    /** Una reproducción ya cerrada, lista para anotarse. */
    static final class Entry {
        long startedAtMs;
        long endedAtMs;
        String track = "";
        String artist = "";
        String key = "";
        long durationMs;
        long playedMs;
        boolean committed;
        /** `saltada`, `conservada` o `sin_decidir`. */
        String decision = "sin_decidir";
        String reason = "";
        /** ¿Coincidía con una escucha previa dentro del intervalo? (aunque no se saltara) */
        boolean duplicateSeen;
        /** Marca de la escucha previa que la delató, 0 si no hubo. */
        long matchedPreviousAtMs;
        long positionMs = -1L;
        long sessionAgeMs = -1L;
        String source = "";
        boolean indexReady;
        boolean skipEnabled;
        String interval = "";
        String mode = "";
        String configJson = "";
        /** Medición de fundido; null si no se midió (función apagada o fila antigua). */
        String fundidoLabel;
        double fundidoConfidence;
        Long fundidoOverlapMs;
        Long fundidoPrevRemainingMs;
        Long fundidoFirstPosMs;
        String fundidoReason;
        /** Id de la sesión de escucha de esta fila, 0 si no pertenece a ninguna. */
        long listeningSessionId;
    }

    /** Una sesión de escucha guardada. */
    static final class SessionRow {
        long id;
        long startedAtMs;
        long endedAtMs;
        long activeMs;
        int songs;
    }

    private static final class Helper extends SQLiteOpenHelper {
        Helper(Context context) {
            super(context, DB_NAME, null, DB_VERSION);
        }

        @Override
        public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE IF NOT EXISTS " + TABLE + " ("
                    + "id INTEGER PRIMARY KEY AUTOINCREMENT,"
                    + "started_at INTEGER NOT NULL,"
                    + "ended_at INTEGER,"
                    + "track TEXT,"
                    + "artist TEXT,"
                    + "track_key TEXT,"
                    + "duration_ms INTEGER,"
                    + "played_ms INTEGER,"
                    + "committed INTEGER,"
                    + "decision TEXT,"
                    + "reason TEXT,"
                    + "duplicate_seen INTEGER,"
                    + "matched_previous_at INTEGER,"
                    + "position_ms INTEGER,"
                    + "session_age_ms INTEGER,"
                    + "source TEXT,"
                    + "index_ready INTEGER,"
                    + "skip_enabled INTEGER,"
                    + "skip_interval TEXT,"
                    + "listening_mode TEXT,"
                    + "config TEXT,"
                    + "fundido_label TEXT,"
                    + "fundido_conf REAL,"
                    + "fundido_overlap_ms INTEGER,"
                    + "fundido_prev_remaining_ms INTEGER,"
                    + "fundido_first_pos_ms INTEGER,"
                    + "fundido_reason TEXT,"
                    + "listening_session_id INTEGER"
                    + ")");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_log_started ON " + TABLE + "(started_at)");
            createSessions(db);
        }

        private void createSessions(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE IF NOT EXISTS " + SESSIONS + " ("
                    + "id INTEGER PRIMARY KEY AUTOINCREMENT,"
                    + "started_at INTEGER NOT NULL,"
                    + "ended_at INTEGER,"
                    + "active_ms INTEGER,"
                    + "songs INTEGER,"
                    // 'si', 'no' o NULL (sin responder).
                    + "answer TEXT,"
                    + "answered_at INTEGER,"
                    // 0 mientras la sesión sigue abierta.
                    + "closed INTEGER NOT NULL DEFAULT 0,"
                    // 1 si ya se lanzó la notificación: un solo aviso por sesión.
                    + "notified INTEGER NOT NULL DEFAULT 0"
                    + ")");
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            // Sólo ALTER TABLE ADD COLUMN, nunca DROP: aquí se guardan datos que
            // no se pueden reconstruir.
            if (oldVersion < 2) {
                String[] cols = {
                        "fundido_label TEXT",
                        "fundido_conf REAL",
                        "fundido_overlap_ms INTEGER",
                        "fundido_prev_remaining_ms INTEGER",
                        "fundido_first_pos_ms INTEGER",
                        "fundido_reason TEXT",
                        "listening_session_id INTEGER"
                };
                for (String col : cols) {
                    try {
                        db.execSQL("ALTER TABLE " + TABLE + " ADD COLUMN " + col);
                    } catch (Throwable t) {
                        // Columna ya existente (actualización a medias): se sigue.
                        Log.w(TAG, "no se pudo añadir " + col, t);
                    }
                }
                createSessions(db);
            }
        }
    }

    private static volatile Helper sHelper;
    private static int sInsertsSincePrune = 0;

    private PlayLogStore() {}

    @Nullable
    private static Helper helper(@Nullable Context ctx) {
        if (ctx == null) return null;
        Helper h = sHelper;
        if (h != null) return h;
        synchronized (PlayLogStore.class) {
            if (sHelper == null) {
                try {
                    sHelper = new Helper(ctx.getApplicationContext());
                } catch (Throwable e) {
                    Log.w(TAG, "no se pudo abrir el registro", e);
                }
            }
            return sHelper;
        }
    }

    /** Anota una reproducción. Debe llamarse fuera del hilo principal. */
    static void insert(@Nullable Context ctx, Entry e) {
        Helper h = helper(ctx);
        if (h == null || e == null) return;
        try {
            SQLiteDatabase db = h.getWritableDatabase();
            if (db == null) return;

            ContentValues v = new ContentValues();
            v.put("started_at", e.startedAtMs);
            v.put("ended_at", e.endedAtMs);
            v.put("track", e.track);
            v.put("artist", e.artist);
            v.put("track_key", e.key);
            v.put("duration_ms", e.durationMs);
            v.put("played_ms", e.playedMs);
            v.put("committed", e.committed ? 1 : 0);
            v.put("decision", e.decision);
            v.put("reason", e.reason);
            v.put("duplicate_seen", e.duplicateSeen ? 1 : 0);
            v.put("matched_previous_at", e.matchedPreviousAtMs);
            v.put("position_ms", e.positionMs);
            v.put("session_age_ms", e.sessionAgeMs);
            v.put("source", e.source);
            v.put("index_ready", e.indexReady ? 1 : 0);
            v.put("skip_enabled", e.skipEnabled ? 1 : 0);
            v.put("skip_interval", e.interval);
            v.put("listening_mode", e.mode);
            v.put("config", e.configJson);
            if (e.fundidoLabel == null) {
                v.putNull("fundido_label");
                v.putNull("fundido_conf");
            } else {
                v.put("fundido_label", e.fundidoLabel);
                v.put("fundido_conf", e.fundidoConfidence);
            }
            putLong(v, "fundido_overlap_ms", e.fundidoOverlapMs);
            putLong(v, "fundido_prev_remaining_ms", e.fundidoPrevRemainingMs);
            putLong(v, "fundido_first_pos_ms", e.fundidoFirstPosMs);
            if (e.fundidoReason == null) v.putNull("fundido_reason");
            else v.put("fundido_reason", e.fundidoReason);
            if (e.listeningSessionId > 0L) v.put("listening_session_id", e.listeningSessionId);
            else v.putNull("listening_session_id");
            db.insert(TABLE, null, v);

            if (++sInsertsSincePrune >= PRUNE_EVERY) {
                sInsertsSincePrune = 0;
                prune(db);
            }
        } catch (Throwable t) {
            Log.w(TAG, "inserción fallida", t);
        }
    }

    private static void putLong(ContentValues v, String col, @Nullable Long value) {
        if (value == null) v.putNull(col);
        else v.put(col, value);
    }

    private static void prune(SQLiteDatabase db) {
        try {
            db.delete(TABLE, "started_at < ?",
                    new String[] { String.valueOf(System.currentTimeMillis() - RETENTION_MS) });
            db.execSQL("DELETE FROM " + TABLE + " WHERE id <= (SELECT MAX(id) FROM " + TABLE
                    + ") - " + MAX_ROWS);
            db.delete(SESSIONS, "closed = 1 AND started_at < ?",
                    new String[] { String.valueOf(System.currentTimeMillis() - RETENTION_MS) });
        } catch (Throwable ignored) {
        }
    }

    /**
     * Escuchas «de verdad» (cerradas y contadas, no saltadas al vuelo) de una
     * canción desde una marca de tiempo. La clave es la canónica del motor
     * ({@link DuplicateSkipEngine#keyOf}). Para las macros «tras N escuchas».
     */
    static int countCommitted(@Nullable Context ctx, @Nullable String key, long sinceMs) {
        if (key == null || key.isEmpty()) return 0;
        Helper h = helper(ctx);
        if (h == null) return 0;
        Cursor c = null;
        try {
            c = h.getReadableDatabase().rawQuery(
                    "SELECT COUNT(*) FROM " + TABLE
                            + " WHERE track_key = ? AND committed = 1 AND started_at >= ?",
                    new String[] { key, String.valueOf(sinceMs) });
            return c != null && c.moveToFirst() ? c.getInt(0) : 0;
        } catch (Throwable t) {
            return 0;
        } finally {
            if (c != null) c.close();
        }
    }

    static int count(@Nullable Context ctx) {
        Helper h = helper(ctx);
        if (h == null) return 0;
        Cursor c = null;
        try {
            c = h.getReadableDatabase().rawQuery("SELECT COUNT(*) FROM " + TABLE, null);
            return c != null && c.moveToFirst() ? c.getInt(0) : 0;
        } catch (Throwable t) {
            return 0;
        } finally {
            if (c != null) c.close();
        }
    }

    /** Una página de filas, de la más antigua a la más reciente. */
    static JSONArray page(@Nullable Context ctx, int offset, int limit) {
        JSONArray out = new JSONArray();
        Helper h = helper(ctx);
        if (h == null) return out;
        Cursor c = null;
        try {
            c = h.getReadableDatabase().rawQuery(
                    "SELECT p.started_at, p.ended_at, p.track, p.artist, p.duration_ms, p.played_ms,"
                            + " p.committed, p.decision, p.reason, p.duplicate_seen, p.matched_previous_at,"
                            + " p.position_ms, p.session_age_ms, p.source, p.index_ready, p.skip_enabled,"
                            + " p.skip_interval, p.listening_mode, p.config,"
                            + " p.fundido_label, p.fundido_conf, p.fundido_overlap_ms,"
                            + " p.fundido_prev_remaining_ms, p.fundido_first_pos_ms, p.fundido_reason,"
                            + " p.listening_session_id, s.answer"
                            + " FROM " + TABLE + " p LEFT JOIN " + SESSIONS + " s"
                            + " ON s.id = p.listening_session_id"
                            + " ORDER BY p.id ASC LIMIT ? OFFSET ?",
                    new String[] { String.valueOf(Math.max(1, limit)), String.valueOf(Math.max(0, offset)) });
            while (c != null && c.moveToNext()) {
                JSONObject o = new JSONObject();
                o.put("startedAt", c.getLong(0));
                o.put("endedAt", c.getLong(1));
                o.put("track", c.getString(2));
                o.put("artist", c.getString(3));
                o.put("durationMs", c.getLong(4));
                o.put("playedMs", c.getLong(5));
                o.put("counted", c.getInt(6) == 1);
                o.put("decision", c.getString(7));
                o.put("reason", c.getString(8));
                o.put("duplicateDetected", c.getInt(9) == 1);
                o.put("matchedPreviousAt", c.getLong(10));
                o.put("positionAtDecisionMs", c.getLong(11));
                o.put("sessionAgeAtDecisionMs", c.getLong(12));
                o.put("source", c.getString(13));
                o.put("indexReady", c.getInt(14) == 1);
                o.put("skipEnabled", c.getInt(15) == 1);
                o.put("skipInterval", c.getString(16));
                o.put("listeningMode", c.getString(17));
                String cfg = c.getString(18);
                try {
                    o.put("calibration", cfg == null || cfg.isEmpty() ? JSONObject.NULL : new JSONObject(cfg));
                } catch (Throwable ignored) {
                    o.put("calibration", JSONObject.NULL);
                }

                // Medición de fundido frente a lo que respondió el usuario. Las
                // filas anteriores a la versión 2 no tienen medición: null.
                if (c.isNull(19)) {
                    o.put("fundido", JSONObject.NULL);
                } else {
                    JSONObject f = new JSONObject();
                    f.put("detectado", c.getString(19));
                    f.put("confianza", c.isNull(20) ? JSONObject.NULL : c.getDouble(20));
                    f.put("solapeMs", c.isNull(21) ? JSONObject.NULL : c.getLong(21));
                    f.put("restanteAnteriorMs", c.isNull(22) ? JSONObject.NULL : c.getLong(22));
                    f.put("posicionPrimeraVistaMs", c.isNull(23) ? JSONObject.NULL : c.getLong(23));
                    f.put("motivo", c.isNull(24) ? JSONObject.NULL : c.getString(24));
                    f.put("sesionEscuchaId", c.isNull(25) ? JSONObject.NULL : c.getLong(25));
                    String ans = c.isNull(26) ? null : c.getString(26);
                    if ("si".equals(ans)) f.put("respuestaUsuario", true);
                    else if ("no".equals(ans)) f.put("respuestaUsuario", false);
                    else f.put("respuestaUsuario", JSONObject.NULL);
                    o.put("fundido", f);
                }
                out.put(o);
            }
        } catch (Throwable t) {
            Log.w(TAG, "lectura del registro fallida", t);
        } finally {
            if (c != null) c.close();
        }
        return out;
    }

    // ── Sesiones de escucha ───────────────────────────────────────────────────

    /** Abre una sesión y devuelve su id, o 0 si no se pudo. */
    static long sessionOpen(@Nullable Context ctx, long startedAtMs) {
        Helper h = helper(ctx);
        if (h == null) return 0L;
        try {
            ContentValues v = new ContentValues();
            v.put("started_at", startedAtMs);
            v.put("ended_at", startedAtMs);
            v.put("active_ms", 0L);
            v.put("songs", 0);
            v.put("closed", 0);
            v.put("notified", 0);
            long id = h.getWritableDatabase().insert(SESSIONS, null, v);
            return Math.max(0L, id);
        } catch (Throwable t) {
            Log.w(TAG, "no se pudo abrir la sesión de escucha", t);
            return 0L;
        }
    }

    /** Actualiza los acumulados de una sesión abierta. */
    static void sessionSave(@Nullable Context ctx, long id, long endedAtMs, long activeMs, int songs) {
        Helper h = helper(ctx);
        if (h == null || id <= 0L) return;
        try {
            ContentValues v = new ContentValues();
            v.put("ended_at", endedAtMs);
            v.put("active_ms", activeMs);
            v.put("songs", songs);
            h.getWritableDatabase().update(SESSIONS, v, "id = ? AND closed = 0",
                    new String[] { String.valueOf(id) });
        } catch (Throwable t) {
            Log.w(TAG, "no se pudo guardar la sesión de escucha", t);
        }
    }

    /**
     * Cierra una sesión. Devuelve true sólo si ESTA llamada la cerró y hay que
     * avisar: la condición `closed = 0` hace que, aunque se llame dos veces
     * (carrera entre el temporizador y el arranque), el aviso salga una vez.
     */
    static boolean sessionClose(@Nullable Context ctx, long id, long endedAtMs, long activeMs,
                                int songs, boolean notify) {
        Helper h = helper(ctx);
        if (h == null || id <= 0L) return false;
        try {
            ContentValues v = new ContentValues();
            v.put("ended_at", endedAtMs);
            v.put("active_ms", activeMs);
            v.put("songs", songs);
            v.put("closed", 1);
            v.put("notified", notify ? 1 : 0);
            int rows = h.getWritableDatabase().update(SESSIONS, v, "id = ? AND closed = 0",
                    new String[] { String.valueOf(id) });
            return rows == 1 && notify;
        } catch (Throwable t) {
            Log.w(TAG, "no se pudo cerrar la sesión de escucha", t);
            return false;
        }
    }

    /** Guarda la respuesta del usuario (`si` o `no`). Sólo la primera cuenta. */
    static boolean sessionAnswer(@Nullable Context ctx, long id, String answer) {
        Helper h = helper(ctx);
        if (h == null || id <= 0L) return false;
        if (!"si".equals(answer) && !"no".equals(answer)) return false;
        try {
            ContentValues v = new ContentValues();
            v.put("answer", answer);
            v.put("answered_at", System.currentTimeMillis());
            return h.getWritableDatabase().update(SESSIONS, v, "id = ? AND answer IS NULL",
                    new String[] { String.valueOf(id) }) == 1;
        } catch (Throwable t) {
            Log.w(TAG, "no se pudo guardar la respuesta", t);
            return false;
        }
    }

    /** Sesiones que quedaron abiertas (el proceso murió antes de cerrarlas). */
    static List<SessionRow> openSessions(@Nullable Context ctx) {
        List<SessionRow> out = new ArrayList<>();
        Helper h = helper(ctx);
        if (h == null) return out;
        Cursor c = null;
        try {
            c = h.getReadableDatabase().rawQuery(
                    "SELECT id, started_at, ended_at, active_ms, songs FROM " + SESSIONS
                            + " WHERE closed = 0 ORDER BY id ASC", null);
            while (c != null && c.moveToNext()) {
                SessionRow r = new SessionRow();
                r.id = c.getLong(0);
                r.startedAtMs = c.getLong(1);
                r.endedAtMs = c.isNull(2) ? r.startedAtMs : c.getLong(2);
                r.activeMs = c.isNull(3) ? 0L : c.getLong(3);
                r.songs = c.isNull(4) ? 0 : c.getInt(4);
                out.add(r);
            }
        } catch (Throwable t) {
            Log.w(TAG, "lectura de sesiones abiertas fallida", t);
        } finally {
            if (c != null) c.close();
        }
        return out;
    }

    /** Todas las sesiones, de la más antigua a la más reciente, para el fichero exportado. */
    static JSONArray sessions(@Nullable Context ctx) {
        JSONArray out = new JSONArray();
        Helper h = helper(ctx);
        if (h == null) return out;
        Cursor c = null;
        try {
            c = h.getReadableDatabase().rawQuery(
                    "SELECT id, started_at, ended_at, active_ms, songs, answer, answered_at, closed,"
                            + " notified FROM " + SESSIONS + " ORDER BY id ASC", null);
            while (c != null && c.moveToNext()) {
                JSONObject o = new JSONObject();
                o.put("id", c.getLong(0));
                o.put("inicio", c.getLong(1));
                o.put("fin", c.isNull(2) ? JSONObject.NULL : c.getLong(2));
                o.put("escuchaActivaMs", c.isNull(3) ? 0L : c.getLong(3));
                o.put("canciones", c.isNull(4) ? 0 : c.getInt(4));
                o.put("respuesta", c.isNull(5) ? JSONObject.NULL : c.getString(5));
                o.put("respuestaEn", c.isNull(6) ? JSONObject.NULL : c.getLong(6));
                o.put("cerrada", c.getInt(7) == 1);
                o.put("avisada", c.getInt(8) == 1);
                out.put(o);
            }
        } catch (Throwable t) {
            Log.w(TAG, "lectura de sesiones fallida", t);
        } finally {
            if (c != null) c.close();
        }
        return out;
    }

    static void clear(@Nullable Context ctx) {
        Helper h = helper(ctx);
        if (h == null) return;
        try {
            SQLiteDatabase db = h.getWritableDatabase();
            db.delete(TABLE, null, null);
            // Las sesiones abiertas se conservan: el reloj en marcha las sigue usando.
            db.delete(SESSIONS, "closed = 1", null);
        } catch (Throwable t) {
            Log.w(TAG, "borrado del registro fallido", t);
        }
    }
}
