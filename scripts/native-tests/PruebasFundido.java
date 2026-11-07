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

        pruebasReloj();

        System.out.println();
        System.out.println("Fundido: " + (total - fallos) + "/" + total + " pruebas correctas");
        if (fallos > 0) System.exit(1);
    }


    static final long MIN = 60_000L;

    /** Observa «sonando» cada 4 min durante `dur` ms desde `desde`; devuelve el instante final. */
    static long suena(SesionEscuchaReloj k, long desde, long dur) {
        long t = desde;
        long fin = desde + dur;
        while (t + 4 * MIN < fin) {
            t += 4 * MIN;
            k.alObservar(t, true, true);
        }
        k.alObservar(fin, true, false);
        return fin;
    }

    /** Sesiones de escucha: 10 min de hueco, 30 min de escucha activa. */
    static void pruebasReloj() {
        SesionEscuchaReloj.Cierre c;

        // 40 min seguidos con canciones de 4 min y luego silencio: un aviso.
        SesionEscuchaReloj k = new SesionEscuchaReloj();
        long t = 1_000_000L;
        k.alObservar(t, true, true);
        k.id = 7L;
        for (int i = 1; i < 10; i++) {
            t += 4 * MIN;
            c = k.alObservar(t, true, true);
            check("sin cierres mientras suena (" + i + ")", c, null);
        }
        t += 4 * MIN;
        k.alObservar(t, false, false);
        check("40 min sonando acumulados", k.activoMs, 40 * MIN);
        check("10 canciones", k.canciones, 10);
        c = k.alVencer(t + 10 * MIN - 1);
        check("a 10 min menos 1 ms no vence", c, null);
        c = k.alVencer(t + 10 * MIN + 1);
        check("pasados 10 min sin sonar vence", c != null, true);
        check("  pregunta (>= 30 min)", c.avisar, true);
        check("  con el id apuntado", c.id, 7L);
        check("  el fin es el último sonido", c.finMs, t);
        check("  y la sesión queda cerrada", k.abierta, false);
        check("  sin cerrarse dos veces", k.alVencer(t + 60 * MIN), null);

        // Una pausa de 5 min no corta la sesión y no cuenta como escucha.
        k = new SesionEscuchaReloj();
        t = 5_000_000L;
        k.alObservar(t, true, true);
        t = suena(k, t, 20 * MIN);
        k.alObservar(t, false, false);
        t += 5 * MIN;
        c = k.alObservar(t, true, false);
        check("pausa de 5 min: misma sesión", c, null);
        t = suena(k, t, 15 * MIN);
        k.alObservar(t, false, false);
        check("pausa excluida del tiempo activo", k.activoMs, 35 * MIN);

        // Una pausa de 12 min parte la sesión en dos; ninguna llega a 30 min.
        k = new SesionEscuchaReloj();
        t = 9_000_000L;
        k.alObservar(t, true, true);
        t = suena(k, t, 25 * MIN);
        k.alObservar(t, false, false);
        t += 12 * MIN;
        c = k.alObservar(t, true, true);
        check("pausa de 12 min cierra la anterior", c != null, true);
        check("  que no llega a 30 min", c.avisar, false);
        check("  tras 25 min activos", c.activoMs, 25 * MIN);
        check("  y abre una nueva", k.abierta && k.id == 0L, true);
        check("  con su canción contada", k.canciones, 1);

        // Si se pierde el aviso de pausa no se cuentan horas fantasma.
        k = new SesionEscuchaReloj();
        t = 20_000_000L;
        k.alObservar(t, true, true);
        c = k.alObservar(t + 3 * 60 * MIN, false, false);
        check("sin avisos durante 3 h se recorta a 20 min", c != null && c.activoMs == 20 * MIN, true);
        check("  no hay pregunta", c.avisar, false);

        // Restaurar tras reiniciar el proceso y vencer.
        k = new SesionEscuchaReloj();
        k.restaurar(3L, 100L, 100L + 35 * MIN, 33 * MIN, 9);
        check("restaurada y reciente sigue abierta", k.alVencer(100L + 40 * MIN), null);
        c = k.alVencer(100L + 46 * MIN);
        check("restaurada y vencida se cierra con pregunta", c != null && c.avisar && c.id == 3L, true);

        // Parada definitiva.
        k = new SesionEscuchaReloj();
        k.alObservar(1_000L, true, true);
        long fin = suena(k, 1_000L, 31 * MIN);
        c = k.cerrarAhora(fin);
        check("parada del listener cierra y pregunta", c != null && c.avisar, true);
    }

    static void check(String etiqueta, Object real, Object esperado) {
        total++;
        boolean ok = esperado == null ? real == null : esperado.equals(real);
        if (!ok) fallos++;
        System.out.println("  " + (ok ? "✓" : "✗") + " " + etiqueta
                + (ok ? "" : "  (esperado " + esperado + ", obtenido " + real + ")"));
    }
}
