package com.skippify.app;

import java.net.URI;
import java.util.Locale;

/**
 * Qué URLs aceptan los plugins que salen de la app (descargar una APK, abrir el
 * navegador). Sin Android a propósito: se prueba con javac a secas.
 *
 * El WebView es quien pide estas acciones; si alguna vez se le colase código
 * ajeno, no debería poder hacer que la app se descargue e intente instalar una
 * APK de cualquier sitio, ni abrir intents de esquemas arbitrarios.
 */
final class UrlsSeguras {

    /** Única ruta de la que se acepta descargar una actualización. */
    static final String RUTA_RELEASES = "/icsdesigns/SKIPPIFY/releases/download/";

    private UrlsSeguras() { }

    /** https://github.com/icsdesigns/SKIPPIFY/releases/download/<tag>/<fichero>.apk */
    static boolean esDescargaDeRelease(String url) {
        URI u = parsear(url);
        if (u == null) return false;
        if (!"https".equals(minus(u.getScheme()))) return false;
        if (!"github.com".equals(minus(u.getHost()))) return false;
        if (u.getUserInfo() != null) return false;
        if (u.getPort() != -1 && u.getPort() != 443) return false;
        if (u.getRawQuery() != null || u.getRawFragment() != null) return false;
        String ruta = u.getRawPath();
        if (ruta == null || !ruta.startsWith(RUTA_RELEASES)) return false;
        if (ruta.contains("..") || ruta.contains("%")) return false;
        String resto = ruta.substring(RUTA_RELEASES.length());
        // Exactamente <tag>/<fichero>.apk
        String[] partes = resto.split("/", -1);
        return partes.length == 2 && !partes[0].isEmpty()
                && partes[1].length() > 4 && partes[1].toLowerCase(Locale.ROOT).endsWith(".apk");
    }

    /** Sólo https con un host normal: nada de intent:, file:, content:, javascript:… */
    static boolean esExternaSegura(String url) {
        URI u = parsear(url);
        if (u == null) return false;
        if (!"https".equals(minus(u.getScheme()))) return false;
        String host = u.getHost();
        if (host == null || host.isEmpty()) return false;
        return u.getUserInfo() == null;
    }

    private static URI parsear(String url) {
        if (url == null) return null;
        String limpia = url.trim();
        if (limpia.isEmpty() || limpia.length() > 2048) return null;
        try {
            return new URI(limpia);
        } catch (Exception e) {
            return null;
        }
    }

    private static String minus(String s) {
        return s == null ? null : s.toLowerCase(Locale.ROOT);
    }
}
