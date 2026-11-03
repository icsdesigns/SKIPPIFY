package com.skippify.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Sondeo en segundo plano de las escuchas de la cuenta de Spotify.
 *
 * Complementa a las notificaciones: éstas son inmediatas y son las únicas que
 * pueden saltar una duplicada, pero sólo ven este móvil. La API ve cualquier
 * dispositivo, y además recupera lo que se haya escapado mientras el servicio
 * estaba muerto (devuelve las últimas 50, unas tres horas de margen).
 *
 * Cuelga del latido del servicio en primer plano, que ya existe, así que "estar
 * siempre activo" significa lo mismo que para el resto: mientras Android deje
 * vivo el servicio. Las decisiones —qué cuenta como escucha y qué es un
 * duplicado— están en {@link EscuchasApi}.
 *
 * Cada escucha nueva se anota en dos sitios, como haría una de notificación:
 *   · la base de datos del motor de duplicadas (para decidir qué saltar), y
 *   · el log crudo de eventos, con un par «playing»/«stopped» sintético, de modo
 *     que la app, el widget y la subida a Comunidad la tratan igual que a las
 *     demás y le aplican sus mismos umbrales del 5 % y el 80 %.
 */
public final class EscuchasApiBackground {

    private static final String TAG = "EscuchasApiBg";
    private static final String PREFS = "skippify_api_escuchas";

    private static final String K_ACTIVO = "enabled";
    private static final String K_ULTIMO_FIN = "lastEndMs";
    private static final String K_ULTIMA_CONSULTA = "lastPollMs";
    private static final String K_NO_ANTES = "notBeforeMs";
    private static final String K_ERROR = "lastError";
    private static final String K_TOTAL = "total";

    private static final String SCOPE_NECESARIO = "user-read-recently-played";
    private static final String URL = "https://api.spotify.com/v1/me/player/recently-played?limit=50";

    /** Entre consulta y consulta: lo bastante poco para que 50 canciones sobren. */
    static final long PERIODO_MS = 5L * 60L * 1000L;
    /** Tras un 429 o un fallo de red no se insiste enseguida. */
    static final long ESPERA_TRAS_ERROR_MS = 15L * 60L * 1000L;

    private static final ExecutorService POOL = Executors.newSingleThreadExecutor();

    private EscuchasApiBackground() { }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean activo(Context c) {
        return prefs(c).getBoolean(K_ACTIVO, false);
    }

    // ── Interruptor ──────────────────────────────────────────────────────────

    /**
     * Al activarlo se parte de cero: la primera consulta sólo fija desde dónde
     * mirar, sin traer el pasado, para no inventar historial de golpe.
     */
    public static void configurar(Context ctx, boolean activo) {
        SharedPreferences.Editor ed = prefs(ctx).edit().putBoolean(K_ACTIVO, activo);
        if (activo) {
            ed.putLong(K_ULTIMO_FIN, 0L).putLong(K_NO_ANTES, 0L).putString(K_ERROR, "");
        }
        ed.apply();
        if (activo) sondear(ctx, true);
    }

    // ── Sondeo ───────────────────────────────────────────────────────────────

    /** Latido del servicio: consulta en su hilo si toca. */
    public static void latido(Context ctx) {
        if (ctx == null || !activo(ctx)) return;
        sondear(ctx, false);
    }

    /** Consulta ya, saltándose el periodo (no la espera tras un error). */
    public static void consultarAhora(Context ctx) {
        if (ctx == null || !activo(ctx)) return;
        sondear(ctx, true);
    }

    private static void sondear(final Context ctx, final boolean forzar) {
        final Context app = ctx.getApplicationContext();
        POOL.execute(new Runnable() {
            public void run() {
                try {
                    consultar(app, forzar);
                } catch (Throwable t) {
                    Log.w(TAG, "la consulta a la API ha fallado", t);
                    fallo(app, "error");
                }
            }
        });
    }

    private static void consultar(Context app, boolean forzar) {
        SharedPreferences sp = prefs(app);
        if (!sp.getBoolean(K_ACTIVO, false)) return;

        long ahora = System.currentTimeMillis();
        if (ahora < sp.getLong(K_NO_ANTES, 0L)) return;
        if (!forzar && ahora - sp.getLong(K_ULTIMA_CONSULTA, 0L) < PERIODO_MS) return;

        JSONObject sesion = MacroBackground.estadoSesion(app);
        if (!sesion.optBoolean("connected", false)) {
            sp.edit().putString(K_ERROR, "no-session").apply();
            return;
        }
        String scope = sesion.optString("scope", "");
        if (!scope.isEmpty() && !scope.contains(SCOPE_NECESARIO)) {
            sp.edit().putString(K_ERROR, "missing-scope").apply();
            return;
        }

        sp.edit().putLong(K_ULTIMA_CONSULTA, ahora).apply();

        MacroRunner.Response r = MacroBackground.http(app).send("GET", URL, null);
        if (r == null || r.status < 200 || r.status >= 300 || r.body == null) {
            int estado = r == null ? 0 : r.status;
            if (estado == 401 || estado == 403) {
                sp.edit().putString(K_ERROR, estado == 403 ? "forbidden" : "no-session").apply();
            } else {
                fallo(app, estado == 429 ? "rate-limit" : "network");
            }
            return;
        }

        List<EscuchasApi.Reproduccion> lista = EscuchasApi.parsear(r.body);
        long ultimo = sp.getLong(K_ULTIMO_FIN, 0L);

        if (ultimo <= 0L) {
            // Primera vez: sólo se fija el punto de partida.
            long tope = EscuchasApi.ultimoFin(lista);
            sp.edit().putLong(K_ULTIMO_FIN, tope > 0L ? tope : ahora)
                    .putString(K_ERROR, "").apply();
            return;
        }

        final DuplicateSkipEngine motor = DuplicateSkipEngine.get();
        motor.asegurarContexto(app);

        List<EscuchasApi.Aceptada> nuevas = EscuchasApi.filtrar(lista, ultimo,
                new EscuchasApi.Historial() {
                    public boolean hayEscucha(String track, String artist, long desde, long hasta) {
                        return motor.hayEscucha(track, artist, desde, hasta);
                    }
                });

        if (!nuevas.isEmpty()) anotar(app, motor, nuevas);

        long tope = Math.max(ultimo, EscuchasApi.ultimoFin(lista));
        sp.edit().putLong(K_ULTIMO_FIN, tope)
                .putLong(K_TOTAL, sp.getLong(K_TOTAL, 0L) + nuevas.size())
                .putString(K_ERROR, "").apply();
        if (!nuevas.isEmpty()) Log.i(TAG, "escuchas nuevas desde la API: " + nuevas.size());
    }

    private static void fallo(Context app, String motivo) {
        prefs(app).edit()
                .putString(K_ERROR, motivo)
                .putLong(K_NO_ANTES, System.currentTimeMillis() + ESPERA_TRAS_ERROR_MS)
                .apply();
    }

    private static void anotar(Context app, DuplicateSkipEngine motor,
                               List<EscuchasApi.Aceptada> nuevas) {
        List<DuplicateSkipEngine.ImportedPlay> filas = new ArrayList<DuplicateSkipEngine.ImportedPlay>();
        for (EscuchasApi.Aceptada a : nuevas) {
            filas.add(new DuplicateSkipEngine.ImportedPlay(
                    a.r.track, a.r.artist, a.inicioMs, a.r.durationMs));
        }
        try {
            motor.importPlays(filas);
        } catch (Throwable t) {
            Log.w(TAG, "no se pudo anotar en el motor", t);
        }

        for (EscuchasApi.Aceptada a : nuevas) {
            try {
                SpotifyNotificationListener.registrarEventoExterno(app,
                        evento("playing", a, a.inicioMs));
                SpotifyNotificationListener.registrarEventoExterno(app,
                        evento("stopped", a, a.r.finMs));
            } catch (Throwable t) {
                Log.w(TAG, "no se pudo anotar el evento", t);
            }
        }
    }

    private static JSONObject evento(String tipo, EscuchasApi.Aceptada a, long cuando) throws Exception {
        JSONObject o = new JSONObject();
        o.put("track", a.r.track);
        o.put("artist", a.r.artist);
        if (a.r.durationMs > 0L) o.put("duration_ms", a.r.durationMs);
        o.put("is_playing", "playing".equals(tipo));
        o.put("event", tipo);
        o.put("played_at", SpotifyNotificationListener.toIso8601(cuando));
        o.put("source", "spotify_api");
        // La app no los ha visto en directo: que los suba el servicio si ella no está.
        o.put("js", false);
        return o;
    }

    // ── Estado para la app ───────────────────────────────────────────────────

    public static JSONObject estado(Context ctx) {
        SharedPreferences sp = prefs(ctx);
        JSONObject o = new JSONObject();
        try {
            JSONObject sesion = MacroBackground.estadoSesion(ctx);
            String scope = sesion.optString("scope", "");
            o.put("enabled", sp.getBoolean(K_ACTIVO, false));
            o.put("connected", sesion.optBoolean("connected", false));
            o.put("hasScope", scope.isEmpty() || scope.contains(SCOPE_NECESARIO));
            o.put("lastPollAt", sp.getLong(K_ULTIMA_CONSULTA, 0L));
            o.put("watchingSince", sp.getLong(K_ULTIMO_FIN, 0L));
            o.put("lastError", sp.getString(K_ERROR, ""));
            o.put("total", sp.getLong(K_TOTAL, 0L));
        } catch (Throwable ignored) { }
        return o;
    }
}
