package com.skippify.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;

import java.util.TimeZone;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * Servicio en primer plano que mantiene vivo el proceso de Skippify en OEMs
 * agresivos (Samsung One UI, Xiaomi MIUI, etc.) para que
 * SpotifyNotificationListener siga registrando reproducciones con la pantalla
 * bloqueada o la app en segundo plano.
 *
 * Se arranca desde SpotifyNotificationListener.onListenerConnected() y corre con
 * START_STICKY para que Android lo recree si lo mata.
 *
 * Tres refuerzos frente al comportamiento de versiones anteriores:
 *
 *  1. La notificación ya no es decorativa: muestra cuántas duplicadas han sonado
 *     hoy y cuántas se han saltado, así que el usuario ve de un vistazo si el
 *     motor está trabajando.
 *  2. Si el usuario la descarta (Android 14 lo permite), el listener la detecta
 *     y la vuelve a publicar en el acto.
 *  3. Una alarma periódica reafirma el servicio: cubre los casos en que el
 *     sistema lo mata sin recrearlo.
 */
public class SkippifyForegroundService extends Service {

    static final int NOTIF_ID   = 0x5BFF; // arbitrario, distinto de cero
    private static final String CHANNEL = "skippify_bg";
    private static final String ACTION_SET_MODE = "com.skippify.app.action.SET_MODE";
    private static final String EXTRA_MODE = "mode";
    public static final String EXTRA_OPEN_ROUTE = "openRoute";

    /** Intervalo con el que la alarma reafirma el servicio. */
    private static final long WATCHDOG_INTERVAL_MS = 15L * 60L * 1000L;
    private static final int WATCHDOG_REQUEST_CODE = 0x5BD0;

    /** Alarma de medianoche que repinta los contadores del día (ver programarCambioDia). */
    static final String ACTION_CAMBIO_DIA = "com.skippify.app.action.CAMBIO_DIA";
    private static final int CAMBIO_DIA_REQUEST_CODE = 0x5BD4;
    private static volatile long sCambioDiaArmado = 0L;
    /** Día (aaaammdd) de lo último que se pintó en la notificación y los widgets. */
    private static volatile int sDiaPintado = 0;

    /** True once startForeground() ha tenido éxito y el servicio sigue vivo. */
    private static volatile boolean sRunning = false;
    private static volatile long sLastStartRequestAtMs = 0L;
    /** Ventana mínima entre intentos de arranque cuando el servicio ya está vivo. */
    private static final long START_THROTTLE_MS = 60_000L;

    /** Call from any context to (re)start the service. */
    public static void start(Context context) {
        start(context, false);
    }

    /**
     * `start()` se invocaba en CADA notificación de Spotify, lo que disparaba un
     * `startForegroundService()` varias veces por canción. Ahora se limita: si el
     * servicio ya está en marcha sólo se reintenta cada START_THROTTLE_MS.
     */
    public static void start(Context context, boolean force) {
        if (context == null) return;

        long now = SystemClock.elapsedRealtime();
        if (!force && sRunning && (now - sLastStartRequestAtMs) < START_THROTTLE_MS) {
            return;
        }
        sLastStartRequestAtMs = now;

        Intent intent = new Intent(context, SkippifyForegroundService.class);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Throwable ignored) {
            // Android 12+ lanza ForegroundServiceStartNotAllowedException si la app
            // está en segundo plano sin exención. No es fatal: el listener sigue
            // funcionando mientras el sistema lo mantenga enlazado.
            sRunning = false;
        }

        scheduleWatchdog(context);
    }

    /**
     * Reescribe la notificación sin reiniciar el servicio. Es el camino barato
     * para refrescar los contadores del día: `startForegroundService()` en cada
     * salto sería un despilfarro (y en segundo plano ni siquiera está permitido).
     */
    public static void refresh(@Nullable Context context) {
        if (context == null) return;
        // Los widgets enseñan los mismos contadores que la notificación.
        WidgetsSkippify.actualizar(context);
        sDiaPintado = hoy();
        if (!sRunning) {
            start(context, false);
            return;
        }
        try {
            NotificationManager nm =
                    (NotificationManager) context.getSystemService(NOTIFICATION_SERVICE);
            if (nm == null) return;
            nm.notify(NOTIF_ID, buildNotification(context));
        } catch (Throwable ignored) {
        }
    }

    /**
     * Alarma inexacta y repetitiva que reafirma el servicio. No necesita
     * permisos de alarma exacta y sobrevive a Doze con retraso, que es
     * justo lo que se quiere: reparar, no despertar cada 15 minutos clavados.
     */
    private static void scheduleWatchdog(Context context) {
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(ALARM_SERVICE);
            if (am == null) return;

            Intent intent = new Intent(context, AlarmasReceiver.class);
            intent.setAction(BootCompletedReceiver.ACTION_WATCHDOG);

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getBroadcast(context, WATCHDOG_REQUEST_CODE, intent, flags);

            am.setInexactRepeating(
                    AlarmManager.ELAPSED_REALTIME,
                    SystemClock.elapsedRealtime() + WATCHDOG_INTERVAL_MS,
                    WATCHDOG_INTERVAL_MS,
                    pi
            );
        } catch (Throwable ignored) {
        }
    }

    @Override
    public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        ensureChannel(this);

        if (intent != null && ACTION_SET_MODE.equals(intent.getAction())) {
            SpotifyNotificationListener.configureListeningMode(
                getApplicationContext(),
                intent.getStringExtra(EXTRA_MODE)
            );
            NotifListenerPlugin.notifyFeatureConfigChanged();
        }

        // startForeground() puede lanzar en Android 12+ (ForegroundServiceStart-
        // NotAllowedException) y en Android 14+ (tipo de servicio no permitido en
        // segundo plano). Sin este try/catch la excepción tumbaba la app entera.
        try {
            startForeground(NOTIF_ID, buildNotification(this));
            sRunning = true;
        } catch (Throwable t) {
            sRunning = false;
            try {
                stopSelf(startId);
            } catch (Throwable ignored) {
            }
            return START_NOT_STICKY;
        }

        tareasDelLatido(getApplicationContext());

        // Los widgets: el modo puede haber cambiado (los cambios de ajustes pasan
        // por aquí) y, con él, lo que enseñan.
        WidgetsSkippify.actualizar(getApplicationContext());
        sDiaPintado = hoy();

        // START_STICKY: if Android kills us, it will re-create and re-deliver
        // a null intent, which is fine – we'll call startForeground() again.
        return START_STICKY;
    }

    /**
     * Lo que cuelga del latido de 15 minutos. Lo llama {@link #onStartCommand}
     * y, con el servicio ya vivo, la vigilancia ({@link #vigilanciaLigera}) sin
     * relanzarlo. Cada tarea lleva su propio freno, así que llamarla de más no
     * cuesta red.
     */
    static void tareasDelLatido(Context app) {
        // Los origenes de lista de las macros no tienen ningun evento que los
        // dispare, asi que se aprovecha este latido —que ya existia para
        // reafirmar la notificacion— en vez de programar una alarma propia. El
        // freno de 15 minutos por macro vive en MacroRunner, de modo que llamar
        // de mas aqui no cuesta ni una peticion.
        try {
            MacroBackground.repasoPeriodico(app);
        } catch (Throwable ignored) {
        }

        // Mismo razonamiento para la comprobación de actualizaciones: toca una
        // vez al día, así que casi todos los latidos sólo miran el reloj. Sin
        // esto, la app sólo se enteraba de una versión nueva al abrirla.
        try {
            UpdateChecker.latido(app);
        } catch (Throwable ignored) {
        }

        // Firebase está desconectado: si una versión anterior dejó su sesión
        // anónima, sus grupos o la alarma del ranking, se borran aquí.
        try {
            LogCrudo.limpiarRestos(app);
        } catch (Throwable ignored) {
        }

        // Comunidad sin servidor: si el proceso se reinició sin la app abierta,
        // reanuda el WebView que sigue sincronizando los grupos.
        try {
            LocalHostBackground.latido(app);
        } catch (Throwable ignored) {
        }

        // El aviso de los domingos de los grupos: si se perdió la alarma (cambio
        // de zona horaria, limpieza del sistema) se repone, y si el móvil estaba
        // apagado a la hora, se avisa al volver.
        try {
            AvisoSemanaGrupos.latido(app);
        } catch (Throwable ignored) {
        }

        // Escuchas de la cuenta de Spotify (otros dispositivos incluidos) y las
        // que se escaparon con el servicio parado. El freno (~15 min en uso,
        // ~30 en reposo) vive en EscuchasApiBackground.
        try {
            EscuchasApiBackground.latido(app);
        } catch (Throwable ignored) {
        }

        // El repintado de medianoche (contadores del día a cero).
        try {
            programarCambioDia(app);
        } catch (Throwable ignored) {
        }
    }

    /**
     * Vigilancia con el servicio vivo: no lo relanza ni vuelve a publicar la
     * notificación. Corre las tareas del latido y sólo repinta notificación y
     * widgets si ha cambiado el día desde la última vez.
     */
    static void vigilanciaLigera(Context ctx) {
        Context app = ctx.getApplicationContext();
        tareasDelLatido(app);
        if (sDiaPintado != hoy()) refresh(app);
    }

    /** ¿Está el servicio en primer plano vivo en este proceso? */
    static boolean vivo() {
        return sRunning;
    }

    private static int hoy() {
        return RitmoFondo.diaLocal(System.currentTimeMillis(), TimeZone.getDefault());
    }

    // ── Cambio de día ────────────────────────────────────────────────────────

    /**
     * Alarma diaria que NO despierta al móvil, un minuto después de medianoche:
     * llega en cuanto el móvil se despierte por cualquier motivo y deja los
     * contadores del día a cero en la notificación y los widgets. Sustituye a la
     * actualización periódica de 30 minutos de los widgets.
     */
    static void programarCambioDia(Context ctx) {
        Context app = ctx.getApplicationContext();
        long cuando = RitmoFondo.proximoCambioDia(System.currentTimeMillis(), TimeZone.getDefault());
        if (cuando == sCambioDiaArmado && intentCambioDia(app, PendingIntent.FLAG_NO_CREATE) != null) return;
        AlarmManager am = (AlarmManager) app.getSystemService(ALARM_SERVICE);
        if (am == null) return;
        am.set(AlarmManager.RTC, cuando, intentCambioDia(app, PendingIntent.FLAG_UPDATE_CURRENT));
        sCambioDiaArmado = cuando;
    }

    /** Ha sonado la alarma de medianoche (la recibe {@link AlarmasReceiver}). */
    static void alCambiarDia(Context ctx) {
        Context app = ctx.getApplicationContext();
        refresh(app);
        sCambioDiaArmado = 0L;
        try {
            programarCambioDia(app);
        } catch (Throwable ignored) {
        }
    }

    private static PendingIntent intentCambioDia(Context app, int flagBase) {
        Intent intent = new Intent(app, AlarmasReceiver.class);
        intent.setAction(ACTION_CAMBIO_DIA);
        int flags = flagBase;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(app, CAMBIO_DIA_REQUEST_CODE, intent, flags);
    }

    @Override
    public void onDestroy() {
        sRunning = false;
        // Si el sistema nos mata, la alarma vuelve a levantarnos.
        scheduleWatchdog(getApplicationContext());
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(@Nullable Intent rootIntent) {
        sRunning = false;
        // Deslizar la app fuera de recientes no debe apagar la detección.
        start(getApplicationContext(), true);
        super.onTaskRemoved(rootIntent);
    }

    private static Notification buildNotification(Context context) {
        String activeMode = SpotifyNotificationListener.getListeningMode(context);
        int[] daily = DuplicateSkipEngine.dailyStats(context);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
                .setContentTitle("Skippify · " + modeLabel(activeMode))
                .setContentText(dailySummary(daily))
                .setSubText("Hoy")
                .setStyle(new NotificationCompat.BigTextStyle().bigText(
                        dailySummary(daily)
                                + "\nMantén esta notificación activa para sincronizar con Spotify."))
                .setSmallIcon(R.drawable.ic_stat_skippify)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setShowWhen(false)
                .addAction(0, "Descubrimiento", buildModeActionPendingIntent(context, "discovery", 101))
                .addAction(0, "Casual", buildModeActionPendingIntent(context, "casual", 102))
                .addAction(0, "Personalizado", buildModeActionPendingIntent(context, "custom", 103));

        PendingIntent contentIntent = buildOpenAppPendingIntent(context);
        if (contentIntent != null) {
            builder.setContentIntent(contentIntent);
        }

        return builder.build();
    }

    /** Resumen esquemático: duplicadas oídas hoy y cuántas se saltaron. */
    private static String dailySummary(int[] daily) {
        int duplicates = daily.length > 0 ? daily[0] : 0;
        int skipped = daily.length > 1 ? daily[1] : 0;
        return "Duplicadas " + duplicates + " · Saltadas " + skipped;
    }

    @Nullable
    private static PendingIntent buildOpenAppPendingIntent(Context context) {
        Intent launchIntent = context.getPackageManager()
                .getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent == null) return null;

        launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        launchIntent.putExtra(EXTRA_OPEN_ROUTE, "/features");
        return PendingIntent.getActivity(context, 100, launchIntent, pendingIntentFlags());
    }

    private static PendingIntent buildModeActionPendingIntent(Context context, String mode, int requestCode) {
        Intent intent = new Intent(context, SkippifyForegroundService.class);
        intent.setAction(ACTION_SET_MODE);
        intent.putExtra(EXTRA_MODE, mode);
        return PendingIntent.getService(context, requestCode, intent, pendingIntentFlags());
    }

    private static int pendingIntentFlags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return flags;
    }

    private static String modeLabel(@Nullable String modeRaw) {
        String mode = modeRaw == null ? "" : modeRaw.trim().toLowerCase();
        if ("discovery".equals(mode)) return "Descubrimiento";
        if ("casual".equals(mode)) return "Casual";
        return "Personalizado";
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL) != null) return;

        NotificationChannel ch = new NotificationChannel(
                CHANNEL,
                "Skippify – segundo plano",
                NotificationManager.IMPORTANCE_LOW
        );
        ch.setDescription("Skippify está registrando escuchas de Spotify en segundo plano");
        ch.setShowBadge(false);
        ch.enableLights(false);
        ch.enableVibration(false);
        nm.createNotificationChannel(ch);
    }

    @Nullable
    @Override
    public IBinder onBind(@Nullable Intent intent) {
        return null;
    }
}
