package com.skippify.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Alarmas internas de Skippify. NO está exportado (`android:exported="false"`):
 * sólo lo alcanzan los PendingIntent explícitos de la propia app, así que otra
 * app instalada no puede arrancar el servicio, el temporizador ni los avisos.
 *
 * Antes estas acciones las atendía BootCompletedReceiver, que tiene que estar
 * exportado para recibir el arranque del sistema.
 */
public class AlarmasReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String action = intent.getAction();

        // Alarma de respaldo del temporizador de escucha: levanta el proceso si
        // Android lo había matado y reengancha la cuenta atrás.
        if (SleepTimer.ACTION_ALARM.equals(action)) {
            SleepTimer.resume(context);
            return;
        }

        // El domingo a media tarde: avisar de que se acaba la semana de los grupos.
        if (AvisoSemanaGrupos.ACTION_ALARMA.equals(action)) {
            AvisoSemanaGrupos.alSonar(context, goAsync());
            return;
        }

        // Han pasado 6 horas desde que se publicó una versión nueva: avisar.
        if (UpdateChecker.ACTION_ALARMA.equals(action)) {
            UpdateChecker.alSonar(context, goAsync());
            return;
        }

        // Latido de seguridad de la sincronización de los grupos.
        if (BootCompletedReceiver.ACTION_LH_LATIDO.equals(action)) {
            LocalHostBackground.alLatido(context, goAsync());
            return;
        }

        // Vigilancia periódica: reafirma el servicio en primer plano.
        if (BootCompletedReceiver.ACTION_WATCHDOG.equals(action)) {
            BootCompletedReceiver.relanzar(context, true);
        }
    }
}
