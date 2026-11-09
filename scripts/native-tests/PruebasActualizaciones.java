package com.skippify.app;

/**
 * Pruebas de cuándo se avisa de una versión nueva: el plazo de 6 horas desde la
 * publicación, la fecha de la alarma y la lectura de la fecha de GitHub.
 * Corre con javac/java a secas, como PruebasMacros.
 */
public final class PruebasActualizaciones {

    static int fallos = 0;
    static int total = 0;

    private static final long H = 60L * 60L * 1000L;
    private static final long MIN = 60_000L;

    public static void main(String[] args) {
        final long pub = ActualizacionAviso.parsearFecha("2026-05-14T09:30:00Z");
        final long inst = 100L, nueva = 101L;
        ActualizacionAviso.Decision d;

        // ── Lectura de la fecha ──
        check("1970-01-02 son 86 400 000 ms", ActualizacionAviso.parsearFecha("1970-01-02T00:00:00Z"), 86_400_000L);
        check("fecha con año bisiesto", ActualizacionAviso.parsearFecha("2024-03-01T00:00:00Z") - ActualizacionAviso.parsearFecha("2024-02-28T00:00:00Z"), 2 * 24 * H);
        check("2000-01-01 (época + 10957 días)", ActualizacionAviso.parsearFecha("2000-01-01T00:00:00Z"), 946_684_800_000L);
        check("zona +02:00 resta dos horas", ActualizacionAviso.parsearFecha("2026-05-14T11:30:00+02:00"), pub);
        check("zona -0300 suma tres horas", ActualizacionAviso.parsearFecha("2026-05-14T06:30:00-0300"), pub);
        check("fracciones de segundo se ignoran", ActualizacionAviso.parsearFecha("2026-05-14T09:30:00.123Z"), pub);
        check("sin zona se toma como UTC", ActualizacionAviso.parsearFecha("2026-05-14T09:30:00"), pub);
        check("nulo no se lee", ActualizacionAviso.parsearFecha(null), -1L);
        check("vacío no se lee", ActualizacionAviso.parsearFecha(""), -1L);
        check("basura no se lee", ActualizacionAviso.parsearFecha("ayer por la tarde"), -1L);
        check("mes 13 no se lee", ActualizacionAviso.parsearFecha("2026-13-01T00:00:00Z"), -1L);
        check("published_at manda sobre created_at",
                ActualizacionAviso.fechaDeRelease("2026-05-14T09:30:00Z", "2026-05-01T00:00:00Z"), pub);
        check("sin published_at vale created_at",
                ActualizacionAviso.fechaDeRelease(null, "2026-05-14T09:30:00Z"), pub);
        check("published_at ilegible vale created_at",
                ActualizacionAviso.fechaDeRelease("?", "2026-05-14T09:30:00Z"), pub);
        check("ninguna fecha: -1", ActualizacionAviso.fechaDeRelease(null, null), -1L);

        // ── Decisión ──
        d = ActualizacionAviso.decidir(pub + 10 * MIN, pub, nueva, inst, 0L);
        check("10 min tras publicar: se programa, no se avisa", d.accion, ActualizacionAviso.Accion.PROGRAMAR);
        check("la alarma es publicación + 6 h + margen", d.cuandoMs, pub + 6 * H + ActualizacionAviso.MARGEN_ALARMA_MS);
        check("y la apertura, publicación + 6 h", d.aperturaMs, pub + 6 * H);

        d = ActualizacionAviso.decidir(pub + 6 * H - 1, pub, nueva, inst, 0L);
        check("a 1 ms del plazo aún no se avisa", d.accion, ActualizacionAviso.Accion.PROGRAMAR);

        d = ActualizacionAviso.decidir(pub + 6 * H, pub, nueva, inst, 0L);
        check("justo a las 6 h se avisa", d.accion, ActualizacionAviso.Accion.NOTIFICAR);

        d = ActualizacionAviso.decidir(pub + 3 * 24 * H, pub, nueva, inst, 0L);
        check("con días de antigüedad se avisa de inmediato", d.accion, ActualizacionAviso.Accion.NOTIFICAR);

        d = ActualizacionAviso.decidir(pub + 7 * H, pub, nueva, inst, nueva);
        check("versión ya avisada: nada", d.accion, ActualizacionAviso.Accion.NADA);
        d = ActualizacionAviso.decidir(pub + 7 * H, pub, nueva, inst, nueva + 5);
        check("avisada una posterior: nada", d.accion, ActualizacionAviso.Accion.NADA);
        d = ActualizacionAviso.decidir(pub + 7 * H, pub, nueva, inst, nueva - 1);
        check("avisada una anterior: se avisa de la nueva", d.accion, ActualizacionAviso.Accion.NOTIFICAR);

        d = ActualizacionAviso.decidir(pub + 10 * MIN, pub, nueva, inst, nueva);
        check("retenida pero ya avisada: no se programa nada", d.accion, ActualizacionAviso.Accion.NADA);

        d = ActualizacionAviso.decidir(pub + 7 * H, pub, inst, inst, 0L);
        check("misma versión que la instalada: nada", d.accion, ActualizacionAviso.Accion.NADA);
        d = ActualizacionAviso.decidir(pub + 7 * H, pub, inst - 1, inst, 0L);
        check("versión más antigua que la instalada: nada", d.accion, ActualizacionAviso.Accion.NADA);
        d = ActualizacionAviso.decidir(pub + 7 * H, pub, nueva, 0L, 0L);
        check("sin saber qué hay instalado: nada", d.accion, ActualizacionAviso.Accion.NADA);

        d = ActualizacionAviso.decidir(pub + 10 * MIN, -1L, nueva, inst, 0L);
        check("sin fecha: se avisa como antes (no se retiene)", d.accion, ActualizacionAviso.Accion.NOTIFICAR);
        d = ActualizacionAviso.decidir(pub + 10 * MIN, 0L, nueva, inst, 0L);
        check("fecha cero: también se avisa", d.accion, ActualizacionAviso.Accion.NOTIFICAR);

        // Reloj del móvil
        d = ActualizacionAviso.decidir(pub - 5 * MIN, pub, nueva, inst, 0L);
        check("reloj unos minutos atrasado: se retiene", d.accion, ActualizacionAviso.Accion.PROGRAMAR);
        check("y la alarma sigue siendo publicación + 6 h + margen", d.cuandoMs, pub + 6 * H + ActualizacionAviso.MARGEN_ALARMA_MS);
        d = ActualizacionAviso.decidir(pub - 3 * 24 * H, pub, nueva, inst, 0L);
        check("reloj días atrasado: no se espera a un futuro absurdo", d.accion, ActualizacionAviso.Accion.NOTIFICAR);
        d = ActualizacionAviso.decidir(pub + 30 * 24 * H, pub, nueva, inst, 0L);
        check("reloj muy adelantado: se avisa", d.accion, ActualizacionAviso.Accion.NOTIFICAR);

        // ── Cuándo consulta el latido ──
        final long dia = 24 * H;
        final long apertura = pub + 6 * H;
        check("nunca comprobado: toca", ActualizacionAviso.tocaComprobar(pub, 0L, dia, 0L), true);
        check("comprobado hace una hora, sin pendiente: no toca", ActualizacionAviso.tocaComprobar(pub, pub - H, dia, 0L), false);
        check("comprobado hace un día: toca", ActualizacionAviso.tocaComprobar(pub, pub - dia, dia, 0L), true);
        check("marca en el futuro (reloj movido): toca", ActualizacionAviso.tocaComprobar(pub, pub + H, dia, 0L), true);
        check("pendiente aún no vencido: no toca antes del día",
                ActualizacionAviso.tocaComprobar(apertura - MIN, apertura - 2 * H, dia, apertura), false);
        check("pendiente vencido (alarma perdida): toca sin esperar al día",
                ActualizacionAviso.tocaComprobar(apertura + 2 * MIN, apertura - 3 * H, dia, apertura), true);
        check("pendiente vencido pero consultado hace 1 min: frena el reintento",
                ActualizacionAviso.tocaComprobar(apertura + 2 * MIN, apertura + MIN, dia, apertura), false);
        check("pendiente vencido y consultado hace 15 min: reintenta",
                ActualizacionAviso.tocaComprobar(apertura + 16 * MIN, apertura + MIN, dia, apertura), true);
        // La consulta que programó la alarma pone la marca «hace un momento»: no debe impedir la puntual.
        check("la marca de la consulta que programó no bloquea la alarma de las 6 h",
                ActualizacionAviso.tocaComprobar(apertura + ActualizacionAviso.MARGEN_ALARMA_MS, pub + MIN, dia, apertura), true);

        System.out.println();
        System.out.println("Actualizaciones: " + (total - fallos) + "/" + total + " pruebas correctas");
        if (fallos > 0) System.exit(1);
    }

    static void check(String etiqueta, Object real, Object esperado) {
        total++;
        boolean ok = esperado.equals(real);
        if (!ok) fallos++;
        System.out.println("  " + (ok ? "✓" : "✗") + " " + etiqueta
                + (ok ? "" : "  (esperado " + esperado + ", obtenido " + real + ")"));
    }
}
