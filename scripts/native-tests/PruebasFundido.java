package com.skippify.app;

/**
 * Pruebas del detector de fundido: clasificación de la transición entre dos
 * canciones a partir de posiciones y duraciones. Corre con javac/java a secas,
 * como PruebasTemporizador:
 *
 *   javac -d out android-src/FundidoDetector.java scripts/native-tests/PruebasFundido.java
 *   java -cp out com.skippify.app.PruebasFundido
 *
 * (también lo ejecuta `npm run test:nativo`).
 */
public final class PruebasFundido {

    static int fallos = 0;
    static int total = 0;

    /** Transición «de libro»: la anterior sonaba, 200 s, sin hueco, aviso de notificación. */
    static FundidoDetector.Entrada base(long restanteMs, long primeraVistaMs) {
        FundidoDetector.Entrada e = new FundidoDetector.Entrada();
        e.anteriorDuracionMs = 200_000L;
        e.anteriorRestanteMs = restanteMs;
        e.anteriorRestanteConocido = true;
        e.anteriorSonandoAlCerrar = true;
        e.huecoSesionesMs = 0L;
        e.mismaCancion = false;
        e.posicionPrimeraVistaMs = primeraVistaMs;
        e.edadSesionMs = 0L;
        e.origen = "notification";
        e.nuevaDuracionMs = 180_000L;
        return e;
    }

    public static void main(String[] args) {
        FundidoDetector.Resultado r;

        // Final natural, el aviso llega tarde: la nueva ya lleva 8 s y la anterior acaba de terminar.
        r = FundidoDetector.clasificar(base(0L, 8_000L));
        check("final natural con solape de 8 s (aviso tardío): etiqueta", r.etiqueta, FundidoDetector.PROBABLE);
        check("  solape = 8 s", r.solapeMs, 8_000L);
        check("  confianza alta", r.confianza >= 0.8, true);

        // El mismo fundido visto al principio: a la anterior aún le quedan 7,7 s.
        r = FundidoDetector.clasificar(base(7_700L, 300L));
        check("fundido visto al empezar la nueva", r.etiqueta, FundidoDetector.PROBABLE);
        check("  solape = 8 s", r.solapeMs, 8_000L);

        // Cambio normal: la nueva lleva 0,3 s y la anterior acabó hace 0,3 s.
        r = FundidoDetector.clasificar(base(-300L, 300L));
        check("cambio normal a los 0,3 s", r.etiqueta, FundidoDetector.SIN_FUNDIDO);
        check("  confianza alta", r.confianza >= 0.8, true);

        // Aviso tardío SIN fundido: la nueva lleva 8 s pero la anterior acabó hace 8 s.
        r = FundidoDetector.clasificar(base(-8_000L, 8_000L));
        check("aviso tardío sin fundido", r.etiqueta, FundidoDetector.SIN_FUNDIDO);
        check("  solape 0", r.solapeMs, 0L);

        // Salto manual: a la anterior le quedaban 100 s.
        r = FundidoDetector.clasificar(base(100_000L, 300L));
        check("salto manual", r.etiqueta, FundidoDetector.NO_APLICA);
        check("  motivo", r.motivo, "salto_manual");

        // Casi al final pero fuera de lo coherente (16 s): sigue siendo salto.
        r = FundidoDetector.clasificar(base(15_700L, 300L));
        check("quedaban 16 s: salto manual", r.motivo, "salto_manual");

        // Pausa: la anterior estaba en pausa a mitad de canción.
        FundidoDetector.Entrada e = base(90_000L, 300L);
        e.anteriorSonandoAlCerrar = false;
        r = FundidoDetector.clasificar(e);
        check("anterior en pausa", r.motivo, "anterior_en_pausa");
        check("  no aplica", r.etiqueta, FundidoDetector.NO_APLICA);

        // «Parado» publicado en la recta final no es una pausa.
        e = base(800L, 300L);
        e.anteriorSonandoAlCerrar = false;
        r = FundidoDetector.clasificar(e);
        check("parada al final de la pista no cuenta como pausa", r.etiqueta, FundidoDetector.SIN_FUNDIDO);

        // Reanudación tras una pausa larga: la nueva empieza mucho después del final.
        e = base(0L, 300L);
        e.huecoSesionesMs = 40_000L;
        r = FundidoDetector.clasificar(e);
        check("hueco largo entre sesiones", r.motivo, "hueco_largo");
        r = FundidoDetector.clasificar(base(-30_000L, 300L));
        check("la nueva empezó 30 s después de acabar la anterior", r.motivo, "hueco_largo");

        // La misma canción se reabre (reanudación a mitad).
        e = base(0L, 95_000L);
        e.mismaCancion = true;
        r = FundidoDetector.clasificar(e);
        check("misma canción reabierta", r.motivo, "misma_cancion_reabierta");

        // Primera vista con la nueva ya muy avanzada: no se puede juzgar.
        r = FundidoDetector.clasificar(base(-60_000L, 60_000L));
        check("primera vista tardía", r.motivo, "primera_vista_tardia");

        // Datos ausentes.
        e = base(0L, 300L);
        e.anteriorDuracionMs = -1L;
        check("sin duración de la anterior", FundidoDetector.clasificar(e).motivo, "falta_duracion_anterior");
        e = base(0L, 300L);
        e.anteriorRestanteConocido = false;
        check("sin posición de la anterior", FundidoDetector.clasificar(e).motivo, "falta_posicion_anterior");
        e = base(0L, -1L);
        check("sin posición de la nueva", FundidoDetector.clasificar(e).motivo, "falta_posicion_nueva");
        check("entrada nula", FundidoDetector.clasificar(null).etiqueta, FundidoDetector.NO_APLICA);
        r = FundidoDetector.clasificar(e);
        check("  y no inventa el solape", r.tieneSolape(), false);

        // Zonas grises.
        r = FundidoDetector.clasificar(base(2_000L, 2_000L));
        check("solape de 4 s medido a mitad: sólo posible", r.etiqueta, FundidoDetector.POSIBLE);
        r = FundidoDetector.clasificar(base(0L, 1_000L));
        check("solape de 1 s: cambio normal", r.etiqueta, FundidoDetector.SIN_FUNDIDO);
        r = FundidoDetector.clasificar(base(0L, 1_600L));
        check("solape de 1,6 s: posible, no probable", r.etiqueta, FundidoDetector.POSIBLE);
        r = FundidoDetector.clasificar(base(0L, 14_500L));
        check("solape de 14,5 s: posible con confianza baja", r.confianza <= 0.3 && r.etiqueta.equals(FundidoDetector.POSIBLE), true);
        e = base(0L, 8_000L);
        e.origen = "sonda";
        e.edadSesionMs = 5_000L;
        r = FundidoDetector.clasificar(e);
        check("sonda y vista tardía restan confianza", r.confianza < 0.85 && r.etiqueta.equals(FundidoDetector.PROBABLE), true);

        System.out.println();
        System.out.println("Fundido: " + (total - fallos) + "/" + total + " pruebas correctas");
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
