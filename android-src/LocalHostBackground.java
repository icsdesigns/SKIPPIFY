package com.skippify.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Sincronización de la Comunidad «sin servidor» (LocalHost) con la app cerrada.
 *
 * El núcleo de LocalHost es JavaScript, así que no se puede reescribir en Java
 * sin duplicar su parte más delicada (firmas, cifrado, validación de
 * miembros). En su lugar, el servicio en primer plano —que ya mantiene vivo el
 * proceso— aloja un WebView sin interfaz que carga `bg.html`, la misma
 * aplicación compilada pero sólo con el bucle de sincronización. Así una
 * invitación se acepta en segundos aunque nadie tenga la app abierta.
 *
 * Reglas que evitan corromper un grupo:
 *
 *   · UNO escribe a la vez. Mientras la actividad principal está en primer plano
 *     este WebView no existe; al ir ella a segundo plano se crea (con 3 s de
 *     margen para no arrancar en cada cambio de pantalla), y al volver se le
 *     pide parar y se destruye. La app espera su confirmación (`acquire`) antes
 *     de tocar los grupos, y si el servicio llegó a escribir, los vuelve a leer
 *     de IndexedDB.
 *   · Mismo origen que la app (https://localhost) para compartir IndexedDB y
 *     localStorage: las peticiones a ese host se sirven desde los assets de
 *     Capacitor, y cualquier otro host se rechaza (la red va por WebSocket, que
 *     no pasa por aquí).
 *   · El ritmo lo dicta JavaScript (`schedule`): cada pocos segundos si alguien
 *     espera entrar o hay una invitación vigente, cada cinco minutos si no.
 *
 * Todo el estado se toca desde el hilo principal.
 */
public final class LocalHostBackground {

    private static final String PREFS = "skippify_lh_bg";
    private static final String K_ACTIVO = "enabled";
    private static final String URL = "https://localhost/bg.html";

    /** Margen antes de arrancar tras salir la app de primer plano. */
    static final long ARRANQUE_MS = 3000L;
    /** Si el WebView no confirma que paró, se cierra igualmente. */
    static final long PARADA_MAX_MS = 8000L;
    static final long MIN_PERIODO_MS = 5000L;
    static final long MAX_PERIODO_MS = 15L * 60L * 1000L;

    public interface Respuesta {
        void hecho(boolean haEscrito);
    }

    private static final Handler H = new Handler(Looper.getMainLooper());
    private static Context app;
    private static WebView web;
    private static boolean paginaLista;
    private static boolean principalActiva;
    private static boolean corriendo;
    private static boolean parando;
    /** El servicio pudo escribir desde la última vez que la app lo supo. */
    private static boolean haEscrito;
    private static final List<Respuesta> esperando = new ArrayList<>();

    private static final Runnable ARRANCAR = new Runnable() {
        @Override public void run() {
            if (app == null || principalActiva || corriendo || !activo(app)) return;
            arrancar();
        }
    };
    private static final Runnable LATIDO_JS = new Runnable() {
        @Override public void run() {
            if (corriendo && !parando) evaluar("window.__lhTick&&window.__lhTick()");
        }
    };
    private static final Runnable PARADA_FORZADA = new Runnable() {
        @Override public void run() { terminarParada(); }
    };

    private LocalHostBackground() { }

    // ── Entrada desde la app y el servicio ────────────────────────────────────

    public static void onMainResumed(final Context ctx) {
        final Context a = ctx.getApplicationContext();
        H.post(new Runnable() {
            @Override public void run() {
                app = a;
                principalActiva = true;
                H.removeCallbacks(ARRANCAR);
                H.removeCallbacks(LATIDO_JS);
                if (corriendo) pedirParada();
            }
        });
    }

    public static void onMainPaused(final Context ctx) {
        final Context a = ctx.getApplicationContext();
        H.post(new Runnable() {
            @Override public void run() {
                app = a;
                principalActiva = false;
                if (activo(a)) {
                    H.removeCallbacks(ARRANCAR);
                    H.postDelayed(ARRANCAR, ARRANQUE_MS);
                }
            }
        });
    }

    /** JS avisa de si hay grupos sin servidor: sin ellos no hay nada que atender. */
    public static void configurar(final Context ctx, final boolean activo) {
        final Context a = ctx.getApplicationContext();
        H.post(new Runnable() {
            @Override public void run() {
                app = a;
                prefs(a).edit().putBoolean(K_ACTIVO, activo).apply();
                if (!activo) {
                    H.removeCallbacks(ARRANCAR);
                    H.removeCallbacks(LATIDO_JS);
                    if (corriendo) pedirParada();
                } else if (!principalActiva && !corriendo) {
                    H.removeCallbacks(ARRANCAR);
                    H.postDelayed(ARRANCAR, ARRANQUE_MS);
                }
            }
        });
    }

    /** La app pide el paso: responde cuando el WebView ya no escribe. */
    public static void adquirir(final Respuesta r) {
        H.post(new Runnable() {
            @Override public void run() {
                if (!corriendo) {
                    boolean b = haEscrito;
                    haEscrito = false;
                    r.hecho(b);
                    return;
                }
                esperando.add(r);
                pedirParada();
            }
        });
    }

    /** Latido del servicio en primer plano: reanuda si el proceso se reinició. */
    public static void latido(final Context ctx) {
        final Context a = ctx.getApplicationContext();
        H.post(new Runnable() {
            @Override public void run() {
                if (app == null) app = a;
                if (activo(a) && !principalActiva && !corriendo) arrancar();
            }
        });
    }

    // ── Ciclo del WebView ─────────────────────────────────────────────────────

    private static void arrancar() {
        corriendo = true;
        parando = false;
        haEscrito = true;
        paginaLista = false;
        try {
            SkippifyForegroundService.start(app, false);
        } catch (Throwable ignored) { }
        try {
            WebView w = new WebView(app);
            WebSettings s = w.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setAllowFileAccess(false);
            s.setAllowContentAccess(false);
            w.addJavascriptInterface(new Puente(), "SkippifyLh");
            w.setWebViewClient(new WebViewClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                    return servir(req.getUrl());
                }

                @Override
                public void onPageFinished(WebView v, String url) {
                    paginaLista = true;
                    if (corriendo && !parando && !principalActiva) {
                        evaluar("window.__lhStart&&window.__lhStart()");
                    }
                }
            });
            web = w;
            w.loadUrl(URL);
        } catch (Throwable t) {
            // Sin WebView utilizable (actualizándose, p. ej.): no es fatal.
            corriendo = false;
            web = null;
        }
    }

    private static void pedirParada() {
        if (parando) return;
        parando = true;
        H.removeCallbacks(LATIDO_JS);
        H.postDelayed(PARADA_FORZADA, PARADA_MAX_MS);
        if (web != null && paginaLista) {
            evaluar("window.__lhStop?window.__lhStop():window.SkippifyLh&&window.SkippifyLh.stopped()");
        } else {
            terminarParada();
        }
    }

    private static void terminarParada() {
        H.removeCallbacks(PARADA_FORZADA);
        H.removeCallbacks(LATIDO_JS);
        corriendo = false;
        parando = false;
        paginaLista = false;
        if (web != null) {
            try { web.stopLoading(); } catch (Throwable ignored) { }
            try { web.destroy(); } catch (Throwable ignored) { }
            web = null;
        }
        boolean b = haEscrito;
        haEscrito = false;
        List<Respuesta> copia = new ArrayList<>(esperando);
        esperando.clear();
        for (Respuesta r : copia) {
            try { r.hecho(b); } catch (Throwable ignored) { }
        }
    }

    private static void evaluar(String js) {
        WebView w = web;
        if (w == null) return;
        try { w.evaluateJavascript(js, null); } catch (Throwable ignored) { }
    }

    // ── Puente JS → Java ──────────────────────────────────────────────────────

    private static final class Puente {
        @JavascriptInterface public void ready() { }

        @JavascriptInterface public void schedule(final long ms) {
            H.post(new Runnable() {
                @Override public void run() {
                    if (!corriendo || parando || principalActiva) return;
                    long espera = Math.max(MIN_PERIODO_MS, Math.min(MAX_PERIODO_MS, ms));
                    H.removeCallbacks(LATIDO_JS);
                    H.postDelayed(LATIDO_JS, espera);
                }
            });
        }

        /**
         * Escuchas captadas con la app cerrada, ya troceadas y con los umbrales
         * de siempre (las mismas que sube LigaBackground a Firebase). El log no
         * se vacía: eso sigue siendo cosa de la app al abrirse. JS les pone el
         * ID y las publica en el grupo, así las estadísticas siguen al día.
         */
        @JavascriptInterface public String escuchas() {
            try {
                Context c = app;
                if (c == null) return "[]";
                java.util.List<EscuchasNube.Escucha> lista =
                        EscuchasNube.paraSubir(EscuchasNube.trocear(LigaBackground.leerLog(c)));
                JSONArray a = new JSONArray();
                for (EscuchasNube.Escucha e : lista) {
                    JSONObject o = new JSONObject();
                    o.put("playedAt", e.playedAt);
                    o.put("playedAtMs", e.playedAtMs);
                    o.put("track", e.track);
                    o.put("artist", e.artist);
                    o.put("durationMs", e.durationMs);
                    o.put("msPlayed", e.msPlayed);
                    a.put(o);
                }
                return a.toString();
            } catch (Throwable t) {
                return "[]";
            }
        }

        @JavascriptInterface public void stopped() {
            H.post(new Runnable() {
                @Override public void run() { if (corriendo) terminarParada(); }
            });
        }
    }

    // ── Assets de Capacitor servidos como https://localhost ───────────────────

    private static WebResourceResponse servir(Uri uri) {
        Map<String, String> cabeceras = new HashMap<>();
        cabeceras.put("Access-Control-Allow-Origin", "*");
        if (uri == null || !"localhost".equals(uri.getHost())) {
            return new WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", cabeceras,
                    new ByteArrayInputStream(new byte[0]));
        }
        String ruta = uri.getPath();
        if (ruta == null || ruta.isEmpty() || "/".equals(ruta)) ruta = "/bg.html";
        if (ruta.contains("..")) {
            return new WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", cabeceras,
                    new ByteArrayInputStream(new byte[0]));
        }
        try {
            InputStream in = app.getAssets().open("public" + ruta);
            return new WebResourceResponse(mime(ruta), "utf-8", 200, "OK", cabeceras, in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", cabeceras,
                    new ByteArrayInputStream(new byte[0]));
        }
    }

    static String mime(String ruta) {
        String r = ruta.toLowerCase(java.util.Locale.ROOT);
        if (r.endsWith(".html")) return "text/html";
        if (r.endsWith(".js") || r.endsWith(".mjs")) return "text/javascript";
        if (r.endsWith(".css")) return "text/css";
        if (r.endsWith(".json")) return "application/json";
        if (r.endsWith(".wasm")) return "application/wasm";
        if (r.endsWith(".svg")) return "image/svg+xml";
        if (r.endsWith(".png")) return "image/png";
        return "application/octet-stream";
    }

    // ── Preferencias ──────────────────────────────────────────────────────────

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static boolean activo(Context c) {
        try { return prefs(c).getBoolean(K_ACTIVO, false); } catch (Throwable t) { return false; }
    }
}
