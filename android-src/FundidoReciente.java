package com.skippify.app;

/**
 * Memoria corta de las últimas transiciones clasificadas por
 * {@link FundidoDetector}. Clase pura (sin Android) para probarla con javac.
 *
 * Sirve para tres cosas:
 *
 *  · CROSSFADE FIJO. El crossfade de Spotify tiene una duración fija (la que se
 *    pone en sus ajustes), así que tres transiciones seguidas con el mismo solape
 *    (±0,5 s) son casi con seguridad un crossfade activo: se marcan como
 *    fundido_probable con confianza 0,95 y motivo «solape_constante». En los
 *    registros de noviembre, 137 transiciones del 9 al 13 midieron 6,9-7,0 s.
 *
 *  · ¿HAY FUNDIDO AHORA? {@link #activo} estima si el fundido está activo a
 *    partir de las últimas transiciones; la estimación se anota en cada fila del
 *    registro y se contrasta luego con la respuesta del usuario.
 *
 *  · VENTANA DE DECISIÓN. Con crossfade, Spotify anuncia la canción nueva cuando
 *    ya lleva 5-8 s sonando: fuera de la ventana de 5 s, y la duplicada se
 *    escapaba. Si hay fundido activo, la ventana crece en lo que mide el solape
 *    (mediana de los últimos), con un tope.
 */
final class FundidoReciente {

    /** Una transición deja de contar pasado este tiempo. */
    static final long VIGENCIA_MS = 10L * 60_000L;
    /** Margen para considerar dos solapes «el mismo». */
    static final long TOLERANCIA_CONSTANTE_MS = 500L;
    /** Transiciones probables previas (vigentes) que deben coincidir con la actual. */
    static final int PREVIAS_CONSTANTES = 2;
    /** Tope de la ventana de decisión ampliada. */
    static final long VENTANA_MAX_MS = 13_000L;
    static final String MOTIVO_CONSTANTE = "solape_constante";

    private static final int CAP = 8;

    private final long[] mEpoch = new long[CAP];
    private final String[] mEtiqueta = new String[CAP];
    private final long[] mSolape = new long[CAP];
    private int mN = 0;
    private int mHead = 0;

    /**
     * Anota una transición clasificada y devuelve el resultado, ajustado si el
     * solape coincide con el de las probables recientes (crossfade fijo).
     * Las no_aplica no se guardan (no dicen nada del fundido).
     */
    synchronized FundidoDetector.Resultado registrar(long epochMs, FundidoDetector.Resultado r) {
        if (r == null) return null;
        FundidoDetector.Resultado out = r;
        boolean candidato = (FundidoDetector.PROBABLE.equals(r.etiqueta) || FundidoDetector.POSIBLE.equals(r.etiqueta))
                && r.tieneSolape() && r.solapeMs >= FundidoDetector.SOLAPE_MIN_MS;
        if (candidato) {
            int coinciden = 0;
            int vistas = 0;
            for (int i = 0; i < mN && vistas < PREVIAS_CONSTANTES; i++) {
                int k = idx(i);
                if (epochMs - mEpoch[k] > VIGENCIA_MS) break;
                if (!FundidoDetector.PROBABLE.equals(mEtiqueta[k])) continue;
                vistas++;
                if (Math.abs(mSolape[k] - r.solapeMs) <= TOLERANCIA_CONSTANTE_MS) coinciden++;
            }
            if (coinciden >= PREVIAS_CONSTANTES) {
                out = new FundidoDetector.Resultado(FundidoDetector.PROBABLE, 0.95, r.solapeMs,
                        r.restanteAnteriorMs, r.posicionPrimeraVistaMs, MOTIVO_CONSTANTE);
            }
        }
        if (!FundidoDetector.NO_APLICA.equals(out.etiqueta)) {
            mHead = (mHead + CAP - 1) % CAP;
            mEpoch[mHead] = epochMs;
            mEtiqueta[mHead] = out.etiqueta;
            mSolape[mHead] = out.tieneSolape() ? out.solapeMs : 0L;
            if (mN < CAP) mN++;
        }
        return out;
    }

    /**
     * ¿Hay fundido activo ahora? TRUE si la última transición vigente es probable
     * o lo son dos de las tres últimas; FALSE si la última es sin_fundido y lo son
     * dos de las tres últimas; null si no hay datos suficientes.
     */
    synchronized Boolean activo(long nowEpochMs) {
        int probables = 0;
        int sin = 0;
        String ultima = null;
        int vistas = 0;
        for (int i = 0; i < mN && vistas < 3; i++) {
            int k = idx(i);
            if (nowEpochMs - mEpoch[k] > VIGENCIA_MS) break;
            if (ultima == null) ultima = mEtiqueta[k];
            vistas++;
            if (FundidoDetector.PROBABLE.equals(mEtiqueta[k])) probables++;
            else if (FundidoDetector.SIN_FUNDIDO.equals(mEtiqueta[k])) sin++;
        }
        if (ultima == null) return null;
        if (FundidoDetector.PROBABLE.equals(ultima) || probables >= 2) return Boolean.TRUE;
        if (FundidoDetector.SIN_FUNDIDO.equals(ultima) && sin >= 2) return Boolean.FALSE;
        return null;
    }

    /** Solape típico del fundido activo (mediana de las probables vigentes), 0 si no hay fundido activo. */
    synchronized long solapeActivoMs(long nowEpochMs) {
        if (!Boolean.TRUE.equals(activo(nowEpochMs))) return 0L;
        long[] v = new long[3];
        int n = 0;
        for (int i = 0; i < mN && n < 3; i++) {
            int k = idx(i);
            if (nowEpochMs - mEpoch[k] > VIGENCIA_MS) break;
            if (FundidoDetector.PROBABLE.equals(mEtiqueta[k])) v[n++] = mSolape[k];
        }
        if (n == 0) return 0L;
        java.util.Arrays.sort(v, 0, n);
        return v[n / 2];
    }

    /** Ventana de decisión: la base, ampliada con el solape si hay fundido activo, sin pasar del tope. */
    long ventanaDecisionMs(long baseMs, long nowEpochMs) {
        long extra = solapeActivoMs(nowEpochMs);
        if (extra <= 0L) return baseMs;
        return Math.max(baseMs, Math.min(VENTANA_MAX_MS, baseMs + extra));
    }

    synchronized void limpiar() {
        mN = 0;
        mHead = 0;
    }

    private int idx(int i) {
        return (mHead + i) % CAP;
    }
}
