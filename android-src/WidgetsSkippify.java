package com.skippify.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.Build;
import android.os.Bundle;
import android.widget.RemoteViews;

import androidx.annotation.Nullable;

import java.util.Calendar;
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
 *   · «Tu semana»: escuchas, tiempo, saltadas, un gráfico por día y el
 *     artista más escuchado, calculados por {@link SemanaWidgetDatos}.
 *
 * Se refrescan desde donde ya cambia cada dato: los contadores del día y el
 * modo pasan por {@link SkippifyForegroundService}, y las escuchas por el
 * listener. El latido de 15 minutos del servicio cubre el cambio de día.
 */
final class WidgetsSkippify {

    private WidgetsSkippify() { }

    static final String ACCION_MODO = "com.skippify.app.widget.SET_MODE";
    static final String EXTRA_MODO = "mode";

    private static final int VERDE = 0xFF1ED760;
    private static final int VERDE_OSCURO = 0xFF12833A;
    private static final int PISTA = 0xFF2A2A2A;
    private static final int BLANCO = 0xFFFFFFFF;
    private static final int GRIS = 0xFFB3B3B3;
    private static final int NEGRO = 0xFF121212;

    private static final String[] MESES = {
            "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"
    };

    /** Un hilo para leer el registro semanal fuera del hilo principal. */
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

    // ── Tu semana ────────────────────────────────────────────────────────────

    private static void pintarSemana(Context ctx) {
        try {
            AppWidgetManager awm = AppWidgetManager.getInstance(ctx);
            int[] ids = ids(ctx, awm, WidgetSemanaProvider.class);
            if (ids.length == 0) return;

            TimeZone zona = TimeZone.getDefault();
            long ahora = System.currentTimeMillis();
            SemanaWidgetDatos.Resumen r = SemanaWidgetDatos.calcular(
                    RegistroSemanal.leer(ctx), DuplicateSkipEngine.dailyHistory(ctx), ahora, zona);
            // Uno a uno: el gráfico se dibuja al tamaño real de cada widget
            // para que las barras no salgan estiradas ni borrosas.
            for (int id : ids) {
                awm.updateAppWidget(id, vistaSemana(ctx, r, zona, awm.getAppWidgetOptions(id)));
            }
        } catch (Throwable ignored) {
        }
    }

    private static RemoteViews vistaSemana(Context ctx, SemanaWidgetDatos.Resumen r, TimeZone zona,
                                           @Nullable Bundle opciones) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_semana);

        v.setTextViewText(R.id.widget_semana_rango, rango(r.inicioSemana, zona));
        v.setTextViewText(R.id.widget_semana_escuchas, String.valueOf(r.escuchas));
        v.setTextViewText(R.id.widget_semana_tiempo, SemanaWidgetDatos.duracion(r.msEscuchados));
        v.setTextViewText(R.id.widget_semana_media, SemanaWidgetDatos.duracion(r.msMediaDiaria));
        v.setTextViewText(R.id.widget_semana_saltadas,String.valueOf(r.saltadas));

        if (r.artistaTop.isEmpty()) {
            v.setTextViewText(R.id.widget_semana_top, r.escuchas == 0
                    ? "Aún no hay escuchas esta semana"
                    : r.distintas + (r.distintas == 1 ? " canción distinta" : " canciones distintas"));
        } else {
            v.setTextViewText(R.id.widget_semana_top, r.artistaTop
                    + " · " + r.escuchasArtistaTop + (r.escuchasArtistaTop == 1 ? " escucha" : " escuchas")
                    + " · " + r.distintas + (r.distintas == 1 ? " canción" : " canciones"));
        }

        int[] letras = {
                R.id.widget_semana_d0, R.id.widget_semana_d1, R.id.widget_semana_d2,
                R.id.widget_semana_d3, R.id.widget_semana_d4, R.id.widget_semana_d5,
                R.id.widget_semana_d6
        };
        for (int i = 0; i < letras.length; i++) {
            v.setTextColor(letras[i], i == r.hoy ? VERDE : GRIS);
        }

        v.setImageViewBitmap(R.id.widget_semana_barras, barras(ctx, r, opciones));

        PendingIntent abrir = abrirApp(ctx, "/stats", 211);
        if (abrir != null) v.setOnClickPendingIntent(R.id.widget_semana_raiz, abrir);
        return v;
    }

    /** Siete barras de lunes a domingo; hoy en verde vivo, el futuro sólo pista. */
    private static Bitmap barras(Context ctx, SemanaWidgetDatos.Resumen r, @Nullable Bundle opciones) {
        float d = Math.min(3f, Math.max(1f, ctx.getResources().getDisplayMetrics().density));
        // Hueco del gráfico: el widget menos márgenes, tarjetas de cifras,
        // letras de los días y la fila del artista (ver widget_semana.xml).
        int anchoDp = 280;
        int altoDp = 48;
        if (opciones != null) {
            int w = opciones.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
            int h = opciones.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
            if (w > 0) anchoDp = Math.max(120, w - 40);
            if (h > 0) altoDp = Math.max(20, h - 186);
        }
        int ancho = Math.round(anchoDp * d);
        int alto = Math.round(altoDp * d);
        Bitmap bmp = Bitmap.createBitmap(ancho, alto, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        int max = 1;
        for (int n : r.porDia) max = Math.max(max, n);

        float hueco = ancho / 7f;
        float barra = Math.min(hueco * 0.56f, 22 * d);
        float radio = Math.min(barra / 2f, 4 * d);
        float minimo = 3 * d;

        for (int i = 0; i < 7; i++) {
            float x = hueco * i + (hueco - barra) / 2f;
            // Pista de fondo en todos los días, para que la semana se lea entera.
            p.setColor(PISTA);
            c.drawRoundRect(new RectF(x, 0, x + barra, alto), radio, radio, p);
            if (i > r.hoy || r.porDia[i] == 0) continue;
            float h = Math.max(minimo, alto * (r.porDia[i] / (float) max));
            p.setColor(i == r.hoy ? VERDE : VERDE_OSCURO);
            c.drawRoundRect(new RectF(x, alto - h, x + barra, alto), radio, radio, p);
        }
        return bmp;
    }

    /** «21 – 27 sep», o «28 sep – 4 oct» si cruza de mes. */
    static String rango(long inicio, TimeZone zona) {
        Calendar a = Calendar.getInstance(zona);
        a.setTimeInMillis(inicio);
        Calendar b = (Calendar) a.clone();
        b.add(Calendar.DAY_OF_MONTH, 6);
        String fin = b.get(Calendar.DAY_OF_MONTH) + " " + MESES[b.get(Calendar.MONTH)];
        if (a.get(Calendar.MONTH) == b.get(Calendar.MONTH)) {
            return a.get(Calendar.DAY_OF_MONTH) + " – " + fin;
        }
        return a.get(Calendar.DAY_OF_MONTH) + " " + MESES[a.get(Calendar.MONTH)] + " – " + fin;
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
