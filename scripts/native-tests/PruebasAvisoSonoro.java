package com.skippify.app;

/**
 * Pruebas del aviso sonoro del botón de los auriculares: la decisión de qué
 * aviso toca y las muestras del tono. Que suene de verdad por los auriculares
 * sólo se comprueba en un móvil.
 */
public final class PruebasAvisoSonoro {

    static int fallos = 0;
    static int total = 0;

    static void check(String etiqueta, Object real, Object esperado) {
        total++;
        boolean ok = esperado == null ? real == null : esperado.equals(real);
        System.out.println("  " + (ok ? "✓" : "✗") + " " + etiqueta
                + (ok ? "" : "\n      esperado: " + esperado + "\n      recibido: " + real));
        if (!ok) fallos++;
    }

    public static void main(String[] args) {
        System.out.println();
        System.out.println("Aviso sonoro del botón de los auriculares");

        check("apagado no suena, ni con éxito", AvisoSonoro.tipoBoton(false, false), AvisoSonoro.SIN_AVISO);
        check("apagado no suena, ni con error", AvisoSonoro.tipoBoton(false, true), AvisoSonoro.SIN_AVISO);
        check("encendido y ejecutada: confirmación", AvisoSonoro.tipoBoton(true, false), AvisoSonoro.AVISO_OK);
        check("encendido y con error: nota grave", AvisoSonoro.tipoBoton(true, true), AvisoSonoro.AVISO_ERROR);

        check("sin aviso no hay notas", AvisoSonoro.notas(AvisoSonoro.SIN_AVISO).length, 0);
        check("la confirmación son dos notas que suben",
                AvisoSonoro.notas(AvisoSonoro.AVISO_OK)[0] < AvisoSonoro.notas(AvisoSonoro.AVISO_OK)[1], true);
        check("el de error es una sola nota, más grave que las de la confirmación",
                AvisoSonoro.notas(AvisoSonoro.AVISO_ERROR).length == 1
                        && AvisoSonoro.notas(AvisoSonoro.AVISO_ERROR)[0] < AvisoSonoro.notas(AvisoSonoro.AVISO_OK)[0], true);
        check("es breve: menos de un segundo", AvisoSonoro.duracionMs(AvisoSonoro.AVISO_OK) < 1000L, true);
        check("y más corto que el aviso del temporizador (1,1 s)", AvisoSonoro.duracionMs(AvisoSonoro.AVISO_OK) < 1100L, true);
        check("más bajo que el del temporizador (0,4)", AvisoSonoro.ganancia(AvisoSonoro.AVISO_OK) < 0.4, true);

        short[] ok = AvisoSonoro.sintetizar(AvisoSonoro.notas(AvisoSonoro.AVISO_OK),
                AvisoSonoro.segundosPorNota(AvisoSonoro.AVISO_OK), AvisoSonoro.ganancia(AvisoSonoro.AVISO_OK), AvisoSonoro.RATE);
        check("las muestras cubren las dos notas",
                ok.length, 2 * (int) (AvisoSonoro.RATE * AvisoSonoro.segundosPorNota(AvisoSonoro.AVISO_OK)));
        int pico = 0;
        for (short s : ok) pico = Math.max(pico, Math.abs((int) s));
        check("no satura (pico por debajo de la ganancia)", pico <= (int) (0.3 * Short.MAX_VALUE) + 1, true);
        check("y se oye (pico apreciable)", pico > 1000, true);
        check("empieza en silencio, sin clic", ok[0], (short) 0);

        // El aviso del temporizador sale igual que antes de extraer la síntesis.
        short[] cuna = AvisoSonoro.sintetizar(new double[] { 440.0, 659.25 }, 0.55, 0.4, 44_100);
        check("el aviso del temporizador conserva su duración", cuna.length, 2 * (int) (44_100 * 0.55));

        System.out.println();
        if (fallos > 0) {
            System.out.println("Fallos: " + fallos + " de " + total);
            System.exit(1);
        }
        System.out.println("Aviso sonoro: " + total + " comprobaciones, todo correcto.");
    }
}
