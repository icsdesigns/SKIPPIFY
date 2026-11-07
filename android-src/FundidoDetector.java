package com.skippify.app;

/**
 * Clasifica la transición entre dos canciones consecutivas: ¿hubo un fundido
 * (crossfade, DJ de Spotify, Mix) o un cambio normal? Función pura y
 * determinista, sin Android, para poder probarla con javac a secas.
 *
 * QUÉ SE MIDE. Un fundido hace que dos canciones suenen a la vez durante O ms:
 * la nueva EMPIEZA cuando a la anterior aún le quedan O ms. El motor no ve ese
 * instante, ve la primera observación de la canción nueva. En ese momento:
 *
 *   P = posición de la canción nueva (cuánto lleva sonando)
 *   R = lo que le queda a la anterior, extrapolando su última posición vista
 *       hasta ese mismo instante (puede salir NEGATIVO: ya debería haber acabado)
 *
 * Como la nueva empezó hace P ms y a la anterior le quedan R ms ahora, cuando
 * empezó la nueva a la anterior le quedaban P + R ms. Ése es el solape:
 *
 *   solape O = P + R
 *
 * Es la misma magnitud se vea el cambio cuando se vea: con el aviso puntual
 * (P≈0,3 s, R≈O) y con el aviso tardío del ~8 % de los casos (P≈O, R≈0), que
 * es justo lo que se quiere separar de un cambio normal (O≈0 aunque P sea
 * grande, porque entonces R≈-P: la anterior acabó hace P ms).
 *
 * CRITERIOS (todos en ms; las constantes de abajo los fijan):
 *
 *  · No se clasifica (no_aplica, con motivo) si falta algún dato; si es la misma
 *    canción reabierta (reanudación a mitad, no es una transición); si la
 *    anterior estaba en pausa al cerrarse (salvo que ya estuviera en su recta
 *    final: algunos móviles publican «parado» al terminar la pista); si hubo
 *    más de 5 s de hueco entre ambas (pausa, buffering, app cerrada); si la
 *    primera vista de la nueva llegó con más de 30 s encima (no se puede juzgar
 *    el solape); o si a la anterior le quedaban más de 15 s cuando empezó la
 *    nueva (salto manual: el máximo de crossfade de Spotify es 12 s).
 *  · O < 1,5 s → sin_fundido. El ruido de la extrapolación (la posición del
 *    MediaSession se refresca por saltos de ~1 s) y la latencia del aviso
 *    (~0,3 s) caben bajo ese umbral; un cambio normal da |O| < 1 s.
 *  · 1,5 s ≤ O ≤ 14 s → hay solape. Es fundido_probable si O ∈ [2, 12,5] s (el
 *    rango real de crossfade y de las transiciones del DJ/Mix), la anterior
 *    seguía sonando al cerrarse y la primera vista coincidió con el principio o
 *    el final del fundido (P o R < 1,5 s, es decir, la medida es limpia).
 *    Fuera de eso, fundido_posible.
 *  · 14 s < O ≤ 15 s → fundido_posible con confianza baja (frontera con el salto
 *    manual).
 *
 * La confianza (0-1) es una heurística ordinal, no una probabilidad calibrada:
 * sirve para ordenar y filtrar, y se contrastará con la respuesta del usuario.
 */
final class FundidoDetector {

    static final String PROBABLE = "fundido_probable";
    static final String POSIBLE = "fundido_posible";
    static final String SIN_FUNDIDO = "sin_fundido";
    static final String NO_APLICA = "no_aplica";

    /** Hueco máximo (silencio o pausa) entre el final de una y el principio de otra. */
    static final long HUECO_MAX_MS = 5_000L;
    /** Si a la anterior le quedaba más que esto al empezar la nueva, fue un salto manual. */
    static final long SALTO_MANUAL_MS = 15_000L;
    /** Por debajo, cambio normal: cabe el ruido de extrapolación y la latencia del aviso. */
    static final long SOLAPE_MIN_MS = 1_500L;
    /** Techo del solape «coherente» (crossfade máximo de Spotify: 12 s, más margen). */
    static final long SOLAPE_MAX_MS = 14_000L;
    /** Rango en el que el solape es claramente un fundido y no ruido. */
    static final long PROBABLE_MIN_MS = 2_000L;
    static final long PROBABLE_MAX_MS = 12_500L;
    /** Margen para decir que la medida cayó en el principio o el final del fundido. */
    static final long MEDIDA_LIMPIA_MS = 1_500L;
    /** Si la nueva ya llevaba más que esto al verla, el aviso llegó demasiado tarde. */
    static final long PRIMERA_VISTA_MAX_MS = 30_000L;
    /** Una anterior «en pausa» a menos de esto del final se da por terminada, no pausada. */
    static final long PAUSA_EN_RECTA_FINAL_MS = 3_000L;
    /** Si la primera vista llegó con la sesión ya así de vieja, la medida es menos fiable. */
    static final long EDAD_TARDIA_MS = 3_000L;

    /** Datos de entrada; -1 significa «desconocido» salvo donde se indica. */
    static final class Entrada {
        /** Duración de la canción anterior. */
        long anteriorDuracionMs = -1L;
        /**
         * Lo que le queda a la anterior en el instante de la primera vista de la
         * nueva: duración - última posición extrapolada hasta ese instante. Puede
         * ser negativo. Sólo vale si {@link #anteriorRestanteConocido}.
         */
        long anteriorRestanteMs = 0L;
        boolean anteriorRestanteConocido = false;
        /** ¿Sonaba la anterior en su última observación? */
        boolean anteriorSonandoAlCerrar = false;
        /** Milisegundos entre el cierre de la anterior y la apertura de la nueva. */
        long huecoSesionesMs = 0L;
        /** ¿Es la misma canción que la anterior (reapertura)? */
        boolean mismaCancion = false;
        /** Posición de la nueva en su primera observación válida (sonando y con posición). */
        long posicionPrimeraVistaMs = -1L;
        /** Antigüedad de la sesión de la nueva en esa primera observación válida. */
        long edadSesionMs = -1L;
        /** `notification`, `media_session`, `sonda`… */
        String origen = "";
        /** Duración de la nueva (sólo para validar que la posición cabe). */
        long nuevaDuracionMs = -1L;
    }

    /** Resultado de la clasificación. */
    static final class Resultado {
        final String etiqueta;
        /** 0-1. En no_aplica es 0. */
        final double confianza;
        /** P + R; sólo si se pudo calcular, si no {@link #sinDato}. */
        final long solapeMs;
        final long restanteAnteriorMs;
        final long posicionPrimeraVistaMs;
        final String motivo;

        Resultado(String etiqueta, double confianza, long solapeMs, long restanteAnteriorMs,
                  long posicionPrimeraVistaMs, String motivo) {
            this.etiqueta = etiqueta;
            this.confianza = confianza;
            this.solapeMs = solapeMs;
            this.restanteAnteriorMs = restanteAnteriorMs;
            this.posicionPrimeraVistaMs = posicionPrimeraVistaMs;
            this.motivo = motivo;
        }

        boolean tieneSolape() {
            return solapeMs != SIN_DATO;
        }
    }

    /** Marca de «magnitud no calculada». */
    static final long SIN_DATO = Long.MIN_VALUE;

    private FundidoDetector() {}

    static Resultado clasificar(Entrada e) {
        if (e == null) return noAplica("sin_datos", SIN_DATO, SIN_DATO, SIN_DATO);

        final long p = e.posicionPrimeraVistaMs;
        final long r = e.anteriorRestanteConocido ? e.anteriorRestanteMs : SIN_DATO;
        final long pOut = p >= 0L ? p : SIN_DATO;

        if (e.mismaCancion) return noAplica("misma_cancion_reabierta", SIN_DATO, r, pOut);
        if (e.anteriorDuracionMs <= 0L) return noAplica("falta_duracion_anterior", SIN_DATO, r, pOut);
        if (!e.anteriorRestanteConocido) return noAplica("falta_posicion_anterior", SIN_DATO, SIN_DATO, pOut);
        if (p < 0L) return noAplica("falta_posicion_nueva", SIN_DATO, r, SIN_DATO);
        if (e.nuevaDuracionMs > 0L && p > e.nuevaDuracionMs) {
            return noAplica("posicion_nueva_incoherente", SIN_DATO, r, p);
        }
        if (!e.anteriorSonandoAlCerrar && e.anteriorRestanteMs > PAUSA_EN_RECTA_FINAL_MS) {
            return noAplica("anterior_en_pausa", SIN_DATO, r, p);
        }
        if (e.huecoSesionesMs > HUECO_MAX_MS) return noAplica("hueco_largo", SIN_DATO, r, p);
        if (p > PRIMERA_VISTA_MAX_MS) return noAplica("primera_vista_tardia", SIN_DATO, r, p);

        final long solape = p + r;
        if (solape > SALTO_MANUAL_MS) return noAplica("salto_manual", solape, r, p);
        // Negativo: la nueva empezó DESPUÉS de acabar la anterior (silencio entre ambas).
        if (-solape > HUECO_MAX_MS) return noAplica("hueco_largo", solape, r, p);

        final boolean origenSonda = "sonda".equals(e.origen);
        final boolean vistaTardia = e.edadSesionMs > EDAD_TARDIA_MS;

        if (solape < SOLAPE_MIN_MS) {
            double c;
            long abs = Math.abs(solape);
            if (solape < 0L && abs > 3_000L) c = 0.5;
            else if (abs <= 800L) c = 0.9;
            else c = 0.7;
            return new Resultado(SIN_FUNDIDO, ajusta(c, origenSonda, vistaTardia), solape, r, p, "solape_nulo");
        }

        if (solape > SOLAPE_MAX_MS) {
            return new Resultado(POSIBLE, ajusta(0.25, origenSonda, vistaTardia), solape, r, p, "solape_en_la_frontera");
        }

        final boolean medidaLimpia = p <= MEDIDA_LIMPIA_MS || Math.abs(r) <= MEDIDA_LIMPIA_MS;
        if (solape >= PROBABLE_MIN_MS && solape <= PROBABLE_MAX_MS
                && e.anteriorSonandoAlCerrar && medidaLimpia) {
            double c = 0.85;
            return new Resultado(PROBABLE, ajusta(c, origenSonda, vistaTardia), solape, r, p, "solape_coherente");
        }

        String motivo;
        double c;
        if (!medidaLimpia) {
            motivo = "medida_a_mitad_del_solape";
            c = 0.55;
        } else if (!e.anteriorSonandoAlCerrar) {
            motivo = "anterior_no_sonaba_al_cerrar";
            c = 0.45;
        } else {
            motivo = "solape_en_el_borde";
            c = 0.4;
        }
        return new Resultado(POSIBLE, ajusta(c, origenSonda, vistaTardia), solape, r, p, motivo);
    }

    /** Resta confianza a las medidas menos fiables y acota a [0, 1]. */
    private static double ajusta(double c, boolean origenSonda, boolean vistaTardia) {
        // Con sonda la «primera vista» la decide nuestro temporizador, no el aviso
        // de Spotify; con sesión ya vieja la posición llegó tarde.
        if (origenSonda) c -= 0.05;
        if (vistaTardia) c -= 0.10;
        if (c < 0.0) c = 0.0;
        if (c > 1.0) c = 1.0;
        return Math.round(c * 100.0) / 100.0;
    }

    private static Resultado noAplica(String motivo, long solape, long restante, long primera) {
        return new Resultado(NO_APLICA, 0.0, solape, restante, primera, motivo);
    }
}
