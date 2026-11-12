package com.skippify.app;

/** Pruebas de las URLs que aceptan los plugins de descarga y de abrir enlaces. */
public final class PruebasUrls {

    static int fallos = 0;
    static int total = 0;

    public static void main(String[] args) {
        String buena = "https://github.com/icsdesigns/SKIPPIFY/releases/download/v4.7.0-b812/Skippify-v4.7.0-b812.apk";
        si("release oficial", UrlsSeguras.esDescargaDeRelease(buena));
        si("host en mayúsculas", UrlsSeguras.esDescargaDeRelease(buena.replace("github.com", "GitHub.com")));
        no("http en vez de https", UrlsSeguras.esDescargaDeRelease(buena.replace("https:", "http:")));
        no("otro repo", UrlsSeguras.esDescargaDeRelease(buena.replace("icsdesigns/SKIPPIFY", "otro/SKIPPIFY")));
        no("otro host", UrlsSeguras.esDescargaDeRelease(buena.replace("github.com", "github.com.evil.io")));
        no("con usuario", UrlsSeguras.esDescargaDeRelease(buena.replace("https://", "https://x@")));
        no("puerto raro", UrlsSeguras.esDescargaDeRelease(buena.replace("github.com", "github.com:8443")));
        no("subida de carpeta", UrlsSeguras.esDescargaDeRelease("https://github.com/icsdesigns/SKIPPIFY/releases/download/../../otro/a.apk"));
        no("codificada", UrlsSeguras.esDescargaDeRelease("https://github.com/icsdesigns/SKIPPIFY/releases/download/%2e%2e/a.apk"));
        no("no es apk", UrlsSeguras.esDescargaDeRelease("https://github.com/icsdesigns/SKIPPIFY/releases/download/v1/latest.json"));
        no("con query", UrlsSeguras.esDescargaDeRelease(buena + "?x=1"));
        no("rutas de más", UrlsSeguras.esDescargaDeRelease("https://github.com/icsdesigns/SKIPPIFY/releases/download/v1/a/b.apk"));
        no("nula", UrlsSeguras.esDescargaDeRelease(null));
        no("vacía", UrlsSeguras.esDescargaDeRelease("  "));

        si("panel de Spotify", UrlsSeguras.esExternaSegura("https://developer.spotify.com/dashboard"));
        si("login de Spotify", UrlsSeguras.esExternaSegura("https://accounts.spotify.com/authorize?client_id=a&state=b"));
        no("intent:", UrlsSeguras.esExternaSegura("intent://x#Intent;scheme=http;end"));
        no("file:", UrlsSeguras.esExternaSegura("file:///sdcard/a"));
        no("javascript:", UrlsSeguras.esExternaSegura("javascript:alert(1)"));
        no("content:", UrlsSeguras.esExternaSegura("content://com.skippify.app.fileprovider/x"));
        no("http", UrlsSeguras.esExternaSegura("http://example.com"));
        no("con usuario", UrlsSeguras.esExternaSegura("https://a:b@example.com"));

        System.out.println("URLs de plugins: " + (total - fallos) + "/" + total + " correctas");
        if (fallos > 0) System.exit(1);
    }

    static void si(String nombre, boolean v) { comprobar(nombre, v, true); }
    static void no(String nombre, boolean v) { comprobar(nombre, v, false); }

    static void comprobar(String nombre, boolean v, boolean esperado) {
        total++;
        if (v != esperado) {
            fallos++;
            System.out.println("  FALLO: " + nombre + " (esperado " + esperado + ")");
        }
    }
}
