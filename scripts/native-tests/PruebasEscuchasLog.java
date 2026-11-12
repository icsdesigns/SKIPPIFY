package com.skippify.app;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pruebas del troceado del log crudo (EscuchasLog). Corre con javac/java a secas.
 *
 * El hash tiene que coincidir con `hashId` de useLocalLeague.js: si no, una
 * escucha publicada desde el servicio y otra desde la app contarían dos veces.
 */
public final class PruebasEscuchasLog {

    static int fallos = 0;
    static int total = 0;

    static long ms(String iso) {
        return java.time.Instant.parse(iso).toEpochMilli();
    }

    static EscuchasLog.Crudo ev(String iso, String event, String track, String artist, long dur, boolean js) {
        return new EscuchasLog.Crudo(ms(iso), iso, event, track, artist, dur, js);
    }

    public static void main(String[] args) {
        // ── El ID es el de useLocalLeague.js ──
        check("hash igual que JS",
                EscuchasLog.hashId("uid-1|2026-09-22T10:03:20.000Z|Despechá|Rosalía|200000"), "fbbf4b72");
        check("también con emojis (pares UTF-16)",
                EscuchasLog.hashId("uid-1|2026-09-22T23:30:00.000Z|Canción 😀|Artista|180000"), "ab143f81");

        // ── Troceado, como ingestBackgroundEvents ──
        List<EscuchasLog.Crudo> log = new ArrayList<EscuchasLog.Crudo>();
        log.add(ev("2026-09-22T10:00:00.000Z", "playing", "Despechá", "Rosalía", 200000, false));
        log.add(ev("2026-09-22T10:01:00.000Z", "playing", "Despechá", "Rosalía", 200000, false));
        log.add(ev("2026-09-22T10:03:20.000Z", "paused", "Despechá", "Rosalía", 200000, false));
        log.add(ev("2026-09-22T11:00:00.000Z", "playing", "Corta", "X", 200000, false));
        log.add(ev("2026-09-22T11:00:05.000Z", "playing", "Media", "X", 200000, false));
        log.add(ev("2026-09-22T11:01:05.000Z", "stopped", "", "", 0, false));
        log.add(ev("2026-09-22T12:00:00.000Z", "playing", "Con la app", "Y", 200000, true));
        log.add(ev("2026-09-22T12:03:30.000Z", "paused", "Con la app", "Y", 200000, true));
        log.add(ev("2026-09-22T13:00:00.000Z", "playing", "Suena aún", "Z", 200000, false));

        List<EscuchasLog.Escucha> trozos = EscuchasLog.trocear(log);
        check("repetir «playing» de la misma canción no la parte", trozos.size(), 4);
        check("la escucha acaba en el evento que la cierra", trozos.get(0).playedAt, "2026-09-22T10:03:20.000Z");
        check("y dura lo que pasó entre ambos", trozos.get(0).msPlayed, 200000L);

        List<EscuchasLog.Escucha> subir = EscuchasLog.paraSubir(trozos);
        check("fuera: la de menos del 5 %, la captada con la app viva y la que sigue sonando", subir.size(), 2);
        check("la de un 30 % se registra sin minutos, como en JS", subir.get(1).msPlayed, 0L);

        System.out.println();
        System.out.println("Troceado del log: " + (total - fallos) + "/" + total + " pruebas correctas");
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
