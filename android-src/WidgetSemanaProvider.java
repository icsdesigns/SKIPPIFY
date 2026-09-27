package com.skippify.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/**
 * Widget «Tu semana»: escuchas, tiempo, saltadas, un gráfico por día y el
 * artista más escuchado. Lo que pinta está en {@link WidgetsSkippify}.
 */
public class WidgetSemanaProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        WidgetsSkippify.pintarSemanaYa(context);
        SkippifyForegroundService.start(context);
    }

    /** Al redimensionarlo, el gráfico se vuelve a dibujar a su nuevo tamaño. */
    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId,
                                          android.os.Bundle newOptions) {
        WidgetsSkippify.pintarSemanaYa(context);
    }
}
