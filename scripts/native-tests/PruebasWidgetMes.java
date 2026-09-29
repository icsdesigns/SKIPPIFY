package com.skippify.app;

import java.util.ArrayList;
import java.util.List;
import java.util.TimeZone;

/**
 * Pruebas de las medias del widget «Tu mes» (MesWidgetDatos). Corre con
 * javac/java a secas.
 */
public final class PruebasWidgetMes {

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

        // Martes 29 de septiembre de 2026, 23:30 en Madrid (21:30 UTC).
        long ahora = ms("2026-09-29T21:30:00Z");
        check("la ventana empieza 29 días antes de hoy, a las 00:00 local",
                MesWidgetDatos.inicioVentana(ahora, madrid), ms("2026-08-30T22:00:00Z"));
        check("de un día a sí mismo va un día",
                MesWidgetDatos.diasIncluidos(ahora, ahora, madrid), 1);
        check("el cambio de hora de octubre no descuadra los días",
                MesWidgetDatos.diasIncluidos(ms("2026-10-20T10:00:00Z"), ms("2026-10-30T10:00:00Z"), madrid), 11);

        List<EscuchasNube.Crudo> log = new ArrayList<EscuchasNube.Crudo>();
        // Martes 22: primer día del registro (el de 8 días de la v4.2.5).
        // Dos de Rosalía, una saltada a los 5 s y otra vez Rosalía.
        log.add(ev("2026-09-22T08:00:00Z", "playing", "Despechá", "Rosalía", 160000));
        log.add(ev("2026-09-22T08:02:40Z", "playing", "La Fama", "Rosalía, The Weeknd", 190000));
        log.add(ev("2026-09-22T08:05:50Z", "playing", "Corta", "Otro", 200000));
        log.add(ev("2026-09-22T08:05:55Z", "playing", "Despechá", "Rosalía", 160000));
        log.add(ev("2026-09-22T08:08:35Z", "stopped", "", "", 0));
        // Hoy: una que sigue sonando desde hace 2 minutos.
        log.add(ev("2026-09-29T21:28:00Z", "playing", "Suena", "Bad Bunny", 240000));

        String historial = "20260929:3:2;20260922:1:1";
        MesWidgetDatos.Resumen r = MesWidgetDatos.calcular(log, historial, ahora, madrid);

        check("cuenta las escuchas, también la que suena; la de 5 s no llega", r.escuchas, 4);
        check("tiempo: 160+190+160+120 s", r.msEscuchados, 630000L);
        check("con datos desde el día 22, reparte entre 8 días", r.diasEscucha, 8);
        check("escuchas al día", r.escuchasDia, 0.5);
        check("tiempo al día", r.msDia, 78750L);
        check("saltadas del mes", r.saltadas, 3);
        check("sin histórico anterior, las saltadas también van desde el 22", r.diasSaltadas, 8);
        check("saltadas al día", r.saltadasDia, 0.375);

        MesWidgetDatos.Resumen conAntiguas = MesWidgetDatos.calcular(
                log, historial + ";20260801:9:9", ahora, madrid);
        check("si el histórico viene de antes, las saltadas cubren el mes entero", conAntiguas.diasSaltadas, 30);
        check("pero lo de agosto no suma", conAntiguas.saltadas, 3);
        check("y las escuchas siguen con sus 8 días", conAntiguas.diasEscucha, 8);

        List<EscuchasNube.Crudo> mesEntero = new ArrayList<EscuchasNube.Crudo>(log);
        // Domingo 30 de agosto a las 23:00 en Madrid: fuera. Lunes 31 a las 10:00: dentro.
        mesEntero.add(ev("2026-08-30T21:00:00Z", "playing", "Fuera", "Nadie", 100000));
        mesEntero.add(ev("2026-08-30T21:01:40Z", "stopped", "", "", 0));
        mesEntero.add(ev("2026-08-31T08:00:00Z", "playing", "Dentro", "Alguien", 180000));
        mesEntero.add(ev("2026-08-31T08:03:00Z", "stopped", "", "", 0));
        MesWidgetDatos.Resumen mes = MesWidgetDatos.calcular(mesEntero, historial, ahora, madrid);
        check("con datos del primer día, reparte entre 30", mes.diasEscucha, 30);
        check("la de agosto 30 se queda fuera, la del 31 cuenta", mes.escuchas, 5);
        check("nunca más de 30 días", MesWidgetDatos.calcular(
                mesEntero, historial, ms("2026-12-01T10:00:00Z"), madrid).diasEscucha <= 30, true);

        MesWidgetDatos.Resumen vacio = MesWidgetDatos.calcular(
                new ArrayList<EscuchasNube.Crudo>(), "", ahora, madrid);
        check("sin datos, cero escuchas", vacio.escuchas, 0);
        check("y un día para no dividir entre cero", vacio.diasEscucha, 1);
        check("media cero", vacio.escuchasDia, 0.0);

        check("media con decimal", MesWidgetDatos.media(0.375), "0,4");
        check("media con medio", MesWidgetDatos.media(7.5), "7,5");
        check("media redonda sin decimal", MesWidgetDatos.media(3.0), "3");
        check("de 10 en adelante, sin decimales", MesWidgetDatos.media(23.4), "23");
        check("9,96 redondea a 10", MesWidgetDatos.media(9.96), "10");

        check("minutos sueltos", MesWidgetDatos.duracion(45 * 60000L), "45 min");
        check("horas justas", MesWidgetDatos.duracion(2 * 3600000L), "2 h");
        check("horas y minutos", MesWidgetDatos.duracion(5 * 3600000L + 20 * 60000L), "5 h 20 min");

        System.out.println();
        System.out.println("Widget del mes: " + (total - fallos) + "/" + total + " pruebas correctas");
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
