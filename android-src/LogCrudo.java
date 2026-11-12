package com.skippify.app;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Log crudo del listener y limpieza de lo que dejó la Comunidad con servidor.
 *
 * Skippify ya no habla con Firebase. Las versiones anteriores guardaban en el
 * móvil una sesión anónima (refresh token incluido), los grupos y una alarma
 * del ranking de los domingos. `limpiarRestos` borra todo eso una sola vez y
 * cancela la alarma; es idempotente y barato, así que el latido del servicio
 * lo llama siempre.
 */
public final class LogCrudo {

    private static final String TAG = "SkippifyLog";
    /** Preferencias de la antigua subida a Firestore (sesión anónima y grupos). */
    private static final String PREFS_LIGA = "skippify_liga_bg";
    /** Preferencias del antiguo aviso del ranking del domingo. */
    private static final String PREFS_RESULTADOS = "skippify_liga_resultados";
    /** Acción y código de la antigua alarma del ranking: hacen falta para cancelarla. */
    static final String ACCION_RANKING_ANTIGUA = "com.skippify.app.action.LIGA_RESULTADOS";
    private static final int ALARMA_RANKING_ANTIGUA = 0x5BE1;
    private static final String CANAL_RANKING_ANTIGUO = "skippify_liga";

    private LogCrudo() { }

    /** Borra la sesión de Firebase, los grupos con servidor y la alarma del ranking. */
    static void limpiarRestos(Context ctx) {
        if (ctx == null) return;
        Context app = ctx.getApplicationContext();
        try {
            for (String nombre : new String[] { PREFS_LIGA, PREFS_RESULTADOS }) {
                SharedPreferences sp = app.getSharedPreferences(nombre, Context.MODE_PRIVATE);
                if (!sp.getAll().isEmpty()) sp.edit().clear().apply();
            }
        } catch (Throwable ignored) { }
        try {
            AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
            Intent intent = new Intent(app, BootCompletedReceiver.class);
            intent.setAction(ACCION_RANKING_ANTIGUA);
            int flags = PendingIntent.FLAG_NO_CREATE;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getBroadcast(app, ALARMA_RANKING_ANTIGUA, intent, flags);
            if (pi != null) {
                if (am != null) am.cancel(pi);
                pi.cancel();
            }
        } catch (Throwable ignored) { }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null && nm.getNotificationChannel(CANAL_RANKING_ANTIGUO) != null) {
                    nm.deleteNotificationChannel(CANAL_RANKING_ANTIGUO);
                }
            }
        } catch (Throwable ignored) { }
    }

    /** Lee el log crudo SIN vaciarlo: eso sigue siendo cosa de la app al abrirse. */
    static List<EscuchasLog.Crudo> leerLog(Context ctx) {
        List<EscuchasLog.Crudo> out = new ArrayList<EscuchasLog.Crudo>();
        synchronized (SpotifyNotificationListener.sEventFileLock) {
            File dir = ctx.getFilesDir();
            if (dir == null) return out;
            File f = new File(dir, SpotifyNotificationListener.EVENT_LOG_FILE);
            if (!f.exists() || !f.isFile()) return out;
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
                String line;
                int leidas = 0;
                // El mismo tope que drainBackgroundEvents, para trocear lo mismo.
                while ((line = reader.readLine()) != null && ++leidas <= 5000) {
                    line = line.trim();
                    if (line.isEmpty()) continue;
                    try {
                        JSONObject o = new JSONObject(line);
                        String playedAt = o.optString("played_at", "");
                        long t = SpotifyNotificationListener.fromIso8601Ms(playedAt);
                        if (t <= 0) continue;
                        out.add(new EscuchasLog.Crudo(t, playedAt,
                                o.optString("event", ""),
                                o.optString("track", ""),
                                o.optString("artist", ""),
                                o.optLong("duration_ms", 0L),
                                // Líneas de versiones anteriores: no se sabe, y ante la
                                // duda no se suben, que duplicar es peor que esperar.
                                o.optBoolean("js", true)));
                    } catch (Throwable ignored) { }
                }
            } catch (Throwable t) {
                Log.w(TAG, "no se pudo leer el log de escuchas", t);
            }
        }
        return out;
    }
}
