package com.skippify.app;

/**
 * Avisos sonoros cortos de Skippify, sin una sola importación de Android: aquí
 * sólo está lo que se puede decidir y calcular (qué aviso toca y las muestras
 * del tono), de modo que se prueba con javac a secas. Quien lo reproduce es
 * {@link SleepTimer#reproducirAviso}.
 *
 * Los tonos comparten idioma con el aviso del temporizador de escucha (dos
 * notas suaves sintetizadas al vuelo, la misma envolvente), pero son más cortos
 * y bajos: el del botón de los auriculares es una confirmación, no una alarma.
 */
final class AvisoSonoro {

    private AvisoSonoro() { }

    static final int RATE = 44_100;

    static final int SIN_AVISO = 0;
    /** La macro se ejecutó: dos notas que suben (mi – la). */
    static final int AVISO_OK = 1;
    /** La macro falló o no pudo ejecutarse: una nota grave. */
    static final int AVISO_ERROR = 2;

    /**
     * Qué aviso corresponde tras pulsar el botón de los auriculares.
     *
     * @param activado el conmutador «Aviso sonoro al ejecutar»
     * @param error    la macro falló o no se pudo ejecutar (sin sesión, sin
     *                 canción sonando, error de Spotify…)
     */
    static int tipoBoton(boolean activado, boolean error) {
        if (!activado) return SIN_AVISO;
        return error ? AVISO_ERROR : AVISO_OK;
    }

    /** Notas (Hz) del aviso. */
    static double[] notas(int tipo) {
        if (tipo == AVISO_OK) return new double[] { 659.25, 880.0 };
        if (tipo == AVISO_ERROR) return new double[] { 293.66 };
        return new double[0];
    }

    /** Duración de cada nota, en segundos. */
    static double segundosPorNota(int tipo) {
        return tipo == AVISO_ERROR ? 0.32 : 0.16;
    }

    /** Ganancia (0–1): por debajo del 0,4 del aviso del temporizador. */
    static double ganancia(int tipo) {
        return 0.3;
    }

    /** Cuánto dura el aviso entero, en milisegundos. */
    static long duracionMs(int tipo) {
        return (long) (notas(tipo).length * segundosPorNota(tipo) * 1000.0);
    }

    /**
     * Muestras PCM de 16 bits, mono: cada nota es un seno con su segundo
     * armónico a un cuarto, ataque de 15 ms y caída exponencial. Con el
     * aviso del temporizador (notas {440; 659,25}, 0,55 s, ganancia 0,4) da
     * exactamente las mismas muestras que antes de extraer esto.
     */
    static short[] sintetizar(double[] notas, double segundosPorNota, double ganancia, int rate) {
        int porNota = (int) (rate * segundosPorNota);
        short[] pcm = new short[porNota * notas.length];
        for (int n = 0; n < notas.length; n++) {
            for (int i = 0; i < porNota; i++) {
                double t = i / (double) rate;
                double ataque = Math.min(1.0, t / 0.015);
                double caida = Math.exp(-t * 5.0);
                double tono = Math.sin(2 * Math.PI * notas[n] * t)
                        + 0.25 * Math.sin(4 * Math.PI * notas[n] * t);
                pcm[n * porNota + i] = (short) (tono / 1.25 * ataque * caida * ganancia * Short.MAX_VALUE);
            }
        }
        return pcm;
    }
}
