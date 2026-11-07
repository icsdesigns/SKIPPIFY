package com.skippify.app;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.util.List;
import java.util.concurrent.Executor;

/**
 * Sesiones de escucha: une el reloj puro ({@link SesionEscuchaReloj}) con la
 * base de datos ({@link PlayLogStore}), el temporizador de caducidad y la
 * notificación de pregunta ({@link FundidoAviso}).
 *
 * Todo el trabajo corre en el hilo de fondo serie del motor (`serie`): ahí se
 * toca el reloj, la base y la notificación, y al camino caliente de las
 * observaciones sólo llega un `execute` por cada una. Con la función apagada
 * ("Medir fundido") esta clase no abre ni cuenta nada.
 *
 * Persistencia: la sesión se guarda al abrirse, al cambiar de canción y al
 * dejar de sonar. Si el proceso muere con una sesión abierta, {@link #recuperar}
 * la retoma al arrancar (si aún no venció) o la cierra (y pregunta, si procede).
 *
 * El temporizador usa el reloj del `Handler` (que no avanza en reposo
 * profundo): si el móvil duerme, el cierre se hace al despertar. El instante de
 * fin de la sesión sale de las marcas de tiempo reales, así que no se falsea.
 */
final class SesionesEscucha {

    private static final String TAG = "SkippifyFundido";
    /** Una sesión que venció hace más que esto ya no se pregunta: ya no se recordaría. */
    private static final long AVISO_MAX_ANTIGUEDAD_MS = 12L * 3_600_000L;

    private final Context mCtx;
    private final Executor mSerie;
    private final Handler mHandler = new Handler(Looper.getMainLooper());
    private final SesionEscuchaReloj mReloj = new SesionEscuchaReloj();
    /** La canción nueva aún no se ha visto sonando; se cuenta la primera vez que suene. */
    private boolean mCancionPendiente = false;

    private final Runnable mVencer = new Runnable() {
        @Override
        public void run() {
            mSerie.execute(new Runnable() {
                @Override
                public void run() {
                    alVencerEnSerie();
                }
            });
        }
    };

    SesionesEscucha(Context ctx, Executor serie) {
        mCtx = ctx.getApplicationContext();
        mSerie = serie;
    }

    /** Id de la sesión abierta, 0 si no hay. Sólo desde el hilo serie. */
    long idActual() {
        return mReloj.abierta ? Math.max(0L, mReloj.id) : 0L;
    }

    /**
     * Cuenta una observación del motor. Sólo desde el hilo serie.
     *
     * Cuando se pierde el listener el motor manda una observación «no suena»:
     * no se cierra de golpe (el listener se reengancha solo con frecuencia y
     * partir la sesión en dos preguntaría dos veces); se deja de contar y vence
     * a los 10 minutos como cualquier silencio, o al arrancar si el proceso muere.
     */
    void alObservar(long ahoraMs, boolean sonando, boolean cancionNueva) {
        try {
            if (!DuplicateSkipEngine.fundidoActivo(mCtx)) {
                // Función apagada: no se cuenta nada; lo que hubiera abierto se cierra sin preguntar.
                if (mReloj.abierta) cerrar(mReloj.cerrarAhora(ahoraMs), ahoraMs, false);
                mHandler.removeCallbacks(mVencer);
                mCancionPendiente = false;
                return;
            }

            if (cancionNueva) mCancionPendiente = true;
            boolean cuentaCancion = sonando && mCancionPendiente;
            if (cuentaCancion) mCancionPendiente = false;

            SesionEscuchaReloj.Cierre cierre = mReloj.alObservar(ahoraMs, sonando, cuentaCancion);
            if (cierre != null) cerrar(cierre, ahoraMs, true);

            if (mReloj.abierta) {
                boolean recienAbierta = false;
                if (mReloj.id == 0L) {
                    mReloj.id = PlayLogStore.sessionOpen(mCtx, mReloj.inicioMs);
                    recienAbierta = true;
                }
                if (recienAbierta || !sonando || cuentaCancion) guardar();
                programar(ahoraMs);
            } else {
                mHandler.removeCallbacks(mVencer);
            }
        } catch (Throwable t) {
            Log.w(TAG, "contar la observación ha fallado", t);
        }
    }

    /**
     * Al arrancar: retoma o cierra las sesiones que dejó abiertas un proceso
     * anterior. Sólo desde el hilo serie.
     */
    void recuperar() {
        try {
            long ahora = System.currentTimeMillis();
            List<PlayLogStore.SessionRow> filas = PlayLogStore.openSessions(mCtx);
            for (PlayLogStore.SessionRow r : filas) {
                if (mReloj.abierta && r.id == mReloj.id) continue;
                boolean reciente = ahora - r.endedAtMs <= SesionEscuchaReloj.HUECO_MAX_MS;
                if (reciente && !mReloj.abierta && DuplicateSkipEngine.fundidoActivo(mCtx)) {
                    mReloj.restaurar(r.id, r.startedAtMs, r.endedAtMs, r.activeMs, r.songs);
                } else {
                    SesionEscuchaReloj.Cierre c = new SesionEscuchaReloj.Cierre(
                            r.id, r.startedAtMs, r.endedAtMs, r.activeMs, r.songs);
                    cerrar(c, ahora, true);
                }
            }
            if (mReloj.abierta) programar(ahora);
        } catch (Throwable t) {
            Log.w(TAG, "recuperar las sesiones ha fallado", t);
        }
    }

    // ── interno (hilo serie) ──────────────────────────────────────────────────

    private void alVencerEnSerie() {
        try {
            long ahora = System.currentTimeMillis();
            SesionEscuchaReloj.Cierre c = mReloj.alVencer(ahora);
            if (c != null) cerrar(c, ahora, true);
            if (mReloj.abierta) programar(ahora);
        } catch (Throwable t) {
            Log.w(TAG, "vencer la sesión ha fallado", t);
        }
    }

    private void guardar() {
        if (mReloj.id > 0L) {
            PlayLogStore.sessionSave(mCtx, mReloj.id, mReloj.ultimoSonidoMs, mReloj.activoMs, mReloj.canciones);
        }
    }

    /**
     * Cierra en la base y, si procede, pregunta. El cierre en la base es atómico
     * (`closed = 0`): aunque lo intenten a la vez el temporizador y el arranque,
     * la pregunta sale una sola vez.
     */
    private void cerrar(SesionEscuchaReloj.Cierre c, long ahoraMs, boolean puedeAvisar) {
        if (c == null || c.id <= 0L) return;
        boolean avisar = puedeAvisar && c.avisar
                && DuplicateSkipEngine.fundidoActivo(mCtx)
                && ahoraMs - c.finMs <= AVISO_MAX_ANTIGUEDAD_MS;
        boolean aviso = PlayLogStore.sessionClose(mCtx, c.id, c.finMs, c.activoMs, c.canciones, avisar);
        if (aviso) FundidoAviso.mostrar(mCtx, c.id, c.activoMs);
    }

    private void programar(long ahoraMs) {
        long ms = mReloj.msHastaVencer(ahoraMs);
        mHandler.removeCallbacks(mVencer);
        if (ms < 0L) return;
        mHandler.postDelayed(mVencer, Math.max(1_000L, ms + 1_000L));
    }
}
