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
 */
final class PlayLogStore {

    private static final String TAG = "SkippifyPlayLog";
    private static final String DB_NAME = "skippify-play-log.db";
    private static final String TABLE = "play_log";

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
    }

    private static final class Helper extends SQLiteOpenHelper {
        Helper(Context context) {
            super(context, DB_NAME, null, 1);
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
                    + "config TEXT"
                    + ")");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_log_started ON " + TABLE + "(started_at)");
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            // Sin cambios de esquema todavía. Cuando los haya: ALTER TABLE ADD
            // COLUMN, nunca DROP, que aquí se guardan datos que no se pueden
            // reconstruir.
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
            db.insert(TABLE, null, v);

            if (++sInsertsSincePrune >= PRUNE_EVERY) {
                sInsertsSincePrune = 0;
                prune(db);
            }
        } catch (Throwable t) {
            Log.w(TAG, "inserción fallida", t);
        }
    }

    private static void prune(SQLiteDatabase db) {
        try {
            db.delete(TABLE, "started_at < ?",
                    new String[] { String.valueOf(System.currentTimeMillis() - RETENTION_MS) });
            db.execSQL("DELETE FROM " + TABLE + " WHERE id <= (SELECT MAX(id) FROM " + TABLE
                    + ") - " + MAX_ROWS);
        } catch (Throwable ignored) {
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
                    "SELECT started_at, ended_at, track, artist, duration_ms, played_ms, committed,"
                            + " decision, reason, duplicate_seen, matched_previous_at, position_ms,"
                            + " session_age_ms, source, index_ready, skip_enabled, skip_interval,"
                            + " listening_mode, config FROM " + TABLE
                            + " ORDER BY id ASC LIMIT ? OFFSET ?",
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
                out.put(o);
            }
        } catch (Throwable t) {
            Log.w(TAG, "lectura del registro fallida", t);
        } finally {
            if (c != null) c.close();
        }
        return out;
    }

    static void clear(@Nullable Context ctx) {
        Helper h = helper(ctx);
        if (h == null) return;
        try {
            h.getWritableDatabase().delete(TABLE, null, null);
        } catch (Throwable t) {
            Log.w(TAG, "borrado del registro fallido", t);
        }
    }
}
