package com.skippify.app;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Núcleo de la ejecución de macros en segundo plano.
 *
 * Deliberadamente sin una sola importación de Android: todo lo que necesita del
 * exterior —red, persistencia y reloj— entra por las tres interfaces de abajo.
 * Así esta clase, que es donde vive la lógica que puede equivocarse, se compila
 * y se prueba con javac a secas contra un Spotify de mentira, sin emulador.
 *
 * Cubre los seis orígenes de la app. Se disparan de dos maneras distintas
 * porque tienen naturalezas distintas:
 *
 *   · «La canción que suena ahora» es un evento: la dispara el cambio de
 *     canción que el listener de notificaciones ya detecta. Sin espera.
 *   · Los orígenes de lista (novedades de una playlist, recientes, novedades en
 *     «Tus me gusta», top) no tienen evento: hay que preguntarle a Spotify. Se
 *     repasan como mucho cada {@link #INTERVALO_LISTAS_MS}, aprovechando el
 *     mismo cambio de canción y el latido de 15 minutos que ya mantiene vivo el
 *     servicio en primer plano. Ni una alarma nueva ni un hilo despierto.
 *
 * Queda fuera a propósito «mover» y «eliminar» sobre el origen «todas las
 * canciones de una playlist»: es la única combinación que puede vaciar una
 * playlist entera de una pasada, y hacer eso sin que nadie mire es un riesgo
 * que no compensa. Esas siguen pidiendo el botón «Ejecutar».
 */
public final class MacroRunner {

    // ── Contratos con el exterior ────────────────────────────────────────────

    /** Una petición HTTP ya autenticada. `jsonBody` puede ser null. */
    public interface Http {
        Response send(String method, String url, String jsonBody);
    }

    /** Almacén de clave/valor. En Android, SharedPreferences. */
    public interface Store {
        String get(String key);
        void put(String key, String value);
    }

    public interface Clock {
        long now();
    }

    public static final class Response {
        public final int status;
        public final String body;

        public Response(int status, String body) {
            this.status = status;
            this.body = body;
        }
    }

    // ── Datos ────────────────────────────────────────────────────────────────

    public static final class Track {
        public final String uri;
        public final String name;
        public final String artists;

        public Track(String uri, String name, String artists) {
            this.uri = uri;
            this.name = name;
            this.artists = artists;
        }

        /** El identificador que se guarda en el cursor sale del propio URI. */
        public String id() {
            return idDeUri(uri);
        }
    }

    public static final class Macro {
        public final String id;
        public final String name;
        public final boolean enabled;
        public final String source;
        public final String action;
        public final String target;            // null cuando la acción no lo usa
        public final String targetPlaylistId;  // null salvo destinos de playlist
        public final String sourcePlaylistId;  // null salvo orígenes de playlist

        public Macro(String id, String name, boolean enabled, String source,
                     String action, String target, String targetPlaylistId) {
            this(id, name, enabled, source, action, target, targetPlaylistId, null);
        }

        public Macro(String id, String name, boolean enabled, String source,
                     String action, String target, String targetPlaylistId,
                     String sourcePlaylistId) {
            this.id = id;
            this.name = name;
            this.enabled = enabled;
            this.source = source;
            this.action = action;
            this.target = target;
            this.targetPlaylistId = targetPlaylistId;
            this.sourcePlaylistId = sourcePlaylistId;
        }
    }

    /**
     * Qué suena ahora y desde dónde.
     *
     * El `contextoPlaylistId` es la playlist que está alimentando la
     * reproducción, no la que contiene la canción: son cosas distintas y sólo
     * la primera importa para no cortar la música (ver
     * {@link #cortariaLaReproduccion}).
     */
    public static final class EnReproduccion {
        public final Track track;
        public final String contextoPlaylistId;

        public EnReproduccion(Track track, String contextoPlaylistId) {
            this.track = track;
            this.contextoPlaylistId = contextoPlaylistId;
        }
    }

    public static final int APLICADA = 0;
    public static final int OMITIDA  = 1;
    public static final int ERROR    = 2;

    public static final class Outcome {
        public final String macroId;
        public final int status;
        public final String message;
        /** Canciones que la macro tenía pendientes en esta pasada. */
        public final int encontradas;
        /** Canciones sobre las que se llegó a actuar. */
        public final int aplicadas;

        Outcome(String macroId, int status, String message) {
            this(macroId, status, message, status == APLICADA ? 1 : 0,
                    status == APLICADA ? 1 : 0);
        }

        Outcome(String macroId, int status, String message, int encontradas, int aplicadas) {
            this.macroId = macroId;
            this.status = status;
            this.message = message;
            this.encontradas = encontradas;
            this.aplicadas = aplicadas;
        }

        @Override
        public String toString() {
            String s = status == APLICADA ? "APLICADA" : (status == OMITIDA ? "OMITIDA" : "ERROR");
            return macroId + " " + s + " " + message;
        }
    }

    // ── Constantes ───────────────────────────────────────────────────────────

    public static final String API = "https://api.spotify.com/v1";

    public static final String SOURCE_CURRENT_TRACK   = "current_track";
    public static final String SOURCE_PLAYLIST_NEW    = "playlist_new";
    public static final String SOURCE_PLAYLIST_ALL    = "playlist_all";
    public static final String SOURCE_RECENTLY_PLAYED = "recently_played";
    public static final String SOURCE_LIKED_NEW       = "liked_new";
    public static final String SOURCE_TOP_TRACKS      = "top_tracks";

    /**
     * Spotify vuelve a publicar la misma canción muchas veces (carátula, cambio
     * de pausa, reanudar tras un anuncio). El listener ya filtra buena parte,
     * pero una canción que se repite al rato es un caso real, así que la guarda
     * es por ventana de tiempo y no «para siempre».
     */
    static final long VENTANA_REPETIDO_MS = 10L * 60L * 1000L;

    /**
     * Cada cuánto se le pregunta a Spotify por los orígenes de lista. Coincide
     * con el latido del servicio en primer plano a propósito: así el repaso cae
     * dentro de un despertar que ya existía en vez de provocar uno nuevo.
     */
    public static final long INTERVALO_LISTAS_MS = 15L * 60L * 1000L;

    /** Cuántos identificadores de canción recuerda el cursor de cada macro. */
    static final int MAX_VISTAS = 400;

    /** Tope de canciones aplazadas por sonar. Más que eso sería un fallo. */
    static final int MAX_APLAZADAS = 50;

    /** Máximo de URIs por llamada al escribir en una playlist / en la biblioteca. */
    static final int LOTE_PLAYLIST = 100;
    static final int LOTE_BIBLIOTECA = 50;

    /** Tope de canciones que se leen de un origen paginado. */
    static final int TOPE_PLAYLIST = 500;
    static final int TOPE_ME_GUSTA = 200;

    private MacroRunner() { }

    // ── Selección ────────────────────────────────────────────────────────────

    static boolean origenConocido(String source) {
        return SOURCE_CURRENT_TRACK.equals(source)
                || SOURCE_PLAYLIST_NEW.equals(source)
                || SOURCE_PLAYLIST_ALL.equals(source)
                || SOURCE_RECENTLY_PLAYED.equals(source)
                || SOURCE_LIKED_NEW.equals(source)
                || SOURCE_TOP_TRACKS.equals(source);
    }

    static boolean origenDePlaylist(String source) {
        return SOURCE_PLAYLIST_NEW.equals(source) || SOURCE_PLAYLIST_ALL.equals(source);
    }

    /**
     * Orígenes que sólo entregan lo aparecido desde la última vez. En su primera
     * pasada fijan un punto de partida sin actuar: si no, una macro recién
     * creada volcaría el historial entero de golpe.
     */
    static boolean incremental(String source) {
        return SOURCE_PLAYLIST_NEW.equals(source)
                || SOURCE_RECENTLY_PLAYED.equals(source)
                || SOURCE_LIKED_NEW.equals(source);
    }

    /** Motivo por el que el servicio NO puede con esta macro, o null si puede. */
    public static String motivoExclusion(Macro m) {
        if (m == null) return "No hay macro.";
        if (!m.enabled) return "La macro está desactivada.";
        if (!origenConocido(m.source)) return "Origen desconocido para el servicio.";

        if (origenDePlaylist(m.source) && !noVacio(m.sourcePlaylistId)) {
            return "Falta la playlist de origen.";
        }

        // La única combinación capaz de vaciar una playlist entera de una
        // pasada. Se deja fuera del segundo plano a propósito.
        if (SOURCE_PLAYLIST_ALL.equals(m.source)
                && ("move".equals(m.action)
                    || "remove".equals(m.action)
                    || "remove_from_source".equals(m.action))) {
            return "Mover o eliminar sobre una playlist completa sólo se ejecuta a mano.";
        }

        if ("move".equals(m.action) && !origenDePlaylist(m.source)) {
            return "«Mover» necesita una playlist de origen.";
        }

        if ("remove_from_source".equals(m.action)) {
            return origenDePlaylist(m.source)
                    ? null
                    : "«Quitar del origen» necesita una playlist de origen.";
        }

        if ("queue".equals(m.action)) return null;

        if ("copy".equals(m.action) || "move".equals(m.action)) {
            if ("liked".equals(m.target) || "queue".equals(m.target)) return null;
            if (!esPlaylist(m.target)) return "Destino desconocido.";
            // Una playlist nueva sólo vale una vez ya creada: crearla es un paso
            // con estado que se deja a la app para no duplicar playlists vacías.
            return noVacio(m.targetPlaylistId)
                    ? null
                    : "La playlist de destino aún no se ha creado; ejecútala una vez desde la app.";
        }

        if ("remove".equals(m.action)) {
            if ("liked".equals(m.target)) return null;
            if (!esPlaylist(m.target)) return "Destino desconocido.";
            return noVacio(m.targetPlaylistId)
                    ? null
                    : "La playlist de destino aún no se ha creado; ejecútala una vez desde la app.";
        }

        return "Acción desconocida para el servicio.";
    }

    /** ¿Puede el servicio ejecutar esta macro por su cuenta? */
    public static boolean esDeSegundoPlano(Macro m) {
        return motivoExclusion(m) == null;
    }

    // ── Guarda de reproducción ───────────────────────────────────────────────

    /**
     * Playlist de la que esta macro BORRA canciones, o null si no borra de
     * ninguna. «Quitar de Tus me gusta» no cuenta: la biblioteca no da contexto
     * de reproducción.
     */
    static String playlistQueVacia(Macro m) {
        if (m == null) return null;
        if ("remove_from_source".equals(m.action) || "move".equals(m.action)) {
            return noVacio(m.sourcePlaylistId) ? m.sourcePlaylistId : null;
        }
        if ("remove".equals(m.action) && esPlaylist(m.target)) {
            return noVacio(m.targetPlaylistId) ? m.targetPlaylistId : null;
        }
        return null;
    }

    /**
     * ¿Cortaría esta macro la música si actuase ahora sobre esta canción?
     *
     * Spotify DETIENE la reproducción cuando se borra de la playlist que está
     * sonando la canción que está sonando: el reproductor se queda sin el ítem
     * que tenía en curso. Es la causa de que la música se pausara sola a
     * mitad de canción sin relación con el motor de duplicadas —una macro de
     * «mover» o «quitar» disparada por el cambio de canción, o por el repaso de
     * listas cada quince minutos, bastaba para provocarlo.
     *
     * La comprobación es deliberadamente estrecha: sólo el borrado, sólo sobre
     * la pista viva y sólo cuando la playlist que se vacía es la que da
     * contexto. Copiar, encolar o tocar «Tus me gusta» no interrumpe nada y se
     * sigue ejecutando al instante.
     */
    static boolean cortariaLaReproduccion(Macro m, String uri, EnReproduccion vivo) {
        if (vivo == null || vivo.track == null || !noVacio(uri)) return false;
        if (!uri.equals(vivo.track.uri)) return false;
        if (!noVacio(vivo.contextoPlaylistId)) return false;

        String playlist = playlistQueVacia(m);
        return playlist != null && playlist.equals(vivo.contextoPlaylistId);
    }

    // ── Aplazadas ────────────────────────────────────────────────────────────

    /**
     * Canciones que una macro dejó a medias por estar sonando. No se descartan:
     * se reintentan en la siguiente pasada, cuando ya no sean la pista viva.
     */
    static List<String> leerAplazadas(Macro m, Store store) {
        List<String> out = new ArrayList<String>();
        String crudo = store.get(clave(m, "aplazadas"));
        if (crudo == null || crudo.length() == 0) return out;
        String[] partes = crudo.split(",");
        for (int i = 0; i < partes.length; i++) {
            String p = partes[i].trim();
            if (p.length() > 0 && !out.contains(p)) out.add(p);
        }
        return out;
    }

    static void guardarAplazadas(Macro m, List<String> uris, Store store) {
        StringBuilder sb = new StringBuilder();
        int n = 0;
        for (int i = 0; i < uris.size() && n < MAX_APLAZADAS; i++) {
            String uri = uris.get(i);
            if (!noVacio(uri)) continue;
            if (n > 0) sb.append(',');
            sb.append(uri);
            n++;
        }
        store.put(clave(m, "aplazadas"), sb.toString());
    }

    static void aplazar(Macro m, String uri, Store store) {
        List<String> pendientes = leerAplazadas(m, store);
        if (pendientes.contains(uri)) return;
        pendientes.add(uri);
        guardarAplazadas(m, pendientes, store);
    }

    /**
     * Aplica lo aplazado que ya no esté sonando. Devuelve cuántas canciones se
     * llegaron a tratar; los fallos se dejan en la lista para la próxima.
     */
    static int aplicarAplazadas(Macro m, Http http, Store store, EnReproduccion vivo) {
        List<String> pendientes = leerAplazadas(m, store);
        if (pendientes.isEmpty()) return 0;

        List<Track> listas = new ArrayList<Track>();
        List<String> siguen = new ArrayList<String>();
        for (int i = 0; i < pendientes.size(); i++) {
            String uri = pendientes.get(i);
            if (cortariaLaReproduccion(m, uri, vivo)) siguen.add(uri);
            // El nombre y el artista no se usan para actuar: basta el URI.
            else listas.add(new Track(uri, "", ""));
        }

        if (listas.isEmpty()) {
            guardarAplazadas(m, siguen, store);
            return 0;
        }

        String error = aplicarLote(m, listas, http);
        if (error != null) {
            // Ha fallado la red o la API: se conserva todo para reintentar.
            return 0;
        }

        guardarAplazadas(m, siguen, store);
        return listas.size();
    }

    /** Todas las que gobierna el servicio. */
    public static List<Macro> filtrar(List<Macro> macros) {
        List<Macro> out = new ArrayList<Macro>();
        if (macros == null) return out;
        for (int i = 0; i < macros.size(); i++) {
            Macro m = macros.get(i);
            if (esDeSegundoPlano(m)) out.add(m);
        }
        return out;
    }

    /** Las que dispara el cambio de canción. */
    public static List<Macro> deCancionActual(List<Macro> macros) {
        List<Macro> out = new ArrayList<Macro>();
        List<Macro> todas = filtrar(macros);
        for (int i = 0; i < todas.size(); i++) {
            if (SOURCE_CURRENT_TRACK.equals(todas.get(i).source)) out.add(todas.get(i));
        }
        return out;
    }

    /** Las que hay que sondear cada tanto. */
    public static List<Macro> deLista(List<Macro> macros) {
        List<Macro> out = new ArrayList<Macro>();
        List<Macro> todas = filtrar(macros);
        for (int i = 0; i < todas.size(); i++) {
            if (!SOURCE_CURRENT_TRACK.equals(todas.get(i).source)) out.add(todas.get(i));
        }
        return out;
    }

    // ── Ejecución por evento (la canción que suena ahora) ────────────────────

    public static List<Outcome> run(Track track, List<Macro> macros,
                                    Http http, Store store, Clock clock) {
        return run(track, macros, http, store, clock, false);
    }

    /**
     * @param forzar salta la ventana de repetición. Lo usa el botón «Ejecutar»
     *               de la app: si alguien lo pulsa a propósito, espera que pase
     *               algo aunque la canción se acabara de procesar sola.
     */
    public static List<Outcome> run(Track track, List<Macro> macros,
                                    Http http, Store store, Clock clock, boolean forzar) {
        return run(track, macros, http, store, clock, forzar, null);
    }

    /**
     * @param vivo qué suena y desde qué playlist, para no borrar la canción en
     *             curso de la lista que la está reproduciendo. Con null se
     *             actúa sin esa guarda (la app, que ejecuta a petición).
     */
    public static List<Outcome> run(Track track, List<Macro> macros,
                                    Http http, Store store, Clock clock, boolean forzar,
                                    EnReproduccion vivo) {
        List<Outcome> out = new ArrayList<Outcome>();
        if (track == null || !esPistaDelCatalogo(track.uri)) return out;

        List<Macro> aplicables = deCancionActual(macros);
        for (int i = 0; i < aplicables.size(); i++) {
            Macro m = aplicables.get(i);

            // Lo que quedó aplazado se reintenta SIEMPRE, incluso si esta
            // canción se salta por el freno de repetición: si no, una macro con
            // trabajo pendiente se quedaría esperando al siguiente cambio.
            int rescatadas = aplicarAplazadas(m, http, store, vivo);
            if (rescatadas > 0) {
                anotar(m, store, clock, APLICADA, rescatadas,
                        "En segundo plano: " + rescatadas + " canción(es) aplazadas ya aplicadas.");
            }

            if (!forzar && yaProcesada(m, track.uri, store, clock)) {
                out.add(new Outcome(m.id, OMITIDA, "Ya procesada hace poco.", 0, 0));
                continue;
            }

            // Borrar la canción viva de la playlist que la está reproduciendo
            // corta la música. Se aparta para la próxima pasada.
            if (cortariaLaReproduccion(m, track.uri, vivo)) {
                aplazar(m, track.uri, store);
                marcarProcesada(m, track.uri, store, clock);
                String msg = "Aplazada: se aplicará al dejar de sonar, para no cortar la reproducción.";
                anotar(m, store, clock, OMITIDA, 0, msg);
                out.add(new Outcome(m.id, OMITIDA, msg, 1, 0));
                continue;
            }

            List<Track> una = new ArrayList<Track>();
            una.add(track);
            String error = aplicarLote(m, una, http);
            marcarProcesada(m, track.uri, store, clock);

            if (error == null) {
                anotar(m, store, clock, APLICADA, 1, "En segundo plano: " + descripcionCorta(m, track));
                out.add(new Outcome(m.id, APLICADA, descripcionCorta(m, track), 1, 1));
            } else {
                anotar(m, store, clock, ERROR, 0, "Error: " + error);
                out.add(new Outcome(m.id, ERROR, error, 1, 0));
            }
        }
        return out;
    }

    // ── Ejecución por sondeo (orígenes de lista) ─────────────────────────────

    /**
     * Repasa los orígenes de lista. Cada macro tiene su propio freno: si se
     * miró hace menos de {@link #INTERVALO_LISTAS_MS} se deja para la próxima,
     * de modo que da igual cuántas veces se llame a esto (cambio de canción,
     * latido del servicio, arranque) — el gasto en peticiones no se dispara.
     *
     * @param soloId si no es null, sólo esa macro, y sin freno.
     */
    public static List<Outcome> runListas(List<Macro> macros, Http http, Store store,
                                          Clock clock, boolean forzar, String soloId) {
        return runListas(macros, http, store, clock, forzar, soloId, null);
    }

    /** @param vivo ver {@link #run(Track, List, Http, Store, Clock, boolean, EnReproduccion)}. */
    public static List<Outcome> runListas(List<Macro> macros, Http http, Store store,
                                          Clock clock, boolean forzar, String soloId,
                                          EnReproduccion vivo) {
        List<Outcome> out = new ArrayList<Outcome>();
        List<Macro> aplicables = deLista(macros);

        for (int i = 0; i < aplicables.size(); i++) {
            Macro m = aplicables.get(i);
            if (soloId != null && !soloId.equals(m.id)) continue;

            if (!forzar && !tocaRepasar(m, store, clock)) {
                out.add(new Outcome(m.id, OMITIDA, "Repasada hace poco.", 0, 0));
                continue;
            }
            store.put(clave(m, "listaAt"), Long.toString(clock.now()));

            out.add(ejecutarLista(m, http, store, clock, vivo));
        }
        return out;
    }

    static boolean tocaRepasar(Macro m, Store store, Clock clock) {
        long ultima = leerLong(store.get(clave(m, "listaAt")));
        if (ultima <= 0) return true;
        return (clock.now() - ultima) >= INTERVALO_LISTAS_MS;
    }

    static Outcome ejecutarLista(Macro m, Http http, Store store, Clock clock) {
        return ejecutarLista(m, http, store, clock, null);
    }

    static Outcome ejecutarLista(Macro m, Http http, Store store, Clock clock,
                                 EnReproduccion vivo) {
        Origen origen = resolverOrigen(m, http);
        if (origen.error != null) {
            anotar(m, store, clock, ERROR, 0, "Error: " + origen.error);
            return new Outcome(m.id, ERROR, origen.error, 0, 0);
        }

        Set<String> vistas = leerVistas(m, store);
        boolean primeraVez = leerLong(store.get(clave(m, "cursorAt"))) <= 0;

        List<Track> pendientes = new ArrayList<Track>();
        for (int i = 0; i < origen.pistas.size(); i++) {
            Track t = origen.pistas.get(i);
            if (!vistas.contains(t.id())) pendientes.add(t);
        }

        // Primera pasada de un origen incremental: se fija el punto de partida
        // sin tocar nada. Lo mismo que hace la app.
        if (primeraVez && incremental(m.source)) {
            List<String> ids = new ArrayList<String>();
            for (int i = 0; i < origen.pistas.size(); i++) ids.add(origen.pistas.get(i).id());
            guardarVistas(m, ids, store, clock);
            String msg = "Punto de partida fijado con " + origen.pistas.size() + " canciones.";
            anotar(m, store, clock, OMITIDA, 0, msg);
            return new Outcome(m.id, OMITIDA, msg, 0, 0);
        }

        if (pendientes.isEmpty()) {
            store.put(clave(m, "cursorAt"), Long.toString(clock.now()));
            anotar(m, store, clock, OMITIDA, 0, "Sin canciones nuevas que procesar.");
            return new Outcome(m.id, OMITIDA, "Sin canciones nuevas que procesar.", 0, 0);
        }

        // La canción viva se aparta del lote si borrarla cortaría la música. No
        // se marca como vista, así que vuelve a salir en el próximo repaso, ya
        // sin sonar.
        int aplazadas = 0;
        for (int i = pendientes.size() - 1; i >= 0; i--) {
            if (!cortariaLaReproduccion(m, pendientes.get(i).uri, vivo)) continue;
            pendientes.remove(i);
            aplazadas++;
        }

        if (pendientes.isEmpty()) {
            String msg = "Aplazada: sonaba ahora mismo y borrarla habría cortado la reproducción.";
            anotar(m, store, clock, OMITIDA, 0, msg);
            return new Outcome(m.id, OMITIDA, msg, aplazadas, 0);
        }

        int encontradas = pendientes.size();
        int limite = maxPorEjecucion(m);
        boolean recortado = encontradas > limite;
        List<Track> lote = recortado ? new ArrayList<Track>(pendientes.subList(0, limite)) : pendientes;

        String error = aplicarLote(m, lote, http);
        if (error != null) {
            anotar(m, store, clock, ERROR, 0, "Error: " + error);
            return new Outcome(m.id, ERROR, error, encontradas, 0);
        }

        // Sólo se marca como visto lo que de verdad se aplicó: lo que sobró por
        // el tope vuelve a salir en la próxima vuelta.
        List<String> nuevas = new ArrayList<String>();
        for (int i = 0; i < lote.size(); i++) nuevas.add(lote.get(i).id());
        for (String id : vistas) nuevas.add(id);
        guardarVistas(m, nuevas, store, clock);

        String msg = recortado
                ? lote.size() + " canción(es) procesadas; el resto queda para la próxima."
                : lote.size() + " canción(es) procesadas.";
        anotar(m, store, clock, APLICADA, lote.size(), "En segundo plano: " + msg);
        return new Outcome(m.id, APLICADA, msg, encontradas, lote.size());
    }

    /**
     * Cuántas canciones se procesan como mucho en una sola ejecución.
     *
     * Las acciones que escriben por lotes gastan una petición cada 50-100
     * canciones, así que aguantan mucho. La cola, en cambio, obliga a un POST
     * por canción: ahí el tope tiene que ser bajo o se agota el cupo de la
     * aplicación y Spotify empieza a devolver 429 a todo.
     */
    static int maxPorEjecucion(Macro m) {
        boolean usaCola = "queue".equals(m.action) || "queue".equals(m.target);
        return usaCola ? 40 : 400;
    }

    // ── Orígenes ─────────────────────────────────────────────────────────────

    static final class Origen {
        final List<Track> pistas;
        final String error;

        Origen(List<Track> pistas, String error) {
            this.pistas = pistas == null ? new ArrayList<Track>() : pistas;
            this.error = error;
        }
    }

    /**
     * Qué suena ahora mismo. La notificación trae título y artista, pero la Web
     * API necesita el URI, y adivinarlo por búsqueda daría falsos positivos con
     * las versiones en directo y los remixes.
     */
    public static Track cancionSonando(Http http) {
        EnReproduccion vivo = sonandoAhora(http);
        return vivo == null ? null : vivo.track;
    }

    /**
     * Igual que {@link #cancionSonando}, pero conservando de qué playlist sale
     * la reproducción. Es la misma petición: el contexto ya venía en la
     * respuesta y antes se tiraba.
     */
    public static EnReproduccion sonandoAhora(Http http) {
        Response r = http.send("GET", API + "/me/player/currently-playing", null);
        if (r == null || r.status < 200 || r.status >= 300) return null;
        // 204: no hay nada sonando.
        if (r.body == null || r.body.trim().length() == 0) return null;

        Object raiz = Json.parse(r.body);
        Track track = pista(Json.get(raiz, "item"));
        if (track == null) return null;

        return new EnReproduccion(track, playlistDeContexto(raiz));
    }

    /** Id de la playlist que da contexto, o "" si se reproduce desde otra cosa. */
    static String playlistDeContexto(Object raiz) {
        Map<String, Object> contexto = Json.object(Json.get(raiz, "context"));
        if (contexto == null) return "";
        if (!"playlist".equals(Json.string(contexto, "type"))) return "";

        String uri = Json.string(contexto, "uri");
        if (uri == null || !uri.startsWith("spotify:playlist:")) return "";
        return idDeUri(uri);
    }

    static Origen resolverOrigen(Macro m, Http http) {
        if (SOURCE_CURRENT_TRACK.equals(m.source)) {
            List<Track> una = new ArrayList<Track>();
            Track t = cancionSonando(http);
            if (t != null) una.add(t);
            return new Origen(una, null);
        }

        if (origenDePlaylist(m.source)) {
            return paginado(http,
                    API + "/playlists/" + m.sourcePlaylistId + "/items"
                            + "?limit=100&fields=items(is_local,item(id,uri,name,type,is_local,artists(name))),next",
                    TOPE_PLAYLIST, "playlist");
        }

        if (SOURCE_RECENTLY_PLAYED.equals(m.source)) {
            return unaPagina(http, API + "/me/player/recently-played?limit=50", "player");
        }

        if (SOURCE_LIKED_NEW.equals(m.source)) {
            return paginado(http, API + "/me/tracks?limit=50", TOPE_ME_GUSTA, "library");
        }

        if (SOURCE_TOP_TRACKS.equals(m.source)) {
            return unaPagina(http, API + "/me/top/tracks?limit=50&time_range=short_term", "library");
        }

        return new Origen(null, "Origen desconocido para el servicio.");
    }

    /**
     * «Tus canciones más escuchadas» y «reproducciones recientes» devuelven las
     * canciones sueltas o envueltas según el endpoint; {@link #pista} acepta las
     * dos formas, así que aquí basta con recorrer `items`.
     */
    static Origen unaPagina(Http http, String url, String ambito) {
        Response r = http.send("GET", url, null);
        String e = revisar(r, ambito);
        if (e != null) return new Origen(null, e);
        return new Origen(pistasDe(Json.get(Json.parse(r.body), "items")), null);
    }

    static Origen paginado(Http http, String url, int tope, String ambito) {
        List<Track> out = new ArrayList<Track>();
        String siguiente = url;
        int vueltas = 0;

        while (siguiente != null && out.size() < tope && vueltas < 20) {
            vueltas++;
            Response r = http.send("GET", siguiente, null);
            String e = revisar(r, ambito);
            if (e != null) return new Origen(null, e);

            Object pagina = Json.parse(r.body);
            out.addAll(pistasDe(Json.get(pagina, "items")));

            Object next = Json.get(pagina, "next");
            siguiente = (next instanceof String) ? (String) next : null;
        }

        if (out.size() > tope) out = new ArrayList<Track>(out.subList(0, tope));
        return new Origen(out, null);
    }

    static List<Track> pistasDe(Object items) {
        List<Track> out = new ArrayList<Track>();
        List<Object> lista = Json.array(items);
        for (int i = 0; i < lista.size(); i++) {
            Track t = pista(lista.get(i));
            if (t != null) out.add(t);
        }
        return out;
    }

    /**
     * Extrae la canción de un elemento de colección.
     *
     * Spotify renombró la envoltura de las playlists: cada entrada traía la
     * canción en `track` y ahora la trae en `item`. «Tus me gusta» sigue con
     * `track`, así que se aceptan las dos formas y esto funciona con cualquiera
     * de las dos versiones de la API.
     */
    static Track pista(Object crudo) {
        Map<String, Object> envoltura = Json.object(crudo);
        if (envoltura == null) return null;

        Map<String, Object> track = Json.object(envoltura.get("item"));
        if (track == null) track = Json.object(envoltura.get("track"));
        if (track == null) track = envoltura;

        String uri = Json.string(track, "uri");
        if (!noVacio(uri) || !noVacio(Json.string(track, "id"))) return null;

        // Los episodios de pódcast y las pistas locales no admiten las mismas
        // operaciones que una canción del catálogo: se descartan en el origen.
        String tipo = Json.string(track, "type");
        if (noVacio(tipo) && !"track".equals(tipo)) return null;
        if (Json.bool(track, "is_local") || Json.bool(envoltura, "is_local")) return null;
        if (!esPistaDelCatalogo(uri)) return null;

        StringBuilder artistas = new StringBuilder();
        List<Object> arr = Json.array(track.get("artists"));
        for (int i = 0; i < arr.size(); i++) {
            Map<String, Object> a = Json.object(arr.get(i));
            if (a == null) continue;
            String nombre = Json.string(a, "name");
            if (!noVacio(nombre)) continue;
            if (artistas.length() > 0) artistas.append(", ");
            artistas.append(nombre);
        }

        String nombre = Json.string(track, "name");
        return new Track(uri, nombre == null ? "" : nombre, artistas.toString());
    }

    // ── Acciones ─────────────────────────────────────────────────────────────

    /** Devuelve null si fue bien, o el motivo en castellano si falló. */
    static String aplicarLote(Macro m, List<Track> pistas, Http http) {
        List<String> uris = new ArrayList<String>();
        for (int i = 0; i < pistas.size(); i++) uris.add(pistas.get(i).uri);
        if (uris.isEmpty()) return null;

        if ("queue".equals(m.action)) return encolar(http, uris);

        if ("remove_from_source".equals(m.action)) {
            return quitarDePlaylist(http, m.sourcePlaylistId, uris);
        }

        if ("copy".equals(m.action) || "move".equals(m.action)) {
            String e;
            if ("liked".equals(m.target)) {
                e = biblioteca(http, uris, "PUT");
            } else if ("queue".equals(m.target)) {
                e = encolar(http, uris);
            } else {
                e = anadirAPlaylist(http, m.targetPlaylistId, uris);
            }
            if (e != null) return e;

            // «Mover» borra del origen. Si el copiado salió bien y esto falla, la
            // canción queda duplicada; por eso va después y no antes.
            if ("move".equals(m.action) && noVacio(m.sourcePlaylistId)) {
                return quitarDePlaylist(http, m.sourcePlaylistId, uris);
            }
            return null;
        }

        if ("remove".equals(m.action)) {
            if ("liked".equals(m.target)) return biblioteca(http, uris, "DELETE");
            return quitarDePlaylist(http, m.targetPlaylistId, uris);
        }

        return "Esta macro no se puede ejecutar en segundo plano.";
    }

    /** La cola no admite lotes: hay un POST por canción. */
    static String encolar(Http http, List<String> uris) {
        for (int i = 0; i < uris.size(); i++) {
            String e = revisar(http.send("POST", API + "/me/player/queue?uri=" + enc(uris.get(i)), null), "player");
            if (e != null) return e;
        }
        return null;
    }

    /** Alta o baja en «Tus me gusta». Las URIs van en la query, no en el cuerpo. */
    static String biblioteca(Http http, List<String> uris, String metodo) {
        for (List<String> grupo : lotes(uris, LOTE_BIBLIOTECA)) {
            String e = revisar(http.send(metodo, API + "/me/library?uris=" + enc(unir(grupo)), null), "library");
            if (e != null) return e;
        }
        return null;
    }

    static String anadirAPlaylist(Http http, String playlistId, List<String> uris) {
        if (!noVacio(playlistId)) return "No se pudo determinar la playlist de destino.";
        for (List<String> grupo : lotes(uris, LOTE_PLAYLIST)) {
            StringBuilder cuerpo = new StringBuilder("{\"uris\":[");
            for (int i = 0; i < grupo.size(); i++) {
                if (i > 0) cuerpo.append(',');
                cuerpo.append(jsonString(grupo.get(i)));
            }
            cuerpo.append("]}");
            String e = revisar(http.send("POST", API + "/playlists/" + playlistId + "/items",
                    cuerpo.toString()), "playlist");
            if (e != null) return e;
        }
        return null;
    }

    /** El cuerpo va con `items`, no con `tracks`. */
    static String quitarDePlaylist(Http http, String playlistId, List<String> uris) {
        if (!noVacio(playlistId)) return "No se pudo determinar la playlist de destino.";
        for (List<String> grupo : lotes(uris, LOTE_PLAYLIST)) {
            StringBuilder cuerpo = new StringBuilder("{\"items\":[");
            for (int i = 0; i < grupo.size(); i++) {
                if (i > 0) cuerpo.append(',');
                cuerpo.append("{\"uri\":").append(jsonString(grupo.get(i))).append('}');
            }
            cuerpo.append("]}");
            String e = revisar(http.send("DELETE", API + "/playlists/" + playlistId + "/items",
                    cuerpo.toString()), "playlist");
            if (e != null) return e;
        }
        return null;
    }

    static List<List<String>> lotes(List<String> items, int tam) {
        List<List<String>> out = new ArrayList<List<String>>();
        for (int i = 0; i < items.size(); i += tam) {
            out.add(new ArrayList<String>(items.subList(i, Math.min(i + tam, items.size()))));
        }
        return out;
    }

    static String unir(List<String> partes) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < partes.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(partes.get(i));
        }
        return sb.toString();
    }

    // ── Traducción de la respuesta ───────────────────────────────────────────

    /**
     * Traduce el código de Spotify a algo que se pueda leer en la pestaña de
     * macros. Mantiene los mismos mensajes que la versión de JavaScript para
     * que el usuario no vea dos vocabularios distintos según dónde corriera.
     */
    static String revisar(Response r, String ambito) {
        if (r == null) return "No hubo respuesta de Spotify.";
        int s = r.status;
        if (s >= 200 && s < 300) return null;

        if (s == 401) return "Tu sesión de Spotify ha caducado. Vuelve a conectar la cuenta.";

        if (s == 403) {
            if ("player".equals(ambito)) {
                return "Spotify ha rechazado la orden de reproducción. Suele ser una cuenta sin Premium.";
            }
            if ("playlist".equals(ambito)) {
                return "Spotify no te deja modificar esa playlist: no es tuya ni colaborativa.";
            }
            return "Spotify ha respondido «Forbidden».";
        }

        if (s == 404) {
            if ("player".equals(ambito)) {
                return "No hay ningún dispositivo activo en el que encolar.";
            }
            return "Spotify no encuentra eso que la macro intenta usar; puede que se haya borrado.";
        }

        if (s == 429) {
            return "Cupo de peticiones agotado. Se reintentará en el próximo repaso.";
        }

        if (s >= 500) {
            return "Spotify está fallando por su lado (error " + s + ").";
        }

        if (s == 0) return "Sin conexión con Spotify.";

        return "Spotify respondió " + s + ".";
    }

    // ── Deduplicado, cursor y estadísticas ───────────────────────────────────

    static boolean yaProcesada(Macro m, String uri, Store store, Clock clock) {
        String ultimaUri = store.get(clave(m, "uri"));
        if (ultimaUri == null || !ultimaUri.equals(uri)) return false;
        long cuando = leerLong(store.get(clave(m, "at")));
        return cuando > 0 && (clock.now() - cuando) < VENTANA_REPETIDO_MS;
    }

    static void marcarProcesada(Macro m, String uri, Store store, Clock clock) {
        store.put(clave(m, "uri"), uri);
        store.put(clave(m, "at"), Long.toString(clock.now()));
    }

    /**
     * Identificadores ya procesados por esta macro. Vale igual para los orígenes
     * incrementales y para los que recorren la lista entera: en segundo plano
     * nunca se vuelve a actuar sobre una canción ya tratada, porque repetir cada
     * quince minutos lo que ya se hizo sólo gasta cupo.
     */
    static Set<String> leerVistas(Macro m, Store store) {
        Set<String> out = new HashSet<String>();
        String crudo = store.get(clave(m, "seen"));
        if (crudo == null || crudo.length() == 0) return out;
        String[] partes = crudo.split(",");
        for (int i = 0; i < partes.length; i++) {
            String p = partes[i].trim();
            if (p.length() > 0) out.add(p);
        }
        return out;
    }

    static void guardarVistas(Macro m, List<String> ids, Store store, Clock clock) {
        StringBuilder sb = new StringBuilder();
        Set<String> puestas = new HashSet<String>();
        int n = 0;
        for (int i = 0; i < ids.size() && n < MAX_VISTAS; i++) {
            String id = ids.get(i);
            if (id == null || id.length() == 0 || !puestas.add(id)) continue;
            if (n > 0) sb.append(',');
            sb.append(id);
            n++;
        }
        store.put(clave(m, "seen"), sb.toString());
        store.put(clave(m, "cursorAt"), Long.toString(clock.now()));
    }

    static void anotar(Macro m, Store store, Clock clock, int estado, int aplicadas, String mensaje) {
        long runs = leerLong(store.get(clave(m, "runs"))) + 1L;
        long applied = leerLong(store.get(clave(m, "applied"))) + (long) Math.max(0, aplicadas);
        store.put(clave(m, "runs"), Long.toString(runs));
        store.put(clave(m, "applied"), Long.toString(applied));
        store.put(clave(m, "result"), mensaje);
        store.put(clave(m, "lastRunAt"), Long.toString(clock.now()));
        registrar(m, store, clock, estado, aplicadas, mensaje);
    }

    /**
     * Historial de los últimos siete días, uno por ejecución.
     *
     * Existe para poder responder a «¿esto funciona de verdad?» sin tener que
     * creerse un contador acumulado: con la app cerrada no hay forma de mirar,
     * y un total que sube no dice si subió anteayer o hace un minuto. Cada línea
     * es `milis|estado|aplicadas|mensaje`, la más reciente primero.
     */
    static final int MAX_HISTORIAL = 60;
    static final long VENTANA_HISTORIAL_MS = 7L * 24L * 60L * 60L * 1000L;

    static void registrar(Macro m, Store store, Clock clock, int estado, int aplicadas, String mensaje) {
        String limpio = mensaje == null ? "" : mensaje.replace('\n', ' ').replace('|', '/');
        StringBuilder sb = new StringBuilder();
        sb.append(clock.now()).append('|').append(estado).append('|')
          .append(Math.max(0, aplicadas)).append('|').append(limpio);

        int n = 1;
        for (String linea : lineasVivas(store.get(clave(m, "log")), clock)) {
            if (n >= MAX_HISTORIAL) break;
            sb.append('\n').append(linea);
            n++;
        }
        store.put(clave(m, "log"), sb.toString());
    }

    /** Las entradas del historial que siguen dentro de la ventana de 7 días. */
    public static List<String> historial(Macro m, Store store, Clock clock) {
        return lineasVivas(store.get(clave(m, "log")), clock);
    }

    static List<String> lineasVivas(String crudo, Clock clock) {
        List<String> out = new ArrayList<String>();
        if (crudo == null || crudo.length() == 0) return out;
        String[] lineas = crudo.split("\n");
        for (int i = 0; i < lineas.length; i++) {
            String linea = lineas[i].trim();
            if (linea.length() == 0) continue;
            int corte = linea.indexOf('|');
            long at = leerLong(corte > 0 ? linea.substring(0, corte) : linea);
            if (at <= 0) continue;
            if (clock.now() - at > VENTANA_HISTORIAL_MS) continue;
            out.add(linea);
        }
        return out;
    }

    /** Estadísticas acumuladas de una macro, para devolvérselas a la app. */
    public static long runs(Macro m, Store store) { return leerLong(store.get(clave(m, "runs"))); }
    public static long applied(Macro m, Store store) { return leerLong(store.get(clave(m, "applied"))); }
    public static String lastResult(Macro m, Store store) { return store.get(clave(m, "result")); }
    public static long lastRunAt(Macro m, Store store) { return leerLong(store.get(clave(m, "lastRunAt"))); }

    static String clave(Macro m, String campo) {
        return "macro." + m.id + "." + campo;
    }

    // ── Utilidades ───────────────────────────────────────────────────────────

    static boolean esPistaDelCatalogo(String uri) {
        return uri != null && uri.startsWith("spotify:track:") && uri.length() > "spotify:track:".length();
    }

    static String idDeUri(String uri) {
        if (uri == null) return "";
        int i = uri.lastIndexOf(':');
        return i >= 0 ? uri.substring(i + 1) : uri;
    }

    static boolean esPlaylist(String target) {
        return "playlist".equals(target) || "new_playlist".equals(target);
    }

    static boolean noVacio(String s) {
        return s != null && s.trim().length() > 0;
    }

    static long leerLong(String s) {
        if (s == null) return 0L;
        try {
            return Long.parseLong(s.trim());
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    /** Codifica para query. URLEncoder usa «+» para el espacio; aquí no vale. */
    static String enc(String s) {
        if (s == null) return "";
        try {
            return URLEncoder.encode(s, "UTF-8").replace("+", "%20");
        } catch (UnsupportedEncodingException e) {
            return s;
        }
    }

    /** Cadena JSON con comillas incluidas. */
    static String jsonString(String s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder(s.length() + 2);
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') {
                sb.append('\\').append(c);
            } else if (c == '\n') {
                sb.append("\\n");
            } else if (c == '\r') {
                sb.append("\\r");
            } else if (c == '\t') {
                sb.append("\\t");
            } else if (c < 0x20) {
                sb.append(String.format("\\u%04x", (int) c));
            } else {
                sb.append(c);
            }
        }
        sb.append('"');
        return sb.toString();
    }

    static String descripcionCorta(Macro m, Track t) {
        String cancion = noVacio(t.name) ? t.name : "la canción actual";
        if ("queue".equals(m.action) || "queue".equals(m.target)) return "«" + cancion + "» a la cola";
        if ("copy".equals(m.action)) {
            return "liked".equals(m.target)
                    ? "«" + cancion + "» a Tus me gusta"
                    : "«" + cancion + "» a la playlist";
        }
        if ("remove".equals(m.action)) {
            return "liked".equals(m.target)
                    ? "«" + cancion + "» quitada de Tus me gusta"
                    : "«" + cancion + "» quitada de la playlist";
        }
        if ("remove_from_source".equals(m.action)) {
            return "«" + cancion + "» quitada de la playlist de origen";
        }
        return cancion;
    }

    // ── JSON ─────────────────────────────────────────────────────────────────

    /**
     * Un analizador de JSON diminuto, con el único fin de no tener que importar
     * org.json aquí: en cuanto esta clase dependiera de Android dejaría de poder
     * probarse con javac a secas, que es lo que permite tener el motor cubierto
     * por pruebas de verdad. Sólo se lee JSON de Spotify, así que basta con
     * objetos, listas, cadenas, números, booleanos y null.
     */
    static final class Json {

        private final String s;
        private int i;

        private Json(String s) {
            this.s = s == null ? "" : s;
        }

        static Object parse(String texto) {
            if (texto == null) return null;
            try {
                Json p = new Json(texto);
                p.blancos();
                Object v = p.valor();
                return v;
            } catch (Throwable t) {
                return null;
            }
        }

        @SuppressWarnings("unchecked")
        static Map<String, Object> object(Object o) {
            return (o instanceof Map) ? (Map<String, Object>) o : null;
        }

        @SuppressWarnings("unchecked")
        static List<Object> array(Object o) {
            return (o instanceof List) ? (List<Object>) o : new ArrayList<Object>();
        }

        static Object get(Object o, String clave) {
            Map<String, Object> m = object(o);
            return m == null ? null : m.get(clave);
        }

        static String string(Map<String, Object> m, String clave) {
            if (m == null) return null;
            Object v = m.get(clave);
            return (v instanceof String) ? (String) v : null;
        }

        static boolean bool(Map<String, Object> m, String clave) {
            if (m == null) return false;
            Object v = m.get(clave);
            return (v instanceof Boolean) && ((Boolean) v).booleanValue();
        }

        // ── El analizador propiamente dicho ──────────────────────────────────

        private void blancos() {
            while (i < s.length()) {
                char c = s.charAt(i);
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r') i++;
                else break;
            }
        }

        private Object valor() {
            blancos();
            if (i >= s.length()) return null;
            char c = s.charAt(i);
            if (c == '{') return objeto();
            if (c == '[') return lista();
            if (c == '"') return cadena();
            if (s.startsWith("true", i))  { i += 4; return Boolean.TRUE; }
            if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
            if (s.startsWith("null", i))  { i += 4; return null; }
            return numero();
        }

        private Map<String, Object> objeto() {
            Map<String, Object> out = new LinkedHashMap<String, Object>();
            i++; // {
            blancos();
            if (i < s.length() && s.charAt(i) == '}') { i++; return out; }
            while (i < s.length()) {
                blancos();
                if (i >= s.length() || s.charAt(i) != '"') break;
                String clave = cadena();
                blancos();
                if (i < s.length() && s.charAt(i) == ':') i++;
                Object v = valor();
                out.put(clave, v);
                blancos();
                if (i < s.length() && s.charAt(i) == ',') { i++; continue; }
                if (i < s.length() && s.charAt(i) == '}') { i++; break; }
                break;
            }
            return out;
        }

        private List<Object> lista() {
            List<Object> out = new ArrayList<Object>();
            i++; // [
            blancos();
            if (i < s.length() && s.charAt(i) == ']') { i++; return out; }
            while (i < s.length()) {
                out.add(valor());
                blancos();
                if (i < s.length() && s.charAt(i) == ',') { i++; continue; }
                if (i < s.length() && s.charAt(i) == ']') { i++; break; }
                break;
            }
            return out;
        }

        private String cadena() {
            StringBuilder sb = new StringBuilder();
            i++; // "
            while (i < s.length()) {
                char c = s.charAt(i++);
                if (c == '"') break;
                if (c != '\\') { sb.append(c); continue; }
                if (i >= s.length()) break;
                char e = s.charAt(i++);
                if (e == 'n') sb.append('\n');
                else if (e == 't') sb.append('\t');
                else if (e == 'r') sb.append('\r');
                else if (e == 'b') sb.append('\b');
                else if (e == 'f') sb.append('\f');
                else if (e == 'u' && i + 4 <= s.length()) {
                    sb.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                    i += 4;
                } else sb.append(e);
            }
            return sb.toString();
        }

        private Object numero() {
            int inicio = i;
            while (i < s.length()) {
                char c = s.charAt(i);
                if ((c >= '0' && c <= '9') || c == '-' || c == '+' || c == '.' || c == 'e' || c == 'E') i++;
                else break;
            }
            if (i == inicio) { i++; return null; }
            try {
                return Double.valueOf(Double.parseDouble(s.substring(inicio, i)));
            } catch (NumberFormatException e) {
                return null;
            }
        }
    }
}
