package uy.grupomuros.etiquetador;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // La impresora por Bluetooth es un complemento propio de la app (ver ImpresoraBTPlugin)
        registerPlugin(ImpresoraBTPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
