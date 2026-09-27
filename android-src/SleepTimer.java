package com.skippify.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Temporizador de escucha.
 *
 * Al agotarse el tiempo no corta en seco: espera a que termine la canción que
 * suena y pausa justo antes de que empiece la siguiente. Después, si se pidió,
 * suena un aviso corto y, por último, se apaga el Bluetooth.
 *
 * El estado vive en SharedPreferences para sobrevivir a que Android mate el
 * proceso: la cuenta atrás corre con un Handler (preciso mientras la música
 * mantiene la CPU despierta) y, de respaldo, con una alarma que vuelve a
 * levantar el proceso aunque el móvil esté en reposo.
 *
 * Bluetooth, según lo que permite Android:
 *  - Detectar si hay auriculares o altavoz conectado: sí, sin permisos, por las
 *    salidas de audio del AudioManager.
 *  - Apagar el Bluetooth: sólo hasta Android 12. Desde Android 13
 *    BluetoothAdapter.disable() siempre devuelve false para apps normales.
 *  - Desconectar un dispositivo concreto: no. BluetoothA2dp.disconnect() es API
 *    de sistema (BLUETOOTH_PRIVILEGED) y está fuera del alcance de una app.
 */
final class SleepTimer {

    private SleepTimer() {}

    private static final String TAG = "SkippifySleepTimer";
    private static final String PREFS = "skippify_sleep_timer";

    private static final String KEY_PHASE = "phase";
    private static final String KEY_END_AT = "endAt";
    private static final String KEY_SOUND = "sound";
    private static final String KEY_BLUETOOTH_OFF = "bluetoothOff";
    private static final String KEY_WAITING_TRACK = "waitingTrack";
    private static final String KEY_LAST_RESULT = "lastResult";
    private static final String KEY_LAST_FINISHED_AT = "lastFinishedAt";

    static final String PHASE_IDLE = "idle";
    /** Corre la cuenta atrás. */
    static final String PHASE_COUNTING = "counting";
    /** Tiempo agotado: se espera a que termine la canción. */
    static final String PHASE_WAITING = "waiting";
    /** Pausado; sonando el aviso o apagando el Bluetooth. */
    static final String PHASE_FINISHING = "finishing";

    static final String ACTION_ALARM = "com.skippify.app.action.SLEEP_TIMER";
    private static final int ALARM_REQUEST_CODE = 0x5BE1;

    /** Tope del wake lock: una canción muy larga más el cierre. */
    private static final long WAKE_LOCK_TIMEOUT_MS = 30L * 60L * 1000L;
    /** Latido máximo de la cuenta atrás: se relee el reloj al menos cada minuto. */
    private static final long MAX_COUNTDOWN_TICK_MS = 60_000L;

    private static final Handler sHandler = new Handler(Looper.getMainLooper());
    private static final Runnable sTick = SleepTimer::tickNow;
    private static volatile Context sAppContext;
    @Nullable private static PowerManager.WakeLock sWakeLock;
    /** Hay un hilo de cierre (aviso + Bluetooth) en curso. */
    private static volatile boolean sFinishing = false;
    /** Latidos seguidos sin el listener de Spotify enganchado. */
    private static int sNoServiceTicks = 0;
    /**
     * Cuánto se espera al listener tras agotarse el tiempo. Si el proceso se
     * levantó por la alarma, el listener tarda unos segundos en reengancharse,
     * y sin él se daría por hecho que no suena nada.
     */
    private static final int MAX_NO_SERVICE_TICKS = 20;

    // ── API para el plugin ────────────────────────────────────────────────────

    static synchronized void start(Context context, long durationMs, boolean sound, boolean bluetoothOff) {
        Context app = remember(context);
        long endAt = System.currentTimeMillis() + Math.max(60_000L, durationMs);
        prefs(app).edit()
                .putString(KEY_PHASE, PHASE_COUNTING)
                .putLong(KEY_END_AT, endAt)
                .putBoolean(KEY_SOUND, sound)
                .putBoolean(KEY_BLUETOOTH_OFF, bluetoothOff)
                .remove(KEY_WAITING_TRACK)
                .apply();
        scheduleAlarm(app, endAt);
        schedule(0L);
        notifyChanged();
    }

    /** Suma (o resta) tiempo a una cuenta atrás en marcha. */
    static synchronized void extend(Context context, long deltaMs) {
        Context app = remember(context);
        SharedPreferences p = prefs(app);
        if (!PHASE_COUNTING.equals(p.getString(KEY_PHASE, PHASE_IDLE))) return;
        long now = System.currentTimeMillis();
        long endAt = Math.max(now + 60_000L, p.getLong(KEY_END_AT, now) + deltaMs);
        p.edit().putLong(KEY_END_AT, endAt).apply();
        scheduleAlarm(app, endAt);
        schedule(0L);
        notifyChanged();
    }

    /** Cambia las opciones sin tocar la cuenta atrás. */
    static synchronized void setOptions(Context context, boolean sound, boolean bluetoothOff) {
        Context app = remember(context);
        prefs(app).edit()
                .putBoolean(KEY_SOUND, sound)
                .putBoolean(KEY_BLUETOOTH_OFF, bluetoothOff)
                .apply();
        notifyChanged();
    }

    static synchronized void cancel(Context context) {
        Context app = remember(context);
        sHandler.removeCallbacks(sTick);
        cancelAlarm(app);
        prefs(app).edit()
                .putString(KEY_PHASE, PHASE_IDLE)
                .remove(KEY_END_AT)
                .remove(KEY_WAITING_TRACK)
                .apply();
        releaseWakeLock();
        notifyChanged();
    }

    /**
     * Reengancha la cuenta atrás tras un reinicio del proceso o al saltar la
     * alarma. Llamarlo de más no cuesta nada: si no hay temporizador, sale.
     */
    static void resume(Context context) {
        remember(context);
        schedule(0L);
    }

    static JSONObject state(Context context) {
        Context app = remember(context);
        SharedPreferences p = prefs(app);
        JSONObject out = new JSONObject();
        try {
            out.put("phase", p.getString(KEY_PHASE, PHASE_IDLE));
            out.put("endAt", p.getLong(KEY_END_AT, 0L));
            out.put("sound", p.getBoolean(KEY_SOUND, false));
            out.put("bluetoothOff", p.getBoolean(KEY_BLUETOOTH_OFF, false));
            out.put("waitingTrack", p.getString(KEY_WAITING_TRACK, ""));
            out.put("lastResult", p.getString(KEY_LAST_RESULT, ""));
            out.put("lastFinishedAt", p.getLong(KEY_LAST_FINISHED_AT, 0L));
            out.put("now", System.currentTimeMillis());
        } catch (Throwable ignored) {
        }
        return out;
    }

    // ── Bucle ─────────────────────────────────────────────────────────────────

    private static void schedule(long delayMs) {
        sHandler.removeCallbacks(sTick);
        sHandler.postDelayed(sTick, Math.max(0L, delayMs));
    }

    private static void tickNow() {
        Context app = sAppContext;
        if (app == null) return;

        String phase;
        long endAt;
        String waitingKey;
        synchronized (SleepTimer.class) {
            SharedPreferences p = prefs(app);
            phase = p.getString(KEY_PHASE, PHASE_IDLE);
            endAt = p.getLong(KEY_END_AT, 0L);
            waitingKey = p.getString(KEY_WAITING_TRACK, "");
        }

        if (PHASE_COUNTING.equals(phase)) {
            long left = endAt - System.currentTimeMillis();
            if (left > 0L) {
                schedule(Math.min(left, MAX_COUNTDOWN_TICK_MS));
                return;
            }
            // Tiempo agotado: se apunta qué suena para reconocer el cambio de
            // canción, y se mantiene la CPU despierta hasta terminar.
            acquireWakeLock(app);
            SpotifyNotificationListener svc = SpotifyNotificationListener.sServiceInstance;
            waitingKey = svc != null && svc.isPlaying() ? trackKey(svc) : "";
            synchronized (SleepTimer.class) {
                prefs(app).edit()
                        .putString(KEY_PHASE, PHASE_WAITING)
                        .putString(KEY_WAITING_TRACK, waitingKey)
                        .apply();
            }
            cancelAlarm(app);
            notifyChanged();
            phase = PHASE_WAITING;
        }

        if (PHASE_FINISHING.equals(phase) && !sFinishing) {
            // El proceso murió a mitad del cierre: se da por terminado.
            synchronized (SleepTimer.class) {
                prefs(app).edit().putString(KEY_PHASE, PHASE_IDLE).apply();
            }
            notifyChanged();
            return;
        }

        if (!PHASE_WAITING.equals(phase)) return;

        acquireWakeLock(app);
        SpotifyNotificationListener svc = SpotifyNotificationListener.sServiceInstance;
        if (svc == null && sNoServiceTicks < MAX_NO_SERVICE_TICKS) {
            sNoServiceTicks++;
            schedule(1000L);
            return;
        }
        sNoServiceTicks = 0;
        SleepTimerDecision.Step step = svc == null
                ? SleepTimerDecision.next(waitingKey, "", false, 0L, -1L)
                : SleepTimerDecision.next(waitingKey, trackKey(svc), svc.isPlaying(),
                        svc.liveDurationMs(), svc.positionMs());

        switch (step.action) {
            case WAIT:
                schedule(step.delayMs);
                return;
            case PAUSE:
                if (svc != null) svc.pause();
                finish(app, true);
                return;
            case FINISH:
            default:
                finish(app, false);
        }
    }

    /**
     * Pausa hecha (o innecesaria): aviso y Bluetooth, en ese orden. Va en un
     * hilo propio porque el aviso se espera entero antes de cortar el Bluetooth:
     * si no, el sonido no llegaría a los auriculares.
     */
    private static void finish(Context app, boolean paused) {
        boolean sound;
        boolean bluetoothOff;
        synchronized (SleepTimer.class) {
            SharedPreferences p = prefs(app);
            sound = p.getBoolean(KEY_SOUND, false);
            bluetoothOff = p.getBoolean(KEY_BLUETOOTH_OFF, false);
            p.edit().putString(KEY_PHASE, PHASE_FINISHING).apply();
        }
        notifyChanged();

        sFinishing = true;
        new Thread(() -> {
            StringBuilder result = new StringBuilder(paused ? "paused" : "not_playing");
            try {
                if (sound) {
                    // Un respiro para que Spotify suelte el audio antes del aviso.
                    sleepQuietly(400L);
                    playChime(app);
                }
                if (bluetoothOff) {
                    result.append(disableBluetooth(app) ? ",bluetooth_off" : ",bluetooth_failed");
                }
            } catch (Throwable t) {
                Log.w(TAG, "cierre del temporizador incompleto", t);
            } finally {
                sFinishing = false;
                synchronized (SleepTimer.class) {
                    SharedPreferences p = prefs(app);
                    // Si mientras tanto se canceló o se puso otro temporizador,
                    // ese manda: no se le pisa el estado.
                    if (!PHASE_FINISHING.equals(p.getString(KEY_PHASE, PHASE_IDLE))) {
                        releaseWakeLock();
                        notifyChanged();
                        return;
                    }
                    p.edit()
                            .putString(KEY_PHASE, PHASE_IDLE)
                            .remove(KEY_END_AT)
                            .remove(KEY_WAITING_TRACK)
                            .putString(KEY_LAST_RESULT, result.toString())
                            .putLong(KEY_LAST_FINISHED_AT, System.currentTimeMillis())
                            .apply();
                }
                releaseWakeLock();
                notifyChanged();
            }
        }, "skippify-sleep-timer").start();
    }

    private static String trackKey(SpotifyNotificationListener svc) {
        String track = svc.liveTrack();
        if (track == null || track.isEmpty()) return "";
        String artist = svc.liveArtist();
        return track + "|" + (artist == null ? "" : artist);
    }

    // ── Aviso sonoro ──────────────────────────────────────────────────────────

    /**
     * Dos notas suaves (la – mi) sintetizadas al vuelo, sin ficheros de audio.
     * Sale por el canal multimedia, así que suena en los auriculares al volumen
     * de la música, que es donde lo va a oír quien se está durmiendo.
     *
     * Bloquea hasta que termina.
     */
    static void playChime(Context context) {
        final int rate = 44_100;
        final double[] notes = {440.0, 659.25};
        final double noteSeconds = 0.55;
        final int perNote = (int) (rate * noteSeconds);
        short[] pcm = new short[perNote * notes.length];

        for (int n = 0; n < notes.length; n++) {
            for (int i = 0; i < perNote; i++) {
                double t = i / (double) rate;
                double attack = Math.min(1.0, t / 0.015);
                double decay = Math.exp(-t * 5.0);
                double tone = Math.sin(2 * Math.PI * notes[n] * t)
                        + 0.25 * Math.sin(4 * Math.PI * notes[n] * t);
                pcm[n * perNote + i] = (short) (tone / 1.25 * attack * decay * 0.4 * Short.MAX_VALUE);
            }
        }

        AudioTrack track = null;
        try {
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            AudioFormat format = new AudioFormat.Builder()
                    .setSampleRate(rate)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build();
            track = new AudioTrack(attrs, format, pcm.length * 2,
                    AudioTrack.MODE_STATIC, AudioManager.AUDIO_SESSION_ID_GENERATE);
            track.write(pcm, 0, pcm.length);
            track.play();
            sleepQuietly((long) (noteSeconds * notes.length * 1000) + 250L);
        } catch (Throwable t) {
            Log.w(TAG, "no se pudo reproducir el aviso", t);
        } finally {
            if (track != null) {
                try { track.stop(); } catch (Throwable ignored) {}
                try { track.release(); } catch (Throwable ignored) {}
            }
        }
    }

    // ── Bluetooth ─────────────────────────────────────────────────────────────

    /** Android 13 (API 33) cerró BluetoothAdapter.disable() a las apps normales. */
    static boolean platformAllowsDisable() {
        return Build.VERSION.SDK_INT < 33;
    }

    /** En Android 12 apagarlo exige el permiso «Dispositivos cercanos». */
    static boolean needsConnectPermission(Context context) {
        if (Build.VERSION.SDK_INT < 31 || Build.VERSION.SDK_INT >= 33) return false;
        return ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED;
    }

    static JSONObject bluetoothInfo(Context context) {
        Context app = remember(context);
        JSONObject out = new JSONObject();
        try {
            BluetoothAdapter adapter = adapter(app);
            out.put("supported", adapter != null);
            out.put("androidVersion", Build.VERSION.RELEASE);
            out.put("sdk", Build.VERSION.SDK_INT);
            out.put("enabled", isEnabled(adapter));
            out.put("canDisable", adapter != null && platformAllowsDisable());
            out.put("needsPermission", needsConnectPermission(app));
            // Desconectar un dispositivo concreto no lo permite ninguna versión.
            out.put("canDisconnectDevice", false);

            JSONArray devices = new JSONArray();
            for (String name : connectedAudioDevices(app)) devices.put(name);
            out.put("connectedDevices", devices);
        } catch (Throwable ignored) {
        }
        return out;
    }

    private static boolean isEnabled(@Nullable BluetoothAdapter adapter) {
        try {
            return adapter != null && adapter.isEnabled();
        } catch (Throwable ignored) {
            return false;
        }
    }

    /**
     * Auriculares o altavoces Bluetooth por los que puede salir el audio ahora
     * mismo. Se miran las salidas del AudioManager y no el BluetoothManager
     * porque así no hace falta ningún permiso y cuenta justo lo que importa:
     * dónde suena la música.
     */
    static List<String> connectedAudioDevices(Context context) {
        List<String> names = new ArrayList<>();
        if (Build.VERSION.SDK_INT < 23) return names;
        try {
            AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return names;
            for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
                int type = d.getType();
                boolean bluetooth = type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP
                        || type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
                        || type == 26  // TYPE_BLE_HEADSET (API 31)
                        || type == 27; // TYPE_BLE_SPEAKER (API 31)
                if (!bluetooth) continue;
                CharSequence product = d.getProductName();
                String name = product == null ? "" : product.toString().trim();
                if (name.isEmpty()) name = "Dispositivo Bluetooth";
                // A2DP y SCO del mismo auricular salen como dos salidas.
                if (!names.contains(name)) names.add(name);
            }
        } catch (Throwable ignored) {
        }
        return names;
    }

    @SuppressWarnings("deprecation")
    private static boolean disableBluetooth(Context context) {
        if (!platformAllowsDisable() || needsConnectPermission(context)) return false;
        try {
            BluetoothAdapter adapter = adapter(context);
            if (adapter == null) return false;
            if (!adapter.isEnabled()) return true;
            return adapter.disable();
        } catch (Throwable t) {
            Log.w(TAG, "no se pudo apagar el Bluetooth", t);
            return false;
        }
    }

    @Nullable
    @SuppressWarnings("deprecation")
    private static BluetoothAdapter adapter(Context context) {
        try {
            if (Build.VERSION.SDK_INT >= 18) {
                BluetoothManager bm = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
                if (bm != null) return bm.getAdapter();
            }
            return BluetoothAdapter.getDefaultAdapter();
        } catch (Throwable ignored) {
            return null;
        }
    }

    // ── Alarma de respaldo ────────────────────────────────────────────────────

    /**
     * Alarma inexacta pero permitida en reposo: no pide el permiso de alarmas
     * exactas. Si el móvil duerme es que no suena música, y unos minutos de
     * retraso sólo afectan a cuándo se apaga el Bluetooth.
     */
    private static void scheduleAlarm(Context context, long endAt) {
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            PendingIntent pi = alarmIntent(context);
            if (Build.VERSION.SDK_INT >= 23) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endAt, pi);
            } else {
                am.set(AlarmManager.RTC_WAKEUP, endAt, pi);
            }
        } catch (Throwable ignored) {
        }
    }

    private static void cancelAlarm(Context context) {
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am != null) am.cancel(alarmIntent(context));
        } catch (Throwable ignored) {
        }
    }

    private static PendingIntent alarmIntent(Context context) {
        Intent intent = new Intent(context, BootCompletedReceiver.class);
        intent.setAction(ACTION_ALARM);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(context, ALARM_REQUEST_CODE, intent, flags);
    }

    // ── Utilidades ────────────────────────────────────────────────────────────

    private static Context remember(Context context) {
        Context app = context.getApplicationContext();
        sAppContext = app;
        return app;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static synchronized void acquireWakeLock(Context context) {
        if (sWakeLock != null && sWakeLock.isHeld()) return;
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            sWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "skippify:sleeptimer");
            sWakeLock.setReferenceCounted(false);
            sWakeLock.acquire(WAKE_LOCK_TIMEOUT_MS);
        } catch (Throwable ignored) {
        }
    }

    private static synchronized void releaseWakeLock() {
        try {
            if (sWakeLock != null && sWakeLock.isHeld()) sWakeLock.release();
        } catch (Throwable ignored) {
        }
        sWakeLock = null;
    }

    private static void notifyChanged() {
        Context app = sAppContext;
        if (app == null) return;
        NotifListenerPlugin.notifySleepTimerChanged(state(app));
    }

    private static void sleepQuietly(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
