package com.skippify.app;

/**
 * Freno de cadenas de saltos. Clase pura (sin Android) para probarla con javac.
 *
 * Cuando toda una lista ya está escuchada, el motor saltaba canción tras canción
 * hasta agotar la cola y Spotify acababa en pausa: en los registros de noviembre
 * hubo una cadena de 51 saltos seguidos y otras de 15 y 8, todas terminadas con
 * la música parada. Tras {@link #MAX_SEGUIDOS} saltos seguidos (cada uno a menos
 * de {@link #HUECO_MAX_MS} del anterior) el motor deja sonar la siguiente
 * duplicada y no vuelve a saltar durante {@link #DURACION_MS}, salvo que suene
 * antes una canción nueva (no duplicada), que da la cadena por terminada.
 */
final class FrenoCadena {

    static final int MAX_SEGUIDOS = 10;
    static final long HUECO_MAX_MS = 60_000L;
    static final long DURACION_MS = 15L * 60_000L;

    /** Saltar con normalidad. */
    static final int SALTAR = 0;
    /** Se acaba de echar el freno: no saltar y avisar. */
    static final int FRENAR = 1;
    /** El freno ya estaba echado: no saltar, sin volver a avisar. */
    static final int FRENADO = 2;

    private int mSeguidos = 0;
    private long mUltimoSaltoMs = Long.MIN_VALUE / 2;
    private long mFrenoHastaMs = Long.MIN_VALUE / 2;

    /** Se ha juzgado una duplicada a saltar. Dice si se salta o se frena. */
    synchronized int alDuplicada(long ahoraMs) {
        if (ahoraMs < mFrenoHastaMs) return FRENADO;
        if (ahoraMs - mUltimoSaltoMs > HUECO_MAX_MS) mSeguidos = 0;
        if (mSeguidos >= MAX_SEGUIDOS) {
            mSeguidos = 0;
            mFrenoHastaMs = ahoraMs + DURACION_MS;
            return FRENAR;
        }
        mSeguidos++;
        mUltimoSaltoMs = ahoraMs;
        return SALTAR;
    }

    /** Ha sonado una canción nueva (no duplicada): fin de cadena y de freno. */
    synchronized void alNoDuplicada() {
        mSeguidos = 0;
        mFrenoHastaMs = Long.MIN_VALUE / 2;
    }

    /** Una canción se quedó sonando por otro motivo (fuera de ventana…): corta la cadena. */
    synchronized void alConservada() {
        mSeguidos = 0;
    }

    synchronized int seguidos() {
        return mSeguidos;
    }

    synchronized boolean frenado(long ahoraMs) {
        return ahoraMs < mFrenoHastaMs;
    }
}
