package uy.grupomuros.etiquetador;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.UUID;

/**
 * Impresora de etiquetas por Bluetooth clásico (puerto serie, SPP): lista las impresoras emparejadas,
 * se conecta a una y le manda los comandos TSPL que arma la app. Funciona con la Unnion LP4206D
 * y con cualquier impresora de etiquetas que entienda TSPL.
 */
@CapacitorPlugin(
    name = "ImpresoraBT",
    permissions = {
        @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN }, alias = "bluetooth")
    }
)
public class ImpresoraBTPlugin extends Plugin {
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private BluetoothSocket socket;
    private OutputStream salida;
    private String conectadaA = null;
    private String nombreConectada = null;

    private BluetoothAdapter adaptador() {
        BluetoothManager m = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    /** Android 12 o más pide permiso para usar el Bluetooth; antes alcanza con lo que dice el manifiesto. */
    private boolean conPermiso() {
        return Build.VERSION.SDK_INT < 31 || getPermissionState("bluetooth") == PermissionState.GRANTED;
    }

    private boolean pedirPermiso(PluginCall call, String despues) {
        if (conPermiso()) return false;
        requestPermissionForAlias("bluetooth", call, despues);
        return true;
    }

    @PermissionCallback
    private void despuesDePermisoListar(PluginCall call) {
        if (conPermiso()) hacerListar(call); else call.reject("Para imprimir hay que dar permiso de «Dispositivos cercanos» (Bluetooth).", "SIN_PERMISO");
    }

    @PermissionCallback
    private void despuesDePermisoConectar(PluginCall call) {
        if (conPermiso()) hacerConectar(call); else call.reject("Para imprimir hay que dar permiso de «Dispositivos cercanos» (Bluetooth).", "SIN_PERMISO");
    }

    @PluginMethod
    public void listar(PluginCall call) {
        if (pedirPermiso(call, "despuesDePermisoListar")) return;
        hacerListar(call);
    }

    @SuppressLint("MissingPermission")
    private void hacerListar(PluginCall call) {
        BluetoothAdapter a = adaptador();
        if (a == null) { call.reject("Este celular no tiene Bluetooth.", "SIN_BLUETOOTH"); return; }
        if (!a.isEnabled()) { call.reject("Prendé el Bluetooth del celular.", "APAGADO"); return; }
        JSArray lista = new JSArray();
        for (BluetoothDevice d : a.getBondedDevices()) {
            JSObject o = new JSObject();
            o.put("nombre", d.getName() == null ? d.getAddress() : d.getName());
            o.put("direccion", d.getAddress());
            lista.put(o);
        }
        JSObject r = new JSObject();
        r.put("dispositivos", lista);
        call.resolve(r);
    }

    @PluginMethod
    public void conectar(PluginCall call) {
        if (pedirPermiso(call, "despuesDePermisoConectar")) return;
        hacerConectar(call);
    }

    @SuppressLint("MissingPermission")
    private void hacerConectar(PluginCall call) {
        final String direccion = call.getString("direccion");
        if (direccion == null || direccion.isEmpty()) { call.reject("Falta la impresora."); return; }
        final BluetoothAdapter a = adaptador();
        if (a == null) { call.reject("Este celular no tiene Bluetooth.", "SIN_BLUETOOTH"); return; }
        if (!a.isEnabled()) { call.reject("Prendé el Bluetooth del celular.", "APAGADO"); return; }
        new Thread(() -> {
            cerrar();
            try {
                BluetoothDevice d = a.getRemoteDevice(direccion);
                a.cancelDiscovery();
                BluetoothSocket s;
                try {
                    s = d.createRfcommSocketToServiceRecord(SPP);
                    s.connect();
                } catch (IOException primero) {
                    // Algunas impresoras solo aceptan la conexión «insegura» o por el canal 1
                    try {
                        s = d.createInsecureRfcommSocketToServiceRecord(SPP);
                        s.connect();
                    } catch (IOException segundo) {
                        Method m = d.getClass().getMethod("createRfcommSocket", int.class);
                        s = (BluetoothSocket) m.invoke(d, 1);
                        s.connect();
                    }
                }
                socket = s;
                salida = s.getOutputStream();
                conectadaA = direccion;
                nombreConectada = d.getName();
                JSObject r = new JSObject();
                r.put("direccion", direccion);
                r.put("nombre", nombreConectada);
                call.resolve(r);
            } catch (Exception e) {
                cerrar();
                call.reject("No se pudo conectar con la impresora. ¿Está prendida y cerca?", "NO_CONECTA");
            }
        }).start();
    }

    @PluginMethod
    public void escribir(PluginCall call) {
        final String datos = call.getString("datos");
        if (datos == null) { call.reject("No hay nada para imprimir."); return; }
        if (salida == null) { call.reject("La impresora no está conectada.", "DESCONECTADA"); return; }
        new Thread(() -> {
            try {
                byte[] b = Base64.decode(datos, Base64.DEFAULT);
                // De a pedazos: algunas impresoras pierden datos si se manda todo junto
                for (int i = 0; i < b.length; i += 512) {
                    salida.write(b, i, Math.min(512, b.length - i));
                    salida.flush();
                    Thread.sleep(15);
                }
                call.resolve();
            } catch (Exception e) {
                cerrar();
                call.reject("Se cortó la conexión con la impresora. Volvé a conectarla.", "DESCONECTADA");
            }
        }).start();
    }

    @PluginMethod
    public void desconectar(PluginCall call) {
        cerrar();
        call.resolve();
    }

    @PluginMethod
    public void estado(PluginCall call) {
        JSObject r = new JSObject();
        r.put("conectada", socket != null && socket.isConnected());
        r.put("direccion", conectadaA);
        r.put("nombre", nombreConectada);
        call.resolve(r);
    }

    private synchronized void cerrar() {
        try { if (salida != null) salida.close(); } catch (IOException ignorado) { }
        try { if (socket != null) socket.close(); } catch (IOException ignorado) { }
        salida = null;
        socket = null;
        conectadaA = null;
        nombreConectada = null;
    }

    @Override
    protected void handleOnDestroy() {
        cerrar();
    }
}
