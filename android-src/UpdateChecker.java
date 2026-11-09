package com.skippify.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.BroadcastReceiver;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Comprobación diaria de actualizaciones, en segundo plano y sin abrir la app.
 *
 * Quien no abre Skippify en una semana se quedaría atrás sin enterarse. Aquí la
 * comprobación se hace sola una vez al día y, si hay versión nueva, lo dice con
 * una notificación (una por versión) que abre la app en Configuración.
 *
 * NO descarga ni instala nada: eso sigue siendo cosa de {@link UpdaterPlugin},
 * con la confirmación del usuario que Android exige de todas formas.
 *
 * Una release no se avisa hasta 6 horas después de publicarse (ver
 * {@link ActualizacionAviso#RETRASO_AVISO_MS}), para no encadenar avisos si salen
 * varias seguidas. Al detectar una todavía dentro del plazo se programa una
 * alarma para la hora exacta en que cumple las 6 horas ({@link #alSonar}); el
 * latido del servicio queda de red de seguridad si la alarma se pierde.
 *
 * El latido lo pone el servicio en primer plano, que ya se despierta cada quince
 * minutos para reafirmar su notificación. Programar una alarma propia para algo
 * que pasa una vez al día sería gastar un despertar de más: aquí sólo se mira el
 * reloj y casi siempre se vuelve por donde se ha venido.
 */
final class UpdateChecker {

    private static final String TAG = "SkippifyUpdate";

    private static final String PREFS = "skippify-updates";
    private static final String PREF_LAST_CHECK_AT = "lastCheckAtMs";
    private static final String PREF_NOTIFIED_CODE = "notifiedVersionCode";
    /** Release retenida por el plazo de 6 h: su versionCode y la hora en que ya se puede avisar. */
    private static final String PREF_PENDING_CODE = "pendingVersionCode";
    private static final String PREF_PENDING_OPEN_AT = "pendingOpenAtMs";
    private static final String PREF_PENDING_ALARM_AT = "pendingAlarmAtMs";

    /** Acción de la alarma puntual: la atiende {@link BootCompletedReceiver}. */
    static final String ACTION_ALARMA = "com.skippify.app.action.AVISO_ACTUALIZACION";
    private static final int ALARM_REQUEST_CODE = 0x5BE6;
    private static final long WAKELOCK_MS = 2L * 60L * 1000L;

    /** Una vez al día: más a menudo no aporta nada y gasta batería y cupo. */
    static final long CHECK_INTERVAL_MS = 24L * 60L * 60L * 1000L;

    /** Debe coincidir con el repositorio que publica las releases. */
    private static final String LATEST_RELEASE_URL =
            "https://api.github.com/repos/icsdesigns/SKIPPIFY/releases/latest";

    /**
     * Etiqueta de release: `v<versionName>-b<versionCode>`, tal y como la
     * compone .github/workflows/release-apk.yml.
     */
    private static final Pattern TAG_PATTERN = Pattern.compile("^v(.+)-b(\\d+)$");

    private static final String CHANNEL = "skippify_updates";
    private static final int NOTIF_ID = 0x5BFE;
    private static final int OPEN_REQUEST_CODE = 0x5BE0;

    /** Un hilo propio: la red nunca puede correr en el del servicio. */
    private static final ExecutorService POOL = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "SkippifyUpdateChecker");
        t.setDaemon(true);
        return t;
    });

    private UpdateChecker() { }

    // ── Entrada ──────────────────────────────────────────────────────────────

    /**
     * Comprueba si toca mirar y, en tal caso, mira. Es lo que llama el latido
     * del servicio: barato de llamar de más.
     */
    static void latido(@Nullable Context context) {
        if (context == null) return;
        final Context app = context.getApplicationContext();

        // Aprovecha el latido para dejar puesta la alarma de una release retenida
        // (la alarma no sobrevive a un reinicio ni a que el sistema la pierda).
        reponerAlarma(app);

        if (!tocaComprobar(app)) return;

        POOL.execute(() -> {
            try {
                comprobarAhora(app);
            } catch (Throwable t) {
                Log.w(TAG, "comprobación de actualización fallida", t);
            }
        });
    }

    static boolean tocaComprobar(Context app) {
        SharedPreferences sp = prefs(app);
        if (sp == null) return false;
        // Un reloj movido hacia atrás dejaría la comprobación congelada para
        // siempre, así que un "futuro" imposible también vale como vencida; y
        // una release retenida cuya hora ya pasó no espera al día siguiente.
        return ActualizacionAviso.tocaComprobar(System.currentTimeMillis(),
                sp.getLong(PREF_LAST_CHECK_AT, 0L), CHECK_INTERVAL_MS,
                sp.getLong(PREF_PENDING_OPEN_AT, 0L));
    }

    /**
     * Ha sonado la alarma de las 6 horas (la recibe {@link BootCompletedReceiver}).
     * Vuelve a consultar la release —puede haber salido otra más nueva, o el
     * usuario haber actualizado ya— y avisa si procede. La marca de «última
     * comprobación» no interviene: esta consulta es independiente de la diaria.
     */
    static void alSonar(Context ctx, @Nullable BroadcastReceiver.PendingResult pendiente) {
        final Context app = ctx.getApplicationContext();
        final PowerManager.WakeLock wl = tomarWakeLock(app);
        try {
            POOL.execute(() -> {
                try {
                    comprobarAhora(app);
                } catch (Throwable t) {
                    Log.w(TAG, "la alarma de actualización ha fallado", t);
                } finally {
                    soltar(wl);
                    terminar(pendiente);
                }
            });
        } catch (Throwable t) {
            soltar(wl);
            terminar(pendiente);
        }
    }

    private static void terminar(@Nullable BroadcastReceiver.PendingResult pendiente) {
        if (pendiente == null) return;
        try { pendiente.finish(); } catch (Throwable ignored) { }
    }

    /** Tras un reinicio o al actualizar la app: repone la alarma de una release retenida. */
    static void reponerAlarma(Context app) {
        try {
            SharedPreferences sp = prefs(app);
            if (sp == null) return;
            long apertura = sp.getLong(PREF_PENDING_OPEN_AT, 0L);
            if (apertura <= 0L) return;
            long cuando = ActualizacionAviso.momentoAlarma(apertura - ActualizacionAviso.RETRASO_AVISO_MS);
            // Ya vencida: no hay nada que programar; el latido la recoge (tocaComprobar).
            if (System.currentTimeMillis() >= cuando) return;
            if (sp.getLong(PREF_PENDING_ALARM_AT, 0L) == cuando && hayAlarma(app)) return;
            ponerAlarma(app, cuando);
        } catch (Throwable t) {
            Log.w(TAG, "no se pudo reponer la alarma de actualización", t);
        }
    }

    // ── Comprobación ─────────────────────────────────────────────────────────

    private static void comprobarAhora(Context app) {
        // La marca se pone ANTES de salir a la red: si GitHub no contesta, se
        // reintenta mañana y no en cada latido de los quince minutos.
        marcarComprobado(app);

        MacroRunner.Response r = new SpotifyBackend.UrlRawHttp()
                .send("GET", LATEST_RELEASE_URL, null, null, null);
        if (r == null || r.status < 200 || r.status >= 300 || r.body == null) {
            Log.i(TAG, "sin respuesta útil de GitHub (" + (r == null ? "null" : r.status) + ")");
            return;
        }

        Object raiz = MacroRunner.Json.parse(r.body);
        Map<String, Object> obj = MacroRunner.Json.object(raiz);
        String etiqueta = MacroRunner.Json.string(obj, "tag_name");
        if (etiqueta == null) {
            aplicarSinPendiente(app, ActualizacionAviso.sinReleaseUtil());
            return;
        }

        Matcher m = TAG_PATTERN.matcher(etiqueta.trim());
        if (!m.matches()) {
            Log.i(TAG, "etiqueta de release inesperada: " + etiqueta);
            aplicarSinPendiente(app, ActualizacionAviso.sinReleaseUtil());
            return;
        }

        String versionNueva = m.group(1);
        long codigoNuevo;
        try {
            codigoNuevo = Long.parseLong(m.group(2));
        } catch (NumberFormatException e) {
            aplicarSinPendiente(app, ActualizacionAviso.sinReleaseUtil());
            return;
        }

        // Sin saber qué hay instalado, o con la release ya instalada, `decidir`
        // responde NADA y más abajo se limpia lo retenido.
        long codigoInstalado = versionCodeInstalado(app);

        // Fecha de lanzamiento: published_at de GitHub (ISO UTC); si falta,
        // created_at. Sin ninguna legible no se retiene nada (ver ActualizacionAviso).
        long publicado = ActualizacionAviso.fechaDeRelease(
                MacroRunner.Json.string(obj, "published_at"),
                MacroRunner.Json.string(obj, "created_at"));

        // Una sola notificación por versión: si el usuario la ignora, no se le
        // repite el aviso cada día hasta que actualice.
        SharedPreferences sp = prefs(app);
        ActualizacionAviso.Decision d = ActualizacionAviso.decidir(System.currentTimeMillis(), publicado,
                codigoNuevo, codigoInstalado, sp == null ? 0L : sp.getLong(PREF_NOTIFIED_CODE, 0L));

        switch (d.accion) {
            case NOTIFICAR:
                notificar(app, versionNueva);
                if (sp != null) sp.edit().putLong(PREF_NOTIFIED_CODE, codigoNuevo).apply();
                limpiarPendiente(app);
                Log.i(TAG, "versión nueva disponible: " + versionNueva + " (b" + codigoNuevo + ")");
                break;
            case PROGRAMAR:
                // Demasiado reciente: se avisará, de la más nueva que haya entonces,
                // cuando cumpla las 6 horas. Si ya había otra retenida, esta la sustituye.
                if (sp != null) {
                    sp.edit().putLong(PREF_PENDING_CODE, codigoNuevo)
                            .putLong(PREF_PENDING_OPEN_AT, d.aperturaMs).apply();
                }
                ponerAlarma(app, d.cuandoMs);
                Log.i(TAG, "versión " + versionNueva + " (b" + codigoNuevo
                        + ") retenida: se avisará a las " + d.cuandoMs);
                break;
            default:
                // Nada que avisar (ya instalada o ya avisada): no queda nada retenido.
                limpiarPendiente(app);
                break;
        }
    }

    /** Aplica una decisión sin release que esperar: borra la alarma y lo retenido. */
    private static void aplicarSinPendiente(Context app, ActualizacionAviso.Decision d) {
        if (ActualizacionAviso.pendienteTras(d) <= 0L) limpiarPendiente(app);
    }

    // ── Alarma ───────────────────────────────────────────────────────────────

    private static PendingIntent intentAlarma(Context app, int flagBase) {
        Intent intent = new Intent(app, BootCompletedReceiver.class);
        intent.setAction(ACTION_ALARMA);
        int flags = flagBase;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(app, ALARM_REQUEST_CODE, intent, flags);
    }

    private static boolean hayAlarma(Context app) {
        return intentAlarma(app, PendingIntent.FLAG_NO_CREATE) != null;
    }

    private static void ponerAlarma(Context app, long cuando) {
        AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = intentAlarma(app, PendingIntent.FLAG_UPDATE_CURRENT);
        // Igual que los demás avisos: exacta si el sistema lo permite (USE_EXACT_ALARM
        // está declarado); si no, una inexacta llega con unos minutos de retraso.
        boolean exacta = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms();
        if (exacta && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cuando, pi);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cuando, pi);
        } else {
            am.setExact(AlarmManager.RTC_WAKEUP, cuando, pi);
        }
        SharedPreferences sp = prefs(app);
        if (sp != null) sp.edit().putLong(PREF_PENDING_ALARM_AT, cuando).apply();
    }

    private static void limpiarPendiente(Context app) {
        try {
            AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
            PendingIntent pi = intentAlarma(app, PendingIntent.FLAG_NO_CREATE);
            if (pi != null) {
                if (am != null) am.cancel(pi);
                pi.cancel();
            }
        } catch (Throwable ignored) {
        }
        SharedPreferences sp = prefs(app);
        if (sp != null) {
            sp.edit().remove(PREF_PENDING_CODE).remove(PREF_PENDING_OPEN_AT)
                    .remove(PREF_PENDING_ALARM_AT).apply();
        }
    }

    @Nullable
    private static PowerManager.WakeLock tomarWakeLock(Context app) {
        try {
            PowerManager pm = (PowerManager) app.getSystemService(Context.POWER_SERVICE);
            if (pm == null) return null;
            PowerManager.WakeLock wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "skippify:actualizacion");
            wl.setReferenceCounted(false);
            // Con tiempo máximo: se suelta sola aunque algo falle.
            wl.acquire(WAKELOCK_MS);
            return wl;
        } catch (Throwable t) {
            return null;
        }
    }

    private static void soltar(@Nullable PowerManager.WakeLock wl) {
        try {
            if (wl != null && wl.isHeld()) wl.release();
        } catch (Throwable ignored) {
        }
    }

    private static long versionCodeInstalado(Context app) {
        try {
            PackageInfo info = app.getPackageManager().getPackageInfo(app.getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return info.getLongVersionCode();
            }
            return info.versionCode;
        } catch (PackageManager.NameNotFoundException | RuntimeException e) {
            // Sin saber qué hay instalado no se puede comparar nada: mejor
            // callar que anunciar una actualización que quizá ya esté puesta.
            return 0L;
        }
    }

    // ── Aviso ────────────────────────────────────────────────────────────────

    private static void notificar(Context app, String version) {
        NotificationManager nm =
                (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        asegurarCanal(nm);

        String texto = "Ya está disponible la versión " + version + ". Ábrela para instalarla.";
        NotificationCompat.Builder b = new NotificationCompat.Builder(app, CHANNEL)
                .setContentTitle("Skippify · actualización disponible")
                .setContentText(texto)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
                .setSmallIcon(R.drawable.ic_stat_skippify)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
                .setAutoCancel(true);

        PendingIntent abrir = intentDeApertura(app);
        if (abrir != null) b.setContentIntent(abrir);

        try {
            nm.notify(NOTIF_ID, b.build());
        } catch (Throwable ignored) {
            // Sin permiso POST_NOTIFICATIONS (Android 13+) no se puede avisar.
            // El aviso dentro de la app sigue saliendo al abrirla.
        }
    }

    private static void asegurarCanal(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            NotificationChannel canal = new NotificationChannel(
                    CHANNEL, "Actualizaciones", NotificationManager.IMPORTANCE_DEFAULT);
            canal.setDescription("Avisa cuando hay una versión nueva de Skippify.");
            canal.setShowBadge(false);
            nm.createNotificationChannel(canal);
        } catch (Throwable ignored) {
        }
    }

    @Nullable
    private static PendingIntent intentDeApertura(Context app) {
        Intent launch = app.getPackageManager().getLaunchIntentForPackage(app.getPackageName());
        if (launch == null) return null;

        launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        launch.putExtra(SkippifyForegroundService.EXTRA_OPEN_ROUTE, "/settings");

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(app, OPEN_REQUEST_CODE, launch, flags);
    }

    // ── Preferencias ─────────────────────────────────────────────────────────

    private static void marcarComprobado(Context app) {
        SharedPreferences sp = prefs(app);
        if (sp == null) return;
        sp.edit().putLong(PREF_LAST_CHECK_AT, System.currentTimeMillis()).apply();
    }

    @Nullable
    private static SharedPreferences prefs(Context app) {
        try {
            return app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        } catch (Throwable ignored) {
            return null;
        }
    }
}
