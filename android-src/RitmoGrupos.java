package com.skippify.app;

import java.util.Calendar;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Las decisiones de tiempo de los grupos sin servidor en segundo plano, sin
 * importar nada de Android para poder probarlas con javac a secas
 * (scripts/native-tests/PruebasGrupos.java).
 *
 * Dos asuntos:
 *
 *   · Disparadores de sincronización (ver {@link LocalHostBackground}). El ritmo
 *     base lo marca JS (15 s si alguien espera entrar, 5 min si no); aquí van
 *     los refuerzos: sincronizar poco después de que acabe una escucha, un
 *     latido de seguridad con una alarma que despierta al móvil aunque esté en
 *     reposo, y la detección de un WebView colgado.
 *
 *   · El aviso de los domingos por la tarde: «se acaba el tiempo para ver los
 *     resultados de la semana». La semana de los grupos va de lunes a domingo
 *     y el lunes el resumen «Semana» vuelve a empezar de cero, así que el aviso
 *     llega el domingo a media tarde, en la hora LOCAL del móvil.
 */
public final class RitmoGrupos {

    /** Hora local (0-23) del aviso del domingo. */
    static final int HORA_AVISO = 17;
    /** Si el móvil estaba apagado o dormido a la hora, aún se avisa hasta este margen después. */
    static final long MARGEN_AVISO_MS = 4L * 60L * 60L * 1000L;

    /** Cada cuánto despierta el latido de seguridad (con margen del sistema: es inexacto). */
    static final long LATIDO_MS = 15L * 60L * 1000L;
    /** Tras acabar una escucha se espera un poco por si empieza otra enseguida (se juntan). */
    static final long ESPERA_TRAS_ESCUCHA_MS = 30L * 1000L;
    /** Entre dos sincronizaciones provocadas por escuchas: no más de una cada 3 minutos. */
    static final long MIN_ENTRE_FORZADAS_MS = 3L * 60L * 1000L;
    /** Sin ningún pulso de JS en tanto tiempo, el WebView se da por colgado y se reinicia. */
    static final long COLGADO_MS = 20L * 60L * 1000L;
    /** Lo que se mantiene despierta la CPU al sincronizar desde una alarma. */
    static final long WAKELOCK_MS = 45L * 1000L;

    private RitmoGrupos() { }

    // ── Aviso del domingo ────────────────────────────────────────────────────

    /** El domingo de la semana (lunes a domingo) de `ahora`, a la hora del aviso, en la zona dada. */
    static long avisoDeEstaSemana(long ahora, TimeZone zona) {
        Calendar c = Calendar.getInstance(zona, Locale.ROOT);
        c.setTimeInMillis(ahora);
        c.set(Calendar.HOUR_OF_DAY, HORA_AVISO);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        // Sumar días de calendario (y no 24 h) respeta el cambio de hora.
        for (int i = 0; i < 7 && c.get(Calendar.DAY_OF_WEEK) != Calendar.SUNDAY; i += 1) {
            c.add(Calendar.DAY_OF_MONTH, 1);
        }
        return c.getTimeInMillis();
    }

    /** El primer aviso estrictamente posterior a `ahora`. */
    static long proximoAviso(long ahora, TimeZone zona) {
        long esta = avisoDeEstaSemana(ahora, zona);
        if (esta > ahora) return esta;
        Calendar c = Calendar.getInstance(zona, Locale.ROOT);
        c.setTimeInMillis(esta);
        c.add(Calendar.DAY_OF_MONTH, 7);
        return c.getTimeInMillis();
    }

    /**
     * ¿Hay que avisar ahora de un aviso que ya tocaba? Sí si `ahora` está entre la
     * hora del aviso de esta semana y el margen, y aún no se avisó de él. Sirve
     * tanto cuando la alarma llega tarde como al arrancar tras un reinicio.
     */
    static boolean avisoPendiente(long ahora, long ultimoAviso, TimeZone zona) {
        long aviso = avisoDeEstaSemana(ahora, zona);
        return ahora >= aviso && ahora < aviso + MARGEN_AVISO_MS && ultimoAviso < aviso;
    }

    // ── Disparadores de sincronización ───────────────────────────────────────

    /**
     * Cuánto esperar antes de la sincronización provocada por una escucha
     * acabada: el margen de juntar escuchas seguidas, y si hace poco que hubo
     * otra, hasta que pase el mínimo entre ellas.
     */
    static long esperaTrasEscucha(long ahora, long ultimaForzada) {
        long hastaMinimo = ultimaForzada + MIN_ENTRE_FORZADAS_MS - ahora;
        return Math.max(ESPERA_TRAS_ESCUCHA_MS, hastaMinimo);
    }

    /**
     * ¿Está colgado el WebView? Cuenta desde el último pulso de JS (cada tanda
     * termina avisando con `schedule`) o, si aún no hubo ninguno, desde que
     * arrancó. El ritmo más lento es de 5 minutos, así que 20 sin pulso es un fallo.
     */
    static boolean colgado(long ahora, long ultimoPulso, long arrancadoEn) {
        long referencia = Math.max(ultimoPulso, arrancadoEn);
        return referencia > 0 && ahora - referencia > COLGADO_MS;
    }
}
