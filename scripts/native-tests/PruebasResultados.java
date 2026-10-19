package com.skippify.app;

/**
 * Pruebas de las horas del aviso del ranking: el domingo a las 15:00 de Madrid,
 * en verano y en invierno, y los reintentos si la semana no ha llegado.
 * Corre con javac/java a secas, como PruebasLiga.
 */
public final class PruebasResultados {

    static int fallos = 0;
    static int total = 0;

    static long t(String iso) { return ResultadosLiga.parseIso(iso); }

    public static void main(String[] args) {
        // Sábado 17-10-2026 (verano): el próximo es el domingo 18 a las 13:00 UTC.
        check("un sábado apunta al domingo siguiente",
                ResultadosLiga.iso(ResultadosLiga.proximoDesvelado(t("2026-10-17T10:00:00.000Z"))),
                "2026-10-18T13:00:00.000Z");
        check("el domingo por la mañana apunta a ese mismo domingo",
                ResultadosLiga.iso(ResultadosLiga.proximoDesvelado(t("2026-10-18T08:00:00.000Z"))),
                "2026-10-18T13:00:00.000Z");
        check("justo a las 15:00 el próximo ya es el de la semana siguiente",
                ResultadosLiga.iso(ResultadosLiga.proximoDesvelado(t("2026-10-18T13:00:00.000Z"))),
                "2026-10-25T14:00:00.000Z");
        check("el domingo del cambio de hora son las 15:00 de invierno",
                ResultadosLiga.iso(ResultadosLiga.proximoDesvelado(t("2026-10-24T12:00:00.000Z"))),
                "2026-10-25T14:00:00.000Z");
        check("y en primavera las 15:00 de verano",
                ResultadosLiga.iso(ResultadosLiga.proximoDesvelado(t("2027-03-27T12:00:00.000Z"))),
                "2027-03-28T13:00:00.000Z");
        check("el último desvelado de un lunes es el del domingo",
                ResultadosLiga.iso(ResultadosLiga.ultimoDesvelado(t("2026-10-19T09:00:00.000Z"))),
                "2026-10-18T13:00:00.000Z");
        check("a las 15:00 en punto el último ya es ese",
                ResultadosLiga.iso(ResultadosLiga.ultimoDesvelado(t("2026-10-18T13:00:00.000Z"))),
                "2026-10-18T13:00:00.000Z");
        check("el último tras el cambio de hora cruza bien la semana",
                ResultadosLiga.iso(ResultadosLiga.ultimoDesvelado(t("2026-10-25T13:30:00.000Z"))),
                "2026-10-18T13:00:00.000Z");

        long a1505 = t("2026-10-18T13:05:00.000Z");
        check("con grupos pendientes a las 15:05 se reintenta en 15 minutos",
                ResultadosLiga.iso(ResultadosLiga.siguienteAlarma(a1505, true)), "2026-10-18T13:20:00.000Z");
        check("sin pendientes se espera al domingo siguiente",
                ResultadosLiga.iso(ResultadosLiga.siguienteAlarma(a1505, false)), "2026-10-25T14:00:00.000Z");
        check("el martes ya no se reintenta",
                ResultadosLiga.iso(ResultadosLiga.siguienteAlarma(t("2026-10-20T10:00:00.000Z"), true)),
                "2026-10-25T14:00:00.000Z");
        check("a las 14:50 la alarma no se adelanta por haber pendientes de la semana pasada",
                ResultadosLiga.iso(ResultadosLiga.siguienteAlarma(t("2026-10-18T12:50:00.000Z"), true)),
                "2026-10-18T13:00:00.000Z");

        check("antes de las 15:00 del domingo se precomprueba",
                ResultadosLiga.antesDelDesvelado(t("2026-10-18T05:00:00.000Z")), true);
        check("el miércoles no",
                ResultadosLiga.antesDelDesvelado(t("2026-10-14T05:00:00.000Z")), false);

        long objetivo = t("2026-10-18T13:00:00.000Z");
        check("la semana esperando en next cuenta como publicada",
                ResultadosLiga.publicada("2026-10-11T13:00:00.000Z", "2026-10-18T13:00:00.000Z", objetivo), true);
        check("y ya subida arriba también",
                ResultadosLiga.publicada("2026-10-18T13:00:00.000Z", "", objetivo), true);
        check("con sólo la semana anterior no está publicada",
                ResultadosLiga.publicada("2026-10-11T13:00:00.000Z", "", objetivo), false);
        check("un documento antiguo sin revealAt no está publicado",
                ResultadosLiga.publicada("", "", objetivo), false);

        System.out.println();
        if (fallos > 0) {
            System.out.println("Aviso del ranking: " + fallos + " fallo(s) de " + total);
            System.exit(1);
        }
        System.out.println("Aviso del ranking: " + total + " comprobaciones, todo correcto.");
    }

    static void check(String etiqueta, Object real, Object esperado) {
        total += 1;
        boolean ok = esperado.equals(real);
        System.out.println("  " + (ok ? "✓" : "✗") + " " + etiqueta
                + (ok ? "" : "\n      esperado: " + esperado + "\n      recibido: " + real));
        if (!ok) fallos += 1;
    }
}
