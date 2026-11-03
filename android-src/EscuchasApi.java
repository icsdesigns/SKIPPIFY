package com.skippify.app;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * Escuchas leídas de la API de Spotify (`/me/player/recently-played`), como
 * respaldo de las notificaciones: ven lo que suena en CUALQUIER dispositivo de
 * la cuenta, no sólo en este móvil.
 *
 * Esta clase es la parte que decide, y no importa nada de Android para poder
 * probarse con javac a secas (ver scripts/native-tests/PruebasEscuchasApi). El
 * sondeo, las preferencias y la escritura al historial viven en
 * `EscuchasApiBackground`.
 *
 * Dos problemas que resuelve:
 *
 *  1. La API NO dice cuánto se escuchó de cada canción: sólo que pasó de los
 *     ~30 s y a qué hora terminó. Pero los umbrales de la app dependen del
 *     tiempo escuchado (el motor exige un 25 % de la duración, entre 20 y 90 s,
 *     y las estadísticas un 5 % para anotar y un 80 % para contar tiempo).
 *     Se estima con el hueco hasta el final de la escucha anterior: nadie
 *     escucha dos canciones a la vez, así que lo escuchado de una no puede ser
 *     más que el tiempo transcurrido desde que acabó la anterior. Es una cota
 *     superior (una pausa larga la infla), pero deja fuera lo que de verdad
 *     son saltos: una canción saltada a los 40 s tras otra que acabó hace 40 s
 *     no llega al umbral.
 *
 *  2. La misma escucha puede llegar por notificación y por API. Antes de anotar
 *     nada se pregunta al historial local si ya la tiene.
 */
final class EscuchasApi {

    private EscuchasApi() { }

    /** Tolerancia entre la hora de la API y la medida en el propio móvil. */
    static final long TOLERANCIA_MS = 60_000L;
    /**
     * Cuánto puede haberse empezado la escucha antes de `fin - duración`: las
     * pausas alargan el tiempo entre que empieza y termina una canción.
     */
    static final long HOLGURA_PAUSAS_MS = 20L * 60_000L;
    /** Spotify sólo lista lo que ha sonado al menos esto (o la canción entera si es más corta). */
    static final long MIN_SPOTIFY_MS = 30_000L;

    // Los umbrales del motor de duplicadas, que antes vivían privados en él.
    static final double MOTOR_RATIO = 0.25;
    static final long MOTOR_MIN_MS = 20_000L;
    static final long MOTOR_MAX_MS = 90_000L;
    /** Con menos de esta fracción de la canción las estadísticas ni la anotan. */
    static final double REGISTRO_RATIO = 0.05;

    /** Una fila de `recently-played`. */
    static final class Reproduccion {
        final String track;
        final String artist;
        final long durationMs;
        final long finMs;

        Reproduccion(String track, String artist, long durationMs, long finMs) {
            this.track = track == null ? "" : track.trim();
            this.artist = artist == null ? "" : artist.trim();
            this.durationMs = durationMs;
            this.finMs = finMs;
        }
    }

    /** Una escucha que supera los umbrales y no estaba en el historial. */
    static final class Aceptada {
        final Reproduccion r;
        final long inicioMs;
        final long msEstimados;

        Aceptada(Reproduccion r, long inicioMs, long msEstimados) {
            this.r = r;
            this.inicioMs = inicioMs;
            this.msEstimados = msEstimados;
        }
    }

    /** Lo que el historial local sabe. Lo implementa el motor de duplicadas. */
    interface Historial {
        /** ¿Hay anotada esa canción con su inicio entre las dos marcas? */
        boolean hayEscucha(String track, String artist, long desdeMs, long hastaMs);
    }

    // ── Umbral ───────────────────────────────────────────────────────────────

    /** Lo que debe sonar una canción para que el motor la dé por escuchada. */
    static long umbralMotorMs(long durationMs) {
        if (durationMs <= 0L) return MOTOR_MIN_MS;
        long required = (long) (durationMs * MOTOR_RATIO);
        if (required < MOTOR_MIN_MS) required = MOTOR_MIN_MS;
        if (required > MOTOR_MAX_MS) required = MOTOR_MAX_MS;
        return required;
    }

    /** El umbral de la app: el del motor, y nunca por debajo del 5 % de las estadísticas. */
    static long umbralMs(long durationMs) {
        long motor = umbralMotorMs(durationMs);
        long registro = durationMs > 0L ? (long) Math.ceil(durationMs * REGISTRO_RATIO) : 0L;
        return Math.max(motor, registro);
    }

    // ── Lectura de la respuesta ──────────────────────────────────────────────

    /** Las reproducciones de la respuesta, de la más antigua a la más reciente. */
    static List<Reproduccion> parsear(String cuerpo) {
        List<Reproduccion> out = new ArrayList<Reproduccion>();
        Object raiz = MacroRunner.Json.parse(cuerpo);
        for (Object item : MacroRunner.Json.array(MacroRunner.Json.get(raiz, "items"))) {
            Map<String, Object> fila = MacroRunner.Json.object(item);
            if (fila == null) continue;
            Map<String, Object> pista = MacroRunner.Json.object(fila.get("track"));
            if (pista == null) continue;
            // Los podcasts y los archivos locales no son música de la cuenta.
            String tipo = MacroRunner.Json.string(pista, "type");
            if (tipo != null && !"track".equals(tipo)) continue;
            if (MacroRunner.Json.bool(pista, "is_local")) continue;

            String nombre = MacroRunner.Json.string(pista, "name");
            String artistas = nombresDeArtistas(pista.get("artists"));
            long duracion = numero(pista.get("duration_ms"));
            long fin = instante(MacroRunner.Json.string(fila, "played_at"));
            if (nombre == null || nombre.trim().isEmpty() || artistas.isEmpty()) continue;
            if (fin <= 0L) continue;

            out.add(new Reproduccion(nombre, artistas, duracion, fin));
        }
        Collections.sort(out, new Comparator<Reproduccion>() {
            public int compare(Reproduccion a, Reproduccion b) {
                return a.finMs < b.finMs ? -1 : (a.finMs > b.finMs ? 1 : 0);
            }
        });
        return out;
    }

    private static String nombresDeArtistas(Object artistas) {
        StringBuilder sb = new StringBuilder();
        for (Object a : MacroRunner.Json.array(artistas)) {
            String n = MacroRunner.Json.string(MacroRunner.Json.object(a), "name");
            if (n == null || n.trim().isEmpty()) continue;
            if (sb.length() > 0) sb.append(", ");
            sb.append(n.trim());
        }
        return sb.toString();
    }

    private static long numero(Object o) {
        return (o instanceof Number) ? ((Number) o).longValue() : 0L;
    }

    /** Fin de la reproducción más reciente de la lista, o 0 si no hay ninguna. */
    static long ultimoFin(List<Reproduccion> lista) {
        long max = 0L;
        for (Reproduccion r : lista) max = Math.max(max, r.finMs);
        return max;
    }

    // ── Decisión ─────────────────────────────────────────────────────────────

    /**
     * De las reproducciones posteriores a `ultimoFinMs`, las que hay que anotar.
     *
     * @param lista        ordenada de más antigua a más reciente
     * @param ultimoFinMs  fin de la última ya procesada (0 si no se sabe)
     * @param historial    lo que ya tiene el móvil; puede ser null
     */
    static List<Aceptada> filtrar(List<Reproduccion> lista, long ultimoFinMs, Historial historial) {
        List<Aceptada> out = new ArrayList<Aceptada>();
        long anteriorFin = ultimoFinMs;

        for (Reproduccion r : lista) {
            if (r.finMs <= ultimoFinMs) continue;

            long estimado = estimarEscuchado(r, anteriorFin);
            anteriorFin = r.finMs;

            if (estimado < umbralMs(r.durationMs)) continue;

            long inicio = r.finMs - estimado;
            if (historial != null) {
                long duracion = Math.max(r.durationMs, estimado);
                long desde = r.finMs - duracion - HOLGURA_PAUSAS_MS;
                long hasta = r.finMs + TOLERANCIA_MS;
                if (historial.hayEscucha(r.track, r.artist, desde, hasta)) continue;
            }
            out.add(new Aceptada(r, inicio, estimado));
        }
        return out;
    }

    /**
     * Cuánto se escuchó, como mucho: el hueco desde que acabó lo anterior,
     * acotado por la duración. Nunca por debajo de lo que Spotify garantiza.
     */
    static long estimarEscuchado(Reproduccion r, long anteriorFinMs) {
        long tope = r.durationMs > 0L ? r.durationMs : Long.MAX_VALUE;
        long garantizado = Math.min(tope, MIN_SPOTIFY_MS);

        long estimado = tope;
        if (anteriorFinMs > 0L) {
            long hueco = r.finMs - anteriorFinMs;
            if (hueco < estimado) estimado = hueco;
        }
        if (estimado < garantizado) estimado = garantizado;
        // Sin duración conocida no se puede dar por entera: se queda en lo seguro.
        if (r.durationMs <= 0L && estimado == Long.MAX_VALUE) estimado = garantizado;
        return estimado;
    }

    // ── Fecha ISO 8601 ───────────────────────────────────────────────────────

    /** `2026-11-02T10:11:12.345Z` → epoch ms; 0 si no se entiende. */
    static long instante(String iso) {
        if (iso == null) return 0L;
        String s = iso.trim();
        if (s.length() < 19 || s.charAt(4) != '-' || s.charAt(10) != 'T') return 0L;
        try {
            int anio = Integer.parseInt(s.substring(0, 4));
            int mes = Integer.parseInt(s.substring(5, 7));
            int dia = Integer.parseInt(s.substring(8, 10));
            int hora = Integer.parseInt(s.substring(11, 13));
            int min = Integer.parseInt(s.substring(14, 16));
            int seg = Integer.parseInt(s.substring(17, 19));
            long ms = 0L;
            int i = 19;
            if (i < s.length() && s.charAt(i) == '.') {
                int j = i + 1;
                while (j < s.length() && Character.isDigit(s.charAt(j))) j++;
                String frac = (s.substring(i + 1, j) + "000").substring(0, 3);
                ms = Long.parseLong(frac);
                i = j;
            }
            long desfaseMs = 0L;
            if (i < s.length() && (s.charAt(i) == '+' || s.charAt(i) == '-')) {
                int signo = s.charAt(i) == '-' ? -1 : 1;
                String z = s.substring(i + 1).replace(":", "");
                if (z.length() >= 4) {
                    desfaseMs = signo * (Long.parseLong(z.substring(0, 2)) * 3600_000L
                            + Long.parseLong(z.substring(2, 4)) * 60_000L);
                }
            }
            long dias = diasDesdeEpoch(anio, mes, dia);
            long base = ((dias * 24L + hora) * 60L + min) * 60L + seg;
            return base * 1000L + ms - desfaseMs;
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    /** Algoritmo de «días desde la época» (Howard Hinnant), sin java.time. */
    private static long diasDesdeEpoch(int y, int m, int d) {
        long anio = m <= 2 ? y - 1 : y;
        long era = (anio >= 0 ? anio : anio - 399) / 400;
        long yoe = anio - era * 400;
        long doy = (153L * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
        long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146097 + doe - 719468;
    }
}
