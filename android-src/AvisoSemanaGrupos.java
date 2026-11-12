package com.skippify.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import java.util.TimeZone;

/**
 * El aviso de los domingos a media tarde: «se acaba el tiempo para ver los
 * resultados de la semana en tus grupos».
 *
 * La semana de los grupos va de lunes a domingo y, desde que la pestaña ya no
 * guarda «la semana pasada», el lunes el resumen «Semana» vuelve a empezar de
 * cero. Por eso el domingo a las {@link RitmoGrupos#HORA_AVISO}:00 (hora local
 * del móvil) suena una notificación local que, al pulsarla, abre la pestaña
 * Grupos. Es independiente de la red y de cualquier servidor.
 *
 *   · Sólo si hay al menos un grupo: lo dice JS con `LocalHostBg.configure`
 *     (que llega a {@link LocalHostBackground#configurar} y de ahí aquí), igual
 *     que activa el servicio en segundo plano.
 *   · Una vez por semana: se apunta la hora del último aviso y no se repite.
 *   · Se reprograma tras cada disparo, al arrancar el móvil o la app, y en cada
 *     latido del servicio (por si cambió la zona horaria o se perdió la alarma).
 *   · Si el móvil estaba apagado o dormido a la hora, se avisa al volver hasta
 *     {@link RitmoGrupos#MARGEN_AVISO_MS} después; pasado ese margen se omite.
 *
 * No toca el antiguo aviso del ranking de los grupos con
 * servidor, desactivado): tiene su propia alarma, su propio fichero de
 * preferencias y su propia acción, y comparte sólo el canal de notificaciones.
 * Las decisiones de horas viven en {@link RitmoGrupos}, que se prueba aparte.
 */
public final class AvisoSemanaGrupos {

    private static final String TAG = "SkippifyAvisoGrupos";
    private static final String PREFS = "skippify_aviso_grupos";
    static final String ACTION_ALARMA = "com.skippify.app.action.AVISO_SEMANA_GRUPOS";
    private static final int ALARMA_REQUEST_CODE = 0x5BE3;
    private static final int ABRIR_REQUEST_CODE = 0x5BE4;
    private static final int NOTIF_ID = 0x5BE5;
    /** El canal que ya usaba el aviso del ranking: mismo sitio en los ajustes del sistema. */
    private static final String CANAL = "skippify_liga";
    private static final int COLOR_MARCA = 0xFF1ED760;

    private static final String K_GRUPOS = "hayGrupos";
    private static final String K_ALARMA = "alarma";
    private static final String K_ULTIMO = "ultimoAviso";

    private AvisoSemanaGrupos() { }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ── Entrada ──────────────────────────────────────────────────────────────

    /** JS avisa de si hay grupos: con ellos se programa el aviso; sin ellos se cancela. */
    public static void configurar(Context ctx, boolean hayGrupos) {
        Context app = ctx.getApplicationContext();
        prefs(app).edit().putBoolean(K_GRUPOS, hayGrupos).apply();
        // Desde la app a la vista no se recupera un aviso atrasado: ya está mirando.
        if (hayGrupos) programar(app, false); else cancelar(app);
    }

    /** Latido del servicio, arranque y reinicio: deja la alarma en su sitio si hay grupos. */
    public static void latido(Context ctx) {
        Context app = ctx.getApplicationContext();
        if (prefs(app).getBoolean(K_GRUPOS, false)) programar(app, true); else cancelar(app);
    }

    /**
     * Pone la alarma del próximo domingo. Barato: si ya está a esa hora no la
     * toca, así que se puede llamar desde cada latido.
     */
    static void programar(Context app, boolean recuperar) {
        try {
            long ahora = System.currentTimeMillis();
            TimeZone zona = TimeZone.getDefault();
            SharedPreferences sp = prefs(app);

            // Un aviso que tocaba hace poco y no llegó a sonar (móvil apagado): ahora.
            if (recuperar && RitmoGrupos.avisoPendiente(ahora, sp.getLong(K_ULTIMO, 0L), zona)) {
                sp.edit().putLong(K_ULTIMO, RitmoGrupos.avisoDeEstaSemana(ahora, zona)).apply();
                mostrar(app);
            }

            long cuando = RitmoGrupos.proximoAviso(ahora, zona);
            if (sp.getLong(K_ALARMA, 0L) == cuando && hayAlarma(app)) return;
            ponerAlarma(app, cuando);
        } catch (Throwable t) {
            Log.w(TAG, "no se pudo programar el aviso del domingo", t);
        }
    }

    static void cancelar(Context app) {
        try {
            AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
            PendingIntent pi = intentAlarma(app, PendingIntent.FLAG_NO_CREATE);
            if (pi != null) {
                if (am != null) am.cancel(pi);
                pi.cancel();
            }
            prefs(app).edit().remove(K_ALARMA).apply();
        } catch (Throwable t) {
            Log.w(TAG, "no se pudo cancelar el aviso del domingo", t);
        }
    }

    /** Ha sonado la alarma: se avisa (si hay grupos y no se avisó ya) y se reprograma. */
    public static void alSonar(Context ctx, BroadcastReceiver.PendingResult pendiente) {
        Context app = ctx.getApplicationContext();
        try {
            SharedPreferences sp = prefs(app);
            long ahora = System.currentTimeMillis();
            TimeZone zona = TimeZone.getDefault();
            long programada = sp.getLong(K_ALARMA, 0L);
            if (sp.getBoolean(K_GRUPOS, false)
                    && RitmoGrupos.avisoPendiente(ahora, sp.getLong(K_ULTIMO, 0L), zona)) {
                sp.edit().putLong(K_ULTIMO, RitmoGrupos.avisoDeEstaSemana(ahora, zona)).apply();
                mostrar(app);
            }
            // Con la semana a punto de cerrar, también se sincronizan los grupos:
            // lo que se abra después lleva las últimas escuchas de este móvil.
            if (programada > 0L) LocalHostBackground.sincronizarYa(app);
        } catch (Throwable t) {
            Log.w(TAG, "el aviso del domingo ha fallado", t);
        } finally {
            try { latido(app); } catch (Throwable ignored) { }
            if (pendiente != null) pendiente.finish();
        }
    }

    // ── Alarma ───────────────────────────────────────────────────────────────

    private static PendingIntent intentAlarma(Context app, int flagBase) {
        Intent intent = new Intent(app, AlarmasReceiver.class);
        intent.setAction(ACTION_ALARMA);
        int flags = flagBase;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(app, ALARMA_REQUEST_CODE, intent, flags);
    }

    private static boolean hayAlarma(Context app) {
        return intentAlarma(app, PendingIntent.FLAG_NO_CREATE) != null;
    }

    private static void ponerAlarma(Context app, long cuando) {
        AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = intentAlarma(app, PendingIntent.FLAG_UPDATE_CURRENT);
        // Como el aviso del ranking: exacta si el sistema lo permite; si no, una
        // inexacta llega con unos minutos de retraso, que aquí da igual.
        boolean exacta = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms();
        if (exacta && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cuando, pi);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cuando, pi);
        } else {
            am.setExact(AlarmManager.RTC_WAKEUP, cuando, pi);
        }
        prefs(app).edit().putLong(K_ALARMA, cuando).apply();
    }

    // ── Notificación ─────────────────────────────────────────────────────────

    private static void mostrar(Context app) {
        try {
            NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CANAL) == null) {
                NotificationChannel ch = new NotificationChannel(CANAL, "Grupos · resultados semanales",
                        NotificationManager.IMPORTANCE_DEFAULT);
                ch.setDescription("El aviso de cada domingo, antes de que acabe la semana de tus grupos");
                nm.createNotificationChannel(ch);
            }

            String texto = "Se acaba el tiempo para ver los resultados de la semana en tus grupos: "
                    + "el lunes el resumen semanal vuelve a empezar.";

            NotificationCompat.Builder b = new NotificationCompat.Builder(app, CANAL)
                    // La barra de estado sólo admite la silueta: el monograma de Skippify.
                    .setSmallIcon(R.drawable.ic_stat_skippify)
                    .setColor(COLOR_MARCA)
                    .setContentTitle("Resultados semanales de tus grupos")
                    .setContentText(texto)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
                    .setCategory(NotificationCompat.CATEGORY_SOCIAL)
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                    .setAutoCancel(true);

            Bitmap icono = iconoDeLaApp(app);
            if (icono != null) b.setLargeIcon(icono);

            PendingIntent abrir = abrirGrupos(app);
            if (abrir != null) b.setContentIntent(abrir);

            nm.notify(NOTIF_ID, b.build());
        } catch (Throwable t) {
            Log.w(TAG, "no se pudo mostrar el aviso del domingo", t);
        }
    }

    private static Bitmap iconoDeLaApp(Context app) {
        try {
            // El icono adaptativo es XML: BitmapFactory no sabe leerlo.
            Drawable d = app.getPackageManager().getApplicationIcon(app.getPackageName());
            if (d instanceof BitmapDrawable) return ((BitmapDrawable) d).getBitmap();
            int lado = Math.round(64 * app.getResources().getDisplayMetrics().density);
            Bitmap bmp = Bitmap.createBitmap(lado, lado, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(bmp);
            d.setBounds(0, 0, lado, lado);
            d.draw(c);
            return bmp;
        } catch (Throwable t) {
            return null;
        }
    }

    /** Pulsarla abre la app en la pestaña Grupos (`/comunidad`). */
    private static PendingIntent abrirGrupos(Context app) {
        Intent launch = app.getPackageManager().getLaunchIntentForPackage(app.getPackageName());
        if (launch == null) return null;
        launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        launch.putExtra(SkippifyForegroundService.EXTRA_OPEN_ROUTE, "/comunidad");
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(app, ABRIR_REQUEST_CODE, launch, flags);
    }
}
