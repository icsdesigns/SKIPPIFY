package com.skippify.app;

/**
 * Pruebas del afinado del motor (4.10.0): memoria de transiciones de fundido
 * (crossfade fijo, fundido activo, ventana de decisión ampliada) y freno de
 * cadenas de saltos. Corre con javac/java a secas (`npm run test:nativo`).
 */
public final class PruebasMotorAfinado {

    static int fallos = 0;
    static int total = 0;

    static FundidoDetector.Resultado res(String etiqueta, long solape) {
        return new FundidoDetector.Resultado(etiqueta, 0.8, solape, 0L, 0L, "x");
    }

    public static void main(String[] args) {
        pruebasReciente();
        pruebasFreno();
        System.out.println("PruebasMotorAfinado: " + (total - fallos) + "/" + total + " correctas");
        if (fallos > 0) System.exit(1);
    }

    static void pruebasReciente() {
        long t = 1_000_000_000L;
        FundidoReciente f = new FundidoReciente();
        check("sin datos: fundido desconocido", f.activo(t), null);
        check("sin datos: ventana base", f.ventanaDecisionMs(5_000L, t), 5_000L);

        // Crossfade de 7 s: la tercera transición igual se marca como constante.
        FundidoDetector.Resultado r = f.registrar(t, res(FundidoDetector.PROBABLE, 6_950L));
        check("1.ª probable sin ajuste", r.motivo, "x");
        r = f.registrar(t + 200_000L, res(FundidoDetector.PROBABLE, 7_010L));
        check("2.ª probable sin ajuste", r.motivo, "x");
        r = f.registrar(t + 400_000L, res(FundidoDetector.POSIBLE, 6_980L));
        check("3.ª con el mismo solape: crossfade fijo", r.motivo, FundidoReciente.MOTIVO_CONSTANTE);
        check("  pasa a probable", r.etiqueta, FundidoDetector.PROBABLE);
        check("  confianza 0,95", r.confianza, 0.95);
        check("fundido activo", f.activo(t + 410_000L), Boolean.TRUE);
        check("ventana 5 s + 7 s", f.ventanaDecisionMs(5_000L, t + 410_000L), 11_980L);
        check("ventana con tope de 13 s", f.ventanaDecisionMs(9_000L, t + 410_000L), 13_000L);
        check("una base ya mayor que el tope se respeta", f.ventanaDecisionMs(20_000L, t + 410_000L), 20_000L);
        check("pasados 10 min deja de contar", f.activo(t + 400_000L + FundidoReciente.VIGENCIA_MS + 1L), null);

        // Un solape distinto no es crossfade fijo.
        r = f.registrar(t + 420_000L, res(FundidoDetector.PROBABLE, 11_000L));
        check("solape distinto: sin ajuste", r.motivo, "x");

        // Se apaga el crossfade: dos cambios normales seguidos.
        f.registrar(t + 600_000L, res(FundidoDetector.SIN_FUNDIDO, -500L));
        check("una sin_fundido tras probables: aún incierto", f.activo(t + 600_001L), Boolean.TRUE);
        f.registrar(t + 800_000L, res(FundidoDetector.SIN_FUNDIDO, -300L));
        check("dos sin_fundido: sin fundido", f.activo(t + 800_001L), Boolean.FALSE);
        check("  y la ventana vuelve a la base", f.ventanaDecisionMs(5_000L, t + 800_001L), 5_000L);

        // Las no_aplica no cuentan.
        f.registrar(t + 810_000L, new FundidoDetector.Resultado(FundidoDetector.NO_APLICA, 0, FundidoDetector.SIN_DATO, 0, 0, "salto_manual"));
        check("no_aplica no cambia la estimación", f.activo(t + 810_001L), Boolean.FALSE);

        // Posibles sueltas no hacen crossfade fijo sin probables previas.
        FundidoReciente g = new FundidoReciente();
        g.registrar(t, res(FundidoDetector.POSIBLE, 7_000L));
        g.registrar(t + 1L, res(FundidoDetector.POSIBLE, 7_000L));
        r = g.registrar(t + 2L, res(FundidoDetector.POSIBLE, 7_000L));
        check("posibles sueltas: sin ajuste", r.etiqueta, FundidoDetector.POSIBLE);
        check("  ni fundido activo", g.activo(t + 3L), null);
    }

    static void pruebasFreno() {
        FrenoCadena f = new FrenoCadena();
        long t = 5_000_000L;
        for (int i = 0; i < FrenoCadena.MAX_SEGUIDOS; i++) {
            check("salto " + (i + 1) + " de la cadena", f.alDuplicada(t + i * 1_000L), FrenoCadena.SALTAR);
        }
        long t11 = t + FrenoCadena.MAX_SEGUIDOS * 1_000L;
        check("el 11.º echa el freno", f.alDuplicada(t11), FrenoCadena.FRENAR);
        check("  frenado", f.frenado(t11 + 1L), true);
        check("con el freno echado no se salta ni se avisa otra vez", f.alDuplicada(t11 + 200_000L), FrenoCadena.FRENADO);
        check("pasados 15 min se vuelve a saltar", f.alDuplicada(t11 + FrenoCadena.DURACION_MS + 1L), FrenoCadena.SALTAR);

        FrenoCadena g = new FrenoCadena();
        for (int i = 0; i < 9; i++) g.alDuplicada(t + i * 1_000L);
        g.alNoDuplicada();
        check("una canción nueva corta la cadena", g.seguidos(), 0);
        for (int i = 0; i < 9; i++) g.alDuplicada(t + 20_000L + i * 1_000L);
        g.alConservada();
        check("una conservada fuera de ventana también", g.seguidos(), 0);

        FrenoCadena h = new FrenoCadena();
        for (int i = 0; i < 9; i++) h.alDuplicada(t + i * 1_000L);
        check("un hueco de más de 1 min reinicia la cuenta", h.alDuplicada(t + 9_000L + FrenoCadena.HUECO_MAX_MS + 1L), FrenoCadena.SALTAR);
        check("  y cuenta 1", h.seguidos(), 1);

        FrenoCadena k = new FrenoCadena();
        for (int i = 0; i <= FrenoCadena.MAX_SEGUIDOS; i++) k.alDuplicada(t + i);
        k.alNoDuplicada();
        check("una canción nueva suelta el freno", k.frenado(t + 100L), false);
    }

    static void check(String etiqueta, Object real, Object esperado) {
        total++;
        boolean ok = real == null ? esperado == null : real.equals(esperado);
        if (!ok) {
            fallos++;
            System.out.println("FALLO: " + etiqueta + " — esperado " + esperado + ", obtenido " + real);
        }
    }
}
