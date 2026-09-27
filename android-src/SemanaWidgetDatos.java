package com.skippify.app;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;

/**
 * Las cifras del widget «Tu semana».
 *
 * Sin importaciones de Android, como {@link EscuchasNube}: se prueba con javac
 * a secas. Quien llama le pasa el registro semanal ya leído, el histórico
 * diario de duplicadas y la hora; aquí sólo se cuenta.
 *
 * La semana va de lunes a domingo en la zona del móvil, igual que el ranking
 * del grupo. Las escuchas se trocean con {@link EscuchasNube#trocear} para que
 * «escuchas» signifique lo mismo aquí que en Comunidad.
 */
public final class SemanaWidgetDatos {

    private SemanaWidgetDatos() { }

    /** Lo que pinta el widget. */
    public static final class Resumen {
        public int escuchas;
        public long msEscuchados;
        /** Tiempo escuchado entre los días que van de semana, hoy incluido. */
        public long msMediaDiaria;
        public int distintas;
        public String artistaTop = "";
        public int escuchasArtistaTop;
        public int duplicadas;
        public int saltadas;
        /** Escuchas por día, de lunes (0) a domingo (6). */
        public final int[] porDia = new int[7];
        /** Índice de hoy en {@link #porDia}. */
        public int hoy;
        /** Lunes de esta semana a las 00:00, en ms. */
        public long inicioSemana;
    }

    /** Lunes 00:00 de la semana de `ahora`, en la zona dada. */
    static long inicioSemana(long ahora, TimeZone zona) {
        Calendar c = Calendar.getInstance(zona);
        c.setTimeInMillis(ahora);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        // Calendar.MONDAY = 2 … SUNDAY = 1: se lleva a 0 = lunes … 6 = domingo.
        int desdeLunes = (c.get(Calendar.DAY_OF_WEEK) + 5) % 7;
        c.add(Calendar.DAY_OF_MONTH, -desdeLunes);
        return c.getTimeInMillis();
    }

    /** Día de la semana (0 = lunes) de un instante. */
    static int diaDeSemana(long ms, TimeZone zona) {
        Calendar c = Calendar.getInstance(zona);
        c.setTimeInMillis(ms);
        return (c.get(Calendar.DAY_OF_WEEK) + 5) % 7;
    }

    /** AAAAMMDD de un instante, el formato del histórico de duplicadas. */
    static int sello(long ms, TimeZone zona) {
        Calendar c = Calendar.getInstance(zona);
        c.setTimeInMillis(ms);
        return c.get(Calendar.YEAR) * 10000
                + (c.get(Calendar.MONTH) + 1) * 100
                + c.get(Calendar.DAY_OF_MONTH);
    }

    /**
     * @param registro       líneas del registro semanal, en cualquier orden
     * @param historialDiario `AAAAMMDD:duplicadas:saltadas` separado por `;`,
     *                       incluido el día en curso (DuplicateSkipEngine.dailyHistory)
     */
    static Resumen calcular(List<EscuchasNube.Crudo> registro, String historialDiario,
                            long ahora, TimeZone zona) {
        Resumen r = new Resumen();
        r.inicioSemana = inicioSemana(ahora, zona);
        r.hoy = diaDeSemana(ahora, zona);

        // La canción que sigue sonando no tiene cierre en el registro: se cierra
        // «ahora» para que el widget no vaya una canción por detrás.
        List<EscuchasNube.Crudo> conCierre = new ArrayList<EscuchasNube.Crudo>(registro);
        conCierre.add(new EscuchasNube.Crudo(ahora, "", "stopped", "", "", 0L, true));

        Set<String> distintas = new HashSet<String>();
        Map<String, Integer> porArtista = new HashMap<String, Integer>();

        for (EscuchasNube.Escucha e : EscuchasNube.trocear(conCierre)) {
            if (e.playedAtMs < r.inicioSemana || e.playedAtMs > ahora) continue;
            if (e.durationMs <= 0 || e.msPlayed <= 0) continue;
            double ratio = (double) e.msPlayed / (double) e.durationMs;
            if (ratio < EscuchasNube.MIN_REGISTRO) continue;

            r.escuchas++;
            r.msEscuchados += Math.min(e.msPlayed, e.durationMs);
            r.porDia[diaDeSemana(e.playedAtMs, zona)]++;
            distintas.add(e.track.toLowerCase() + "\u0000" + e.artist.toLowerCase());

            String artista = artistaPrincipal(e.artist);
            if (artista.isEmpty()) continue;
            Integer n = porArtista.get(artista);
            porArtista.put(artista, n == null ? 1 : n + 1);
        }
        r.distintas = distintas.size();
        // Se divide entre los días transcurridos, no entre siete: un martes con
        // dos días de música no debe salir con una media de domingo.
        r.msMediaDiaria = r.msEscuchados / (r.hoy + 1);

        for (Map.Entry<String, Integer> it : porArtista.entrySet()) {
            int n = it.getValue();
            // Empate: gana el orden alfabético, para que el widget no baile.
            if (n > r.escuchasArtistaTop
                    || (n == r.escuchasArtistaTop && it.getKey().compareTo(r.artistaTop) < 0)) {
                r.artistaTop = it.getKey();
                r.escuchasArtistaTop = n;
            }
        }

        int desde = sello(r.inicioSemana, zona);
        if (historialDiario != null) {
            for (String trozo : historialDiario.split(";")) {
                String[] p = trozo.split(":");
                if (p.length != 3) continue;
                try {
                    if (Integer.parseInt(p[0].trim()) < desde) continue;
                    r.duplicadas += Math.max(0, Integer.parseInt(p[1].trim()));
                    r.saltadas += Math.max(0, Integer.parseInt(p[2].trim()));
                } catch (NumberFormatException ignored) { }
            }
        }
        return r;
    }

    /** «Rosalía, Ozuna» cuenta para Rosalía: el ranking de artistas va por el primero. */
    static String artistaPrincipal(String artistas) {
        if (artistas == null) return "";
        String s = artistas.trim();
        for (String sep : new String[] { ", ", " & ", " feat. ", " ft. ", " x " }) {
            int i = s.indexOf(sep);
            if (i > 0) s = s.substring(0, i);
        }
        return s.trim();
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
