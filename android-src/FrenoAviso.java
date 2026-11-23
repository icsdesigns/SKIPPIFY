package com.skippify.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Aviso de que el freno de cadenas ha dejado sonar una duplicada (ver
 * {@link FrenoCadena}): lo que suena ya está escuchado entero. Discreto, como la
 * pregunta de fundido: importancia baja, sin sonido, se descarta solo.
 */
final class FrenoAviso {

    private static final String TAG = "SkippifyFreno";
    static final String CANAL = "skippify_freno_cadena";
    private static final int ID = "skippify|freno_cadena".hashCode();
    private static final int COLOR_MARCA = 0xFF1ED760;
    private static final long CADUCIDAD_MS = 30L * 60_000L;

    private FrenoAviso() {}

    static void mostrar(Context ctx, int saltos) {
        if (ctx == null) return;
        Context app = ctx.getApplicationContext();
        try {
            if (!NotificationManagerCompat.from(app).areNotificationsEnabled()) return;
            NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CANAL) == null) {
                NotificationChannel ch = new NotificationChannel(CANAL, "Lista ya escuchada",
                        NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("Aviso cuando Skippify deja de saltar porque todo lo que viene ya lo has escuchado");
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
            String texto = "Se han saltado " + saltos + " canciones seguidas que ya habías escuchado. "
                    + "Para que la música no se pare, Skippify deja de saltar durante 15 minutos "
                    + "o hasta que suene una canción nueva.";
            NotificationCompat.Builder b = new NotificationCompat.Builder(app, CANAL)
                    .setSmallIcon(R.drawable.ic_stat_skippify)
                    .setColor(COLOR_MARCA)
                    .setContentTitle("Esta lista ya la has escuchado")
                    .setContentText("Skippify deja sonar las duplicadas un rato para no parar la música.")
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setOnlyAlertOnce(true)
                    .setAutoCancel(true)
                    .setTimeoutAfter(CADUCIDAD_MS);
            nm.notify(ID, b.build());
        } catch (Throwable t) {
            Log.w(TAG, "no se pudo mostrar el aviso del freno", t);
        }
    }
}
