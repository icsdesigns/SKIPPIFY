package com.skippify.app;

/**
 * Pruebas de la decisión del temporizador de escucha: cuándo pausar una vez
 * agotado el tiempo. Corre con javac/java a secas, como PruebasMacros.
 */
public final class PruebasTemporizador {

    static int fallos = 0;
    static int total = 0;

    public static void main(String[] args) {
        final String cancion = "Everything Is Embarrassing|Sky Ferreira";
        final String otra = "Nobody Asked Me|Sky Ferreira";

        SleepTimerDecision.Step s;

        s = SleepTimerDecision.next(cancion, cancion, true, 240_000L, 100_000L);
        check("a mitad de canción se espera", s.action, SleepTimerDecision.Action.WAIT);
        check("el latido no pasa de un segundo", s.delayMs, SleepTimerDecision.MAX_TICK_MS);

        s = SleepTimerDecision.next(cancion, cancion, true, 240_000L, 239_500L);
        check("dentro del margen final se pausa", s.action, SleepTimerDecision.Action.PAUSE);

        s = SleepTimerDecision.next(cancion, cancion, true, 240_000L, 239_000L);
        check("a un segundo del final se espera", s.action, SleepTimerDecision.Action.WAIT);
        check("y se vuelve a mirar justo al entrar en el margen", s.delayMs, 300L);

        s = SleepTimerDecision.next(cancion, cancion, true, 240_000L, 239_250L);
        check("el latido nunca baja del mínimo", s.delayMs, SleepTimerDecision.MIN_TICK_MS);

        s = SleepTimerDecision.next(cancion, otra, true, 200_000L, 1_000L);
        check("si ya empezó otra canción se pausa en el acto", s.action, SleepTimerDecision.Action.PAUSE);

        s = SleepTimerDecision.next(cancion, cancion, false, 240_000L, 100_000L);
        check("en pausa no hay nada que cortar", s.action, SleepTimerDecision.Action.FINISH);

        s = SleepTimerDecision.next("", otra, true, 200_000L, 1_000L);
        check("sin canción apuntada no se toma cualquiera por cambio", s.action, SleepTimerDecision.Action.WAIT);

        s = SleepTimerDecision.next(cancion, cancion, true, 0L, -1L);
        check("sin duración ni posición se espera al cambio de pista", s.action, SleepTimerDecision.Action.WAIT);

        s = SleepTimerDecision.next(cancion, "", true, 240_000L, 120_000L);
        check("metadatos vacíos un instante no cuentan como cambio", s.action, SleepTimerDecision.Action.WAIT);

        System.out.println();
        System.out.println("Temporizador: " + (total - fallos) + "/" + total + " pruebas correctas");
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
