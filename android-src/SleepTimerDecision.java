package com.skippify.app;

/**
 * Decisión del temporizador de escucha, sin nada de Android.
 *
 * Igual que MacroRunner, se aparta del resto para poder probarla con javac a
 * secas (scripts/native-tests/PruebasTemporizador.java): qué hacer en cada
 * latido una vez agotado el tiempo depende sólo de lo que suena y de cuánto le
 * queda, así que no hace falta un emulador para comprobarlo.
 */
final class SleepTimerDecision {

    private SleepTimerDecision() {}

    /**
     * Margen antes del final de la canción en el que se pausa. Pausar justo al
     * cambiar de pista dejaría oír el arranque de la siguiente (y con el
     * fundido de Spotify, varios segundos de ella); este margen sólo recorta
     * el último instante de la canción que termina.
     */
    static final long END_MARGIN_MS = 700L;

    /** Latido mínimo y máximo mientras se espera el final de la canción. */
    static final long MIN_TICK_MS = 200L;
    static final long MAX_TICK_MS = 1000L;

    /** Qué hacer en este latido. */
    enum Action {
        /** Seguir esperando: volver a mirar dentro de {@link Step#delayMs}. */
        WAIT,
        /** Pausar ya y terminar (con el aviso después, si se pidió). */
        PAUSE,
        /** No suena nada: no hay que pausar, sólo terminar. */
        FINISH
    }

    static final class Step {
        final Action action;
        final long delayMs;

        Step(Action action, long delayMs) {
            this.action = action;
            this.delayMs = delayMs;
        }
    }

    /**
     * @param waitingKey  canción («título|artista») que sonaba al agotarse el
     *                    tiempo; vacía si entonces no sonaba nada
     * @param currentKey  la que suena ahora
     * @param isPlaying   si Spotify está reproduciendo
     * @param durationMs  duración de la canción actual, o 0 si no se sabe
     * @param positionMs  posición actual, o negativa si no se sabe
     */
    static Step next(String waitingKey, String currentKey, boolean isPlaying,
                     long durationMs, long positionMs) {
        // En pausa (o sin Spotify) ya no hay escucha que cortar.
        if (!isPlaying) return new Step(Action.FINISH, 0L);

        // Ha empezado otra canción: la que había terminó (o el usuario saltó).
        // Se pausa en el acto para que la nueva no llegue a oírse.
        String waiting = waitingKey == null ? "" : waitingKey;
        String current = currentKey == null ? "" : currentKey;
        if (!waiting.isEmpty() && !current.isEmpty() && !waiting.equals(current)) {
            return new Step(Action.PAUSE, 0L);
        }

        // Sin duración o posición fiables sólo queda esperar al cambio de pista.
        if (durationMs <= 0L || positionMs < 0L) return new Step(Action.WAIT, MAX_TICK_MS);

        long remaining = durationMs - positionMs;
        if (remaining <= END_MARGIN_MS) return new Step(Action.PAUSE, 0L);

        long delay = remaining - END_MARGIN_MS;
        if (delay < MIN_TICK_MS) delay = MIN_TICK_MS;
        if (delay > MAX_TICK_MS) delay = MAX_TICK_MS;
        return new Step(Action.WAIT, delay);
    }
}
