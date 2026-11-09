package com.skippify.app;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Pruebas del aviso de los domingos de los grupos y de los disparadores de
 * sincronización en segundo plano. Corre con javac/java a secas, como
 * PruebasResultados.
 */
public final class PruebasGrupos {

    static int fallos = 0;
    static int total = 0;

    static final TimeZone MADRID = TimeZone.getTimeZone("Europe/Madrid");
    static final TimeZone MEXICO = TimeZone.getTimeZone("America/Mexico_City");

    /** Instante a partir de «yyyy-MM-dd HH:mm» en la zona dada. */
    static long t(String texto, TimeZone zona) throws Exception {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.ROOT);
        f.setTimeZone(zona);
        return f.parse(texto).getTime();
    }

    static String local(long ms, TimeZone zona) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.ROOT);
        f.setTimeZone(zona);
        return f.format(new Date(ms));
    }

    public static void main(String[] args) throws Exception {
        // 2026-11-08 es domingo; 2026-11-09 lunes.
        check("la hora del aviso es las 17:00", RitmoGrupos.HORA_AVISO, 17);
        check("un miércoles apunta al domingo de esa semana",
                local(RitmoGrupos.proximoAviso(t("2026-11-04 10:00", MADRID), MADRID), MADRID), "2026-11-08 17:00");
        check("el domingo por la mañana, a esa misma tarde",
                local(RitmoGrupos.proximoAviso(t("2026-11-08 09:00", MADRID), MADRID), MADRID), "2026-11-08 17:00");
        check("justo a las 17:00 el próximo es el de la semana siguiente",
                local(RitmoGrupos.proximoAviso(t("2026-11-08 17:00", MADRID), MADRID), MADRID), "2026-11-15 17:00");
        check("el domingo por la noche, el de la semana siguiente",
                local(RitmoGrupos.proximoAviso(t("2026-11-08 22:30", MADRID), MADRID), MADRID), "2026-11-15 17:00");
        check("el lunes, el domingo que cierra esa semana",
                local(RitmoGrupos.proximoAviso(t("2026-11-09 08:00", MADRID), MADRID), MADRID), "2026-11-15 17:00");
        check("es hora LOCAL: en México son las 17:00 de allí",
                local(RitmoGrupos.proximoAviso(t("2026-11-04 10:00", MEXICO), MEXICO), MEXICO), "2026-11-08 17:00");
        check("y dos zonas distintas no dan el mismo instante",
                RitmoGrupos.proximoAviso(t("2026-11-04 10:00", MADRID), MADRID) != RitmoGrupos.proximoAviso(t("2026-11-04 10:00", MEXICO), MEXICO), true);
        check("el cambio de hora de otoño (25-10-2026) no corre el aviso",
                local(RitmoGrupos.proximoAviso(t("2026-10-21 12:00", MADRID), MADRID), MADRID), "2026-10-25 17:00");
        check("ni el de primavera (28-3-2027)",
                local(RitmoGrupos.proximoAviso(t("2027-03-24 12:00", MADRID), MADRID), MADRID), "2027-03-28 17:00");
        java.util.Calendar dia = java.util.Calendar.getInstance(MADRID, Locale.ROOT);
        dia.setTimeInMillis(RitmoGrupos.proximoAviso(t("2026-12-30 12:00", MADRID), MADRID));
        check("siempre cae en domingo", dia.get(java.util.Calendar.DAY_OF_WEEK), java.util.Calendar.SUNDAY);

        long aviso = t("2026-11-08 17:00", MADRID);
        check("a las 17:05 sin avisar aún, hay aviso pendiente",
                RitmoGrupos.avisoPendiente(t("2026-11-08 17:05", MADRID), 0L, MADRID), true);
        check("antes de las 17:00 no",
                RitmoGrupos.avisoPendiente(t("2026-11-08 16:59", MADRID), 0L, MADRID), false);
        check("si ya se avisó a las 17:00, no se repite",
                RitmoGrupos.avisoPendiente(t("2026-11-08 17:20", MADRID), aviso, MADRID), false);
        check("con el móvil encendido a las 20:00 aún se avisa (margen de 4 h)",
                RitmoGrupos.avisoPendiente(t("2026-11-08 20:59", MADRID), 0L, MADRID), true);
        check("pasado el margen ya no, que sería avisar de algo que acabó",
                RitmoGrupos.avisoPendiente(t("2026-11-08 21:00", MADRID), 0L, MADRID), false);
        check("el lunes no hay aviso pendiente de la semana que empieza",
                RitmoGrupos.avisoPendiente(t("2026-11-09 18:00", MADRID), 0L, MADRID), false);
        check("el aviso de la semana pasada no impide el de ésta",
                RitmoGrupos.avisoPendiente(t("2026-11-08 17:10", MADRID), t("2026-11-01 17:00", MADRID), MADRID), true);

        // Sincronización provocada por una escucha acabada.
        long ahora = 10_000_000L;
        check("sin sincronizaciones recientes, se espera sólo el margen de juntar escuchas",
                RitmoGrupos.esperaTrasEscucha(ahora, 0L), RitmoGrupos.ESPERA_TRAS_ESCUCHA_MS);
        check("si acaba de haber una, se espera a que pase el mínimo entre ellas",
                RitmoGrupos.esperaTrasEscucha(ahora, ahora - 60_000L), 120_000L);
        check("a punto de cumplirse el mínimo, rige el margen de juntar escuchas",
                RitmoGrupos.esperaTrasEscucha(ahora, ahora - 170_000L), RitmoGrupos.ESPERA_TRAS_ESCUCHA_MS);
        check("nunca más de una cada 3 minutos",
                RitmoGrupos.esperaTrasEscucha(ahora, ahora) >= RitmoGrupos.MIN_ENTRE_FORZADAS_MS, true);

        // WebView colgado.
        check("con un pulso reciente no está colgado",
                RitmoGrupos.colgado(ahora, ahora - 5 * 60_000L, ahora - 60 * 60_000L), false);
        check("sin pulso en 25 minutos, sí",
                RitmoGrupos.colgado(ahora, ahora - 25 * 60_000L, ahora - 60 * 60_000L), true);
        check("recién arrancado y aún sin pulso, no",
                RitmoGrupos.colgado(ahora, 0L, ahora - 2 * 60_000L), false);
        check("arrancado hace 30 minutos y sin pulso nunca, sí",
                RitmoGrupos.colgado(ahora, 0L, ahora - 30 * 60_000L), true);
        check("sin ningún dato (nunca arrancó) no se da por colgado",
                RitmoGrupos.colgado(ahora, 0L, 0L), false);
        check("el ritmo más lento de JS (5 min) cabe de sobra antes de darlo por colgado",
                RitmoGrupos.COLGADO_MS > 3 * 5 * 60_000L, true);
        check("el latido de seguridad es de 15 minutos",
                RitmoGrupos.LATIDO_MS, 15L * 60_000L);

        System.out.println();
        if (fallos > 0) {
            System.out.println("Grupos en segundo plano: " + fallos + " fallo(s) de " + total);
            System.exit(1);
        }
        System.out.println("Grupos en segundo plano: " + total + " comprobaciones, todo correcto.");
    }

    static void check(String etiqueta, Object real, Object esperado) {
        total += 1;
        boolean ok = esperado.equals(real);
        System.out.println("  " + (ok ? "✓" : "✗") + " " + etiqueta
                + (ok ? "" : "\n      esperado: " + esperado + "\n      recibido: " + real));
        if (!ok) fallos += 1;
    }
}
