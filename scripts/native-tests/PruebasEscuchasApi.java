package com.skippify.app;

import java.util.ArrayList;
import java.util.List;

/**
 * Pruebas de las escuchas leídas de la API de Spotify: que pasen por los mismos
 * umbrales que las de la notificación aunque la API no diga cuánto se escuchó,
 * y que la misma escucha no se anote dos veces.
 * Corre con javac/java a secas, como PruebasLiga.
 */
public final class PruebasEscuchasApi {

    static int fallos = 0;
    static int total = 0;

    static final long MIN = 60_000L;
    static final long T0 = EscuchasApi.instante("2026-11-02T10:00:00.000Z");

    public static void main(String[] args) {
        // ── Umbrales: los del motor de siempre, y el 5 % de las estadísticas ──
        check("una canción de 3 min exige 45 s", EscuchasApi.umbralMs(3 * MIN), 45_000L);
        check("una de 10 min se queda en el tope de 90 s", EscuchasApi.umbralMs(10 * MIN), 90_000L);
        check("una de 40 s exige el mínimo de 20 s", EscuchasApi.umbralMs(40_000L), 20_000L);
        check("sin duración conocida, el mínimo", EscuchasApi.umbralMs(0L), 20_000L);

        // ── Fechas ISO ────────────────────────────────────────────────────────
        check("la época", EscuchasApi.instante("1970-01-01T00:00:00.000Z"), 0L + 0L);
        check("una fecha con milisegundos",
                EscuchasApi.instante("2026-11-02T10:11:12.345Z"), 1793614272345L);
        check("sin fracción", EscuchasApi.instante("2026-11-02T10:11:12Z"), 1793614272000L);
        check("con desfase +01:00 son 60 min antes en UTC",
                EscuchasApi.instante("2026-11-02T11:11:12.000+01:00"), 1793614272000L);
        check("basura da 0", EscuchasApi.instante("ayer"), 0L);

        // ── Lectura de la respuesta ───────────────────────────────────────────
        String cuerpo = "{\"items\":["
                + fila("B", "Ana, Luis", 180_000, "2026-11-02T10:08:00.000Z", "track", false)
                + "," + fila("A", "Ana", 200_000, "2026-11-02T10:04:00.000Z", "track", false)
                + "," + fila("Pod", "Radio", 3_000_000, "2026-11-02T10:02:00.000Z", "episode", false)
                + "," + fila("Local", "Yo", 100_000, "2026-11-02T10:01:00.000Z", "track", true)
                + "]}";
        List<EscuchasApi.Reproduccion> lista = EscuchasApi.parsear(cuerpo);
        check("se leen dos pistas (sin podcast ni local)", lista.size(), 2);
        check("salen de la más antigua a la más reciente", lista.get(0).track, "A");
        check("los artistas se unen con coma", lista.get(1).artist, "Ana, Luis");
        check("la duración se lee", lista.get(1).durationMs, 180_000L);
        check("el último fin es el de B", EscuchasApi.ultimoFin(lista), T0 + 8 * MIN);
        check("un cuerpo roto no lanza", EscuchasApi.parsear("no json").size(), 0);

        // ── Lo que suena ahora (/me/player) ──────────────────────────────────
        String ahora = "{\"is_playing\":true,\"progress_ms\":42000,\"device\":{\"name\":\"Salón\"},"
                + "\"item\":{\"name\":\"Canción\",\"type\":\"track\",\"is_local\":false,\"duration_ms\":210000,"
                + "\"album\":{\"name\":\"Disco\"},\"artists\":[{\"name\":\"Ana\"},{\"name\":\"Luis\"}]}}";
        EscuchasApi.Ahora a = EscuchasApi.parsearAhora(ahora);
        check("se lee la canción en directo", a == null ? "null" : a.track, "Canción");
        check("los artistas se unen con coma", a.artist, "Ana, Luis");
        check("álbum y dispositivo", a.album + "/" + a.dispositivo, "Disco/Salón");
        check("duración y avance", a.durationMs + "/" + a.progressMs, "210000/42000");
        check("está sonando", a.sonando, true);
        check("en pausa se sigue leyendo", EscuchasApi.parsearAhora(ahora.replace("\"is_playing\":true", "\"is_playing\":false")).sonando, false);
        check("un podcast no cuenta", EscuchasApi.parsearAhora(ahora.replace("\"type\":\"track\"", "\"type\":\"episode\"")) == null, true);
        check("un archivo local no cuenta", EscuchasApi.parsearAhora(ahora.replace("\"is_local\":false", "\"is_local\":true")) == null, true);
        check("sin canción (204 sin cuerpo) es null", EscuchasApi.parsearAhora("") == null, true);
        check("un cuerpo roto no lanza", EscuchasApi.parsearAhora("no json") == null, true);

        // ── Estimación del tiempo escuchado ───────────────────────────────────
        EscuchasApi.Reproduccion tres = rep("X", "Y", 180_000, T0 + 10 * MIN);
        check("sin anterior se da por entera",
                EscuchasApi.estimarEscuchado(tres, 0L), 180_000L);
        check("con un hueco corto sólo cuenta el hueco",
                EscuchasApi.estimarEscuchado(tres, T0 + 10 * MIN - 50_000L), 50_000L);
        check("con un hueco largo, la canción entera",
                EscuchasApi.estimarEscuchado(tres, T0), 180_000L);
        check("nunca por debajo de lo que Spotify garantiza (30 s)",
                EscuchasApi.estimarEscuchado(tres, T0 + 10 * MIN - 5_000L), 30_000L);
        check("una canción de 20 s no se estima por encima de su duración",
                EscuchasApi.estimarEscuchado(rep("c", "d", 20_000, T0 + MIN), 0L), 20_000L);

        // ── Filtrado ──────────────────────────────────────────────────────────
        // Una canción de 3 min escuchada entera tras otra que acabó hace 5 min.
        List<EscuchasApi.Reproduccion> una = lista(rep("Prev", "P", 120_000, T0),
                rep("Entera", "E", 180_000, T0 + 5 * MIN));
        List<EscuchasApi.Aceptada> r = EscuchasApi.filtrar(una, T0 - MIN, null);
        check("las dos pasan el umbral", r.size(), 2);
        check("la entera empieza 3 min antes de acabar", r.get(1).inicioMs, T0 + 2 * MIN);

        // La saltada a los 40 s: la anterior acabó 40 s antes y el umbral es de 45 s.
        List<EscuchasApi.Reproduccion> saltada = lista(rep("Prev", "P", 120_000, T0),
                rep("Saltada", "S", 180_000, T0 + 40_000L));
        r = EscuchasApi.filtrar(saltada, T0 - MIN, null);
        check("una saltada a los 40 s de una de 3 min no cuenta", names(r), "Prev");

        // En cambio con 50 s sí llega.
        List<EscuchasApi.Reproduccion> casi = lista(rep("Prev", "P", 120_000, T0),
                rep("Casi", "C", 180_000, T0 + 50_000L));
        check("con 50 s sí supera los 45 s", names(EscuchasApi.filtrar(casi, T0 - MIN, null)), "Prev,Casi");

        // Una corta: el mínimo de Spotify (30 s) ya supera el umbral de 20 s.
        List<EscuchasApi.Reproduccion> corta = lista(rep("Corta", "K", 40_000, T0 + 35_000L));
        check("una de 40 s oída 35 s cuenta",
                names(EscuchasApi.filtrar(corta, T0, null)), "Corta");

        // Ya procesadas: no se repiten.
        List<EscuchasApi.Reproduccion> vieja = lista(rep("Vieja", "V", 180_000, T0));
        check("lo anterior al cursor se ignora",
                EscuchasApi.filtrar(vieja, T0, null).size(), 0);

        // ── Duplicados con el historial local ─────────────────────────────────
        final List<Object[]> historial = new ArrayList<Object[]>();
        // Empezó 10 s antes de lo esperado: dentro de la tolerancia.
        historial.add(new Object[] { "Entera", "E", T0 + 2 * MIN - 10_000L });
        EscuchasApi.Historial h = new EscuchasApi.Historial() {
            public boolean hayEscucha(String track, String artist, long desde, long hasta) {
                for (Object[] f : historial) {
                    long t = (Long) f[2];
                    if (f[0].equals(track) && f[1].equals(artist) && t >= desde && t <= hasta) return true;
                }
                return false;
            }
        };
        r = EscuchasApi.filtrar(una, T0 - MIN, h);
        check("la que ya midió el móvil no se duplica", names(r), "Prev");

        historial.clear();
        historial.add(new Object[] { "Entera", "E", T0 + 2 * MIN + 50_000L });
        check("empezada 50 s después del fin: dentro del minuto de tolerancia",
                names(EscuchasApi.filtrar(una, T0 - MIN, h)), "Prev");

        historial.clear();
        historial.add(new Object[] { "Entera", "E", T0 + 5 * MIN + 2 * MIN });
        check("más de un minuto después del fin ya no es la misma",
                names(EscuchasApi.filtrar(una, T0 - MIN, h)), "Prev,Entera");

        historial.clear();
        historial.add(new Object[] { "Entera", "E", T0 - 6 * MIN });
        check("una pausa de 5 min a media canción sigue siendo la misma",
                names(EscuchasApi.filtrar(lista(rep("Entera", "E", 180_000, T0 + 2 * MIN)), T0 - MIN, h)), "");

        historial.clear();
        historial.add(new Object[] { "Otra", "E", T0 + 2 * MIN });
        check("otra canción en esas fechas no tapa a la nueva",
                names(EscuchasApi.filtrar(una, T0 - MIN, h)), "Prev,Entera");

        System.out.println();
        if (fallos > 0) {
            System.out.println("Escuchas por API: " + fallos + " fallo(s) de " + total);
            System.exit(1);
        }
        System.out.println("Escuchas por API: " + total + " comprobaciones, todo correcto.");
    }

    static EscuchasApi.Reproduccion rep(String t, String a, long dur, long fin) {
        return new EscuchasApi.Reproduccion(t, a, dur, fin);
    }

    static List<EscuchasApi.Reproduccion> lista(EscuchasApi.Reproduccion... rs) {
        List<EscuchasApi.Reproduccion> out = new ArrayList<EscuchasApi.Reproduccion>();
        for (EscuchasApi.Reproduccion r : rs) out.add(r);
        return out;
    }

    static String names(List<EscuchasApi.Aceptada> l) {
        StringBuilder sb = new StringBuilder();
        for (EscuchasApi.Aceptada a : l) {
            if (sb.length() > 0) sb.append(",");
            sb.append(a.r.track);
        }
        return sb.toString();
    }

    static String fila(String nombre, String artistas, long dur, String playedAt, String tipo, boolean local) {
        StringBuilder arts = new StringBuilder();
        for (String a : artistas.split(", ")) {
            if (arts.length() > 0) arts.append(",");
            arts.append("{\"name\":\"").append(a).append("\"}");
        }
        return "{\"played_at\":\"" + playedAt + "\",\"track\":{\"name\":\"" + nombre
                + "\",\"type\":\"" + tipo + "\",\"is_local\":" + local
                + ",\"duration_ms\":" + dur + ",\"artists\":[" + arts + "]}}";
    }

    static void check(String etiqueta, Object real, Object esperado) {
        total += 1;
        boolean ok = esperado.equals(real);
        System.out.println("  " + (ok ? "✓" : "✗") + " " + etiqueta
                + (ok ? "" : "\n      esperado: " + esperado + "\n      recibido: " + real));
        if (!ok) fallos += 1;
    }
}
