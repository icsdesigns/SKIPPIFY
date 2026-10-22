package com.skippify.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Puente entre la app y {@link LocalHostBackground}: JS dice si hay grupos sin
 * servidor (`configure`) y pide el paso antes de tocarlos (`acquire`).
 */
@CapacitorPlugin(name = "LocalHostBg")
public class LocalHostBgPlugin extends Plugin {

    @PluginMethod
    public void configure(PluginCall call) {
        boolean activo = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        LocalHostBackground.configurar(getContext(), activo);
        call.resolve();
    }

    /** Resuelve cuando el servicio ya no escribe; `bgRan` dice si llegó a hacerlo. */
    @PluginMethod
    public void acquire(final PluginCall call) {
        LocalHostBackground.adquirir(new LocalHostBackground.Respuesta() {
            @Override
            public void hecho(boolean haEscrito) {
                JSObject o = new JSObject();
                o.put("bgRan", haEscrito);
                call.resolve(o);
            }
        });
    }
}
