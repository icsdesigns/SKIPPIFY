package com.skippify.app;

import android.content.Context;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Copia de los eventos de Spotify de los últimos días, para el widget «Tu semana».
 *
 * El widget no puede tirar del log crudo del listener: la app lo vacía cada
 * vez que se abre (drainBackgroundEvents), así que tras abrirla el widget se
 * quedaría a cero. Tampoco del historial de la app, que vive en el
 * localStorage de la WebView y Android no puede leer. Por eso el listener
 * escribe cada evento también aquí, y este fichero sólo lo recorta el tiempo:
 * se guardan {@link #DIAS} días, lo justo para cubrir la semana en curso.
 */
final class RegistroSemanal {

    static final String FICHERO = "skippify-widget-semana.ndjson";

    /** Una semana y un día: el lunes a primera hora aún se ve el domingo. */
    private static final long DIAS = 8L;
    private static final long VENTANA_MS = DIAS * 24L * 3600L * 1000L;
    /** Recorte como mucho cada 6 horas: reescribir el fichero en cada evento sobra. */
    private static final long RECORTE_CADA_MS = 6L * 3600L * 1000L;
    /** Tope de seguridad por si el reloj se va: más de esto se recorta ya. */
    private static final long MAX_BYTES = 2L * 1024L * 1024L;
    private static final int MAX_LINEAS = 20000;

    private static final Object LOCK = new Object();
    private static long sUltimoRecorte = 0L;

    private RegistroSemanal() { }

    /** Añade un evento con la misma forma que el log crudo. */
    static void anotar(Context ctx, JSONObject evento) {
        if (ctx == null || evento == null) return;
        synchronized (LOCK) {
            try {
                File f = fichero(ctx);
                if (f == null) return;
                long ahora = System.currentTimeMillis();
                if (f.exists() && (ahora - sUltimoRecorte > RECORTE_CADA_MS || f.length() > MAX_BYTES)) {
                    recortar(f, ahora);
                    sUltimoRecorte = ahora;
                }
                try (FileOutputStream out = new FileOutputStream(f, true)) {
                    out.write((evento.toString() + "\n").getBytes(StandardCharsets.UTF_8));
                }
            } catch (Throwable ignored) {
            }
        }
    }

    /** Eventos de los últimos días, en el formato que trocea EscuchasNube. */
    static List<EscuchasNube.Crudo> leer(Context ctx) {
        List<EscuchasNube.Crudo> out = new ArrayList<EscuchasNube.Crudo>();
        if (ctx == null) return out;
        long desde = System.currentTimeMillis() - VENTANA_MS;
        synchronized (LOCK) {
            File f = fichero(ctx);
            if (f == null || !f.isFile()) return out;
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
                String line;
                int leidas = 0;
                while ((line = reader.readLine()) != null && ++leidas <= MAX_LINEAS) {
                    EscuchasNube.Crudo c = crudo(line);
                    if (c != null && c.t >= desde) out.add(c);
                }
            } catch (Throwable ignored) {
            }
        }
        return out;
    }

    /** Reescribe el fichero sin los eventos más viejos que la ventana. */
    private static void recortar(File f, long ahora) {
        long desde = ahora - VENTANA_MS;
        StringBuilder quedan = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                EscuchasNube.Crudo c = crudo(line);
                if (c != null && c.t >= desde) quedan.append(line.trim()).append('\n');
            }
        } catch (Throwable t) {
            // Ilegible: mejor empezar de cero que arrastrarlo.
            quedan.setLength(0);
        }
        // Si aun así se pasa del tope, se queda sólo con la mitad más reciente.
        if (quedan.length() > MAX_BYTES) {
            int corte = quedan.indexOf("\n", quedan.length() / 2);
            quedan.delete(0, corte < 0 ? quedan.length() : corte + 1);
        }
        try (FileOutputStream out = new FileOutputStream(f, false)) {
            out.write(quedan.toString().getBytes(StandardCharsets.UTF_8));
        } catch (Throwable ignored) {
        }
    }

    private static EscuchasNube.Crudo crudo(String line) {
        if (line == null) return null;
        line = line.trim();
        if (line.isEmpty()) return null;
        try {
            JSONObject o = new JSONObject(line);
            String playedAt = o.optString("played_at", "");
            long t = SpotifyNotificationListener.fromIso8601Ms(playedAt);
            if (t <= 0) return null;
            return new EscuchasNube.Crudo(t, playedAt,
                    o.optString("event", ""),
                    o.optString("track", ""),
                    o.optString("artist", ""),
                    o.optLong("duration_ms", 0L),
                    true);
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static File fichero(Context ctx) {
        File dir = ctx.getFilesDir();
        return dir == null ? null : new File(dir, FICHERO);
    }
}
