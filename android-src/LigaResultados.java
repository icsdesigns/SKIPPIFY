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
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * El aviso del ranking semanal de Comunidad, el domingo a las 15:00 en punto.
 *
 * Antes el aviso dependía de que la acción de GitHub publicara a su hora (y
 * llegaba con horas de retraso) y de que JS estuviera vivo para verlo. Ahora la
 * acción publica de madrugada con `revealAt`, y aquí una alarma exacta despierta
 * al móvil a las 15:00, mira qué grupos tienen ya su semana y avisa de cada uno.
 *
 *   · Desde unas horas antes, el latido del servicio comprueba si ya está
 *     publicada: a las 15:00 se avisa de esos grupos sin tocar la red, que en
 *     reposo profundo puede no estar.
 *   · Si a las 15:00 algún grupo aún no la tiene, se vuelve a mirar cada 15
 *     minutos durante un día y medio, y se avisa en cuanto aparece.
 *   · La app, al abrirse, avisa por el mismo sitio (`avisar`), así que un grupo
 *     del que ya se avisó a las 15:00 no vuelve a sonar.
 *
 * Las decisiones de horas viven en {@link ResultadosLiga}, que se prueba aparte.
 */
public final class LigaResultados {

    private static final String TAG = "SkippifyLiga";
    private static final String PREFS = "skippify_liga_resultados";
    static final String ACTION_ALARMA = "com.skippify.app.action.LIGA_RESULTADOS";
    private static final int ALARMA_REQUEST_CODE = 0x5BE1;
    private static final String CANAL = "skippify_liga";
    private static final int COLOR_MARCA = 0xFF1ED760;

    private static final String K_AVISADOS = "avisados";
    private static final String K_LISTOS = "listos";
    private static final String K_ALARMA = "alarma";
    private static final String K_ULTIMA = "ultimaComprobacion";
    private static final int MAX_AVISADOS = 60;
    /** Entre dos comprobaciones desde el latido, que llega cada ~15 min. */
    private static final long MIN_ENTRE_COMPROBACIONES_MS = 10L * 60L * 1000L;

    private static final ExecutorService POOL = Executors.newSingleThreadExecutor();

    private LigaResultados() { }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ── Alarma ───────────────────────────────────────────────────────────────

    /**
     * Pone la alarma en su sitio. Barato: si ya está a esa hora no la toca, así
     * que se puede llamar desde cada latido, al arrancar y al sincronizar.
     */
    public static void programar(Context ctx) {
        Context app = ctx.getApplicationContext();
        long ahora = System.currentTimeMillis();
        long cuando = ResultadosLiga.siguienteAlarma(ahora, hayPendientes(app, ahora));
        if (prefs(app).getLong(K_ALARMA, 0L) == cuando) return;
        ponerAlarma(app, cuando);
    }

    private static void ponerAlarma(Context app, long cuando) {
        try {
            AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent intent = new Intent(app, BootCompletedReceiver.class);
            intent.setAction(ACTION_ALARMA);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getBroadcast(app, ALARMA_REQUEST_CODE, intent, flags);

            // USE_EXACT_ALARM (Android 13+) la concede el sistema sin preguntar;
            // si algún fabricante la quita, una alarma inexacta llega con unos
            // minutos de retraso, que sigue siendo mejor que esperar a GitHub.
            boolean exacta = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms();
            if (exacta && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cuando, pi);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cuando, pi);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, cuando, pi);
            }
            prefs(app).edit().putLong(K_ALARMA, cuando).apply();
        } catch (Throwable t) {
            Log.w(TAG, "no se pudo programar el aviso del ranking", t);
        }
    }

    /** Ha sonado la alarma: se comprueba en su hilo y se reprograma. */
    public static void alSonar(Context ctx, final BroadcastReceiver.PendingResult pendiente) {
        final Context app = ctx.getApplicationContext();
        // Se deja puesto el reintento antes de tocar la red: si Android corta
        // el receptor a mitad, la próxima alarma ya está en su sitio.
        prefs(app).edit().putLong(K_ALARMA, 0L).apply();
        ponerAlarma(app, ResultadosLiga.siguienteAlarma(System.currentTimeMillis(), true));
        POOL.execute(new Runnable() {
            public void run() {
                try {
                    comprobar(app, true);
                } catch (Throwable t) {
                    Log.w(TAG, "la comprobación del ranking ha fallado", t);
                } finally {
                    try { programar(app); } catch (Throwable ignored) { }
                    if (pendiente != null) {
                        try { pendiente.finish(); } catch (Throwable ignored) { }
                    }
                }
            }
        });
    }

    /**
     * Latido del servicio en primer plano: repara la alarma si se ha perdido y,
     * cerca de las 15:00 o mientras se espera la semana, comprueba.
     */
    public static void latido(Context ctx) {
        final Context app = ctx.getApplicationContext();
        if (!EscuchasNube.configurado(LigaBackground.store(app))) return;
        programar(app);

        final long ahora = System.currentTimeMillis();
        final boolean tras15 = ResultadosLiga.enEspera(ahora) && hayPendientes(app, ahora);
        final boolean antes15 = ResultadosLiga.antesDelDesvelado(ahora);
        if (!tras15 && !antes15) return;
        if (ahora - prefs(app).getLong(K_ULTIMA, 0L) < MIN_ENTRE_COMPROBACIONES_MS) return;

        POOL.execute(new Runnable() {
            public void run() {
                try {
                    comprobar(app, tras15);
                } catch (Throwable t) {
                    Log.w(TAG, "la comprobación del ranking ha fallado", t);
                } finally {
                    try { programar(app); } catch (Throwable ignored) { }
                }
            }
        });
    }

    // ── Comprobación ─────────────────────────────────────────────────────────

    private static boolean hayPendientes(Context app, long ahora) {
        EscuchasNube.Store s = LigaBackground.store(app);
        if (!EscuchasNube.configurado(s)) return false;
        String reveal = ResultadosLiga.iso(ResultadosLiga.ultimoDesvelado(ahora));
        String avisados = prefs(app).getString(K_AVISADOS, "");
        for (String g : EscuchasNube.grupos(s)) {
            if (!contiene(avisados, ResultadosLiga.claveAviso(g, reveal))) return true;
        }
        return false;
    }

    /**
     * Mira cada grupo. Con `avisarYa` se avisa de los que tengan la semana de
     * las últimas 15:00; sin él (antes de esa hora) sólo se apunta cuáles de la
     * próxima ya están publicados, para avisar a la hora sin red.
     */
    static void comprobar(Context app, boolean avisarYa) {
        SharedPreferences sp = prefs(app);
        long ahora = System.currentTimeMillis();
        sp.edit().putLong(K_ULTIMA, ahora).apply();

        EscuchasNube.Store s = LigaBackground.store(app);
        if (!EscuchasNube.configurado(s)) return;

        long objetivo = avisarYa ? ResultadosLiga.ultimoDesvelado(ahora) : ResultadosLiga.proximoDesvelado(ahora);
        String reveal = ResultadosLiga.iso(objetivo);
        String listos = sp.getString(K_LISTOS, "");
        String token = null;
        boolean tokenPedido = false;

        for (String g : EscuchasNube.grupos(s)) {
            String clave = ResultadosLiga.claveAviso(g, reveal);
            if (contiene(sp.getString(K_AVISADOS, ""), clave)) continue;

            String nombre = nombreListo(listos, clave);
            if (nombre == null) {
                if (!tokenPedido) {
                    token = EscuchasNube.idToken(s, new EscuchasNube.UrlHttp(), LigaBackground.PARSER, LigaBackground.RELOJ);
                    tokenPedido = true;
                }
                if (token == null) return;
                if (!publicada(s, token, g, objetivo)) continue;
                nombre = nombreDelGrupo(s, token, g);
                listos = apuntar(listos, clave + "\t" + nombre);
                sp.edit().putString(K_LISTOS, listos).apply();
            }
            if (avisarYa) avisar(app, g, nombre, reveal);
        }
    }

    private static String urlDoc(EscuchasNube.Store s, String ruta) {
        return "https://firestore.googleapis.com/v1/projects/" + s.get(EscuchasNube.K_PROYECTO)
                + "/databases/(default)/documents/" + ruta;
    }

    private static boolean publicada(EscuchasNube.Store s, String token, String groupId, long objetivo) {
        String url = urlDoc(s, "friend_groups/" + Uri.encode(groupId) + "/weekly_results/current")
                + "?mask.fieldPaths=revealAt&mask.fieldPaths=next.revealAt";
        EscuchasNube.Response r = new EscuchasNube.UrlHttp().send("GET", url, null, null, token,
                s.get(EscuchasNube.K_ORIGEN));
        if (r == null || !r.ok() || r.body == null) {
            if (r != null && r.status == 401) s.put(EscuchasNube.K_ID_TOKEN, "");
            return false;
        }
        try {
            JSONObject campos = new JSONObject(r.body).optJSONObject("fields");
            if (campos == null) return false;
            String arriba = texto(campos.optJSONObject("revealAt"));
            JSONObject next = campos.optJSONObject("next");
            JSONObject mapa = next == null ? null : next.optJSONObject("mapValue");
            JSONObject camposNext = mapa == null ? null : mapa.optJSONObject("fields");
            String abajo = camposNext == null ? "" : texto(camposNext.optJSONObject("revealAt"));
            return ResultadosLiga.publicada(arriba, abajo, objetivo);
        } catch (Throwable t) {
            return false;
        }
    }

    private static String nombreDelGrupo(EscuchasNube.Store s, String token, String groupId) {
        String url = urlDoc(s, "friend_groups/" + Uri.encode(groupId)) + "?mask.fieldPaths=name";
        EscuchasNube.Response r = new EscuchasNube.UrlHttp().send("GET", url, null, null, token,
                s.get(EscuchasNube.K_ORIGEN));
        if (r == null || !r.ok() || r.body == null) return "";
        try {
            JSONObject campos = new JSONObject(r.body).optJSONObject("fields");
            return campos == null ? "" : texto(campos.optJSONObject("name"));
        } catch (Throwable t) {
            return "";
        }
    }

    private static String texto(JSONObject valor) {
        if (valor == null) return "";
        return valor.optString("stringValue", "");
    }

    // ── Aviso ────────────────────────────────────────────────────────────────

    /**
     * Avisa de que ya se ve la semana de un grupo, una sola vez por semana y
     * grupo. Lo usan la alarma y la app; devuelve si ha sonado.
     */
    public static synchronized boolean avisar(Context ctx, String groupId, String nombre, String revealAt) {
        Context app = ctx.getApplicationContext();
        SharedPreferences sp = prefs(app);
        boolean conFecha = revealAt != null && !revealAt.isEmpty();
        String clave = ResultadosLiga.claveAviso(groupId, conFecha ? revealAt : "");
        // Sin fecha (resultados publicados a mano o de antes de esta versión)
        // no hay con qué cruzarlo: se avisa sin apuntarlo.
        if (conFecha && contiene(sp.getString(K_AVISADOS, ""), clave)) return false;

        boolean ok = mostrar(app, groupId, nombre);
        if (conFecha) {
            sp.edit().putString(K_AVISADOS, apuntar(sp.getString(K_AVISADOS, ""), clave)).apply();
        }
        return ok;
    }

    private static boolean mostrar(Context app, String groupId, String nombre) {
        try {
            NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CANAL) == null) {
                NotificationChannel ch = new NotificationChannel(CANAL, "Comunidad · resultados semanales",
                        NotificationManager.IMPORTANCE_DEFAULT);
                ch.setDescription("El ranking de tus grupos, cada domingo a las 15:00");
                nm.createNotificationChannel(ch);
            }

            String texto = nombre == null || nombre.trim().isEmpty()
                    ? "Ya están los resultados semanales de tu grupo."
                    : "Ya están los resultados de la semana de " + nombre.trim() + ".";

            NotificationCompat.Builder b = new NotificationCompat.Builder(app, CANAL)
                    // La barra de estado sólo admite la silueta: el monograma
                    // de Skippify, el mismo que la notificación del servicio.
                    .setSmallIcon(R.drawable.ic_stat_skippify)
                    .setColor(COLOR_MARCA)
                    .setContentTitle("Resultados de la semana")
                    .setContentText(texto)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
                    .setCategory(NotificationCompat.CATEGORY_SOCIAL)
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                    .setAutoCancel(true);

            // Y dentro de la notificación, el icono de la app a todo color.
            Bitmap icono = iconoDeLaApp(app);
            if (icono != null) b.setLargeIcon(icono);

            PendingIntent abrir = abrirComunidad(app);
            if (abrir != null) b.setContentIntent(abrir);

            nm.notify(("liga|" + groupId).hashCode(), b.build());
            return true;
        } catch (Throwable t) {
            Log.w(TAG, "no se pudo mostrar el aviso del ranking", t);
            return false;
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

    private static PendingIntent abrirComunidad(Context app) {
        Intent launch = app.getPackageManager().getLaunchIntentForPackage(app.getPackageName());
        if (launch == null) return null;
        launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        launch.putExtra(SkippifyForegroundService.EXTRA_OPEN_ROUTE, "/comunidad");
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(app, 0x5BE2, launch, flags);
    }

    // ── Listas en una cadena ─────────────────────────────────────────────────

    private static boolean contiene(String lista, String clave) {
        if (lista == null || lista.isEmpty()) return false;
        for (String l : lista.split("\n")) {
            if (l.equals(clave) || l.startsWith(clave + "\t")) return true;
        }
        return false;
    }

    /** Nombre apuntado al precomprobar, o null si ese grupo no estaba listo. */
    private static String nombreListo(String lista, String clave) {
        if (lista == null || lista.isEmpty()) return null;
        for (String l : lista.split("\n")) {
            if (l.equals(clave)) return "";
            if (l.startsWith(clave + "\t")) return l.substring(clave.length() + 1);
        }
        return null;
    }

    /** Añade una línea y se queda con las últimas: no crece sin fin. */
    private static String apuntar(String lista, String linea) {
        List<String> lineas = new ArrayList<String>();
        if (lista != null && !lista.isEmpty()) {
            for (String l : lista.split("\n")) if (!l.isEmpty()) lineas.add(l);
        }
        lineas.add(linea.replace("\n", " "));
        while (lineas.size() > MAX_AVISADOS) lineas.remove(0);
        StringBuilder b = new StringBuilder();
        for (String l : lineas) {
            if (b.length() > 0) b.append('\n');
            b.append(l);
        }
        return b.toString();
    }
}
