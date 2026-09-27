package com.skippify.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;

/**
 * Widget «Modo de escucha»: cambia de modo con un toque y enseña las
 * duplicadas y saltadas de hoy. Lo que pinta está en {@link WidgetsSkippify}.
 */
public class WidgetModoProvider extends AppWidgetProvider {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent != null && WidgetsSkippify.ACCION_MODO.equals(intent.getAction())) {
            WidgetsSkippify.cambiarModo(context, intent.getStringExtra(WidgetsSkippify.EXTRA_MODO));
            return;
        }
        super.onReceive(context, intent);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        WidgetsSkippify.actualizarModo(context);
        // De paso se asegura el servicio: sin él los contadores no se mueven.
        SkippifyForegroundService.start(context);
    }
}
