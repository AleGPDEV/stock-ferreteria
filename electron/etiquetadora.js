// Manda comandos TSPL «en crudo» a una impresora de Windows (sin pasar por el tamaño de papel del driver).
// Así la etiqueta sale igual que desde el celular: la impresora de etiquetas la dibuja ella misma.
// Usa la cola de impresión de Windows (winspool.drv) con un pequeño programa en C# que compila PowerShell.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ImpresoraCruda {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool OpenPrinter(string nombre, out IntPtr h, IntPtr def);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] static extern int StartDocPrinter(IntPtr h, int nivel, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr h, byte[] datos, int n, out int escritos);
  public static string Mandar(string impresora, byte[] datos) {
    IntPtr h;
    if (!OpenPrinter(impresora, out h, IntPtr.Zero)) return "No se encontró la impresora (" + Marshal.GetLastWin32Error() + ")";
    try {
      DOCINFO di = new DOCINFO(); di.pDocName = "Etiquetas Grupo Muros"; di.pDataType = "RAW";
      if (StartDocPrinter(h, 1, di) == 0) return "La impresora no aceptó el trabajo (" + Marshal.GetLastWin32Error() + ")";
      try {
        StartPagePrinter(h);
        int escritos;
        bool ok = WritePrinter(h, datos, datos.Length, out escritos);
        EndPagePrinter(h);
        if (!ok || escritos != datos.Length) return "No se pudo mandar todo a la impresora (" + Marshal.GetLastWin32Error() + ")";
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
    return "";
  }
}
"@
$r = [ImpresoraCruda]::Mandar($env:ETQ_IMPRESORA, [System.IO.File]::ReadAllBytes($env:ETQ_ARCHIVO))
if ($r) { [Console]::Out.Write($r); exit 2 }
[Console]::Out.Write('OK')
`;

/** Manda el texto TSPL a la impresora. Devuelve null si salió bien, o el error en palabras. */
function imprimirCrudo(impresora, tspl) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve('Esto funciona solo en Windows.');
    const nombre = String(impresora || '').trim();
    if (!nombre) return resolve('Elegí la impresora de etiquetas.');
    const texto = String(tspl || '');
    if (!texto || texto.length > 5e6) return resolve('No hay etiquetas para imprimir.');
    const archivo = path.join(os.tmpdir(), `etiquetas-${process.pid}-${Date.now()}.prn`);
    try { fs.writeFileSync(archivo, Buffer.from(texto, 'latin1')); } catch (e) { return resolve('No se pudo preparar la impresión: ' + e.message); }
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT], {
      windowsHide: true, timeout: 60000, env: { ...process.env, ETQ_IMPRESORA: nombre, ETQ_ARCHIVO: archivo },
    }, (err, stdout, stderr) => {
      try { fs.unlinkSync(archivo); } catch (e) { /* nada */ }
      const salida = String(stdout || '').trim();
      if (salida === 'OK') return resolve(null);
      resolve(salida || (err && err.killed ? 'La impresora no contestó a tiempo.' : 'No se pudo imprimir: ' + String(stderr || (err && err.message) || '').split('\n')[0]));
    });
  });
}

module.exports = { imprimirCrudo };
