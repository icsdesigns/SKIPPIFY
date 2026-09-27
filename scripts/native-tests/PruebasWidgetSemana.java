package com.skippify.app;

import java.util.ArrayList;
import java.util.List;
import java.util.TimeZone;

/**
 * Pruebas de las cifras del widget «Tu semana» (SemanaWidgetDatos). Corre con
 * javac/java a secas.
 */
public final class PruebasWidgetSemana {

    static int fallos = 0;
    static int total = 0;

    static long ms(String iso) {
        return java.time.Instant.parse(iso).toEpochMilli();
    }

    static EscuchasNube.Crudo ev(String iso, String event, String track, String artist, long dur) {
        return new EscuchasNube.Crudo(ms(iso), iso, event, track, artist, dur, false);
    }

    public static void main(String[] args) {
        TimeZone madrid = TimeZone.getTimeZone("Europe/Madrid");

        // Domingo 27 de septiembre de 2026, 23:30 en Madrid (21:30 UTC).
        long domingo = ms("2026-09-27T21:30:00Z");
        check("la semana empieza el lunes 00:00 local",
                SemanaWidgetDatos.inicioSemana(domingo, madrid), ms("2026-09-20T22:00:00Z"));
        check("el domingo es el día 6", SemanaWidgetDatos.diaDeSemana(domingo, madrid), 6);
        // Lunes 00:30 en Madrid sigue siendo domingo en UTC.
        long lunes = ms("2026-09-27T22:30:00Z");
        check("el lunes a las 00:30 ya es otra semana",
                SemanaWidgetDatos.inicioSemana(lunes, madrid), ms("2026-09-27T22:00:00Z"));
        check("y es el día 0", SemanaWidgetDatos.diaDeSemana(lunes, madrid), 0);

        List<EscuchasNube.Crudo> log = new ArrayList<EscuchasNube.Crudo>();
        // Domingo anterior: no cuenta.
        log.add(ev("2026-09-20T10:00:00Z", "playing", "Vieja", "Alguien", 200000));
        log.add(ev("2026-09-20T10:03:20Z", "paused", "Vieja", "Alguien", 200000));
        // Lunes: dos de Rosalía (una con otro artista) y una saltada a los 5 s.
        log.add(ev("2026-09-21T08:00:00Z", "playing", "Despechá", "Rosalía", 160000));
        log.add(ev("2026-09-21T08:02:40Z", "playing", "La Fama", "Rosalía, The Weeknd", 190000));
        log.add(ev("2026-09-21T08:05:50Z", "playing", "Corta", "Otro", 200000));
        log.add(ev("2026-09-21T08:05:55Z", "playing", "Despechá", "Rosalía", 160000));
        log.add(ev("2026-09-21T08:08:35Z", "stopped", "", "", 0));
        // Domingo: una que sigue sonando desde hace 2 minutos.
        log.add(ev("2026-09-27T21:28:00Z", "playing", "Suena", "Bad Bunny", 240000));

        String historial = "20260927:3:2;20260922:1:1;20260920:9:9";
        SemanaWidgetDatos.Resumen r = SemanaWidgetDatos.calcular(log, historial, domingo, madrid);

        check("cuenta las escuchas de la semana, también la que suena", r.escuchas, 4);
        check("la de 5 s no llega al 5 %", r.porDia[0], 3);
        check("la que suena cae en domingo", r.porDia[6], 1);
        check("hoy es domingo", r.hoy, 6);
        check("canciones distintas", r.distintas, 3);
        check("artista top por su primer nombre", r.artistaTop, "Rosalía");
        check("con sus escuchas", r.escuchasArtistaTop, 3);
        check("tiempo: 160+190+160+120 s", r.msEscuchados, 630000L);
        check("duplicadas desde el lunes", r.duplicadas, 4);
        check("saltadas desde el lunes", r.saltadas, 3);

        SemanaWidgetDatos.Resumen vacio = SemanaWidgetDatos.calcular(
                new ArrayList<EscuchasNube.Crudo>(), "", domingo, madrid);
        check("sin datos, cero escuchas", vacio.escuchas, 0);
        check("y sin artista", vacio.artistaTop, "");

        check("minutos sueltos", SemanaWidgetDatos.duracion(45 * 60000L), "45 min");
        check("horas justas", SemanaWidgetDatos.duracion(2 * 3600000L), "2 h");
        check("horas y minutos", SemanaWidgetDatos.duracion(5 * 3600000L + 20 * 60000L), "5 h 20 min");
        check("feat. cuenta para el primero", SemanaWidgetDatos.artistaPrincipal("Quevedo feat. Myke Towers"), "Quevedo");

        System.out.println();
        System.out.println("Widget de la semana: " + (total - fallos) + "/" + total + " pruebas correctas");
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
