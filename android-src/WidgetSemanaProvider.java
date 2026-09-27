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
}
