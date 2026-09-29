package com.skippify.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/**
 * Widget «Tu mes»: escuchas, tiempo y saltadas de media al día en los últimos
 * 30 días. Nació como «Tu semana» y conserva el nombre para que los widgets ya
 * puestos sigan vivos. Lo que pinta está en {@link WidgetsSkippify}.
 */
public class WidgetSemanaProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        WidgetsSkippify.pintarSemanaYa(context);
        SkippifyForegroundService.start(context);
    }

    /** Al redimensionarlo se repinta. */
    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId,
                                          android.os.Bundle newOptions) {
        WidgetsSkippify.pintarSemanaYa(context);
    }
}
