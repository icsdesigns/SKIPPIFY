package com.skippify.app;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * Convierte el log crudo del listener (`skippify-spotify-events.ndjson`) en
 * escuchas cerradas.
 *
 * Lo usan el widget «Tu mes» y el WebView del servicio, que publica en los
 * grupos sin servidor las escuchas captadas con la app cerrada. No envía nada a
 * ningún servidor: Skippify ya no tiene backend propio (Firebase se desconectó
 * por completo en la v4.8).
 *
 *   · Las escuchas se trocean EXACTAMENTE como lo hace `ingestBackgroundEvents`
 *     en useNotifListener.js.
 *   · Lo que se captó con la app viva (`js: true` en el log) se descarta en
 *     `paraSubir`: JS ya lo registra en directo y contarlo aquí lo duplicaría.
 *
 * Sin importaciones de Android: se prueba con javac a secas.
 */
public final class EscuchasLog {

    /** Iguales a MIN_REGISTER_PROGRESS_RATIO y REGISTER_LISTEN_TIME_PROGRESS_RATIO. */
    static final double MIN_REGISTRO = 0.05;
    static final double MIN_TIEMPO = 0.80;
    static final long MAX_SEGMENTO_MS = 6L * 3600000L;

    private EscuchasLog() { }

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

    /** Una escucha ya cerrada. */
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

    /** El mismo FNV-1a que `hashId` en useLocalLeague.js, sobre unidades UTF-16. */
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
}
