package com.skippify.app;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Cuándo se desvela el ranking semanal de Comunidad y cuándo volver a mirar.
 *
 * El ranking se ve el domingo a las 15:00 de Madrid. La acción de GitHub lo
 * calcula de madrugada y lo deja en `weekly_results/current.next` con
 * `revealAt`; el móvil pone una alarma exacta a esa hora y avisa entonces. Si a
 * las 15:00 todavía no está (GitHub se ha saltado todas las ejecuciones de la
 * mañana), se vuelve a mirar cada 15 minutos durante un día y medio.
 *
 * Sin importaciones de Android, como {@link EscuchasNube}: se prueba con javac
 * a secas. La parte que pone alarmas y notificaciones está en LigaResultados.
 */
public final class ResultadosLiga {

    static final TimeZone MADRID = TimeZone.getTimeZone("Europe/Madrid");
    static final int HORA_DESVELADO = 15;

    /** Reintento mientras la semana no aparece. */
    static final long REINTENTO_MS = 15L * 60L * 1000L;
    /** A partir de aquí GitHub ya ha dejado de intentarlo (corre domingo y lunes). */
    static final long ESPERA_MAXIMA_MS = 36L * 60L * 60L * 1000L;
    /** Antes de las 15:00 se mira si ya está, para avisar a la hora sin depender de la red. */
    static final long PRECOMPROBAR_MS = 12L * 60L * 60L * 1000L;

    private ResultadosLiga() { }

    /** Domingo a las 15:00 de Madrid, el primero estrictamente posterior a `ahora`. */
    static long proximoDesvelado(long ahora) {
        Calendar c = Calendar.getInstance(MADRID, Locale.ROOT);
        c.setTimeInMillis(ahora);
        c.set(Calendar.HOUR_OF_DAY, HORA_DESVELADO);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        // Sumar días de calendario (y no 24 h) respeta el cambio de hora.
        for (int i = 0; i < 8; i += 1) {
            if (c.get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY && c.getTimeInMillis() > ahora) break;
            c.add(Calendar.DAY_OF_MONTH, 1);
        }
        return c.getTimeInMillis();
    }

    /** El último domingo a las 15:00 que ya ha llegado. */
    static long ultimoDesvelado(long ahora) {
        Calendar c = Calendar.getInstance(MADRID, Locale.ROOT);
        c.setTimeInMillis(proximoDesvelado(ahora));
        c.add(Calendar.DAY_OF_MONTH, -7);
        return c.getTimeInMillis();
    }

    /** ¿Estamos en el día y medio tras las 15:00 en que la semana tiene que aparecer? */
    static boolean enEspera(long ahora) {
        return ahora - ultimoDesvelado(ahora) < ESPERA_MAXIMA_MS;
    }

    /** ¿Faltan pocas horas para las 15:00, como para mirar si ya está calculada? */
    static boolean antesDelDesvelado(long ahora) {
        return proximoDesvelado(ahora) - ahora <= PRECOMPROBAR_MS;
    }

    /**
     * Próxima vez que tiene que sonar la alarma.
     *
     * @param pendientes si queda algún grupo cuya semana aún no se ha avisado.
     */
    static long siguienteAlarma(long ahora, boolean pendientes) {
        long proximo = proximoDesvelado(ahora);
        if (pendientes && enEspera(ahora)) return Math.min(ahora + REINTENTO_MS, proximo);
        return proximo;
    }

    /** Mismo formato que `Date.prototype.toISOString`, que es como lo escribe la acción. */
    static String iso(long ms) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(ms));
    }

    static long parseIso(String s) {
        if (s == null || s.isEmpty()) return -1L;
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            return f.parse(s).getTime();
        } catch (Throwable t) {
            return -1L;
        }
    }

    /**
     * ¿Está ya publicada la semana que se desvela en `objetivo`?
     * Vale tanto si espera en `next` como si alguna ejecución ya la subió arriba.
     */
    static boolean publicada(String revealArriba, String revealNext, long objetivo) {
        return parseIso(revealArriba) >= objetivo || parseIso(revealNext) >= objetivo;
    }

    /** Clave de «ya avisado»: un aviso por grupo y semana. */
    static String claveAviso(String groupId, String revealAt) {
        return groupId + "|" + revealAt;
    }
}
