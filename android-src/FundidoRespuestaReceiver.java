package com.skippify.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Recibe el toque en «Sí» o «No» de la notificación de fundido y guarda la
 * respuesta en la sesión de escucha. Declarado en el manifiesto (sin exportar:
 * sólo se le llega por el PendingIntent explícito de la notificación), así que
 * funciona aunque la app esté cerrada.
 */
public class FundidoRespuestaReceiver extends BroadcastReceiver {

    static final String ACTION_RESPONDER = "com.skippify.app.action.FUNDIDO_RESPUESTA";
    static final String EXTRA_SESION = "sesionId";
    static final String EXTRA_RESPUESTA = "respuesta";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        if (!ACTION_RESPONDER.equals(intent.getAction())) return;

        final long sesionId = intent.getLongExtra(EXTRA_SESION, 0L);
        final String respuesta = intent.getStringExtra(EXTRA_RESPUESTA);
        final Context app = context.getApplicationContext();

        // La notificación se quita ya, sin esperar a la base de datos.
        FundidoAviso.cancelar(app, sesionId);

        // La escritura va fuera del hilo principal; goAsync mantiene vivo el
        // receiver hasta terminar.
        final PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                PlayLogStore.sessionAnswer(app, sesionId, respuesta);
            } catch (Throwable t) {
                Log.w("SkippifyFundido", "no se pudo guardar la respuesta", t);
            } finally {
                pending.finish();
            }
        }, "SkippifyFundidoRespuesta").start();
    }
}
