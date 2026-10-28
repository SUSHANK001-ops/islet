# Verifies the island window is actually SHAPED by SetWindowRgn.
#
# WHY this script exists: the notch lives in one fixed 640x720 transparent
# window. If that window has no region, the whole rectangle swallows clicks and
# hover at the top of the screen, which is invisible to look at but very
# noticeable to use. GetWindowRgnBox reports the bounding box of a window's
# region, or 0 (ERROR) when the window has none - so it tells us directly
# whether the fix is live, without needing to eyeball anything.
#
# Usage: run while Islet is running.  pwsh -File scripts/check-hit-region.ps1

$ErrorActionPreference = "Stop"

Add-Type @"
using System;
using System.Runtime.InteropServices;
public struct RECT { public int Left, Top, Right, Bottom; }
public class W {
  [DllImport("user32.dll")] public static extern int GetWindowRgnBox(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
}
"@

$proc = Get-Process -Name islet -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1

if (-not $proc) {
  Write-Host "Islet is not running (or has no top-level window yet)." -ForegroundColor Yellow
  exit 1
}

$hwnd = $proc.MainWindowHandle
$win = New-Object RECT
$rgn = New-Object RECT
[void][W]::GetWindowRect($hwnd, [ref]$win)
$result = [W]::GetWindowRgnBox($hwnd, [ref]$rgn)

$winW = $win.Right - $win.Left
$winH = $win.Bottom - $win.Top
Write-Host "Window rect : $winW x $winH  at ($($win.Left),$($win.Top))"

# GetWindowRgnBox returns NULLREGION(1)/SIMPLEREGION(2)/COMPLEXREGION(3), or 0 on error.
if ($result -eq 0) {
  Write-Host "Window region: NONE" -ForegroundColor Red
  Write-Host "  => the full $winW x $winH window is catching clicks. Fix is NOT active." -ForegroundColor Red
  exit 2
}

$rgnW = $rgn.Right - $rgn.Left
$rgnH = $rgn.Bottom - $rgn.Top
$kind = @{ 1 = "NULLREGION"; 2 = "SIMPLEREGION"; 3 = "COMPLEXREGION" }[$result]
Write-Host "Window region: $kind  $rgnW x $rgnH  at offset ($($rgn.Left),$($rgn.Top))" -ForegroundColor Green

$winArea = [double]($winW * $winH)
$rgnArea = [double]($rgnW * $rgnH)
$pct = if ($winArea -gt 0) { [math]::Round(100.0 * $rgnArea / $winArea, 1) } else { 0 }
Write-Host "  => clickable bounding box is $pct% of the window." -ForegroundColor Green
Write-Host "     The other $([math]::Round(100 - $pct,1))% now passes clicks through to the apps behind it."
