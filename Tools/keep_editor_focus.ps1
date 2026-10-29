# Mantiene el foco de Windows en la ventana del editor Unreal.
# Necesario para la telemetria de percepcion: sin foco, UEditorEngine::GetMaxTickRate()
# devuelve 3.0f y el mundo de PIE avanza en cuantos de 333.3 ms.
param([int]$Seconds = 420, [int]$IntervalMs = 300)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class UnrealFocus {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, int extra);
}
"@

$proc = Get-Process UnrealEditor -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) { Write-Output "SIN EDITOR"; exit 1 }
$h = $proc.MainWindowHandle
Write-Output "guardian de foco -> handle $h durante ${Seconds}s"

$me = [UnrealFocus]::GetCurrentThreadId()
$deadline = (Get-Date).AddSeconds($Seconds)
$fixes = 0
while ((Get-Date) -lt $deadline) {
    $fg = [UnrealFocus]::GetForegroundWindow()
    if ($fg -ne $h) {
        $tf = [UnrealFocus]::GetWindowThreadProcessId($fg, [IntPtr]::Zero)
        [UnrealFocus]::keybd_event(0x12, 0, 0, 0)
        [UnrealFocus]::AttachThreadInput($me, $tf, $true) | Out-Null
        [UnrealFocus]::BringWindowToTop($h) | Out-Null
        [UnrealFocus]::SetForegroundWindow($h) | Out-Null
        [UnrealFocus]::AttachThreadInput($me, $tf, $false) | Out-Null
        [UnrealFocus]::keybd_event(0x12, 0, 2, 0)
        $fixes++
    }
    Start-Sleep -Milliseconds $IntervalMs
}
Write-Output "guardian fin: $fixes reenfoques"
