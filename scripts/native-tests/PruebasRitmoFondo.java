package com.skippify.app;

import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.TimeZone;

/** Pruebas de {@link RitmoFondo}: sondeo de la API y cambio de día. */
public final class PruebasRitmoFondo {

    static int total = 0;
    static int fallos = 0;
    static final TimeZone MADRID = TimeZone.getTimeZone("Europe/Madrid");

    public static void main(String[] args) throws Exception {
        long min = 60_000L;
        long ahora = 1_000_000_000_000L;

        // API de Spotify.
        check("en uso, a los 10 min aún no toca", RitmoFondo.tocaConsultarApi(ahora, ahora - 10 * min, true), false);
        check("en uso, a los 14 min sí", RitmoFondo.tocaConsultarApi(ahora, ahora - 14 * min, true), true);
        check("en reposo, a los 15 min aún no", RitmoFondo.tocaConsultarApi(ahora, ahora - 15 * min, false), false);
        check("en reposo, a los 29 min sí", RitmoFondo.tocaConsultarApi(ahora, ahora - 29 * min, false), true);
        check("nunca consultado: toca", RitmoFondo.tocaConsultarApi(ahora, 0L, false), true);
        check("reloj hacia atrás: toca", RitmoFondo.tocaConsultarApi(ahora, ahora + 60 * min, false), true);
        check("en reposo nunca pasa de media hora (50 canciones dan más de 2 h)",
                RitmoFondo.PERIODO_API_REPOSO_MS <= 30 * min, true);
        check("en uso no es más lento que el latido de 15 min",
                RitmoFondo.PERIODO_API_ACTIVO_MS < 15 * min, true);

        // Cambio de día.
        check("día local", RitmoFondo.diaLocal(t("2026-11-24 00:30"), MADRID), 20261124);
        check("a las 23:59 el día aún es el anterior", RitmoFondo.diaLocal(t("2026-11-23 23:59"), MADRID), 20261123);
        check("a las 22:00 el próximo cambio es a las 00:01 del día siguiente",
                RitmoFondo.proximoCambioDia(t("2026-11-23 22:00"), MADRID), t("2026-11-24 00:01"));
        check("a las 00:00:30 aún toca el de hoy",
                RitmoFondo.proximoCambioDia(t("2026-11-24 00:00") + 30_000L, MADRID), t("2026-11-24 00:01"));
        check("justo a las 00:01 pasa al día siguiente",
                RitmoFondo.proximoCambioDia(t("2026-11-24 00:01"), MADRID), t("2026-11-25 00:01"));
        check("cambio de hora de octubre (día de 25 h)",
                RitmoFondo.proximoCambioDia(t("2026-10-25 12:00"), MADRID), t("2026-10-26 00:01"));

        System.out.println();
        if (fallos > 0) {
            System.out.println("Ritmo en segundo plano: " + fallos + " fallo(s) de " + total);
            System.exit(1);
        }
        System.out.println("Ritmo en segundo plano: " + total + " comprobaciones, todo correcto.");
    }

    static long t(String s) throws Exception {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.ROOT);
        f.setTimeZone(MADRID);
        return f.parse(s).getTime();
    }

    static void check(String etiqueta, Object real, Object esperado) {
        total++;
        boolean ok = real == null ? esperado == null : real.equals(esperado);
        if (!ok) fallos++;
        System.out.println((ok ? "  ok   " : "  FALLO ") + etiqueta + (ok ? "" : "  (real " + real + ", esperado " + esperado + ")"));
    }
}
