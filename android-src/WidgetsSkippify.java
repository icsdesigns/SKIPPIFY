package com.skippify.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.widget.RemoteViews;

import androidx.annotation.Nullable;

import java.util.TimeZone;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Pinta los dos widgets de la pantalla de inicio.
 *
 *   · «Modo de escucha»: el modo activo con sus tres botones y las duplicadas
 *     y saltadas de hoy, los mismos datos que la notificación persistente.
 *   · «Tu mes»: escuchas, tiempo y saltadas de media al día en los últimos
 *     30 días, calculados por {@link MesWidgetDatos}. En el código sigue
 *     llamándose «semana» (receptor, layout, ids) para que los widgets que ya
 *     estaban puestos no se rompan al actualizar.
 *
 * Se refrescan desde donde ya cambia cada dato: los contadores del día y el
 * modo pasan por {@link SkippifyForegroundService}, y las escuchas por el
 * listener. El latido de 15 minutos del servicio cubre el cambio de día.
 */
final class WidgetsSkippify {

    private WidgetsSkippify() { }

    static final String ACCION_MODO = "com.skippify.app.widget.SET_MODE";
    static final String EXTRA_MODO = "mode";

    private static final int GRIS = 0xFFB3B3B3;
    private static final int NEGRO = 0xFF121212;

    /** Un hilo para leer el registro de escuchas fuera del hilo principal. */
    private static final ScheduledExecutorService HILO = Executors.newSingleThreadScheduledExecutor();
    private static final AtomicBoolean SEMANA_PENDIENTE = new AtomicBoolean(false);
    /** Los eventos llegan a ráfagas al cambiar de canción: se agrupan. */
    private static final long ESPERA_SEMANA_MS = 3000L;


    // ── Entradas ─────────────────────────────────────────────────────────────

    /** Refresca los dos. */
    static void actualizar(@Nullable Context ctx) {
        if (ctx == null) return;
        actualizarModo(ctx);
        actualizarSemana(ctx);
    }

    static void actualizarModo(@Nullable Context ctx) {
        if (ctx == null) return;
        try {
            Context app = ctx.getApplicationContext();
            AppWidgetManager awm = AppWidgetManager.getInstance(app);
            int[] ids = ids(app, awm, WidgetModoProvider.class);
            if (ids.length == 0) return;
            awm.updateAppWidget(ids, vistaModo(app));
        } catch (Throwable ignored) {
        }
    }

    /** Programa el recálculo de la semana; varias llamadas seguidas cuentan como una. */
    static void actualizarSemana(@Nullable Context ctx) {
        if (ctx == null) return;
        final Context app = ctx.getApplicationContext();
        try {
            if (ids(app, AppWidgetManager.getInstance(app), WidgetSemanaProvider.class).length == 0) return;
        } catch (Throwable ignored) {
            return;
        }
        if (!SEMANA_PENDIENTE.compareAndSet(false, true)) return;
        HILO.schedule(new Runnable() {
            public void run() {
                SEMANA_PENDIENTE.set(false);
                pintarSemana(app);
            }
        }, ESPERA_SEMANA_MS, TimeUnit.MILLISECONDS);
    }

    /** Para onUpdate: pinta ya, sin esperar, porque el widget acaba de aparecer. */
    static void pintarSemanaYa(final Context ctx) {
        final Context app = ctx.getApplicationContext();
        HILO.execute(new Runnable() {
            public void run() { pintarSemana(app); }
        });
    }

    /** Un toque en un botón de modo. */
    static void cambiarModo(Context ctx, @Nullable String modo) {
        if (ctx == null || modo == null) return;
        Context app = ctx.getApplicationContext();
        SpotifyNotificationListener.configureListeningMode(app, modo);
        NotifListenerPlugin.notifyFeatureConfigChanged();
        actualizarModo(app);
    }

    // ── Modo de escucha ──────────────────────────────────────────────────────

    private static RemoteViews vistaModo(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_modo);
        String modo = SpotifyNotificationListener.getListeningMode(ctx);
        int[] hoy = DuplicateSkipEngine.dailyStats(ctx);

        v.setTextViewText(R.id.widget_modo_duplicadas, String.valueOf(hoy.length > 0 ? hoy[0] : 0));
        v.setTextViewText(R.id.widget_modo_saltadas, String.valueOf(hoy.length > 1 ? hoy[1] : 0));

        boton(ctx, v, R.id.widget_modo_descubrimiento, "discovery", modo, 201);
        boton(ctx, v, R.id.widget_modo_casual, "casual", modo, 202);
        boton(ctx, v, R.id.widget_modo_personalizado, "custom", modo, 203);

        PendingIntent abrir = abrirApp(ctx, "/features", 210);
        if (abrir != null) v.setOnClickPendingIntent(R.id.widget_modo_cabecera, abrir);
        return v;
    }

    private static void boton(Context ctx, RemoteViews v, int id, String modo, String activo, int codigo) {
        boolean sel = modo.equals(activo);
        v.setInt(id, "setBackgroundResource",
                sel ? R.drawable.widget_modo_activo : R.drawable.widget_modo_inactivo);
        v.setTextColor(id, sel ? NEGRO : GRIS);

        Intent i = new Intent(ctx, WidgetModoProvider.class);
        i.setAction(ACCION_MODO);
        i.putExtra(EXTRA_MODO, modo);
        v.setOnClickPendingIntent(id, PendingIntent.getBroadcast(ctx, codigo, i, flags()));
    }

    // ── Tu mes ───────────────────────────────────────────────────────────────

    private static void pintarSemana(Context ctx) {
        try {
            AppWidgetManager awm = AppWidgetManager.getInstance(ctx);
            int[] ids = ids(ctx, awm, WidgetSemanaProvider.class);
            if (ids.length == 0) return;

            MesWidgetDatos.Resumen r = MesWidgetDatos.calcular(
                    RegistroEscuchas.leer(ctx), DuplicateSkipEngine.dailyHistory(ctx),
                    System.currentTimeMillis(), TimeZone.getDefault());
            awm.updateAppWidget(ids, vistaMes(ctx, r));
        } catch (Throwable ignored) {
        }
    }

    private static RemoteViews vistaMes(Context ctx, MesWidgetDatos.Resumen r) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_semana);

        // Mientras el registro no llega a 30 días, la pastilla dice entre
        // cuántos se está haciendo la media.
        v.setTextViewText(R.id.widget_semana_rango, "Media · " + r.diasEscucha
                + (r.diasEscucha == 1 ? " día" : " días"));
        v.setTextViewText(R.id.widget_semana_escuchas, MesWidgetDatos.media(r.escuchasDia));
        v.setTextViewText(R.id.widget_semana_tiempo, MesWidgetDatos.duracion(r.msDia));
        v.setTextViewText(R.id.widget_semana_saltadas, MesWidgetDatos.media(r.saltadasDia));

        PendingIntent abrir = abrirApp(ctx, "/stats", 211);
        if (abrir != null) v.setOnClickPendingIntent(R.id.widget_semana_raiz, abrir);
        return v;
    }

    // ── Comunes ──────────────────────────────────────────────────────────────

    private static int[] ids(Context ctx, AppWidgetManager awm, Class<?> proveedor) {
        if (awm == null) return new int[0];
        int[] ids = awm.getAppWidgetIds(new ComponentName(ctx, proveedor));
        return ids == null ? new int[0] : ids;
    }

    @Nullable
    private static PendingIntent abrirApp(Context ctx, String ruta, int codigo) {
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (launch == null) return null;
        launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        launch.putExtra(SkippifyForegroundService.EXTRA_OPEN_ROUTE, ruta);
        return PendingIntent.getActivity(ctx, codigo, launch, flags());
    }

    private static int flags() {
        int f = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) f |= PendingIntent.FLAG_IMMUTABLE;
        return f;
    }
}
