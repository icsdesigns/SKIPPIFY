package com.skippify.app;

import java.util.Calendar;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Ritmos del trabajo en segundo plano que no son de los grupos (esos están en
 * {@link RitmoGrupos}), sin importar nada de Android para poder probarlos con
 * javac a secas (scripts/native-tests/PruebasRitmoFondo.java).
 *
 *   · Cada cuánto se consulta la API de Spotify (`recently-played`).
 *   · Cuándo repintar la notificación y los widgets por el cambio de día.
 */
public final class RitmoFondo {

    /**
     * Consulta a la API con el móvil en uso (pantalla encendida o música en este
     * móvil). Algo menos de 15 min para no saltarse un latido inexacto de 15.
     */
    static final long PERIODO_API_ACTIVO_MS = 14L * 60L * 1000L;
    /**
     * Consulta con el móvil en reposo: la API devuelve las 50 últimas canciones
     * (dos horas y media largas), así que cada media hora no se pierde ninguna,
     * ni escuchando horas seguidas en otro dispositivo.
     */
    static final long PERIODO_API_REPOSO_MS = 29L * 60L * 1000L;

    /** Minuto después de medianoche al que se repintan contadores del día. */
    static final int MINUTO_CAMBIO_DIA = 1;

    private RitmoFondo() { }

    static long periodoApi(boolean movilEnUso) {
        return movilEnUso ? PERIODO_API_ACTIVO_MS : PERIODO_API_REPOSO_MS;
    }

    /** ¿Toca consultar la API? Un reloj movido hacia atrás también cuenta como vencido. */
    static boolean tocaConsultarApi(long ahora, long ultima, boolean movilEnUso) {
        if (ultima <= 0L || ultima > ahora) return true;
        return ahora - ultima >= periodoApi(movilEnUso);
    }

    /** El día local como número aaaammdd. */
    static int diaLocal(long ahora, TimeZone zona) {
        Calendar c = Calendar.getInstance(zona, Locale.ROOT);
        c.setTimeInMillis(ahora);
        return c.get(Calendar.YEAR) * 10000 + (c.get(Calendar.MONTH) + 1) * 100 + c.get(Calendar.DAY_OF_MONTH);
    }

    /** La próxima medianoche local (más un minuto) estrictamente posterior a `ahora`. */
    static long proximoCambioDia(long ahora, TimeZone zona) {
        Calendar c = Calendar.getInstance(zona, Locale.ROOT);
        c.setTimeInMillis(ahora);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, MINUTO_CAMBIO_DIA);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        if (c.getTimeInMillis() <= ahora) c.add(Calendar.DAY_OF_MONTH, 1);
        return c.getTimeInMillis();
    }
}
