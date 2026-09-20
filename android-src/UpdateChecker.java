package com.skippify.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
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
 * La app ya miraba si había una APK nueva, pero sólo al arrancar: quien no abre
 * Skippify en una semana se queda una semana atrás sin enterarse. Aquí la
 * comprobación se hace sola una vez al día y, si hay versión nueva, lo dice con
 * una notificación que abre la app en Configuración.
 *
 * NO descarga ni instala nada: eso sigue siendo cosa de {@link UpdaterPlugin},
 * con la confirmación del usuario que Android exige de todas formas.
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

    /** Debe coincidir con el repositorio que publica las releases. */
    private static final String LATEST_RELEASE_URL =
            "https://api.github.com/repos/SILAB3D/SKIPPIFY/releases/latest";

    /** Una vez al día: más a menudo no aporta nada y gasta batería y cupo. */
    static final long CHECK_INTERVAL_MS = 24L * 60L * 60L * 1000L;

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
        long ultima = sp.getLong(PREF_LAST_CHECK_AT, 0L);
        // Un reloj movido hacia atrás dejaría la comprobación congelada para
        // siempre, así que un "futuro" imposible también vale como vencida.
        long transcurrido = System.currentTimeMillis() - ultima;
        return ultima <= 0L || transcurrido >= CHECK_INTERVAL_MS || transcurrido < 0L;
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
        if (etiqueta == null) return;

        Matcher m = TAG_PATTERN.matcher(etiqueta.trim());
        if (!m.matches()) {
            Log.i(TAG, "etiqueta de release inesperada: " + etiqueta);
            return;
        }

        String versionNueva = m.group(1);
        long codigoNuevo;
        try {
            codigoNuevo = Long.parseLong(m.group(2));
        } catch (NumberFormatException e) {
            return;
        }

        long codigoInstalado = versionCodeInstalado(app);
        if (codigoInstalado <= 0L || codigoNuevo <= codigoInstalado) return;

        // Una sola notificación por versión: si el usuario la ignora, no se le
        // repite el aviso cada día hasta que actualice.
        SharedPreferences sp = prefs(app);
        if (sp != null && sp.getLong(PREF_NOTIFIED_CODE, 0L) >= codigoNuevo) return;

        notificar(app, versionNueva);
        if (sp != null) sp.edit().putLong(PREF_NOTIFIED_CODE, codigoNuevo).apply();
        Log.i(TAG, "versión nueva disponible: " + versionNueva + " (b" + codigoNuevo + ")");
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
