package com.skippify.app;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Cuándo se avisa de una versión nueva: la parte que decide, sin Android.
 *
 * Una release no se notifica hasta que han pasado {@link #RETRASO_AVISO_MS}
 * (6 horas) desde que se publicó. Si se lanzan varias seguidas en ese rato, no
 * se avisa de cada una: pasado el plazo se avisa de la más reciente, una vez.
 *
 * Esta regla es para las detecciones AUTOMÁTICAS (la notificación del servicio
 * y el aviso emergente al abrir la app). La búsqueda manual de Ajustes sigue
 * mostrando cualquier versión nueva al momento: es una petición explícita.
 *
 * Sin fecha de publicación legible no se retiene nada (se avisa como antes de
 * existir este retraso): es preferible un aviso temprano a no avisar jamás.
 *
 * No importa nada de Android (minSdk 22: tampoco java.time) para poder
 * probarse con javac a secas; ver PruebasActualizaciones.
 */
final class ActualizacionAviso {

    /** Tiempo que debe pasar desde la publicación antes de avisar. */
    static final long RETRASO_AVISO_MS = 6L * 60L * 60L * 1000L;

    /** La alarma suena un poco después del plazo, nunca justo en el borde. */
    static final long MARGEN_ALARMA_MS = 90_000L;

    /**
     * Si la fecha de la release está más allá de esto en el futuro respecto al
     * reloj del móvil, el reloj va mal (o la fecha es absurda): no se retiene.
     */
    static final long TOLERANCIA_RELOJ_MS = 60L * 60L * 1000L;

    /** Con un aviso vencido y la red fallando, no se reintenta más a menudo que esto. */
    static final long REINTENTO_MIN_MS = 10L * 60L * 1000L;

    enum Accion { NADA, NOTIFICAR, PROGRAMAR }

    static final class Decision {
        final Accion accion;
        /** Sólo con PROGRAMAR: cuándo debe sonar la alarma (ms de época). */
        final long cuandoMs;
        /** Sólo con PROGRAMAR: cuándo la release pasa a ser notificable. */
        final long aperturaMs;

        Decision(Accion accion, long cuandoMs, long aperturaMs) {
            this.accion = accion;
            this.cuandoMs = cuandoMs;
            this.aperturaMs = aperturaMs;
        }
    }

    private ActualizacionAviso() { }

    /**
     * @param publicadoMs fecha de publicación (ms de época) o {@code <= 0} si no se pudo leer
     * @param codigoInstalado {@code <= 0} si no se sabe qué hay instalado
     * @param codigoNotificado última versión ya avisada
     */
    static Decision decidir(long ahora, long publicadoMs, long codigoNuevo,
                            long codigoInstalado, long codigoNotificado) {
        if (codigoInstalado <= 0L || codigoNuevo <= codigoInstalado) return nada();
        if (codigoNotificado >= codigoNuevo) return nada();

        // Sin fecha: comportamiento de siempre, avisar ya.
        if (publicadoMs <= 0L) return new Decision(Accion.NOTIFICAR, 0L, 0L);

        // Reloj del móvil muy por detrás de GitHub: esperar «6 horas» no tendría sentido.
        if (publicadoMs - ahora > TOLERANCIA_RELOJ_MS) return new Decision(Accion.NOTIFICAR, 0L, 0L);

        long apertura = publicadoMs + RETRASO_AVISO_MS;
        if (ahora >= apertura) return new Decision(Accion.NOTIFICAR, 0L, 0L);
        return new Decision(Accion.PROGRAMAR, momentoAlarma(publicadoMs), apertura);
    }

    /** Cuándo suena la alarma de una release publicada en {@code publicadoMs}. */
    static long momentoAlarma(long publicadoMs) {
        return publicadoMs + RETRASO_AVISO_MS + MARGEN_ALARMA_MS;
    }

    /**
     * ¿Toca consultar GitHub desde el latido del servicio?
     *
     * Lo de siempre (una vez al día, con el reloj movido contando como vencido)
     * y, además, la red de seguridad de la alarma: si había un aviso retenido y
     * su hora ya pasó (alarma perdida, móvil apagado), se consulta sin esperar
     * al día siguiente, con un freno {@link #REINTENTO_MIN_MS} si falla.
     *
     * @param aperturaPendienteMs hora a la que se podía avisar de la release
     *        retenida, o {@code <= 0} si no hay ninguna
     */
    static boolean tocaComprobar(long ahora, long ultimaMs, long intervaloMs, long aperturaPendienteMs) {
        long transcurrido = ahora - ultimaMs;
        if (ultimaMs <= 0L || transcurrido >= intervaloMs || transcurrido < 0L) return true;
        return aperturaPendienteMs > 0L && ahora >= aperturaPendienteMs && transcurrido >= REINTENTO_MIN_MS;
    }

    // ── Fecha ────────────────────────────────────────────────────────────────

    private static final Pattern ISO = Pattern.compile(
            "^(\\d{4})-(\\d{2})-(\\d{2})[Tt ](\\d{2}):(\\d{2}):(\\d{2})(?:\\.\\d+)?\\s*(Z|z|[+-]\\d{2}:?\\d{2})?$");

    /**
     * Fecha ISO 8601 de GitHub (`2026-05-14T09:30:00Z`) a ms de época UTC.
     * Sin zona se toma como UTC. Devuelve {@code -1} si no se entiende.
     */
    static long parsearFecha(String iso) {
        if (iso == null) return -1L;
        Matcher m = ISO.matcher(iso.trim());
        if (!m.matches()) return -1L;
        try {
            int anio = Integer.parseInt(m.group(1));
            int mes = Integer.parseInt(m.group(2));
            int dia = Integer.parseInt(m.group(3));
            int h = Integer.parseInt(m.group(4));
            int mi = Integer.parseInt(m.group(5));
            int s = Integer.parseInt(m.group(6));
            if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || h > 23 || mi > 59 || s > 60) return -1L;
            long dias = diasDesdeEpoca(anio, mes, dia);
            long ms = ((dias * 24L + h) * 60L + mi) * 60L + Math.min(s, 59);
            ms *= 1000L;
            String z = m.group(7);
            if (z != null && !z.equalsIgnoreCase("Z")) {
                int signo = z.charAt(0) == '-' ? -1 : 1;
                String d = z.substring(1).replace(":", "");
                long desfase = (Long.parseLong(d.substring(0, 2)) * 60L + Long.parseLong(d.substring(2, 4))) * 60_000L;
                ms -= signo * desfase;
            }
            return ms > 0L ? ms : -1L;
        } catch (RuntimeException e) {
            return -1L;
        }
    }

    /** `published_at` y, si falta o no se lee, `created_at`; {@code -1} si ninguna sirve. */
    static long fechaDeRelease(String publishedAt, String createdAt) {
        long f = parsearFecha(publishedAt);
        return f > 0L ? f : parsearFecha(createdAt);
    }

    /** Días desde 1970-01-01 de una fecha del calendario gregoriano (algoritmo de Hinnant). */
    private static long diasDesdeEpoca(int anio, int mes, int dia) {
        long y = mes <= 2 ? anio - 1 : anio;
        long era = (y >= 0 ? y : y - 399) / 400;
        long yoe = y - era * 400;
        long doy = (153L * (mes + (mes > 2 ? -3 : 9)) + 2) / 5 + dia - 1;
        long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146097 + doe - 719468;
    }

    private static Decision nada() {
        return new Decision(Accion.NADA, 0L, 0L);
    }
}
