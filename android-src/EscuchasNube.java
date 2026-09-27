package com.skippify.app;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Sube a Firebase las escuchas captadas con la app cerrada.
 *
 * La app sólo subía las escuchas desde JS, y JS no corre si nadie abre la app:
 * quien escuchaba toda la semana sin abrirla llegaba al domingo con cero
 * canciones en el ranking del grupo. El servicio en primer plano sí sigue
 * vivo, y el listener deja cada cambio de canción en el log crudo
 * (`skippify-spotify-events.ndjson`); aquí se convierte ese log en escuchas y
 * se envían por la API REST de Firestore.
 *
 * Dos reglas para que nada cuente dos veces:
 *
 *   · Las escuchas se trocean EXACTAMENTE como lo hace `ingestBackgroundEvents`
 *     en useNotifListener.js, y el ID del documento es el mismo hash que usa
 *     useLeague.js. Cuando la app se abre, drena el mismo log y sube las mismas
 *     escuchas: caen sobre los mismos documentos con merge, no al lado.
 *   · Lo que se captó con la app viva (`js: true` en el log) no se sube desde
 *     aquí: JS ya lo registra en directo con otra marca de tiempo, y subirlo
 *     también desde aquí lo duplicaría.
 *
 * Sin importaciones de Android, como {@link MacroRunner}: se prueba con javac a
 * secas. El JSON de las respuestas lo lee quien llama (org.json en el móvil).
 */
public final class EscuchasNube {

    /** Iguales a MIN_REGISTER_PROGRESS_RATIO y REGISTER_LISTEN_TIME_PROGRESS_RATIO. */
    static final double MIN_REGISTRO = 0.05;
    static final double MIN_TIEMPO = 0.80;
    static final long MAX_SEGMENTO_MS = 6L * 3600000L;

    /** Una subida por hora basta: el ranking es semanal. */
    static final long INTERVALO_MS = 60L * 60L * 1000L;
    static final int POR_LOTE = 400;

    static final String K_UID = "liga.uid";
    static final String K_REFRESH = "liga.refresh";
    static final String K_API_KEY = "liga.apiKey";
    static final String K_PROYECTO = "liga.projectId";
    static final String K_GRUPOS = "liga.groupIds";
    static final String K_ACTIVO = "liga.activeGroupId";
    static final String K_ORIGEN = "liga.origin";
    static final String K_ID_TOKEN = "liga.idToken";
    static final String K_ID_EXPIRA = "liga.idTokenExpiresAt";
    static final String K_MARCA = "liga.subidoHasta";
    static final String K_ULTIMO = "liga.ultimoIntento";

    private EscuchasNube() { }

    // ── Piezas que pone quien llama ──────────────────────────────────────────

    public interface Store {
        String get(String key);
        void put(String key, String value);
    }

    public interface Clock {
        long now();
    }

    public static final class Response {
        public final int status;
        public final String body;

        public Response(int status, String body) {
            this.status = status;
            this.body = body;
        }

        boolean ok() { return status >= 200 && status < 300; }
    }

    public interface Http {
        Response send(String method, String url, String body, String contentType,
                      String bearer, String referer);
    }

    /** De la respuesta de securetoken: [id_token, expires_in, user_id]. */
    public interface TokenParser {
        String[] parse(String body);
    }

    /** Una línea del log crudo. */
    public static final class Crudo {
        final long t;
        final String playedAt;
        final String event;
        final String track;
        final String artist;
        final long durationMs;
        final boolean js;

        public Crudo(long t, String playedAt, String event, String track, String artist,
                     long durationMs, boolean js) {
            this.t = t;
            this.playedAt = playedAt == null ? "" : playedAt;
            this.event = event == null ? "" : event.toLowerCase(Locale.ROOT);
            this.track = track == null ? "" : track.trim();
            this.artist = artist == null ? "" : artist.trim();
            this.durationMs = durationMs;
            this.js = js;
        }
    }

    /** Una escucha ya cerrada, lista para subir. */
    public static final class Escucha {
        final String playedAt;
        final long playedAtMs;
        final String track;
        final String artist;
        final long durationMs;
        final long msPlayed;
        final boolean js;

        Escucha(String playedAt, long playedAtMs, String track, String artist,
                long durationMs, long msPlayed, boolean js) {
            this.playedAt = playedAt;
            this.playedAtMs = playedAtMs;
            this.track = track;
            this.artist = artist;
            this.durationMs = durationMs;
            this.msPlayed = msPlayed;
            this.js = js;
        }
    }

    // ── Troceado (copia de ingestBackgroundEvents) ───────────────────────────

    /**
     * Escuchas cerradas del log. La que sigue sonando se queda fuera: JS la
     * cierra con la hora a la que se abre la app, y ese instante aquí no se
     * conoce, así que su ID no coincidiría.
     */
    static List<Escucha> trocear(List<Crudo> log) {
        List<Crudo> ordenado = new ArrayList<Crudo>(log);
        // Collections.sort es estable, como Array.prototype.sort.
        Collections.sort(ordenado, new Comparator<Crudo>() {
            public int compare(Crudo a, Crudo b) { return a.t < b.t ? -1 : (a.t > b.t ? 1 : 0); }
        });

        List<Escucha> out = new ArrayList<Escucha>();
        Crudo abierta = null;

        for (Crudo e : ordenado) {
            if ("playing".equals(e.event)) {
                if (e.track.isEmpty() || e.artist.isEmpty()) continue;
                if (abierta != null && abierta.track.equals(e.track) && abierta.artist.equals(e.artist)) continue;
                if (abierta != null) cerrar(abierta, e, out);
                abierta = e;
                continue;
            }
            if ("paused".equals(e.event) || "stopped".equals(e.event)) {
                if (abierta != null) cerrar(abierta, e, out);
                abierta = null;
            }
        }
        return out;
    }

    private static void cerrar(Crudo inicio, Crudo fin, List<Escucha> out) {
        long ms = fin.t - inicio.t;
        if (ms <= 0 || ms > MAX_SEGMENTO_MS) return;
        out.add(new Escucha(fin.playedAt, fin.t, inicio.track, inicio.artist,
                inicio.durationMs, ms, inicio.js));
    }

    /** Los mismos umbrales que JS antes de guardar la escucha. */
    static List<Escucha> paraSubir(List<Escucha> escuchas) {
        List<Escucha> out = new ArrayList<Escucha>();
        for (Escucha e : escuchas) {
            if (e.js) continue;
            if (e.durationMs <= 0 || e.msPlayed <= 0) continue;
            double ratio = (double) e.msPlayed / (double) e.durationMs;
            if (ratio < MIN_REGISTRO) continue;
            long ms = ratio < MIN_TIEMPO ? 0L : e.msPlayed;
            out.add(new Escucha(e.playedAt, e.playedAtMs, e.track, e.artist,
                    e.durationMs, ms, false));
        }
        return out;
    }

    // ── Documento ────────────────────────────────────────────────────────────

    /** El mismo FNV-1a que `hashId` en useLeague.js, sobre unidades UTF-16. */
    static String hashId(String input) {
        int h = 0x811c9dc5;
        for (int i = 0; i < input.length(); i += 1) {
            h ^= input.charAt(i);
            h *= 0x01000193;
        }
        String hex = Long.toHexString(h & 0xffffffffL);
        while (hex.length() < 8) hex = "0" + hex;
        return hex;
    }

    static String idDeEscucha(String uid, Escucha e) {
        return hashId(uid + "|" + e.playedAt + "|" + e.track + "|" + e.artist + "|" + e.durationMs);
    }

    /** Medianoche local del día de la escucha, en ISO UTC (`playedAtDay` de JS). */
    static String diaLocal(long ms, TimeZone zona) {
        Calendar c = Calendar.getInstance(zona);
        c.setTimeInMillis(ms);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(c.getTime());
    }

    static String json(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i += 1) {
            char c = s.charAt(i);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                default:
                    if (c < 0x20) b.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
                    else b.append(c);
            }
        }
        return b.append('"').toString();
    }

    private static String texto(String s) { return "{\"stringValue\":" + json(s) + "}"; }

    private static String entero(long n) { return "{\"integerValue\":\"" + n + "\"}"; }

    private static String booleano(boolean v) { return "{\"booleanValue\":" + v + "}"; }

    /** Como el SDK de JS: un número entero viaja como entero, el resto como double. */
    private static String numero(double d) {
        if (d == Math.rint(d) && !Double.isInfinite(d)) return entero((long) d);
        return "{\"doubleValue\":" + d + "}";
    }

    private static String lista(List<String> valores) {
        StringBuilder b = new StringBuilder("{\"arrayValue\":{\"values\":[");
        for (int i = 0; i < valores.size(); i += 1) {
            if (i > 0) b.append(',');
            b.append(texto(valores.get(i)));
        }
        return b.append("]}}").toString();
    }

    static final String[] CAMPOS = {
        "eventId", "uid", "groupId", "groupIds", "playedAt", "playedAtDay", "track", "artist",
        "durationMs", "msPlayed", "measuredMs", "completionRatio", "countedForTime",
        "countedForRegister", "source"
    };

    /** Cuerpo de `documents:commit` con los mismos campos que escribe useLeague.js. */
    static String cuerpoCommit(String proyecto, String uid, String grupoActivo, List<String> grupos,
                               List<Escucha> escuchas, TimeZone zona) {
        String base = "projects/" + proyecto + "/databases/(default)/documents/users/" + uid
                + "/listening_events/";
        StringBuilder mask = new StringBuilder();
        for (int i = 0; i < CAMPOS.length; i += 1) {
            if (i > 0) mask.append(',');
            mask.append(json(CAMPOS[i]));
        }

        StringBuilder b = new StringBuilder("{\"writes\":[");
        for (int i = 0; i < escuchas.size(); i += 1) {
            Escucha e = escuchas.get(i);
            String id = idDeEscucha(uid, e);
            // Como JS: measuredMs = max(ms_played, resume_anchor_ms), y aquí no hay ancla.
            double ratio = e.durationMs > 0 ? (double) e.msPlayed / (double) e.durationMs : 0;

            if (i > 0) b.append(',');
            b.append("{\"update\":{\"name\":").append(json(base + id)).append(",\"fields\":{")
                .append("\"eventId\":").append(texto(id))
                .append(",\"uid\":").append(texto(uid))
                .append(",\"groupId\":").append(texto(grupoActivo))
                .append(",\"groupIds\":").append(lista(grupos))
                .append(",\"playedAt\":").append(texto(e.playedAt))
                .append(",\"playedAtDay\":").append(texto(diaLocal(e.playedAtMs, zona)))
                .append(",\"track\":").append(texto(e.track))
                .append(",\"artist\":").append(texto(e.artist))
                .append(",\"durationMs\":").append(entero(e.durationMs))
                .append(",\"msPlayed\":").append(entero(e.msPlayed))
                .append(",\"measuredMs\":").append(entero(e.msPlayed))
                .append(",\"completionRatio\":").append(numero(Math.max(0, ratio)))
                .append(",\"countedForTime\":").append(booleano(ratio >= 0.8))
                .append(",\"countedForRegister\":").append(booleano(ratio >= 0.25))
                .append(",\"source\":").append(texto("notification_background"))
                .append("}},\"updateMask\":{\"fieldPaths\":[").append(mask).append("]}")
                .append(",\"updateTransforms\":[{\"fieldPath\":\"createdAt\",\"setToServerValue\":\"REQUEST_TIME\"}]}");
        }
        return b.append("]}").toString();
    }

    // ── Sesión ───────────────────────────────────────────────────────────────

    static List<String> grupos(Store s) {
        List<String> out = new ArrayList<String>();
        String raw = s.get(K_GRUPOS);
        if (raw == null) return out;
        for (String g : raw.split(",")) {
            if (!g.trim().isEmpty()) out.add(g.trim());
        }
        return out;
    }

    static boolean configurado(Store s) {
        return !vacio(s.get(K_UID)) && !vacio(s.get(K_REFRESH)) && !vacio(s.get(K_API_KEY))
                && !vacio(s.get(K_PROYECTO)) && !grupos(s).isEmpty();
    }

    private static boolean vacio(String s) { return s == null || s.trim().isEmpty(); }

    private static long numeroGuardado(Store s, String k) {
        try { return Long.parseLong(s.get(k)); } catch (Throwable t) { return 0L; }
    }

    /** ID token vigente; lo renueva con el refresh token de la sesión anónima. */
    static String idToken(Store s, Http http, TokenParser parser, Clock reloj) {
        String actual = s.get(K_ID_TOKEN);
        if (!vacio(actual) && numeroGuardado(s, K_ID_EXPIRA) - 60000L > reloj.now()) return actual;

        String cuerpo;
        try {
            cuerpo = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(s.get(K_REFRESH), "UTF-8");
        } catch (Throwable t) {
            return null;
        }
        Response r = http.send("POST", "https://securetoken.googleapis.com/v1/token?key=" + s.get(K_API_KEY),
                cuerpo, "application/x-www-form-urlencoded", null, s.get(K_ORIGEN));
        if (r == null || !r.ok()) return null;

        String[] p = parser.parse(r.body);
        if (p == null || vacio(p[0])) return null;
        // Si la sesión ya no es la del usuario que nos dio la app, no se sube nada.
        if (!vacio(p[2]) && !p[2].equals(s.get(K_UID))) return null;

        long segundos = 3600L;
        try { segundos = Long.parseLong(p[1]); } catch (Throwable ignored) { }
        s.put(K_ID_TOKEN, p[0]);
        s.put(K_ID_EXPIRA, Long.toString(reloj.now() + segundos * 1000L));
        return p[0];
    }

    // ── Subida ───────────────────────────────────────────────────────────────

    /**
     * Sube lo que haya en el log y no se haya subido ya.
     *
     * @return escuchas subidas; 0 si no tocaba o no había nada; -1 si falló.
     */
    public static int subir(Store s, Http http, TokenParser parser, Clock reloj,
                            List<Crudo> log, TimeZone zona, boolean forzar) {
        if (!configurado(s)) return 0;
        long ahora = reloj.now();
        if (!forzar && ahora - numeroGuardado(s, K_ULTIMO) < INTERVALO_MS) return 0;
        s.put(K_ULTIMO, Long.toString(ahora));

        long marca = numeroGuardado(s, K_MARCA);
        List<Escucha> pendientes = new ArrayList<Escucha>();
        for (Escucha e : paraSubir(trocear(log))) {
            if (e.playedAtMs > marca) pendientes.add(e);
        }
        if (pendientes.isEmpty()) return 0;

        String token = idToken(s, http, parser, reloj);
        if (token == null) return -1;

        String url = "https://firestore.googleapis.com/v1/projects/" + s.get(K_PROYECTO)
                + "/databases/(default)/documents:commit";
        String uid = s.get(K_UID);
        String activo = s.get(K_ACTIVO) == null ? "" : s.get(K_ACTIVO);
        List<String> grupos = grupos(s);

        int subidas = 0;
        for (int i = 0; i < pendientes.size(); i += POR_LOTE) {
            List<Escucha> lote = pendientes.subList(i, Math.min(pendientes.size(), i + POR_LOTE));
            Response r = http.send("POST", url,
                    cuerpoCommit(s.get(K_PROYECTO), uid, activo, grupos, lote, zona),
                    "application/json", token, s.get(K_ORIGEN));
            if (r == null || !r.ok()) {
                // Un token caducado antes de tiempo se reintenta en el siguiente latido.
                if (r != null && r.status == 401) s.put(K_ID_TOKEN, "");
                return subidas > 0 ? subidas : -1;
            }
            long hasta = marca;
            for (Escucha e : lote) hasta = Math.max(hasta, e.playedAtMs);
            s.put(K_MARCA, Long.toString(hasta));
            marca = hasta;
            subidas += lote.size();
        }
        return subidas;
    }

    // ── Red real ─────────────────────────────────────────────────────────────

    /**
     * HttpURLConnection con Referer: si la API key de Firebase está limitada a
     * los orígenes de la app, desde aquí hay que presentarse con el mismo que
     * usa el WebView.
     */
    public static final class UrlHttp implements Http {
        public Response send(String method, String url, String body, String contentType,
                             String bearer, String referer) {
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setRequestMethod(method);
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(20000);
                conn.setRequestProperty("Accept", "application/json");
                if (bearer != null && bearer.length() > 0) {
                    conn.setRequestProperty("Authorization", "Bearer " + bearer);
                }
                if (referer != null && referer.length() > 0) {
                    conn.setRequestProperty("Referer", referer);
                }
                if (body != null) {
                    conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type", contentType);
                    byte[] bytes = body.getBytes("UTF-8");
                    conn.setFixedLengthStreamingMode(bytes.length);
                    OutputStream os = conn.getOutputStream();
                    try { os.write(bytes); } finally { os.close(); }
                }
                int status = conn.getResponseCode();
                InputStream is = status >= 200 && status < 400 ? conn.getInputStream() : conn.getErrorStream();
                return new Response(status, leer(is));
            } catch (Throwable t) {
                return new Response(0, null);
            } finally {
                if (conn != null) {
                    try { conn.disconnect(); } catch (Throwable ignored) { }
                }
            }
        }

        private static String leer(InputStream is) {
            if (is == null) return null;
            try {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[4096];
                int n;
                while ((n = is.read(buf)) != -1) out.write(buf, 0, n);
                return out.toString("UTF-8");
            } catch (Throwable t) {
                return null;
            } finally {
                try { is.close(); } catch (Throwable ignored) { }
            }
        }
    }
}
