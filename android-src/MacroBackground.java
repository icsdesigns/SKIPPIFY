package com.skippify.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * La capa de Android del motor de macros en segundo plano.
 *
 * Aquí vive lo específico de la plataforma —SharedPreferences, org.json y el
 * hilo en el que se sale a la red— y nada más. Toda la lógica que decide qué
 * hacer está en {@link MacroRunner} y {@link SpotifyBackend}, que se prueban
 * aparte con javac sin necesidad de un móvil.
 *
 * Dos disparos, porque las macros no son todas iguales:
 *
 *   · Cambio de canción: lo avisa el listener de notificaciones. Atiende al
 *     origen «la canción que suena ahora» al instante y, de paso, aprovecha
 *     para repasar los orígenes de lista si toca.
 *   · Latido del servicio en primer plano (cada 15 min, alarma que ya existía
 *     para reafirmar la notificación persistente): repasa los orígenes de lista
 *     aunque no se esté escuchando nada.
 *
 * El freno de los repasos vive en {@link MacroRunner}, por macro, así que da
 * igual cuántas veces se llame aquí: no se dispara el gasto en peticiones.
 */
public final class MacroBackground {

    private static final String TAG = "SkippifyMacros";

    /** Fichero propio: no se mezcla con las preferencias del motor de saltos. */
    private static final String PREFS = "skippify_macros_bg";

    private static final String K_MACROS = "macros.json";

    /**
     * Un solo hilo: los cambios de canción llegan en ráfaga y dos ejecuciones a
     * la vez sobre las mismas macros se pisarían el deduplicado.
     */
    private static final ExecutorService POOL = Executors.newSingleThreadExecutor();

    private MacroBackground() { }

    // ── Piezas de la plataforma ──────────────────────────────────────────────

    static final MacroRunner.Clock RELOJ = new MacroRunner.Clock() {
        public long now() { return System.currentTimeMillis(); }
    };

    static MacroRunner.Store store(final Context ctx) {
        final SharedPreferences sp = ctx.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return new MacroRunner.Store() {
            public String get(String key) {
                try { return sp.getString(key, null); } catch (Throwable t) { return null; }
            }
            public void put(String key, String value) {
                try { sp.edit().putString(key, value).apply(); } catch (Throwable ignored) { }
            }
        };
    }

    /** El análisis del JSON lo hace org.json, que ya viene en Android. */
    static final SpotifyBackend.TokenParser PARSER = new SpotifyBackend.TokenParser() {
        public String[] parse(String body) {
            if (body == null) return null;
            try {
                JSONObject o = new JSONObject(body);
                return new String[] {
                        o.optString("access_token", null),
                        Long.toString(o.optLong("expires_in", 3600L)),
                        o.optString("refresh_token", null)
                };
            } catch (Throwable t) {
                return null;
            }
        }
    };

    static SpotifyBackend.Session sesion(Context ctx) {
        return new SpotifyBackend.Session(store(ctx), RELOJ,
                new SpotifyBackend.UrlRawHttp(), PARSER);
    }

    static MacroRunner.Http http(Context ctx) {
        return new SpotifyBackend.AuthedHttp(new SpotifyBackend.UrlRawHttp(), sesion(ctx));
    }

    // ── Sesión de Spotify (la app la deposita aquí al iniciarla) ─────────────

    public static void guardarSesion(Context ctx, String clientId, String access,
                                     String refresh, long expiresAt, String scope) {
        sesion(ctx).guardar(clientId, access, refresh, expiresAt, scope);
    }

    public static void borrarSesion(Context ctx) {
        sesion(ctx).borrar();
    }

    /**
     * Estado de la sesión para la app. Devuelve el access token porque la app lo
     * necesita para sus propias llamadas, pero NO el refresh token: ése se queda
     * aquí, que es quien lo renueva.
     */
    public static JSONObject estadoSesion(Context ctx) {
        SpotifyBackend.Session s = sesion(ctx);
        JSONObject o = new JSONObject();
        try {
            o.put("connected", s.haySesion());
            o.put("clientId", valor(s.clientId()));
            o.put("accessToken", valor(s.accessToken()));
            o.put("expiresAt", s.expiresAt());
            o.put("scope", valor(s.scope()));
            o.put("hasRefreshToken", SpotifyBackend.noVacio(s.refreshToken()));
        } catch (Throwable ignored) { }
        return o;
    }

    /** Fuerza un refresco y devuelve el estado resultante. */
    public static JSONObject refrescarSesion(Context ctx) {
        SpotifyBackend.Session s = sesion(ctx);
        boolean ok = s.refrescar();
        JSONObject o = estadoSesion(ctx);
        try { o.put("refreshed", ok); } catch (Throwable ignored) { }
        return o;
    }

    // ── Macros (la app las sincroniza aquí cada vez que cambian) ────────────

    public static void guardarMacros(Context ctx, String json) {
        store(ctx).put(K_MACROS, json == null ? "[]" : json);
    }

    static List<MacroRunner.Macro> macros(Context ctx) {
        List<MacroRunner.Macro> out = new ArrayList<MacroRunner.Macro>();
        String json = store(ctx).get(K_MACROS);
        if (json == null || json.length() == 0) return out;
        try {
            JSONArray arr = new JSONArray(json);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                String id = o.optString("id", null);
                if (id == null || id.length() == 0) continue;
                out.add(new MacroRunner.Macro(
                        id,
                        o.optString("name", id),
                        o.optBoolean("enabled", true),
                        o.optString("source", ""),
                        o.optString("action", ""),
                        vacioANull(o.optString("target", null)),
                        vacioANull(o.optString("targetPlaylistId", null)),
                        vacioANull(o.optString("sourcePlaylistId", null))
                ));
            }
        } catch (Throwable t) {
            Log.w(TAG, "no se pudieron leer las macros guardadas", t);
        }
        return out;
    }

    /** Cuáles de las guardadas puede ejecutar el servicio, para que la app lo diga. */
    public static JSONArray idsDeSegundoPlano(Context ctx) {
        JSONArray arr = new JSONArray();
        List<MacroRunner.Macro> ms = MacroRunner.filtrar(macros(ctx));
        for (int i = 0; i < ms.size(); i++) arr.put(ms.get(i).id);
        return arr;
    }

    /**
     * Por qué el servicio deja fuera a cada macro excluida. La app lo enseña en
     * vez de limitarse a no poner la etiqueta, que es lo que deja al usuario
     * preguntándose si aquello está roto.
     */
    public static JSONArray exclusiones(Context ctx) {
        JSONArray arr = new JSONArray();
        List<MacroRunner.Macro> ms = macros(ctx);
        for (int i = 0; i < ms.size(); i++) {
            MacroRunner.Macro m = ms.get(i);
            String motivo = MacroRunner.motivoExclusion(m);
            if (motivo == null) continue;
            try {
                JSONObject o = new JSONObject();
                o.put("id", m.id);
                o.put("motivo", motivo);
                arr.put(o);
            } catch (Throwable ignored) { }
        }
        return arr;
    }

    /** Estadísticas de lo ejecutado en segundo plano, por macro. */
    public static JSONArray estadisticas(Context ctx) {
        MacroRunner.Store st = store(ctx);
        JSONArray arr = new JSONArray();
        List<MacroRunner.Macro> ms = macros(ctx);
        for (int i = 0; i < ms.size(); i++) {
            MacroRunner.Macro m = ms.get(i);
            long runs = MacroRunner.runs(m, st);
            if (runs <= 0) continue;
            try {
                JSONObject o = new JSONObject();
                o.put("id", m.id);
                o.put("runs", runs);
                o.put("applied", MacroRunner.applied(m, st));
                o.put("lastResult", valor(MacroRunner.lastResult(m, st)));
                o.put("lastRunAt", MacroRunner.lastRunAt(m, st));
                o.put("historial", historial(m, st));
                arr.put(o);
            } catch (Throwable ignored) { }
        }
        return arr;
    }

    /**
     * Historial de los últimos siete días de una macro. Cada línea guardada es
     * `milis|estado|aplicadas|mensaje`; aquí se convierte en algo que la app
     * pueda pintar sin volver a analizar cadenas.
     */
    static JSONArray historial(MacroRunner.Macro m, MacroRunner.Store st) {
        JSONArray arr = new JSONArray();
        List<String> lineas = MacroRunner.historial(m, st, RELOJ);
        for (int i = 0; i < lineas.size(); i++) {
            String[] campos = lineas.get(i).split("\\|", 4);
            if (campos.length < 4) continue;
            try {
                JSONObject o = new JSONObject();
                o.put("at", MacroRunner.leerLong(campos[0]));
                o.put("status", (int) MacroRunner.leerLong(campos[1]));
                o.put("applied", (int) MacroRunner.leerLong(campos[2]));
                o.put("message", campos[3]);
                arr.put(o);
            } catch (Throwable ignored) { }
        }
        return arr;
    }

    // ── Ejecución ────────────────────────────────────────────────────────────

    /**
     * Punto de entrada desde el listener. No bloquea: el hilo que trae la
     * notificación tiene que volver enseguida o Android se queja.
     */
    public static void alCambiarDeCancion(final Context ctx, boolean sonando) {
        if (ctx == null || !sonando) return;
        lanzar(ctx.getApplicationContext());
    }

    /**
     * Latido del servicio en primer plano. Sirve para los orígenes de lista, que
     * no tienen ningún evento que los dispare; la canción actual no se toca aquí
     * porque para eso ya está el cambio de canción.
     */
    public static void repasoPeriodico(final Context ctx) {
        if (ctx == null) return;
        lanzar(ctx.getApplicationContext());
    }

    private static void lanzar(final Context app) {
        // Comprobaciones baratas antes de ocupar el hilo y, sobre todo, antes de
        // salir a la red: lo normal es no tener ninguna macro de este tipo.
        if (MacroRunner.filtrar(macros(app)).isEmpty()) return;
        if (!sesion(app).haySesion()) return;

        POOL.execute(new Runnable() {
            public void run() {
                try {
                    ejecutar(app, false, null);
                } catch (Throwable t) {
                    Log.w(TAG, "fallo ejecutando macros en segundo plano", t);
                }
            }
        });
    }

    /**
     * Ejecuta ahora mismo, saltándose los frenos. Es lo que usa el botón
     * «Ejecutar» de la app para las macros que gobierna el servicio, de modo que
     * exista un único sitio que las ejecuta y un único deduplicado.
     *
     * @param macroId sólo esa macro; null para todas.
     */
    public static JSONObject ejecutarAhora(Context ctx, String macroId) {
        try {
            return ejecutar(ctx.getApplicationContext(), true, vacioANull(macroId));
        } catch (Throwable t) {
            JSONObject o = new JSONObject();
            try { o.put("error", String.valueOf(t.getMessage())); } catch (Throwable ignored) { }
            return o;
        }
    }

    static JSONObject ejecutar(Context app, boolean forzar, String soloId) {
        JSONObject resumen = new JSONObject();
        JSONArray detalle = new JSONArray();

        MacroRunner.Http http = http(app);
        MacroRunner.Store store = store(app);
        List<MacroRunner.Macro> objetivo = seleccionar(macros(app), soloId);

        List<MacroRunner.Outcome> res = new ArrayList<MacroRunner.Outcome>();

        // 1 · La canción que suena ahora. Sólo se pregunta si hay alguna macro
        // que la use: una petición de más en cada cambio de canción se nota.
        //
        // Se guarda también de qué playlist sale: borrar de ella la pista en
        // curso detiene la reproducción, y ésa era la causa de que la música se
        // pausara sola a media canción.
        MacroRunner.EnReproduccion vivo = null;
        if (!MacroRunner.deCancionActual(objetivo).isEmpty()) {
            vivo = MacroRunner.sonandoAhora(http);
            MacroRunner.Track track = vivo == null ? null : vivo.track;
            try {
                resumen.put("track", track == null ? JSONObject.NULL : track.uri);
            } catch (Throwable ignored) { }
            if (track != null) {
                res.addAll(MacroRunner.run(track, objetivo, http, store, RELOJ, forzar, vivo));
            }
        }

        // 2 · Orígenes de lista, con su propio freno de 15 minutos por macro.
        //
        // Aquí también hace falta saber qué suena: un repaso de lista con
        // «quitar» puede toparse con la canción en curso igual que el disparo
        // por cambio de canción. Si nadie lo ha preguntado ya, se pregunta sólo
        // cuando alguna de estas macros borra de una playlist.
        if (vivo == null && alguna(MacroRunner.deLista(objetivo))) {
            vivo = MacroRunner.sonandoAhora(http);
        }
        res.addAll(MacroRunner.runListas(objetivo, http, store, RELOJ, forzar, null, vivo));

        for (int i = 0; i < res.size(); i++) {
            MacroRunner.Outcome o = res.get(i);
            try {
                JSONObject j = new JSONObject();
                j.put("id", o.macroId);
                j.put("status", o.status);
                j.put("message", valor(o.message));
                j.put("matched", o.encontradas);
                j.put("applied", o.aplicadas);
                detalle.put(j);
            } catch (Throwable ignored) { }
        }
        try { resumen.put("detalle", detalle); } catch (Throwable ignored) { }

        Log.i(TAG, "macros en segundo plano: " + res.size() + " evaluadas");
        return resumen;
    }

    /** ¿Hay alguna macro que borre de una playlist? Si no, no se pregunta nada. */
    static boolean alguna(List<MacroRunner.Macro> ms) {
        for (int i = 0; i < ms.size(); i++) {
            if (MacroRunner.playlistQueVacia(ms.get(i)) != null) return true;
        }
        return false;
    }

    static List<MacroRunner.Macro> seleccionar(List<MacroRunner.Macro> ms, String soloId) {
        if (soloId == null) return ms;
        List<MacroRunner.Macro> out = new ArrayList<MacroRunner.Macro>();
        for (int i = 0; i < ms.size(); i++) {
            if (soloId.equals(ms.get(i).id)) out.add(ms.get(i));
        }
        return out;
    }

    // ── Utilidades ───────────────────────────────────────────────────────────

    static String valor(String s) { return s == null ? "" : s; }

    static String vacioANull(String s) {
        return (s == null || s.length() == 0 || "null".equals(s)) ? null : s;
    }
}
