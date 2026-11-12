package com.skippify.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Descarga e instala una APK nueva publicada como release de GitHub.
 *
 * Vive en `android-src/` igual que el resto de fuentes nativas: `android/` está
 * en .gitignore y se regenera en cada build, así que un fichero dejado allí
 * desaparecería en cuanto alguien recreara el proyecto.
 *
 * La descarga se hace aquí y no en JavaScript a propósito. Pasar una APK de
 * ~8 MB por el puente de Capacitor obligaría a codificarla en base64 (un tercio
 * más de memoria, todo en el hilo principal); en Java es un stream directo a
 * disco con progreso real.
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {

    /** Debe coincidir con el authority del <provider> que declara Capacitor. */
    private static final String FILE_PROVIDER_SUFFIX = ".fileprovider";

    /** Subcarpeta dentro de cacheDir; `file_paths.xml` ya expone cache-path ".". */
    private static final String UPDATE_DIR = "updates";

    private static final int CONNECT_TIMEOUT_MS = 20000;
    private static final int READ_TIMEOUT_MS = 60000;

    /**
     * Capacitor sólo expone `executeOnMainThread()`, que es justo lo contrario
     * de lo que hace falta aquí: descargar en el hilo principal bloquearía la UI
     * y el sistema mataría la app. Con un único hilo, además, dos toques
     * seguidos en "Actualizar" se encolan en vez de descargar por duplicado.
     */
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    /** Versión instalada ahora mismo, para que JS decida si hay algo más nuevo. */
    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        try {
            PackageManager pm = getContext().getPackageManager();
            PackageInfo info = pm.getPackageInfo(getContext().getPackageName(), 0);
            result.put("versionName", info.versionName);
            result.put("versionCode", longVersionCode(info));
        } catch (PackageManager.NameNotFoundException e) {
            // Irrecuperable en la práctica: el paquete siempre se encuentra a sí
            // mismo. Se devuelve 0 para que JS trate la app como desactualizada
            // en vez de romperse.
            result.put("versionName", "");
            result.put("versionCode", 0);
        }
        result.put("canInstall", canRequestInstall());
        call.resolve(result);
    }

    /**
     * Descarga la APK a la caché y notifica el progreso por el evento
     * `downloadProgress`. Resuelve con la ruta absoluta del fichero.
     */
    @PluginMethod
    public void download(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Falta la URL de la APK");
            return;
        }
        // Sólo las releases del propio repo: el WebView no debe poder hacer que
        // la app descargue (y luego ofrezca instalar) una APK de otro sitio.
        if (!UrlsSeguras.esDescargaDeRelease(url)) {
            call.reject("URL de actualización no permitida");
            return;
        }
        final String fileName = sanitizeFileName(call.getString("fileName", "skippify-update.apk"));

        executor.execute(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection connection = null;
                try {
                    File dir = new File(getContext().getCacheDir(), UPDATE_DIR);
                    if (!dir.exists() && !dir.mkdirs()) {
                        call.reject("No se pudo crear la carpeta de descargas");
                        return;
                    }

                    // Se limpian descargas previas: una APK a medias de un
                    // intento anterior sólo ocupa espacio y confunde al instalador.
                    File[] stale = dir.listFiles();
                    if (stale != null) {
                        for (File file : stale) {
                            //noinspection ResultOfMethodCallIgnored
                            file.delete();
                        }
                    }

                    File target = new File(dir, fileName);

                    connection = (HttpURLConnection) new URL(url).openConnection();
                    connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
                    connection.setReadTimeout(READ_TIMEOUT_MS);
                    // Las releases de GitHub redirigen a objects.githubusercontent.com.
                    connection.setInstanceFollowRedirects(true);
                    connection.setRequestProperty("Accept", "application/octet-stream");
                    connection.connect();

                    int status = connection.getResponseCode();
                    if (status < 200 || status >= 300) {
                        call.reject("La descarga devolvió HTTP " + status);
                        return;
                    }

                    long total = connection.getContentLength();
                    long downloaded = 0;
                    int lastNotifiedPercent = -1;

                    InputStream input = connection.getInputStream();
                    FileOutputStream output = new FileOutputStream(target);
                    try {
                        byte[] buffer = new byte[8192];
                        int read;
                        while ((read = input.read(buffer)) != -1) {
                            output.write(buffer, 0, read);
                            downloaded += read;

                            if (total > 0) {
                                int percent = (int) (downloaded * 100 / total);
                                // Un evento por punto porcentual; sin esto se
                                // saturaría el puente con miles de mensajes.
                                if (percent != lastNotifiedPercent) {
                                    lastNotifiedPercent = percent;
                                    JSObject progress = new JSObject();
                                    progress.put("percent", percent);
                                    progress.put("downloaded", downloaded);
                                    progress.put("total", total);
                                    notifyListeners("downloadProgress", progress);
                                }
                            }
                        }
                        output.flush();
                    } finally {
                        try { output.close(); } catch (Exception ignored) {}
                        try { input.close(); } catch (Exception ignored) {}
                    }

                    if (target.length() <= 0) {
                        //noinspection ResultOfMethodCallIgnored
                        target.delete();
                        call.reject("La descarga llegó vacía");
                        return;
                    }

                    JSObject result = new JSObject();
                    result.put("path", target.getAbsolutePath());
                    result.put("size", target.length());
                    call.resolve(result);
                } catch (Exception e) {
                    call.reject("Fallo al descargar la actualización: " + e.getMessage(), e);
                } finally {
                    if (connection != null) connection.disconnect();
                }
            }
        });
    }

    /**
     * Lanza el instalador del sistema. Android nunca permite instalar en
     * silencio a una app normal, así que a partir de aquí manda el usuario:
     * verá el diálogo de "¿Actualizar Skippify?" y tendrá que confirmarlo.
     */
    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("Falta la ruta de la APK");
            return;
        }

        File apk = new File(path);
        // Sólo lo que haya descargado `download` en su carpeta de la caché.
        try {
            File carpeta = new File(getContext().getCacheDir(), UPDATE_DIR).getCanonicalFile();
            File canon = apk.getCanonicalFile();
            if (!carpeta.equals(canon.getParentFile())) {
                call.reject("Ruta de APK no permitida");
                return;
            }
            apk = canon;
        } catch (Exception e) {
            call.reject("Ruta de APK no válida");
            return;
        }
        if (!apk.exists()) {
            call.reject("La APK descargada ya no está en disco");
            return;
        }

        if (!canRequestInstall()) {
            // El código lo mira la UI para ofrecer el atajo a los ajustes.
            call.reject("Falta el permiso para instalar apps desconocidas", "SIN_PERMISO_INSTALACION");
            return;
        }

        try {
            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + FILE_PROVIDER_SUFFIX,
                    apk
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo abrir el instalador: " + e.getMessage(), e);
        }
    }

    /** Abre los ajustes donde se concede "instalar apps desconocidas". */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudieron abrir los ajustes: " + e.getMessage(), e);
        }
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
    }

    private boolean canRequestInstall() {
        // Antes de Android 8 el permiso era global y se concedía al instalar.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    @SuppressWarnings("deprecation")
    private long longVersionCode(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return info.getLongVersionCode();
        }
        return info.versionCode;
    }

    /** Evita que un nombre venido de JS escape de la carpeta de caché. */
    private String sanitizeFileName(String name) {
        String cleaned = name.replaceAll("[^A-Za-z0-9._-]", "_");
        if (cleaned.isEmpty()) return "skippify-update.apk";
        return cleaned.endsWith(".apk") ? cleaned : cleaned + ".apk";
    }
}
