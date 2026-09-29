package com.skippify.app;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Las cifras del widget «Tu mes»: medias diarias de los últimos 30 días.
 *
 * Sin importaciones de Android, como {@link EscuchasNube}: se prueba con javac
 * a secas. Quien llama le pasa el registro de escuchas ya leído, el histórico
 * diario de duplicadas y la hora; aquí sólo se cuenta.
 *
 * Las medias se dividen entre los días de los que hay datos, no entre 30 a
 * ciegas: el registro propio del widget nació con la v4.2.5 guardando sólo 8
 * días, así que durante el primer mes la ventana real es más corta. Las
 * escuchas se trocean con {@link EscuchasNube#trocear} para que «escuchas»
 * signifique lo mismo aquí que en Comunidad.
 */
public final class MesWidgetDatos {

    private MesWidgetDatos() { }

    /** Días que abarca la ventana, hoy incluido. */
    static final int DIAS = 30;

    private static final long DIA_MS = 24L * 3600L * 1000L;

    /** Lo que pinta el widget. */
    public static final class Resumen {
        public int escuchas;
        public long msEscuchados;
        public int saltadas;
        /** Días entre los que se reparten escuchas y tiempo (1…30). */
        public int diasEscucha = 1;
        /** Ídem para las saltadas, que llevan su propio histórico. */
        public int diasSaltadas = 1;
        public double escuchasDia;
        public long msDia;
        public double saltadasDia;
    }

    /** 00:00 del día de `ms`, en la zona dada. */
    static long inicioDia(long ms, TimeZone zona) {
        Calendar c = Calendar.getInstance(zona);
        c.setTimeInMillis(ms);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis();
    }

    /** 00:00 del primer día de la ventana: hoy y los 29 anteriores. */
    static long inicioVentana(long ahora, TimeZone zona) {
        Calendar c = Calendar.getInstance(zona);
        c.setTimeInMillis(inicioDia(ahora, zona));
        c.add(Calendar.DAY_OF_MONTH, -(DIAS - 1));
        return c.getTimeInMillis();
    }

    /** Días de calendario de `desde` a `hasta`, ambos incluidos. Aguanta el cambio de hora. */
    static int diasIncluidos(long desde, long hasta, TimeZone zona) {
        long a = inicioDia(desde, zona);
        long b = inicioDia(hasta, zona);
        return (int) Math.round((b - a) / (double) DIA_MS) + 1;
    }

    /** AAAAMMDD de un instante, el formato del histórico de duplicadas. */
    static int sello(long ms, TimeZone zona) {
        Calendar c = Calendar.getInstance(zona);
        c.setTimeInMillis(ms);
        return c.get(Calendar.YEAR) * 10000
                + (c.get(Calendar.MONTH) + 1) * 100
                + c.get(Calendar.DAY_OF_MONTH);
    }

    /** 00:00 del día AAAAMMDD, o -1 si no es una fecha. */
    static long desdeSello(int sello, TimeZone zona) {
        int anio = sello / 10000;
        int mes = (sello / 100) % 100;
        int dia = sello % 100;
        if (anio < 2000 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return -1L;
        Calendar c = Calendar.getInstance(zona);
        c.clear();
        c.set(anio, mes - 1, dia, 0, 0, 0);
        return c.getTimeInMillis();
    }

    /**
     * @param registro       eventos del registro de escuchas, en cualquier orden
     * @param historialDiario `AAAAMMDD:duplicadas:saltadas` separado por `;`,
     *                       incluido el día en curso (DuplicateSkipEngine.dailyHistory)
     */
    static Resumen calcular(List<EscuchasNube.Crudo> registro, String historialDiario,
                            long ahora, TimeZone zona) {
        Resumen r = new Resumen();
        long desde = inicioVentana(ahora, zona);

        // El primer evento guardado marca desde cuándo hay datos: antes de él
        // no es que no se escuchara nada, es que no se apuntaba.
        long primero = Long.MAX_VALUE;
        for (EscuchasNube.Crudo c : registro) {
            if (c.t >= desde && c.t <= ahora) primero = Math.min(primero, c.t);
        }
        r.diasEscucha = primero == Long.MAX_VALUE ? 1 : Math.max(1, diasIncluidos(primero, ahora, zona));

        // La canción que sigue sonando no tiene cierre en el registro: se cierra
        // «ahora» para que el widget no vaya una canción por detrás.
        List<EscuchasNube.Crudo> conCierre = new ArrayList<EscuchasNube.Crudo>(registro);
        conCierre.add(new EscuchasNube.Crudo(ahora, "", "stopped", "", "", 0L, true));

        for (EscuchasNube.Escucha e : EscuchasNube.trocear(conCierre)) {
            if (e.playedAtMs < desde || e.playedAtMs > ahora) continue;
            if (e.durationMs <= 0 || e.msPlayed <= 0) continue;
            double ratio = (double) e.msPlayed / (double) e.durationMs;
            if (ratio < EscuchasNube.MIN_REGISTRO) continue;
            r.escuchas++;
            r.msEscuchados += Math.min(e.msPlayed, e.durationMs);
        }

        // El histórico de duplicadas es anterior al widget y sólo apunta los
        // días con algo que contar. Si tiene algún día anterior a la ventana,
        // ya se llevaba la cuenta el mes entero; si no, desde su primer día.
        int selloDesde = sello(desde, zona);
        int primerSello = Integer.MAX_VALUE;
        boolean hayAnteriores = false;
        if (historialDiario != null) {
            for (String trozo : historialDiario.split(";")) {
                String[] p = trozo.split(":");
                if (p.length != 3) continue;
                try {
                    int dia = Integer.parseInt(p[0].trim());
                    if (dia < selloDesde) {
                        hayAnteriores = true;
                        continue;
                    }
                    primerSello = Math.min(primerSello, dia);
                    r.saltadas += Math.max(0, Integer.parseInt(p[2].trim()));
                } catch (NumberFormatException ignored) { }
            }
        }
        if (hayAnteriores) {
            r.diasSaltadas = DIAS;
        } else if (primerSello != Integer.MAX_VALUE) {
            long inicio = desdeSello(primerSello, zona);
            r.diasSaltadas = inicio < 0 ? r.diasEscucha : Math.max(1, diasIncluidos(inicio, ahora, zona));
        } else {
            r.diasSaltadas = r.diasEscucha;
        }

        r.diasEscucha = Math.min(DIAS, r.diasEscucha);
        r.diasSaltadas = Math.min(DIAS, r.diasSaltadas);
        r.escuchasDia = r.escuchas / (double) r.diasEscucha;
        r.msDia = r.msEscuchados / r.diasEscucha;
        r.saltadasDia = r.saltadas / (double) r.diasSaltadas;
        return r;
    }

    /** «0,4», «7,5», «23»: un decimal sólo mientras aporta algo. */
    static String media(double valor) {
        double v = Math.max(0d, valor);
        if (v >= 10d) return String.valueOf(Math.round(v));
        double redondo = Math.round(v * 10d) / 10d;
        if (redondo == Math.floor(redondo)) return String.valueOf((long) redondo);
        return String.format(Locale.ROOT, "%.1f", redondo).replace('.', ',');
    }

    /** «5 h 20 min», «45 min», «0 min». */
    static String duracion(long ms) {
        long min = Math.max(0L, ms) / 60000L;
        long h = min / 60L;
        long resto = min % 60L;
        if (h == 0) return resto + " min";
        if (resto == 0) return h + " h";
        return h + " h " + resto + " min";
    }
}
