package com.skippify.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * Activity principal de Skippify.
 *
 * Vive en `android-src/` y la copia `build-apk.ps1`: la carpeta `android/` es
 * generada y no está versionada, así que un parche aplicado allí se perdería en
 * cuanto alguien recreara el proyecto.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NotifListenerPlugin.class);
        registerPlugin(UpdaterPlugin.class);
        registerPlugin(LocalHostBgPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * La activity es `singleTask`, así que cuando el navegador devuelve el deep
     * link del login de Spotify (o se toca la notificación persistente) Android
     * NO crea una activity nueva: entrega el intent por aquí.
     *
     * `BridgeActivity.onNewIntent()` no llama a `setIntent()`, de modo que
     * `getIntent()` seguía devolviendo para siempre el intent de lanzamiento.
     * El plugin leía ese intent viejo, nunca encontraba el `code` y la pantalla
     * de Macros se quedaba en «Esperando a Spotify…» indefinidamente.
     */
    @Override
    protected void onNewIntent(Intent intent) {
        if (intent != null) setIntent(intent);
        super.onNewIntent(intent);

        // onResume() llega justo después y también avisa al plugin, pero
        // hacerlo aquí acorta la espera y cubre el caso de que el sistema no
        // dispare un onResume completo.
        NotifListenerPlugin instance = NotifListenerPlugin.getInstance();
        if (instance != null) {
            instance.onActivityResumed();
        }
    }

    /**
     * Con la app a la vista, el WebView del servicio (Comunidad sin servidor)
     * debe parar: sólo uno escribe a la vez. Ver LocalHostBackground.
     */
    @Override
    public void onPause() {
        super.onPause();
        LocalHostBackground.onMainPaused(this);
    }

    @Override
    public void onResume() {
        super.onResume();
        LocalHostBackground.onMainResumed(this);
        // Notify plugin that activity resumed (user may have granted permission)
        NotifListenerPlugin instance = NotifListenerPlugin.getInstance();
        if (instance != null) {
            instance.onActivityResumed();
        }
    }
}
