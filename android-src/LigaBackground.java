package com.skippify.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * La capa de Android de la subida de escuchas en segundo plano.
 *
 * Igual que {@link MacroBackground}: aquí sólo va lo de la plataforma
 * (SharedPreferences, org.json, leer el log y el hilo de red). Lo que decide
 * qué se sube y cómo está en {@link EscuchasNube}, que se prueba aparte.
 *
 * Lo dispara el latido del servicio en primer plano; el freno de una subida
 * por hora vive en EscuchasNube, así que llamar de más no cuesta nada.
 */
public final class LigaBackground {

    private static final String TAG = "SkippifyLiga";
    private static final String PREFS = "skippify_liga_bg";

    private static final ExecutorService POOL = Executors.newSingleThreadExecutor();

    private LigaBackground() { }

    static EscuchasNube.Store store(Context ctx) {
        final SharedPreferences sp = ctx.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return new EscuchasNube.Store() {
            public String get(String key) {
                try { return sp.getString(key, null); } catch (Throwable t) { return null; }
            }
            public void put(String key, String value) {
                try { sp.edit().putString(key, value).apply(); } catch (Throwable ignored) { }
            }
        };
    }

    static final EscuchasNube.Clock RELOJ = new EscuchasNube.Clock() {
        public long now() { return System.currentTimeMillis(); }
    };

    static final EscuchasNube.TokenParser PARSER = new EscuchasNube.TokenParser() {
        public String[] parse(String body) {
            if (body == null) return null;
            try {
                JSONObject o = new JSONObject(body);
                return new String[] {
                        o.optString("id_token", null),
                        o.optString("expires_in", "3600"),
                        o.optString("user_id", null)
                };
            } catch (Throwable t) {
                return null;
            }
        }
    };

    /**
     * La app deposita aquí su sesión anónima de Firebase y sus grupos cada vez
     * que sincroniza. Si cambia el usuario, se olvida lo ya subido.
     */
    public static void guardar(Context ctx, String uid, String refreshToken, String apiKey,
                               String projectId, JSONArray groupIds, String activeGroupId,
                               String origin) {
        EscuchasNube.Store s = store(ctx);
        String anterior = s.get(EscuchasNube.K_UID);
        if (anterior != null && !anterior.equals(uid)) {
            s.put(EscuchasNube.K_MARCA, "0");
            s.put(EscuchasNube.K_ID_TOKEN, "");
        }
        StringBuilder grupos = new StringBuilder();
        if (groupIds != null) {
            for (int i = 0; i < groupIds.length(); i++) {
                String g = groupIds.optString(i, "");
                if (g.isEmpty() || g.contains(",")) continue;
                if (grupos.length() > 0) grupos.append(',');
                grupos.append(g);
            }
        }
        s.put(EscuchasNube.K_UID, uid == null ? "" : uid);
        s.put(EscuchasNube.K_REFRESH, refreshToken == null ? "" : refreshToken);
        s.put(EscuchasNube.K_API_KEY, apiKey == null ? "" : apiKey);
        s.put(EscuchasNube.K_PROYECTO, projectId == null ? "" : projectId);
        s.put(EscuchasNube.K_GRUPOS, grupos.toString());
        s.put(EscuchasNube.K_ACTIVO, activeGroupId == null ? "" : activeGroupId);
        s.put(EscuchasNube.K_ORIGEN, origin == null ? "" : origin);
    }

    /** Sin grupos no hay ranking al que subir nada. */
    public static void borrar(Context ctx) {
        EscuchasNube.Store s = store(ctx);
        s.put(EscuchasNube.K_REFRESH, "");
        s.put(EscuchasNube.K_ID_TOKEN, "");
        s.put(EscuchasNube.K_GRUPOS, "");
    }

    public static JSONObject estado(Context ctx) {
        EscuchasNube.Store s = store(ctx);
        JSONObject o = new JSONObject();
        try {
            o.put("configured", EscuchasNube.configurado(s));
            o.put("uploadedUntil", valor(s.get(EscuchasNube.K_MARCA)));
            o.put("lastAttempt", valor(s.get(EscuchasNube.K_ULTIMO)));
        } catch (Throwable ignored) { }
        return o;
    }

    private static String valor(String s) { return s == null ? "" : s; }

    /** Latido del servicio: sube en su hilo si toca. */
    public static void latido(final Context ctx) {
        final Context app = ctx.getApplicationContext();
        if (!EscuchasNube.configurado(store(app))) return;
        POOL.execute(new Runnable() {
            public void run() {
                try {
                    int n = EscuchasNube.subir(store(app), new EscuchasNube.UrlHttp(), PARSER, RELOJ,
                            leerLog(app), TimeZone.getDefault(), false);
                    if (n != 0) Log.i(TAG, "escuchas subidas en segundo plano: " + n);
                } catch (Throwable t) {
                    Log.w(TAG, "la subida en segundo plano ha fallado", t);
                }
            }
        });
    }

    /** Lee el log crudo SIN vaciarlo: eso sigue siendo cosa de la app al abrirse. */
    static List<EscuchasNube.Crudo> leerLog(Context ctx) {
        List<EscuchasNube.Crudo> out = new ArrayList<EscuchasNube.Crudo>();
        synchronized (SpotifyNotificationListener.sEventFileLock) {
            File dir = ctx.getFilesDir();
            if (dir == null) return out;
            File f = new File(dir, SpotifyNotificationListener.EVENT_LOG_FILE);
            if (!f.exists() || !f.isFile()) return out;
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
                String line;
                int leidas = 0;
                // El mismo tope que drainBackgroundEvents, para trocear lo mismo.
                while ((line = reader.readLine()) != null && ++leidas <= 5000) {
                    line = line.trim();
                    if (line.isEmpty()) continue;
                    try {
                        JSONObject o = new JSONObject(line);
                        String playedAt = o.optString("played_at", "");
                        long t = SpotifyNotificationListener.fromIso8601Ms(playedAt);
                        if (t <= 0) continue;
                        out.add(new EscuchasNube.Crudo(t, playedAt,
                                o.optString("event", ""),
                                o.optString("track", ""),
                                o.optString("artist", ""),
                                o.optLong("duration_ms", 0L),
                                // Líneas de versiones anteriores: no se sabe, y ante la
                                // duda no se suben, que duplicar es peor que esperar.
                                o.optBoolean("js", true)));
                    } catch (Throwable ignored) { }
                }
            } catch (Throwable t) {
                Log.w(TAG, "no se pudo leer el log de escuchas", t);
            }
        }
        return out;
    }
}
