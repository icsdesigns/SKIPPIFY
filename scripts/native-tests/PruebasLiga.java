package com.skippify.app;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pruebas de la subida de escuchas en segundo plano (EscuchasNube). Corre con
 * javac/java a secas, contra una red de mentira.
 *
 * Lo que más importa es que el ID de cada documento coincida con el que calcula
 * useLeague.js: si no, cuando la app se abre y sube lo mismo, el ranking cuenta
 * cada canción dos veces. Los hashes esperados salen de ejecutar `hashId` de JS.
 */
public final class PruebasLiga {

    static int fallos = 0;
    static int total = 0;

    static final String UID = "uid-1";

    static long ms(String iso) {
        return java.time.Instant.parse(iso).toEpochMilli();
    }

    static EscuchasNube.Crudo ev(String iso, String event, String track, String artist, long dur, boolean js) {
        return new EscuchasNube.Crudo(ms(iso), iso, event, track, artist, dur, js);
    }

    static final class Memoria implements EscuchasNube.Store {
        final Map<String, String> m = new HashMap<String, String>();
        public String get(String k) { return m.get(k); }
        public void put(String k, String v) { m.put(k, v); }
    }

    static final class RedFalsa implements EscuchasNube.Http {
        final List<String> urls = new ArrayList<String>();
        final List<String> cuerpos = new ArrayList<String>();
        final List<String> bearers = new ArrayList<String>();
        String usuarioDelToken = UID;
        int estadoCommit = 200;

        public EscuchasNube.Response send(String method, String url, String body, String ct,
                                          String bearer, String referer) {
            urls.add(url);
            cuerpos.add(body);
            bearers.add(bearer);
            if (url.startsWith("https://securetoken.googleapis.com/")) {
                return new EscuchasNube.Response(200, "{\"id_token\":\"tok-" + urls.size()
                        + "\",\"expires_in\":\"3600\",\"user_id\":\"" + usuarioDelToken + "\"}");
            }
            return new EscuchasNube.Response(estadoCommit, "{}");
        }
    }

    static final EscuchasNube.TokenParser PARSER = new EscuchasNube.TokenParser() {
        public String[] parse(String body) {
            return new String[] { campo(body, "id_token"), campo(body, "expires_in"), campo(body, "user_id") };
        }
    };

    static String campo(String json, String k) {
        Matcher m = Pattern.compile("\"" + k + "\":\"([^\"]*)\"").matcher(json);
        return m.find() ? m.group(1) : null;
    }

    static Memoria configurado() {
        Memoria s = new Memoria();
        s.put(EscuchasNube.K_UID, UID);
        s.put(EscuchasNube.K_REFRESH, "refresh-1");
        s.put(EscuchasNube.K_API_KEY, "AIza-prueba");
        s.put(EscuchasNube.K_PROYECTO, "skippify-test");
        s.put(EscuchasNube.K_GRUPOS, "IVANDRA,otro");
        s.put(EscuchasNube.K_ACTIVO, "IVANDRA");
        return s;
    }

    public static void main(String[] args) {
        final TimeZone madrid = TimeZone.getTimeZone("Europe/Madrid");

        // ── El ID es el de useLeague.js ──
        check("hash igual que JS",
                EscuchasNube.hashId("uid-1|2026-09-22T10:03:20.000Z|Despechá|Rosalía|200000"), "fbbf4b72");
        check("también con emojis (pares UTF-16)",
                EscuchasNube.hashId("uid-1|2026-09-22T23:30:00.000Z|Canción 😀|Artista|180000"), "ab143f81");

        // ── Troceado, como ingestBackgroundEvents ──
        List<EscuchasNube.Crudo> log = new ArrayList<EscuchasNube.Crudo>();
        log.add(ev("2026-09-22T10:00:00.000Z", "playing", "Despechá", "Rosalía", 200000, false));
        log.add(ev("2026-09-22T10:01:00.000Z", "playing", "Despechá", "Rosalía", 200000, false));
        log.add(ev("2026-09-22T10:03:20.000Z", "paused", "Despechá", "Rosalía", 200000, false));
        log.add(ev("2026-09-22T11:00:00.000Z", "playing", "Corta", "X", 200000, false));
        log.add(ev("2026-09-22T11:00:05.000Z", "playing", "Media", "X", 200000, false));
        log.add(ev("2026-09-22T11:01:05.000Z", "stopped", "", "", 0, false));
        log.add(ev("2026-09-22T12:00:00.000Z", "playing", "Con la app", "Y", 200000, true));
        log.add(ev("2026-09-22T12:03:30.000Z", "paused", "Con la app", "Y", 200000, true));
        log.add(ev("2026-09-22T13:00:00.000Z", "playing", "Suena aún", "Z", 200000, false));

        List<EscuchasNube.Escucha> trozos = EscuchasNube.trocear(log);
        check("repetir «playing» de la misma canción no la parte", trozos.size(), 4);
        check("la escucha acaba en el evento que la cierra", trozos.get(0).playedAt, "2026-09-22T10:03:20.000Z");
        check("y dura lo que pasó entre ambos", trozos.get(0).msPlayed, 200000L);

        List<EscuchasNube.Escucha> subir = EscuchasNube.paraSubir(trozos);
        check("fuera: la de menos del 5 %, la captada con la app viva y la que sigue sonando", subir.size(), 2);
        check("la de un 30 % se registra sin minutos, como en JS", subir.get(1).msPlayed, 0L);

        // ── Día local ──
        check("playedAtDay es la medianoche de Madrid",
                EscuchasNube.diaLocal(ms("2026-09-22T23:30:00.000Z"), madrid), "2026-09-22T22:00:00.000Z");

        // ── Subida ──
        Memoria s = configurado();
        RedFalsa red = new RedFalsa();
        final long[] ahora = { ms("2026-09-22T14:00:00.000Z") };
        EscuchasNube.Clock reloj = new EscuchasNube.Clock() { public long now() { return ahora[0]; } };

        int n = EscuchasNube.subir(s, red, PARSER, reloj, log, madrid, false);
        check("sube las dos escuchas", n, 2);
        check("primero renueva el token y luego un solo commit", red.urls.size(), 2);
        check("el commit va con el token recién sacado", red.bearers.get(1), "tok-1");
        String cuerpo = red.cuerpos.get(1);
        check("documento con el ID de JS",
                cuerpo.contains("/users/uid-1/listening_events/fbbf4b72\""), true);
        check("con los grupos del usuario", cuerpo.contains("{\"stringValue\":\"IVANDRA\"},{\"stringValue\":\"otro\"}"), true);
        check("marcado como segundo plano", cuerpo.contains("notification_background"), true);
        check("createdAt con la hora del servidor", cuerpo.contains("REQUEST_TIME"), true);
        check("con merge (updateMask)", cuerpo.contains("\"updateMask\""), true);
        check("no sube lo captado con la app viva", cuerpo.contains("Con la app"), false);

        check("antes de una hora no vuelve a subir", EscuchasNube.subir(s, red, PARSER, reloj, log, madrid, false), 0);
        check("y lo ya subido no se repite", EscuchasNube.subir(s, red, PARSER, reloj, log, madrid, true), 0);
        check("sin peticiones de más", red.urls.size(), 2);

        // La que sonaba se cierra: sale en la siguiente hora, con el token guardado.
        log.add(ev("2026-09-22T13:03:20.000Z", "paused", "Suena aún", "Z", 200000, false));
        ahora[0] += EscuchasNube.INTERVALO_MS;
        check("una hora después sube la nueva", EscuchasNube.subir(s, red, PARSER, reloj, log, madrid, false), 1);
        // El ID token dura una hora: a la hora justa ya hay que renovarlo.
        check("renovando el token, que ya caducó", red.urls.size(), 4);
        check("y usando el nuevo", red.bearers.get(3), "tok-3");

        // ── Seguridad ──
        Memoria otro = configurado();
        RedFalsa redOtro = new RedFalsa();
        redOtro.usuarioDelToken = "uid-distinto";
        check("si la sesión es de otro usuario no sube", EscuchasNube.subir(otro, redOtro, PARSER, reloj, log, madrid, true), -1);
        check("ni llega a hacer el commit", redOtro.urls.size(), 1);

        Memoria caducado = configurado();
        RedFalsa red401 = new RedFalsa();
        red401.estadoCommit = 401;
        check("un 401 cuenta como fallo", EscuchasNube.subir(caducado, red401, PARSER, reloj, log, madrid, true), -1);
        check("y olvida el token para renovarlo", caducado.get(EscuchasNube.K_ID_TOKEN), "");
        check("sin avanzar lo subido", caducado.get(EscuchasNube.K_MARCA), null);

        Memoria sinGrupos = configurado();
        sinGrupos.put(EscuchasNube.K_GRUPOS, "");
        RedFalsa redSin = new RedFalsa();
        check("sin grupos no hace nada", EscuchasNube.subir(sinGrupos, redSin, PARSER, reloj, log, madrid, true), 0);
        check("ni una petición", redSin.urls.size(), 0);

        check("escapa comillas y barras", EscuchasNube.json("a\"b\\c\n"), "\"a\\\"b\\\\c\\n\"");

        System.out.println();
        System.out.println("Escuchas en segundo plano: " + (total - fallos) + "/" + total + " pruebas correctas");
        if (fallos > 0) System.exit(1);
    }

    static void check(String etiqueta, Object real, Object esperado) {
        total++;
        boolean ok = esperado == null ? real == null : esperado.equals(real);
        if (!ok) fallos++;
        System.out.println("  " + (ok ? "✓" : "✗") + " " + etiqueta
                + (ok ? "" : "  (esperado " + esperado + ", obtenido " + real + ")"));
    }
}
