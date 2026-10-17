package com.skippify.app;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.widget.Toast;

import org.json.JSONObject;

/**
 * Recibe la pulsación larga del botón de función de los auriculares y ejecuta
 * la macro que el usuario haya vinculado.
 *
 * Por qué así y no con una MediaSession propia: los botones multimedia van a la
 * sesión que reprodujo audio por última vez, que mientras suena música es la de
 * Spotify. Una sesión de Skippify sólo los recibiría con Spotify parado, que es
 * justo cuando no sirve de nada. Robárselos obligaría a reproducir audio y
 * cortaría la música.
 *
 * Lo que queda libre es la pulsación larga: Android la convierte en una orden
 * de voz. Unos auriculares Bluetooth la envían por el perfil de manos libres y
 * el sistema lanza ACTION_VOICE_COMMAND; con cable, el reproductor la traduce en
 * VOICE_SEARCH_HANDS_FREE con la pantalla apagada. Esta activity responde a las
 * dos, no pinta nada y se cierra en el acto.
 *
 * Sólo está habilitada mientras haya una macro vinculada (ver
 * {@link #habilitar}). Mientras tanto Skippify no aparece en el selector del
 * asistente. La primera vez que se pulse, Android preguntará con qué app
 * abrirlo: hay que elegir Skippify y «Siempre».
 */
public class BotonAuricularesActivity extends Activity {

    private static final String TAG = "SkippifyBoton";

    /**
     * Los auriculares repiten la orden si la pulsación se alarga, y algunos
     * sistemas la entregan dos veces. Una segunda llegada dentro de esta
     * ventana se ignora.
     */
    private static final long VENTANA_REBOTE_MS = 2500L;

    private static volatile long sUltimaMs = 0L;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        final Context app = getApplicationContext();

        long ahora = SystemClock.elapsedRealtime();
        boolean rebote = (ahora - sUltimaMs) < VENTANA_REBOTE_MS;
        sUltimaMs = ahora;

        // Theme.NoDisplay exige cerrar antes de onResume.
        finish();
        if (rebote) return;

        new Thread(new Runnable() {
            public void run() {
                JSONObject r;
                try {
                    r = MacroBackground.ejecutarBoton(app);
                } catch (Throwable t) {
                    Log.w(TAG, "fallo ejecutando la macro del botón", t);
                    r = new JSONObject();
                }
                avisar(app, texto(r));
            }
        }, "skippify-boton").start();
    }

    /** Lo que se le dice al usuario tras la pulsación. */
    static String texto(JSONObject r) {
        String nombre = r.optString("name", "");
        String prefijo = nombre.length() > 0 ? "«" + nombre + "»: " : "";
        String error = r.optString("error", "");
        if (error.length() > 0) return "Skippify · " + prefijo + error;

        int status = r.optInt("status", MacroRunner.ERROR);
        String msg = r.optString("message", "");
        if (status == MacroRunner.ERROR) {
            return "Skippify · " + prefijo + "error. " + msg;
        }
        return "Skippify · " + prefijo + (msg.length() > 0 ? msg : "hecho.");
    }

    private static void avisar(final Context app, final String texto) {
        new Handler(Looper.getMainLooper()).post(new Runnable() {
            public void run() {
                try {
                    Toast.makeText(app, texto, Toast.LENGTH_LONG).show();
                } catch (Throwable ignored) { }
            }
        });
    }

    /**
     * Habilita o deshabilita esta activity. Deshabilitada, Android ni siquiera
     * la ofrece para las órdenes de voz, que es lo correcto si no hay macro.
     */
    public static void habilitar(Context ctx, boolean si) {
        try {
            ctx.getPackageManager().setComponentEnabledSetting(
                    new ComponentName(ctx, BotonAuricularesActivity.class),
                    si ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                       : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP);
        } catch (Throwable t) {
            Log.w(TAG, "no se pudo cambiar el estado del receptor del botón", t);
        }
    }
}
