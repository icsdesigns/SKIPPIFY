package com.skippify.app;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Batería de pruebas del motor de macros en segundo plano.
 *
 * Corre con javac/java a secas: ni Android, ni emulador, ni dependencias. Lo que
 * no se puede comprobar así —que el servicio siga vivo a las tres de la mañana
 * en un Xiaomi— se comprueba en el móvil; todo lo demás se comprueba aquí.
 */
public final class PruebasMacros {

    static int fallos = 0;
    static int total = 0;

    public static void main(String[] args) throws Exception {
        seleccion();
        peticiones();
        deduplicado();
        forzado();
        errores();
        estadisticas();
        urisNoValidas();
        sesion();
        reintentoPor401();
        httpDeVerdad();
        seleccionDeListas();
        lecturaDeOrigenes();
        primeraPasadaIncremental();
        primeraPasadaNoIncremental();
        frenoDeQuinceMinutos();
        topesYLotes();
        moverBorraDelOrigen();
        unaSolaMacro();
        erroresDeLista();
        historialDeSieteDias();
        noCortarLaReproduccion();

        System.out.println();
        if (fallos > 0) {
            System.out.println("Fallos: " + fallos + " de " + total);
            System.exit(1);
        }
        System.out.println("Macros en segundo plano: " + total + " comprobaciones, todo correcto.");
    }

    // ── Andamiaje ────────────────────────────────────────────────────────────

    static void titulo(String s) {
        System.out.println();
        System.out.println(s);
    }

    static void check(String etiqueta, Object real, Object esperado) {
        total++;
        boolean ok = esperado == null ? real == null : esperado.equals(real);
        System.out.println("  " + (ok ? "✓" : "✗") + " " + etiqueta
                + (ok ? "" : "\n      esperado: " + esperado + "\n      recibido: " + real));
        if (!ok) fallos++;
    }

    static void contiene(String etiqueta, String real, String fragmento) {
        total++;
        boolean ok = real != null && real.contains(fragmento);
        System.out.println("  " + (ok ? "✓" : "✗") + " " + etiqueta
                + (ok ? "" : "\n      debía contener: " + fragmento + "\n      recibido: " + real));
        if (!ok) fallos++;
    }

    /** Almacén en memoria. */
    static final class Memoria implements MacroRunner.Store {
        final Map<String, String> m = new HashMap<String, String>();
        public String get(String k) { return m.get(k); }
        public void put(String k, String v) { m.put(k, v); }
    }

    /** Reloj manipulable. */
    static final class Reloj implements MacroRunner.Clock {
        long t = 1_700_000_000_000L;
        public long now() { return t; }
        void avanzar(long ms) { t += ms; }
    }

    /** Http que anota lo que se le pide y responde lo que se le diga. */
    static final class HttpFalso implements MacroRunner.Http {
        final List<String> llamadas = new ArrayList<String>();
        int status = 200;
        String body = "{}";

        public MacroRunner.Response send(String method, String url, String jsonBody) {
            llamadas.add(method + " " + url + (jsonBody == null ? "" : " :: " + jsonBody));
            return new MacroRunner.Response(status, body);
        }
    }

    static MacroRunner.Macro macro(String id, String source, String action,
                                   String target, String playlistId) {
        return new MacroRunner.Macro(id, id, true, source, action, target, playlistId);
    }

    static MacroRunner.Track pista() {
        return new MacroRunner.Track("spotify:track:abc123", "Les Mentimos", "Cami Sanabria");
    }

    static List<MacroRunner.Macro> lista(MacroRunner.Macro... ms) {
        return Arrays.asList(ms);
    }

    // ── A · qué macros asume el segundo plano ────────────────────────────────

    static void seleccion() {
        titulo("Qué macros puede ejecutar el servicio por su cuenta");
        String C = MacroRunner.SOURCE_CURRENT_TRACK;

        check("encolar la que suena", MacroRunner.esDeSegundoPlano(macro("a", C, "queue", null, null)), true);
        check("copiar a Tus me gusta", MacroRunner.esDeSegundoPlano(macro("b", C, "copy", "liked", null)), true);
        check("copiar a una playlist con id", MacroRunner.esDeSegundoPlano(macro("c", C, "copy", "playlist", "PL1")), true);
        check("copiar a la cola", MacroRunner.esDeSegundoPlano(macro("d", C, "copy", "queue", null)), true);
        check("quitar de Tus me gusta", MacroRunner.esDeSegundoPlano(macro("e", C, "remove", "liked", null)), true);
        check("quitar de una playlist con id", MacroRunner.esDeSegundoPlano(macro("f", C, "remove", "playlist", "PL1")), true);

        check("playlist nueva sin crear queda para la app",
                MacroRunner.esDeSegundoPlano(macro("g", C, "copy", "new_playlist", null)), false);
        check("playlist nueva ya creada sí vale",
                MacroRunner.esDeSegundoPlano(macro("h", C, "copy", "new_playlist", "PL9")), true);
        check("copiar a playlist sin id no vale",
                MacroRunner.esDeSegundoPlano(macro("i", C, "copy", "playlist", null)), false);
        check("mover no cabe con esta fuente",
                MacroRunner.esDeSegundoPlano(macro("j", C, "move", "playlist", "PL1")), false);
        check("novedades de playlist sin playlist de origen quedan fuera",
                MacroRunner.esDeSegundoPlano(macro("k", "playlist_new", "copy", "liked", null)), false);
        check("una macro pausada no corre",
                MacroRunner.esDeSegundoPlano(new MacroRunner.Macro("l", "l", false, C, "queue", null, null)), false);
        check("null no revienta", MacroRunner.esDeSegundoPlano(null), false);

        List<MacroRunner.Macro> mezcla = lista(
                macro("uno", C, "queue", null, null),
                macro("dos", "playlist_all", "copy", "liked", null),
                macro("tres", C, "copy", "liked", null));
        check("filtrar deja sólo las que corresponden", MacroRunner.filtrar(mezcla).size(), 2);
    }

    // ── B · qué peticiones salen exactamente ─────────────────────────────────

    static void peticiones() {
        titulo("Peticiones que se envían a Spotify");
        String C = MacroRunner.SOURCE_CURRENT_TRACK;
        String URI = "spotify:track:abc123";
        String ENC = "spotify%3Atrack%3Aabc123";

        HttpFalso h = new HttpFalso();
        MacroRunner.run(pista(), lista(macro("q", C, "queue", null, null)), h, new Memoria(), new Reloj());
        check("encolar: una sola petición", h.llamadas.size(), 1);
        check("encolar: método y ruta", h.llamadas.get(0),
                "POST " + MacroRunner.API + "/me/player/queue?uri=" + ENC);

        h = new HttpFalso();
        MacroRunner.run(pista(), lista(macro("l", C, "copy", "liked", null)), h, new Memoria(), new Reloj());
        check("me gusta: alta por query", h.llamadas.get(0),
                "PUT " + MacroRunner.API + "/me/library?uris=" + ENC);

        h = new HttpFalso();
        MacroRunner.run(pista(), lista(macro("p", C, "copy", "playlist", "PL1")), h, new Memoria(), new Reloj());
        check("playlist: alta con cuerpo uris", h.llamadas.get(0),
                "POST " + MacroRunner.API + "/playlists/PL1/items :: {\"uris\":[\"" + URI + "\"]}");

        h = new HttpFalso();
        MacroRunner.run(pista(), lista(macro("rl", C, "remove", "liked", null)), h, new Memoria(), new Reloj());
        check("me gusta: baja por query", h.llamadas.get(0),
                "DELETE " + MacroRunner.API + "/me/library?uris=" + ENC);

        h = new HttpFalso();
        MacroRunner.run(pista(), lista(macro("rp", C, "remove", "playlist", "PL1")), h, new Memoria(), new Reloj());
        check("playlist: baja con cuerpo items", h.llamadas.get(0),
                "DELETE " + MacroRunner.API + "/playlists/PL1/items :: {\"items\":[{\"uri\":\"" + URI + "\"}]}");

        h = new HttpFalso();
        MacroRunner.run(pista(), lista(
                macro("m1", C, "queue", null, null),
                macro("m2", C, "copy", "liked", null),
                macro("m3", "top_tracks", "copy", "liked", null)), h, new Memoria(), new Reloj());
        check("varias macros: sólo las que corresponden", h.llamadas.size(), 2);

        check("las comillas del JSON se escapan",
                MacroRunner.jsonString("di \"hola\"\\fin"), "\"di \\\"hola\\\"\\\\fin\"");
    }

    // ── C · no actuar dos veces sobre la misma canción ───────────────────────

    static void deduplicado() {
        titulo("No repetir sobre la misma canción");
        String C = MacroRunner.SOURCE_CURRENT_TRACK;
        HttpFalso h = new HttpFalso();
        Memoria store = new Memoria();
        Reloj reloj = new Reloj();
        List<MacroRunner.Macro> ms = lista(macro("q", C, "queue", null, null));

        List<MacroRunner.Outcome> r1 = MacroRunner.run(pista(), ms, h, store, reloj);
        check("primera vez: se aplica", r1.get(0).status, MacroRunner.APLICADA);

        List<MacroRunner.Outcome> r2 = MacroRunner.run(pista(), ms, h, store, reloj);
        check("repetición inmediata: se omite", r2.get(0).status, MacroRunner.OMITIDA);
        check("y no sale ninguna petición nueva", h.llamadas.size(), 1);

        reloj.avanzar(MacroRunner.VENTANA_REPETIDO_MS - 1000L);
        MacroRunner.run(pista(), ms, h, store, reloj);
        check("justo antes de la ventana sigue omitida", h.llamadas.size(), 1);

        reloj.avanzar(2000L);
        List<MacroRunner.Outcome> r4 = MacroRunner.run(pista(), ms, h, store, reloj);
        check("pasada la ventana vuelve a aplicarse", r4.get(0).status, MacroRunner.APLICADA);
        check("y sale la segunda petición", h.llamadas.size(), 2);

        MacroRunner.Track otra = new MacroRunner.Track("spotify:track:zzz999", "Otra", "Alguien");
        MacroRunner.run(otra, ms, h, store, reloj);
        check("una canción distinta se procesa al momento", h.llamadas.size(), 3);

        // Cada macro lleva su propia cuenta: que una haya visto la canción no
        // puede silenciar a la de al lado.
        HttpFalso h2 = new HttpFalso();
        Memoria s2 = new Memoria();
        Reloj c2 = new Reloj();
        MacroRunner.run(pista(), lista(macro("uno", C, "queue", null, null)), h2, s2, c2);
        MacroRunner.run(pista(), lista(macro("dos", C, "copy", "liked", null)), h2, s2, c2);
        check("el deduplicado es por macro, no global", h2.llamadas.size(), 2);
    }

    static void forzado() {
        titulo("«Ejecutar» a mano se salta la ventana");
        String C = MacroRunner.SOURCE_CURRENT_TRACK;
        HttpFalso h = new HttpFalso();
        Memoria store = new Memoria();
        Reloj reloj = new Reloj();
        List<MacroRunner.Macro> ms = lista(macro("q", C, "queue", null, null));

        MacroRunner.run(pista(), ms, h, store, reloj);
        check("automática: se aplica", h.llamadas.size(), 1);
        MacroRunner.run(pista(), ms, h, store, reloj);
        check("automática repetida: se omite", h.llamadas.size(), 1);

        List<MacroRunner.Outcome> r = MacroRunner.run(pista(), ms, h, store, reloj, true);
        check("forzada: se aplica igualmente", r.get(0).status, MacroRunner.APLICADA);
        check("y sale la petición", h.llamadas.size(), 2);

        MacroRunner.run(pista(), ms, h, store, reloj);
        check("tras forzar, la ventana se reinicia", h.llamadas.size(), 2);
    }

    // ── D · traducción de los errores de Spotify ─────────────────────────────

    static void errores() {
        titulo("Errores de Spotify traducidos");
        String C = MacroRunner.SOURCE_CURRENT_TRACK;

        contiene("403 sobre playlist",
                fallo(403, macro("p", C, "copy", "playlist", "PL1")), "no es tuya ni colaborativa");
        contiene("403 encolando habla de Premium",
                fallo(403, macro("q", C, "queue", null, null)), "Premium");
        contiene("404 encolando: no hay dispositivo",
                fallo(404, macro("q", C, "queue", null, null)), "dispositivo activo");
        contiene("429: cupo agotado",
                fallo(429, macro("l", C, "copy", "liked", null)), "Cupo de peticiones");
        contiene("401: sesión caducada",
                fallo(401, macro("l", C, "copy", "liked", null)), "caducado");
        contiene("500: es cosa de Spotify",
                fallo(503, macro("l", C, "copy", "liked", null)), "fallando por su lado");
        contiene("sin red",
                fallo(0, macro("l", C, "copy", "liked", null)), "Sin conexión");
        contiene("un código raro se dice tal cual",
                fallo(418, macro("l", C, "copy", "liked", null)), "418");
        check("una respuesta 2xx no es error", MacroRunner.revisar(new MacroRunner.Response(204, null), "player"), null);
    }

    static String fallo(int status, MacroRunner.Macro m) {
        HttpFalso h = new HttpFalso();
        h.status = status;
        List<MacroRunner.Outcome> r = MacroRunner.run(pista(), lista(m), h, new Memoria(), new Reloj());
        return r.isEmpty() ? null : r.get(0).message;
    }

    // ── E · lo que la app leerá después ──────────────────────────────────────

    static void estadisticas() {
        titulo("Estadísticas que verá la app");
        String C = MacroRunner.SOURCE_CURRENT_TRACK;
        HttpFalso h = new HttpFalso();
        Memoria store = new Memoria();
        Reloj reloj = new Reloj();
        MacroRunner.Macro m = macro("q", C, "queue", null, null);

        MacroRunner.run(pista(), lista(m), h, store, reloj);
        check("una ejecución contada", MacroRunner.runs(m, store), 1L);
        check("una canción aplicada", MacroRunner.applied(m, store), 1L);
        contiene("el resultado dice que fue en segundo plano",
                MacroRunner.lastResult(m, store), "En segundo plano");
        check("queda la marca de tiempo", MacroRunner.lastRunAt(m, store), reloj.t);

        reloj.avanzar(MacroRunner.VENTANA_REPETIDO_MS + 1000L);
        h.status = 403;
        MacroRunner.run(pista(), lista(m), h, store, reloj);
        check("la ejecución fallida también cuenta", MacroRunner.runs(m, store), 2L);
        check("pero no suma canción aplicada", MacroRunner.applied(m, store), 1L);
        contiene("y el motivo queda escrito", MacroRunner.lastResult(m, store), "Error:");
    }

    // ── F · lo que no es una canción del catálogo ────────────────────────────

    static void urisNoValidas() {
        titulo("Lo que no se toca");
        String C = MacroRunner.SOURCE_CURRENT_TRACK;
        List<MacroRunner.Macro> ms = lista(macro("q", C, "queue", null, null));

        for (String uri : new String[] { null, "", "spotify:episode:xyz", "spotify:local:a:b:c", "spotify:track:" }) {
            HttpFalso h = new HttpFalso();
            MacroRunner.run(new MacroRunner.Track(uri, "x", "y"), ms, h, new Memoria(), new Reloj());
            check("no se actúa sobre " + (uri == null ? "null" : "«" + uri + "»"), h.llamadas.size(), 0);
        }

        HttpFalso h = new HttpFalso();
        MacroRunner.run(null, ms, h, new Memoria(), new Reloj());
        check("sin canción no pasa nada", h.llamadas.size(), 0);
    }

    // ── G · la sesión y su refresco ──────────────────────────────────────────

    /** RawHttp de mentira, para la sesión. */
    static final class RawFalso implements SpotifyBackend.RawHttp {
        final List<String> llamadas = new ArrayList<String>();
        int status = 200;
        String body = "{\"access_token\":\"NUEVO\",\"expires_in\":3600}";

        public MacroRunner.Response send(String method, String url, String body_,
                                         String contentType, String bearer) {
            llamadas.add(method + " " + url + " bearer=" + bearer
                    + (body_ == null ? "" : " :: " + body_));
            return new MacroRunner.Response(status, body);
        }
    }

    /** Analizador de tokens de juguete: sirve para las respuestas de la prueba. */
    static final SpotifyBackend.TokenParser PARSER = new SpotifyBackend.TokenParser() {
        public String[] parse(String body) {
            if (body == null) return null;
            return new String[] {
                    entre(body, "\"access_token\":\"", "\""),
                    entre(body, "\"expires_in\":", ",}"),
                    entre(body, "\"refresh_token\":\"", "\"")
            };
        }
    };

    static String entre(String s, String desde, String hasta) {
        int i = s.indexOf(desde);
        if (i < 0) return null;
        i += desde.length();
        int j = i;
        while (j < s.length() && hasta.indexOf(s.charAt(j)) < 0) j++;
        return s.substring(i, j);
    }

    static void sesion() {
        titulo("Sesión de Spotify en el móvil");

        Memoria store = new Memoria();
        Reloj reloj = new Reloj();
        RawFalso raw = new RawFalso();
        SpotifyBackend.Session s = new SpotifyBackend.Session(store, reloj, raw, PARSER);

        check("sin nada guardado no hay sesión", s.haySesion(), false);

        s.guardar("CLIENT", "VIEJO", "REFRESCO", reloj.now() + 3600_000L, "scope1");
        check("hay sesión tras guardarla", s.haySesion(), true);
        check("token válido: se usa sin refrescar", s.bearer(), "VIEJO");
        check("y no se ha llamado a Spotify", raw.llamadas.size(), 0);

        reloj.avanzar(3600_000L);
        check("caducado: refresca y devuelve el nuevo", s.bearer(), "NUEVO");
        check("se llamó una vez al endpoint de token", raw.llamadas.size(), 1);
        contiene("con grant_type de refresco", raw.llamadas.get(0), "grant_type=refresh_token");
        contiene("y el client_id", raw.llamadas.get(0), "client_id=CLIENT");
        contiene("contra la URL correcta", raw.llamadas.get(0), SpotifyBackend.TOKEN_URL);
        check("la nueva caducidad se guarda", s.expiresAt(), reloj.now() + 3600_000L);
        check("el refresh token se conserva", s.refreshToken(), "REFRESCO");

        // Una respuesta sin refresh_token no debe borrar el que ya había.
        Memoria st2 = new Memoria();
        Reloj rl2 = new Reloj();
        RawFalso raw2 = new RawFalso();
        SpotifyBackend.Session s2 = new SpotifyBackend.Session(st2, rl2, raw2, PARSER);
        s2.guardar("C", "A", "R-ORIGINAL", 0L, null);
        s2.refrescar();
        check("un refresco sin refresh_token nuevo no borra el viejo", s2.refreshToken(), "R-ORIGINAL");

        // Rotación: si Spotify manda uno nuevo, se guarda.
        raw2.body = "{\"access_token\":\"A2\",\"expires_in\":100,\"refresh_token\":\"R-NUEVO\"}";
        s2.refrescar();
        check("si Spotify rota el refresh token, se guarda el nuevo", s2.refreshToken(), "R-NUEVO");

        // invalid_grant sí cierra la sesión.
        Memoria st3 = new Memoria();
        RawFalso raw3 = new RawFalso();
        raw3.status = 400;
        raw3.body = "{\"error\":\"invalid_grant\"}";
        SpotifyBackend.Session s3 = new SpotifyBackend.Session(st3, new Reloj(), raw3, PARSER);
        s3.guardar("C", "A", "R", 0L, null);
        check("invalid_grant: el refresco falla", s3.refrescar(), false);
        check("y la sesión se cierra", s3.haySesion(), false);

        // Un fallo pasajero NO cierra la sesión.
        Memoria st4 = new Memoria();
        RawFalso raw4 = new RawFalso();
        raw4.status = 429;
        raw4.body = "{\"error\":\"too many requests\"}";
        SpotifyBackend.Session s4 = new SpotifyBackend.Session(st4, new Reloj(), raw4, PARSER);
        s4.guardar("C", "A", "R", 0L, null);
        check("429: el refresco falla", s4.refrescar(), false);
        check("pero la sesión se mantiene", s4.haySesion(), true);

        RawFalso raw5 = new RawFalso();
        raw5.status = 503;
        Memoria st5 = new Memoria();
        SpotifyBackend.Session s5 = new SpotifyBackend.Session(st5, new Reloj(), raw5, PARSER);
        s5.guardar("C", "A", "R", 0L, null);
        s5.refrescar();
        check("un 5xx tampoco cierra la sesión", s5.haySesion(), true);

        // Sin refresh token no hay nada que hacer.
        Memoria st6 = new Memoria();
        SpotifyBackend.Session s6 = new SpotifyBackend.Session(st6, new Reloj(), new RawFalso(), PARSER);
        s6.guardar("C", "A", null, 0L, null);
        check("sin refresh token no se intenta refrescar", s6.refrescar(), false);
    }

    // ── H · el 401 se reintenta una vez ──────────────────────────────────────

    static void reintentoPor401() {
        titulo("Un 401 se refresca y se reintenta");

        Memoria store = new Memoria();
        Reloj reloj = new Reloj();

        final int[] veces = { 0 };
        final List<String> bearers = new ArrayList<String>();
        SpotifyBackend.RawHttp raw = new SpotifyBackend.RawHttp() {
            public MacroRunner.Response send(String method, String url, String body,
                                             String contentType, String bearer) {
                if (url.equals(SpotifyBackend.TOKEN_URL)) {
                    return new MacroRunner.Response(200, "{\"access_token\":\"FRESCO\",\"expires_in\":3600}");
                }
                bearers.add(bearer);
                veces[0]++;
                return new MacroRunner.Response(veces[0] == 1 ? 401 : 200, "{}");
            }
        };

        SpotifyBackend.Session s = new SpotifyBackend.Session(store, reloj, raw, PARSER);
        s.guardar("CLIENT", "CADUCADO", "REFRESCO", reloj.now() + 3600_000L, null);
        SpotifyBackend.AuthedHttp authed = new SpotifyBackend.AuthedHttp(raw, s);

        MacroRunner.Response r = authed.send("POST", "https://api.spotify.com/v1/x", null);
        check("acaba en 200 tras el reintento", r.status, 200);
        check("se intentó dos veces", veces[0], 2);
        check("la primera con el token viejo", bearers.get(0), "CADUCADO");
        check("y la segunda con el nuevo", bearers.get(1), "FRESCO");

        // Si el refresco no sale, se devuelve el 401 sin insistir.
        Memoria st2 = new Memoria();
        final int[] veces2 = { 0 };
        SpotifyBackend.RawHttp raw2 = new SpotifyBackend.RawHttp() {
            public MacroRunner.Response send(String method, String url, String body,
                                             String contentType, String bearer) {
                if (url.equals(SpotifyBackend.TOKEN_URL)) return new MacroRunner.Response(400, "{\"error\":\"invalid_grant\"}");
                veces2[0]++;
                return new MacroRunner.Response(401, "{}");
            }
        };
        SpotifyBackend.Session s2 = new SpotifyBackend.Session(st2, new Reloj(), raw2, PARSER);
        s2.guardar("C", "A", "R", System.currentTimeMillis() + 3600_000L, null);
        MacroRunner.Response r2 = new SpotifyBackend.AuthedHttp(raw2, s2).send("POST", "https://api.spotify.com/v1/x", null);
        check("si el refresco falla se devuelve el 401", r2.status, 401);
        check("y no se insiste", veces2[0], 1);

        // Sin sesión no se sale a la red siquiera.
        Memoria st3 = new Memoria();
        RawFalso raw3 = new RawFalso();
        SpotifyBackend.Session s3 = new SpotifyBackend.Session(st3, new Reloj(), raw3, PARSER);
        MacroRunner.Response r3 = new SpotifyBackend.AuthedHttp(raw3, s3).send("POST", "https://api.spotify.com/v1/x", null);
        check("sin sesión se responde 401 sin llamar", r3.status, 401);
        check("y no hubo peticiones", raw3.llamadas.size(), 0);
    }

    // ── I · la capa HTTP real, contra un servidor de verdad ──────────────────

    static void httpDeVerdad() throws Exception {
        titulo("La capa HTTP real (servidor local)");

        final List<String> recibido = new ArrayList<String>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 8907), 0);
        server.createContext("/", new com.sun.net.httpserver.HttpHandler() {
            public void handle(HttpExchange ex) throws java.io.IOException {
                String cuerpo = leer(ex.getRequestBody());
                recibido.add(ex.getRequestMethod() + " " + ex.getRequestURI()
                        + " auth=" + ex.getRequestHeaders().getFirst("Authorization")
                        + " ct=" + ex.getRequestHeaders().getFirst("Content-Type")
                        + " :: " + cuerpo);
                byte[] out;
                int code;
                if (ex.getRequestURI().getPath().startsWith("/error")) {
                    code = 403;
                    out = "{\"error\":{\"status\":403,\"message\":\"Forbidden\"}}".getBytes("UTF-8");
                } else if (ex.getRequestURI().getPath().startsWith("/vacio")) {
                    code = 204;
                    out = new byte[0];
                } else {
                    code = 200;
                    out = "{\"ok\":true}".getBytes("UTF-8");
                }
                ex.sendResponseHeaders(code, out.length == 0 ? -1 : out.length);
                if (out.length > 0) {
                    OutputStream os = ex.getResponseBody();
                    os.write(out);
                    os.close();
                } else {
                    ex.close();
                }
            }
        });
        server.start();

        try {
            SpotifyBackend.UrlRawHttp http = new SpotifyBackend.UrlRawHttp(3000, 3000);
            String base = "http://127.0.0.1:8907";

            MacroRunner.Response r1 = http.send("POST", base + "/ok?uri=x", "{\"uris\":[\"a\"]}",
                    "application/json", "TOKEN123");
            check("POST con cuerpo: status", r1.status, 200);
            check("POST con cuerpo: respuesta leída", r1.body, "{\"ok\":true}");
            contiene("llegó la autorización", recibido.get(0), "auth=Bearer TOKEN123");
            contiene("llegó el content-type", recibido.get(0), "ct=application/json");
            contiene("llegó el cuerpo", recibido.get(0), ":: {\"uris\":[\"a\"]}");

            MacroRunner.Response r2 = http.send("PUT", base + "/ok", null, null, "T2");
            check("PUT sin cuerpo: status", r2.status, 200);
            contiene("sin cuerpo no se anuncia content-type", recibido.get(1), "ct=null");

            MacroRunner.Response r3 = http.send("DELETE", base + "/error", null, null, "T3");
            check("un 403 llega como 403", r3.status, 403);
            contiene("y con su cuerpo de error", r3.body, "Forbidden");

            MacroRunner.Response r4 = http.send("POST", base + "/vacio", null, null, "T4");
            check("un 204 sin cuerpo no revienta", r4.status, 204);

            MacroRunner.Response r5 = new SpotifyBackend.UrlRawHttp(400, 400)
                    .send("GET", "http://127.0.0.1:1/nada", null, null, "T5");
            check("un destino inalcanzable se traduce a 0", r5.status, 0);
            contiene("y el motor lo llama «sin conexión»",
                    MacroRunner.revisar(r5, "library"), "Sin conexión");
        } finally {
            server.stop(0);
        }
    }

    static String leer(InputStream is) {
        try {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[1024];
            int n;
            while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
            return new String(bos.toByteArray(), "UTF-8");
        } catch (Exception e) {
            return "";
        }
    }

    // ── H · orígenes de lista ────────────────────────────────────────────────

    /** Http con guion: responde según lo que reconozca en la URL. */
    static final class HttpGuion implements MacroRunner.Http {
        final List<String> llamadas = new ArrayList<String>();
        final List<String[]> guion = new ArrayList<String[]>();   // {fragmento, status, cuerpo}
        int porDefectoStatus = 200;
        String porDefectoBody = "{}";

        HttpGuion cuando(String fragmento, int status, String cuerpo) {
            guion.add(new String[] { fragmento, Integer.toString(status), cuerpo });
            return this;
        }

        public MacroRunner.Response send(String method, String url, String jsonBody) {
            llamadas.add(method + " " + url + (jsonBody == null ? "" : " :: " + jsonBody));
            for (int i = 0; i < guion.size(); i++) {
                String[] fila = guion.get(i);
                if (url.contains(fila[0])) {
                    return new MacroRunner.Response(Integer.parseInt(fila[1]), fila[2]);
                }
            }
            return new MacroRunner.Response(porDefectoStatus, porDefectoBody);
        }

        int escrituras() {
            int n = 0;
            for (int i = 0; i < llamadas.size(); i++) {
                if (!llamadas.get(i).startsWith("GET ")) n++;
            }
            return n;
        }
    }

    static MacroRunner.Macro macroLista(String id, String source, String action, String target,
                                        String targetPl, String sourcePl) {
        return new MacroRunner.Macro(id, id, true, source, action, target, targetPl, sourcePl);
    }

    /** Una página de playlist con las canciones que se pidan. */
    static String paginaPlaylist(String next, String... ids) {
        StringBuilder sb = new StringBuilder("{\"items\":[");
        for (int i = 0; i < ids.length; i++) {
            if (i > 0) sb.append(',');
            sb.append("{\"is_local\":false,\"item\":{\"id\":\"").append(ids[i])
              .append("\",\"uri\":\"spotify:track:").append(ids[i])
              .append("\",\"name\":\"Canción ").append(ids[i])
              .append("\",\"type\":\"track\",\"is_local\":false,")
              .append("\"artists\":[{\"name\":\"Artista\"}]}}");
        }
        sb.append("],\"next\":").append(next == null ? "null" : ("\"" + next + "\"")).append('}');
        return sb.toString();
    }

    static void seleccionDeListas() {
        titulo("Qué orígenes de lista asume el servicio");

        check("novedades de playlist con origen",
                MacroRunner.esDeSegundoPlano(macroLista("a", "playlist_new", "copy", "liked", null, "PLS")), true);
        check("novedades de playlist sin origen no",
                MacroRunner.esDeSegundoPlano(macroLista("b", "playlist_new", "copy", "liked", null, null)), false);
        check("playlist entera copiando sí",
                MacroRunner.esDeSegundoPlano(macroLista("c", "playlist_all", "copy", "liked", null, "PLS")), true);
        check("playlist entera eliminando no",
                MacroRunner.esDeSegundoPlano(macroLista("d", "playlist_all", "remove", "liked", null, "PLS")), false);
        check("playlist entera moviendo no",
                MacroRunner.esDeSegundoPlano(macroLista("e", "playlist_all", "move", "playlist", "PLT", "PLS")), false);
        contiene("y lo explica",
                MacroRunner.motivoExclusion(macroLista("e", "playlist_all", "move", "playlist", "PLT", "PLS")),
                "sólo se ejecuta a mano");
        check("mover novedades sí",
                MacroRunner.esDeSegundoPlano(macroLista("f", "playlist_new", "move", "playlist", "PLT", "PLS")), true);
        check("mover sin playlist de origen no",
                MacroRunner.esDeSegundoPlano(macroLista("g", "liked_new", "move", "playlist", "PLT", null)), false);
        check("recientes a la cola",
                MacroRunner.esDeSegundoPlano(macroLista("h", "recently_played", "queue", null, null, null)), true);
        check("top a una playlist con id",
                MacroRunner.esDeSegundoPlano(macroLista("i", "top_tracks", "copy", "playlist", "PLT", null)), true);
        check("novedades de me gusta quitando de una playlist",
                MacroRunner.esDeSegundoPlano(macroLista("j", "liked_new", "remove", "playlist", "PLT", null)), true);
        check("un origen inventado no",
                MacroRunner.esDeSegundoPlano(macroLista("k", "lo_que_sea", "queue", null, null, null)), false);
        check("quitar del origen sobre novedades sí",
                MacroRunner.esDeSegundoPlano(macroLista("l", "playlist_new", "remove_from_source", null, null, "PLS")), true);
        check("quitar del origen sin playlist de origen no",
                MacroRunner.esDeSegundoPlano(macroLista("m", "liked_new", "remove_from_source", null, null, null)), false);
        check("quitar del origen sobre la playlist entera no",
                MacroRunner.esDeSegundoPlano(macroLista("n", "playlist_all", "remove_from_source", null, null, "PLS")), false);

        List<MacroRunner.Macro> mezcla = lista(
                macro("uno", MacroRunner.SOURCE_CURRENT_TRACK, "queue", null, null),
                macroLista("dos", "top_tracks", "copy", "liked", null, null));
        check("las de canción se separan", MacroRunner.deCancionActual(mezcla).size(), 1);
        check("las de lista también", MacroRunner.deLista(mezcla).size(), 1);
    }

    static void lecturaDeOrigenes() {
        titulo("Lectura de los orígenes (paginación y filtrado)");

        HttpGuion http = new HttpGuion()
                .cuando("pagina2", 200, paginaPlaylist(null, "t3"))
                .cuando("/playlists/PLS/items", 200,
                        "{\"items\":["
                        + "{\"is_local\":false,\"item\":{\"id\":\"t1\",\"uri\":\"spotify:track:t1\",\"name\":\"Uno\",\"type\":\"track\",\"artists\":[{\"name\":\"A\"},{\"name\":\"B\"}]}},"
                        + "{\"is_local\":true,\"item\":{\"id\":\"loc\",\"uri\":\"spotify:track:loc\",\"name\":\"Local\",\"type\":\"track\"}},"
                        + "{\"item\":{\"id\":\"ep\",\"uri\":\"spotify:episode:ep\",\"name\":\"Pódcast\",\"type\":\"episode\"}},"
                        + "{\"item\":null},"
                        + "{\"item\":{\"id\":\"t2\",\"uri\":\"spotify:track:t2\",\"name\":\"Dos\",\"type\":\"track\",\"artists\":[]}}"
                        + "],\"next\":\"https://api.spotify.com/v1/pagina2\"}");

        MacroRunner.Origen o = MacroRunner.resolverOrigen(
                macroLista("x", "playlist_all", "copy", "liked", null, "PLS"), http);

        check("sin error", o.error, null);
        check("descarta locales, pódcast y nulos, y sigue la página", o.pistas.size(), 3);
        check("primera canción", o.pistas.get(0).uri, "spotify:track:t1");
        check("artistas unidos", o.pistas.get(0).artists, "A, B");
        check("segunda página incluida", o.pistas.get(2).uri, "spotify:track:t3");
        check("dos peticiones, no más", http.llamadas.size(), 2);
        check("el id sale del uri", o.pistas.get(0).id(), "t1");

        HttpGuion malo = new HttpGuion().cuando("/playlists/PLS/items", 403, "{}");
        MacroRunner.Origen ko = MacroRunner.resolverOrigen(
                macroLista("y", "playlist_all", "copy", "liked", null, "PLS"), malo);
        contiene("un 403 se explica", ko.error, "no es tuya ni colaborativa");

        HttpGuion top = new HttpGuion().cuando("/me/top/tracks",
                200, "{\"items\":[{\"id\":\"z1\",\"uri\":\"spotify:track:z1\",\"name\":\"Z\",\"type\":\"track\"}]}");
        MacroRunner.Origen ot = MacroRunner.resolverOrigen(
                macroLista("z", "top_tracks", "queue", null, null, null), top);
        check("el top llega sin envoltura", ot.pistas.size(), 1);
        contiene("y pide el rango corto", top.llamadas.get(0), "time_range=short_term");
    }

    static void primeraPasadaIncremental() {
        titulo("Primera pasada de un origen incremental");

        Memoria store = new Memoria();
        Reloj reloj = new Reloj();
        HttpGuion http = new HttpGuion()
                .cuando("/playlists/PLS/items", 200, paginaPlaylist(null, "t1", "t2"));

        MacroRunner.Macro m = macroLista("m1", "playlist_new", "copy", "liked", null, "PLS");
        List<MacroRunner.Outcome> r1 = MacroRunner.runListas(lista(m), http, store, reloj, false, null);

        check("no aplica nada la primera vez", r1.get(0).status, MacroRunner.OMITIDA);
        contiene("y lo dice", r1.get(0).message, "Punto de partida");
        check("no escribe en Spotify", http.escrituras(), 0);

        // Aparece una canción nueva y se avanza el reloj más allá del freno.
        reloj.avanzar(MacroRunner.INTERVALO_LISTAS_MS + 1000L);
        HttpGuion http2 = new HttpGuion()
                .cuando("/playlists/PLS/items", 200, paginaPlaylist(null, "t1", "t2", "t3"));
        List<MacroRunner.Outcome> r2 = MacroRunner.runListas(lista(m), http2, store, reloj, false, null);

        check("la segunda vez sólo procesa la nueva", r2.get(0).aplicadas, 1);
        contiene("y escribe sólo esa", http2.llamadas.get(1), "spotify%3Atrack%3At3");
        check("una sola escritura", http2.escrituras(), 1);

        // Y a la siguiente, sin novedades, no escribe nada.
        reloj.avanzar(MacroRunner.INTERVALO_LISTAS_MS + 1000L);
        HttpGuion http3 = new HttpGuion()
                .cuando("/playlists/PLS/items", 200, paginaPlaylist(null, "t1", "t2", "t3"));
        List<MacroRunner.Outcome> r3 = MacroRunner.runListas(lista(m), http3, store, reloj, false, null);
        check("sin novedades no hace nada", r3.get(0).status, MacroRunner.OMITIDA);
        check("y no escribe", http3.escrituras(), 0);
    }

    static void primeraPasadaNoIncremental() {
        titulo("Un origen no incremental sí actúa en su primera pasada");

        Memoria store = new Memoria();
        Reloj reloj = new Reloj();
        HttpGuion http = new HttpGuion().cuando("/me/top/tracks", 200,
                "{\"items\":[{\"id\":\"z1\",\"uri\":\"spotify:track:z1\",\"name\":\"Z\",\"type\":\"track\"},"
                + "{\"id\":\"z2\",\"uri\":\"spotify:track:z2\",\"name\":\"Z2\",\"type\":\"track\"}]}");

        MacroRunner.Macro m = macroLista("m2", "top_tracks", "copy", "liked", null, null);
        List<MacroRunner.Outcome> r = MacroRunner.runListas(lista(m), http, store, reloj, false, null);

        check("aplica desde el primer momento", r.get(0).status, MacroRunner.APLICADA);
        check("las dos canciones", r.get(0).aplicadas, 2);
        check("una sola escritura por lote", http.escrituras(), 1);

        // Repetir no vuelve a escribir: en segundo plano nunca se repite lo hecho.
        reloj.avanzar(MacroRunner.INTERVALO_LISTAS_MS + 1000L);
        HttpGuion otra = new HttpGuion().cuando("/me/top/tracks", 200,
                "{\"items\":[{\"id\":\"z1\",\"uri\":\"spotify:track:z1\",\"name\":\"Z\",\"type\":\"track\"}]}");
        List<MacroRunner.Outcome> r2 = MacroRunner.runListas(lista(m), otra, store, reloj, false, null);
        check("no repite lo ya hecho", r2.get(0).status, MacroRunner.OMITIDA);
        check("y no escribe", otra.escrituras(), 0);
    }

    static void frenoDeQuinceMinutos() {
        titulo("Freno de los repasos");

        Memoria store = new Memoria();
        Reloj reloj = new Reloj();
        MacroRunner.Macro m = macroLista("m3", "top_tracks", "copy", "liked", null, null);

        HttpGuion a = new HttpGuion().cuando("/me/top/tracks", 200, "{\"items\":[]}");
        MacroRunner.runListas(lista(m), a, store, reloj, false, null);
        check("la primera vez sí mira", a.llamadas.size(), 1);

        reloj.avanzar(60_000L);
        HttpGuion b = new HttpGuion().cuando("/me/top/tracks", 200, "{\"items\":[]}");
        List<MacroRunner.Outcome> r = MacroRunner.runListas(lista(m), b, store, reloj, false, null);
        check("un minuto después, ni una petición", b.llamadas.size(), 0);
        contiene("y se dice por qué", r.get(0).message, "hace poco");

        reloj.avanzar(MacroRunner.INTERVALO_LISTAS_MS);
        HttpGuion c = new HttpGuion().cuando("/me/top/tracks", 200, "{\"items\":[]}");
        MacroRunner.runListas(lista(m), c, store, reloj, false, null);
        check("pasados los 15 minutos vuelve a mirar", c.llamadas.size(), 1);

        // «Ejecutar» en la app se salta el freno.
        HttpGuion d = new HttpGuion().cuando("/me/top/tracks", 200, "{\"items\":[]}");
        MacroRunner.runListas(lista(m), d, store, reloj, true, null);
        check("forzar se salta el freno", d.llamadas.size(), 1);
    }

    static void topesYLotes() {
        titulo("Topes por ejecución y tamaño de los lotes");

        // 120 canciones a «Tus me gusta»: 50 por petición.
        StringBuilder items = new StringBuilder("{\"items\":[");
        for (int i = 0; i < 120; i++) {
            if (i > 0) items.append(',');
            items.append("{\"id\":\"k").append(i).append("\",\"uri\":\"spotify:track:k").append(i)
                 .append("\",\"name\":\"K\",\"type\":\"track\"}");
        }
        items.append("],\"next\":null}");

        Memoria store = new Memoria();
        Reloj reloj = new Reloj();
        HttpGuion http = new HttpGuion().cuando("/playlists/PLS/items", 200, items.toString());
        MacroRunner.Macro m = macroLista("m4", "playlist_all", "copy", "liked", null, "PLS");
        List<MacroRunner.Outcome> r = MacroRunner.runListas(lista(m), http, store, reloj, false, null);

        check("las 120 se aplican", r.get(0).aplicadas, 120);
        check("en tres peticiones de 50", http.escrituras(), 3);

        // La cola es de una en una: el tope baja a 40.
        Memoria store2 = new Memoria();
        HttpGuion cola = new HttpGuion().cuando("/playlists/PLS/items", 200, items.toString());
        MacroRunner.Macro q = macroLista("m5", "playlist_all", "queue", null, null, "PLS");
        List<MacroRunner.Outcome> rq = MacroRunner.runListas(lista(q), cola, store2, new Reloj(), false, null);

        check("encontradas todas", rq.get(0).encontradas, 120);
        check("pero sólo 40 por vuelta", rq.get(0).aplicadas, 40);
        contiene("y se avisa", rq.get(0).message, "queda para la próxima");
        check("40 POST a la cola", cola.escrituras(), 40);
    }

    static void moverBorraDelOrigen() {
        titulo("«Mover» quita del origen después de copiar");

        Memoria store = new Memoria();
        Reloj reloj = new Reloj();
        // Primera pasada fija el punto de partida; se avanza y llega una nueva.
        MacroRunner.Macro m = macroLista("m6", "playlist_new", "move", "playlist", "PLT", "PLS");
        MacroRunner.runListas(lista(m),
                new HttpGuion().cuando("/playlists/PLS/items", 200, paginaPlaylist(null, "t1")),
                store, reloj, false, null);

        reloj.avanzar(MacroRunner.INTERVALO_LISTAS_MS + 1000L);
        HttpGuion http = new HttpGuion().cuando("/playlists/PLS/items", 200, paginaPlaylist(null, "t1", "t2"));
        List<MacroRunner.Outcome> r = MacroRunner.runListas(lista(m), http, store, reloj, false, null);

        check("aplicada", r.get(0).status, MacroRunner.APLICADA);
        check("dos escrituras: añadir y quitar", http.escrituras(), 2);
        contiene("primero añade al destino", http.llamadas.get(1), "POST https://api.spotify.com/v1/playlists/PLT/items");
        contiene("después quita del origen", http.llamadas.get(2), "DELETE https://api.spotify.com/v1/playlists/PLS/items");
        contiene("con el cuerpo que espera Spotify", http.llamadas.get(2), "{\"items\":[{\"uri\":\"spotify:track:t2\"}]}");
    }

    static void unaSolaMacro() {
        titulo("Ejecutar una sola macro desde la app");

        Memoria store = new Memoria();
        Reloj reloj = new Reloj();
        MacroRunner.Macro a = macroLista("a", "top_tracks", "copy", "liked", null, null);
        MacroRunner.Macro b = macroLista("b", "recently_played", "copy", "liked", null, null);

        HttpGuion http = new HttpGuion()
                .cuando("/me/top/tracks", 200, "{\"items\":[]}")
                .cuando("/me/player/recently-played", 200, "{\"items\":[]}");
        List<MacroRunner.Outcome> r = MacroRunner.runListas(lista(a, b), http, store, reloj, true, "b");

        check("sólo se evalúa la pedida", r.size(), 1);
        check("y es la correcta", r.get(0).macroId, "b");
        contiene("con su petición", http.llamadas.get(0), "recently-played");
    }

    static void erroresDeLista() {
        titulo("Errores leyendo el origen");

        Memoria store = new Memoria();
        Reloj reloj = new Reloj();
        MacroRunner.Macro m = macroLista("m7", "liked_new", "copy", "playlist", "PLT", null);

        HttpGuion http = new HttpGuion().cuando("/me/tracks", 429, "{}");
        List<MacroRunner.Outcome> r = MacroRunner.runListas(lista(m), http, store, reloj, false, null);

        check("marcada como error", r.get(0).status, MacroRunner.ERROR);
        contiene("con el motivo", r.get(0).message, "Cupo de peticiones");
        check("sin escribir nada", http.escrituras(), 0);
        contiene("y queda anotado", MacroRunner.lastResult(m, store), "Cupo");

        // Un fallo al escribir no marca las canciones como vistas.
        Memoria store2 = new Memoria();
        HttpGuion http2 = new HttpGuion()
                .cuando("/me/top/tracks", 200,
                        "{\"items\":[{\"id\":\"z1\",\"uri\":\"spotify:track:z1\",\"name\":\"Z\",\"type\":\"track\"}]}")
                .cuando("/me/library", 500, "{}");
        MacroRunner.Macro t = macroLista("m8", "top_tracks", "copy", "liked", null, null);
        MacroRunner.runListas(lista(t), http2, store2, new Reloj(), false, null);
        check("no se da por vista al fallar", MacroRunner.leerVistas(t, store2).size(), 0);
    }

    static void historialDeSieteDias() {
        titulo("Historial de los últimos 7 días");

        Memoria store = new Memoria();
        Reloj reloj = new Reloj();
        MacroRunner.Macro m = macroLista("m9", "top_tracks", "copy", "liked", null, null);

        // Tres pasadas: una que aplica, una sin novedades y una con error.
        MacroRunner.runListas(lista(m),
                new HttpGuion().cuando("/me/top/tracks", 200,
                        "{\"items\":[{\"id\":\"h1\",\"uri\":\"spotify:track:h1\",\"name\":\"H\",\"type\":\"track\"}]}"),
                store, reloj, true, null);
        reloj.avanzar(3_600_000L);
        MacroRunner.runListas(lista(m),
                new HttpGuion().cuando("/me/top/tracks", 200,
                        "{\"items\":[{\"id\":\"h1\",\"uri\":\"spotify:track:h1\",\"name\":\"H\",\"type\":\"track\"}]}"),
                store, reloj, true, null);
        reloj.avanzar(3_600_000L);
        MacroRunner.runListas(lista(m),
                new HttpGuion().cuando("/me/top/tracks", 500, "{}"),
                store, reloj, true, null);

        List<String> h = MacroRunner.historial(m, store, reloj);
        check("una entrada por ejecución", h.size(), 3);
        check("la más reciente primero", h.get(0).split("\\|")[1], Integer.toString(MacroRunner.ERROR));
        check("la del medio fue omitida", h.get(1).split("\\|")[1], Integer.toString(MacroRunner.OMITIDA));
        check("la primera aplicó una", h.get(2).split("\\|")[2], "1");
        contiene("y guarda el mensaje", h.get(2), "procesadas");

        // Lo de hace ocho días ya no cuenta.
        reloj.avanzar(8L * 24L * 60L * 60L * 1000L);
        check("a los 8 días el historial queda vacío",
                MacroRunner.historial(m, store, reloj).size(), 0);

        // Y no crece sin límite.
        Memoria store2 = new Memoria();
        Reloj reloj2 = new Reloj();
        MacroRunner.Macro t = macroLista("m10", "top_tracks", "copy", "liked", null, null);
        for (int i = 0; i < MacroRunner.MAX_HISTORIAL + 20; i++) {
            MacroRunner.registrar(t, store2, reloj2, MacroRunner.OMITIDA, 0, "vuelta " + i);
            reloj2.avanzar(60_000L);
        }
        check("el historial se recorta", MacroRunner.historial(t, store2, reloj2).size(),
                MacroRunner.MAX_HISTORIAL);

        // Las macros de canción actual también dejan rastro.
        Memoria store3 = new Memoria();
        Reloj reloj3 = new Reloj();
        MacroRunner.Macro c = macro("m11", MacroRunner.SOURCE_CURRENT_TRACK, "queue", null, null);
        HttpFalso http = new HttpFalso();
        MacroRunner.run(pista(), lista(c), http, store3, reloj3, true);
        check("también las de la canción actual",
                MacroRunner.historial(c, store3, reloj3).size(), 1);
    }

    // ── T · no cortar la música al borrar la canción que suena ───────────────

    static void noCortarLaReproduccion() {
        titulo("Borrar la canción en curso no detiene la reproducción");
        String C = MacroRunner.SOURCE_CURRENT_TRACK;

        MacroRunner.EnReproduccion desdePL1 =
                new MacroRunner.EnReproduccion(pista(), "PL1");
        MacroRunner.EnReproduccion sinContexto =
                new MacroRunner.EnReproduccion(pista(), "");

        // Qué se considera peligroso y qué no.
        check("quitar de la playlist que suena corta la música",
                MacroRunner.cortariaLaReproduccion(
                        macro("a", C, "remove", "playlist", "PL1"), pista().uri, desdePL1), true);
        check("quitar de OTRA playlist no corta nada",
                MacroRunner.cortariaLaReproduccion(
                        macro("b", C, "remove", "playlist", "PL2"), pista().uri, desdePL1), false);
        check("quitar de Tus me gusta no corta nada",
                MacroRunner.cortariaLaReproduccion(
                        macro("c", C, "remove", "liked", null), pista().uri, desdePL1), false);
        check("copiar nunca corta nada",
                MacroRunner.cortariaLaReproduccion(
                        macro("d", C, "copy", "playlist", "PL1"), pista().uri, desdePL1), false);
        check("encolar nunca corta nada",
                MacroRunner.cortariaLaReproduccion(
                        macro("e", C, "queue", null, null), pista().uri, desdePL1), false);
        check("otra canción de la misma playlist no corta nada",
                MacroRunner.cortariaLaReproduccion(
                        macro("f", C, "remove", "playlist", "PL1"),
                        "spotify:track:zzz999", desdePL1), false);
        check("sin playlist de contexto no hay nada que proteger",
                MacroRunner.cortariaLaReproduccion(
                        macro("g", C, "remove", "playlist", "PL1"), pista().uri, sinContexto), false);
        check("sin saber qué suena se actúa como siempre",
                MacroRunner.cortariaLaReproduccion(
                        macro("h", C, "remove", "playlist", "PL1"), pista().uri, null), false);

        // El borrado peligroso se aplaza y se aplica en la pasada siguiente.
        HttpFalso h = new HttpFalso();
        Memoria store = new Memoria();
        Reloj reloj = new Reloj();
        List<MacroRunner.Macro> ms = lista(macro("rp", C, "remove", "playlist", "PL1"));

        List<MacroRunner.Outcome> r1 =
                MacroRunner.run(pista(), ms, h, store, reloj, false, desdePL1);
        check("mientras suena: se omite", r1.get(0).status, MacroRunner.OMITIDA);
        check("y NO sale ninguna petición", h.llamadas.size(), 0);
        contiene("y se explica por qué", r1.get(0).message, "Aplazada");
        check("queda apuntada para después",
                MacroRunner.leerAplazadas(ms.get(0), store).size(), 1);

        // Ya suena otra: la aplazada se aplica.
        MacroRunner.Track otra = new MacroRunner.Track("spotify:track:zzz999", "Otra", "Alguien");
        MacroRunner.EnReproduccion ahoraOtra = new MacroRunner.EnReproduccion(otra, "PL1");
        MacroRunner.run(otra, ms, h, store, reloj, false, ahoraOtra);
        contiene("al cambiar de canción se aplica la aplazada", h.llamadas.get(0),
                "DELETE " + MacroRunner.API + "/playlists/PL1/items");
        contiene("y es la canción correcta", h.llamadas.get(0), "spotify:track:abc123");
        // La nueva pasa a ocupar su sitio: ahora es ella la que suena.
        check("y la que suena ahora toma el relevo en la lista",
                MacroRunner.leerAplazadas(ms.get(0), store).get(0), otra.uri);
        check("sin acumularse de más",
                MacroRunner.leerAplazadas(ms.get(0), store).size(), 1);

        // Sin contexto de playlist, el borrado sale al instante como siempre.
        HttpFalso h2 = new HttpFalso();
        MacroRunner.run(pista(), lista(macro("rp2", C, "remove", "playlist", "PL1")),
                h2, new Memoria(), new Reloj(), false, sinContexto);
        check("reproducción sin playlist: se borra al momento", h2.llamadas.size(), 1);

        // El repaso de listas aparta la canción viva y la deja para la próxima.
        HttpFalso h3 = new HttpFalso();
        h3.body = paginaPlaylist(null, "abc123");
        Memoria store3 = new Memoria();
        Reloj reloj3 = new Reloj();
        MacroRunner.Macro lista3 =
                macroLista("pl", "playlist_new", "remove_from_source", null, null, "PL1");
        // Primera pasada de un origen incremental: sólo fija el punto de partida.
        MacroRunner.runListas(lista(lista3), h3, store3, reloj3, true, null, desdePL1);
        h3.llamadas.clear();
        MacroRunner.runListas(lista(lista3), h3, store3, reloj3, true, null, desdePL1);
        check("repaso de listas: no se borra lo que suena", contarEscrituras(h3), 0);
    }

    /** Peticiones que modifican algo, ignorando las lecturas del origen. */
    static int contarEscrituras(HttpFalso h) {
        int n = 0;
        for (int i = 0; i < h.llamadas.size(); i++) {
            if (!h.llamadas.get(i).startsWith("GET ")) n++;
        }
        return n;
    }
}
