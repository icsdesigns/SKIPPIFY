package com.skippify.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.service.notification.NotificationListenerService;
import android.content.ComponentName;

/**
 * Relanza el servicio en primer plano tras un reinicio o una actualización del
 * paquete.
 *
 * Está exportado porque así lo exige recibir BOOT_COMPLETED, así que SÓLO
 * atiende las acciones protegidas del sistema (que ninguna otra app puede
 * enviar). Las alarmas internas (vigilancia, temporizador, avisos, latido de
 * los grupos) llegan a {@link AlarmasReceiver}, que no está exportado: otra
 * app instalada ya no puede dispararlas.
 */
public class BootCompletedReceiver extends BroadcastReceiver {

    static final String ACTION_WATCHDOG = "com.skippify.app.action.WATCHDOG";
    /** Latido de seguridad de los grupos sin servidor (ver LocalHostBackground). */
    static final String ACTION_LH_LATIDO = "com.skippify.app.action.LH_LATIDO";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;

        String action = intent.getAction();
        boolean shouldStart = Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action);

        if (!shouldStart) return;
        relanzar(context, false);
    }

    /** Arranca el servicio y repone las alarmas. También lo usa la vigilancia. */
    static void relanzar(Context context, boolean vigilancia) {
        Context appContext = context.getApplicationContext();
        SkippifyForegroundService.start(appContext, vigilancia);
        // Un temporizador puesto antes de reiniciar o de actualizar sigue vivo.
        SleepTimer.resume(appContext);
        // Y las de los grupos: el aviso de los domingos y el latido de la
        // sincronización (si hay grupos; si no, no hacen nada).
        try {
            AvisoSemanaGrupos.latido(appContext);
            LocalHostBackground.latido(appContext);
        } catch (Throwable ignored) {
        }

        // Una versión nueva retenida por el plazo de 6 h conserva su alarma.
        try {
            UpdateChecker.reponerAlarma(appContext);
        } catch (Throwable ignored) {
        }

        // Algunos OEMs sueltan el NotificationListenerService bajo presión de
        // memoria y no lo vuelven a enlazar solos. Pedirlo es barato y es la
        // única forma de recuperar la detección sin que el usuario entre en los
        // ajustes del sistema.
        try {
            NotificationListenerService.requestRebind(
                    new ComponentName(appContext, SpotifyNotificationListener.class)
            );
        } catch (Throwable ignored) {
        }
    }
}
