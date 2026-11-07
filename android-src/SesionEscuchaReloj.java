package com.skippify.app;

/**
 * Reloj de las «sesiones de escucha»: una reproducción continua por
 * notificación cuyos huecos de silencio o pausa no pasan de 10 minutos.
 * Acumula el tiempo REAL sonando (las pausas no cuentan) y avisa cuando una
 * sesión se cierra con al menos 30 minutos de escucha.
 *
 * Clase pura, sin Android y sin base de datos: quien la usa le cuenta lo que ve
 * (`alObservar`) y se encarga de persistir y de notificar. Todas las marcas son
 * épocas en ms (no `uptime`) para que sobrevivan a un reinicio del proceso.
 * No es segura entre hilos: se usa siempre desde el mismo hilo de fondo.
 */
final class SesionEscuchaReloj {

    /** Silencio o pausa máximo para seguir en la misma sesión. */
    static final long HUECO_MAX_MS = 10L * 60_000L;
    /** Escucha activa mínima para que la sesión merezca la pregunta. */
    static final long MIN_ESCUCHA_MS = 30L * 60_000L;
    /**
     * Si el motor dice «sonando» y pasa más de esto sin ninguna observación (ni
     * canción nueva, ni pausa), no se le cree más allá: el aviso de pausa se
     * habrá perdido. Cubre sobradamente una canción larga o un mix.
     */
    static final long MAX_SIN_AVISO_MS = 20L * 60_000L;

    /** Una sesión que acaba de cerrarse. */
    static final class Cierre {
        final long id;
        final long inicioMs;
        /** Último instante en que se sabe que sonaba. */
        final long finMs;
        final long activoMs;
        final int canciones;
        /** ¿Escuchó lo bastante como para preguntar? */
        final boolean avisar;

        Cierre(long id, long inicioMs, long finMs, long activoMs, int canciones) {
            this.id = id;
            this.inicioMs = inicioMs;
            this.finMs = finMs;
            this.activoMs = activoMs;
            this.canciones = canciones;
            this.avisar = activoMs >= MIN_ESCUCHA_MS;
        }
    }

    boolean abierta = false;
    /** Id en la base de datos; 0 mientras quien llama no se lo haya puesto. */
    long id = 0L;
    long inicioMs = 0L;
    long ultimoSonidoMs = 0L;
    long activoMs = 0L;
    int canciones = 0;
    /** Instante desde el que se cuenta tiempo sonando, 0 si ahora no suena. */
    private long sonandoDesdeMs = 0L;

    /** Retoma una sesión guardada (tras reiniciar el proceso). Se supone que no suena. */
    void restaurar(long id, long inicioMs, long finMs, long activoMs, int canciones) {
        this.abierta = true;
        this.id = id;
        this.inicioMs = inicioMs;
        this.ultimoSonidoMs = finMs;
        this.activoMs = activoMs;
        this.canciones = canciones;
        this.sonandoDesdeMs = 0L;
    }

    /**
     * Anota una observación del motor. Devuelve la sesión que esta observación
     * deja cerrada (porque pasó demasiado silencio desde el último sonido), o
     * null. Si abre una sesión nueva, deja `abierta` y `id == 0`: quien llama
     * debe guardarla y poner el id.
     */
    Cierre alObservar(long ahoraMs, boolean sonando, boolean cancionNueva) {
        Cierre cierre = acumulaYVence(ahoraMs);

        if (sonando) {
            if (!abierta) {
                abierta = true;
                id = 0L;
                inicioMs = ahoraMs;
                ultimoSonidoMs = ahoraMs;
                activoMs = 0L;
                canciones = 0;
                sonandoDesdeMs = 0L;
            }
            if (sonandoDesdeMs == 0L) sonandoDesdeMs = ahoraMs;
            ultimoSonidoMs = Math.max(ultimoSonidoMs, ahoraMs);
            if (cancionNueva) canciones++;
        } else {
            // acumulaYVence ya contó hasta ahora; sólo se deja de contar.
            sonandoDesdeMs = 0L;
        }
        return cierre;
    }

    /** Llamada por el temporizador de caducidad: cierra la sesión si ya venció. */
    Cierre alVencer(long ahoraMs) {
        return acumulaYVence(ahoraMs);
    }

    /** Milisegundos hasta que la sesión abierta venza si nada suena, o -1 si no hay sesión. */
    long msHastaVencer(long ahoraMs) {
        if (!abierta) return -1L;
        long limite = (sonandoDesdeMs > 0L ? sonandoDesdeMs + MAX_SIN_AVISO_MS : ultimoSonidoMs)
                + HUECO_MAX_MS;
        return Math.max(0L, limite - ahoraMs);
    }

    /** Cierra a la fuerza la sesión abierta (parada definitiva). Null si no hay. */
    Cierre cerrarAhora(long ahoraMs) {
        if (!abierta) return null;
        acumula(ahoraMs);
        return cerrar();
    }

    // ── interno ───────────────────────────────────────────────────────────────

    private Cierre acumulaYVence(long ahoraMs) {
        if (!abierta) return null;
        acumula(ahoraMs);
        if (sonandoDesdeMs == 0L && ahoraMs - ultimoSonidoMs > HUECO_MAX_MS) return cerrar();
        return null;
    }

    /** Suma el tiempo sonando hasta `ahoraMs`, sin fiarse más allá de MAX_SIN_AVISO_MS. */
    private void acumula(long ahoraMs) {
        if (sonandoDesdeMs <= 0L) return;
        long dt = Math.max(0L, ahoraMs - sonandoDesdeMs);
        long contado = Math.min(dt, MAX_SIN_AVISO_MS);
        activoMs += contado;
        ultimoSonidoMs = sonandoDesdeMs + contado;
        // Si se recortó, se deja de creer que sigue sonando; si no, se sigue contando.
        sonandoDesdeMs = contado < dt ? 0L : ahoraMs;
    }

    private Cierre cerrar() {
        Cierre c = new Cierre(id, inicioMs, ultimoSonidoMs, activoMs, canciones);
        abierta = false;
        id = 0L;
        inicioMs = 0L;
        ultimoSonidoMs = 0L;
        activoMs = 0L;
        canciones = 0;
        sonandoDesdeMs = 0L;
        return c;
    }
}
