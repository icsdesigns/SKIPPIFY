package com.skippify.app;

/**
 * Canal de distribución con el que se compiló esta build.
 *
 * Este fichero es el del canal por defecto (releases de GitHub, con su
 * actualizador). `scripts/build-apk.ps1 -Canal play` lo sobrescribe en la copia
 * de `android/` con PLAY = true: en Google Play las actualizaciones las hace la
 * propia tienda y la política no permite que una app se instale APKs a sí misma.
 */
final class Canal {
    static final boolean PLAY = false;

    private Canal() { }
}
