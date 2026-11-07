package com.skippify.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * La notificación «¿Has estado escuchando música con fundido?», con los botones
 * Sí y No. Los botones mandan un broadcast explícito a
 * {@link FundidoRespuestaReceiver}, declarado en el manifiesto, así que
 * funcionan con la app cerrada.
 *
 * Es discreta a propósito: canal de importancia baja (sin sonido ni vibración,
 * no asoma sobre lo que haya en pantalla), se descarta sola a las 12 h y no
 * insiste: un solo aviso por sesión de escucha.
 */
final class FundidoAviso {

    private static final String TAG = "SkippifyFundido";
    static final String CANAL = "skippify_fundido_pregunta";
    private static final int COLOR_MARCA = 0xFF1ED760;
    private static final long CADUCIDAD_MS = 12L * 3_600_000L;

    private FundidoAviso() {}

    static int idNotificacion(long sesionId) {
        return ("fundido|" + sesionId).hashCode();
    }

    /** Muestra la pregunta. Devuelve false si no se pudo (sin permiso, sin servicio…). */
    static boolean mostrar(Context ctx, long sesionId, long activoMs) {
        if (ctx == null || sesionId <= 0L) return false;
        Context app = ctx.getApplicationContext();
        try {
            // Sin permiso de notificaciones (Android 13+) o con ellas apagadas
            // para la app no hay nada que mostrar; no se insiste ni se pide aquí.
            if (!NotificationManagerCompat.from(app).areNotificationsEnabled()) return false;

            NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CANAL) == null) {
                NotificationChannel ch = new NotificationChannel(CANAL, "Medición de fundido",
                        NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("Una pregunta tras escuchar música un buen rato, para medir la detección de fundidos");
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }

            long minutos = Math.max(1L, Math.round(activoMs / 60_000.0));
            String corto = "Llevas " + minutos + " min de escucha. ¿Sonó con fundido entre canciones?";
            String largo = "Has escuchado música unos " + minutos + " minutos seguidos. "
                    + "¿Han sonado con fundido entre canciones? Cuenta si usaste el DJ de Spotify, "
                    + "la función Mix (no es lo mismo que el modo aleatorio) o tenías el crossfade "
                    + "activado en los ajustes de Spotify. Tu respuesta se guarda en el móvil y sirve "
                    + "para medir con qué precisión se detectan los fundidos.";

            NotificationCompat.Builder b = new NotificationCompat.Builder(app, CANAL)
                    .setSmallIcon(R.drawable.ic_stat_skippify)
                    .setColor(COLOR_MARCA)
                    .setContentTitle("¿Has estado escuchando música con fundido?")
                    .setContentText(corto)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(largo))
                    .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setOnlyAlertOnce(true)
                    .setAutoCancel(true)
                    .setTimeoutAfter(CADUCIDAD_MS)
                    .addAction(0, "Sí", respuesta(app, sesionId, "si"))
                    .addAction(0, "No", respuesta(app, sesionId, "no"));

            nm.notify(idNotificacion(sesionId), b.build());
            return true;
        } catch (Throwable t) {
            Log.w(TAG, "no se pudo mostrar la pregunta de fundido", t);
            return false;
        }
    }

    static void cancelar(Context ctx, long sesionId) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(idNotificacion(sesionId));
        } catch (Throwable ignored) {
        }
    }

    /**
     * PendingIntent explícito hacia el receiver. Un PendingIntent se identifica
     * sin contar los extras, así que cada botón de cada sesión lleva su propio
     * `data` y su propio código de petición: si no, "Sí" y "No" se pisarían.
     */
    private static PendingIntent respuesta(Context app, long sesionId, String valor) {
        Intent intent = new Intent(app, FundidoRespuestaReceiver.class);
        intent.setAction(FundidoRespuestaReceiver.ACTION_RESPONDER);
        intent.setData(Uri.parse("skippify://fundido/" + sesionId + "/" + valor));
        intent.putExtra(FundidoRespuestaReceiver.EXTRA_SESION, sesionId);
        intent.putExtra(FundidoRespuestaReceiver.EXTRA_RESPUESTA, valor);
        int code = (int) ((sesionId & 0x3FFFFFFFL) * 2L) + ("si".equals(valor) ? 1 : 0);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(app, code, intent, flags);
    }
}
