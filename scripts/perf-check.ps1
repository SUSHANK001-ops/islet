# perf-check: measure Islet's CPU and memory over a window, closed and open.
# AGENTS.md: run 5 min closed and 5 min open, record CPU + memory, fail if a
# budget is broken. This is the spike-level skeleton: it measures the running
# process tree and prints a report. Wire the pass/fail gates once the spike has
# produced real baseline numbers.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/perf-check.ps1 -Minutes 5
#
# Note: launch the app yourself first (npm run tauri dev, or the built exe),
# then run this. It finds the Islet process tree by name.

param(
    [int]$Minutes = 5,
    [string]$ProcessName = "islet"
)

$budgetMemClosedMB = 80
$budgetMemOpenMB = 130
$budgetCpuClosed = 0.3
$budgetCpuOpen = 2.0

Write-Host "Islet perf-check: sampling '$ProcessName' for $Minutes minute(s)..."

$proc = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
if (-not $proc) {
    Write-Error "No process named '$ProcessName' found. Start the app first."
    exit 1
}

$samples = @()
$cpuCount = [Environment]::ProcessorCount
$endTime = (Get-Date).AddMinutes($Minutes)
$prevCpu = ($proc | Measure-Object -Property CPU -Sum).Sum
$prevTime = Get-Date

while ((Get-Date) -lt $endTime) {
    Start-Sleep -Seconds 2
    $proc = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
    if (-not $proc) { break }

    $now = Get-Date
    $cpuNow = ($proc | Measure-Object -Property CPU -Sum).Sum
    $wallSec = ($now - $prevTime).TotalSeconds
    $cpuPct = if ($wallSec -gt 0) { (($cpuNow - $prevCpu) / $wallSec / $cpuCount) * 100 } else { 0 }
    $memMB = (($proc | Measure-Object -Property WorkingSet64 -Sum).Sum) / 1MB

    $samples += [pscustomobject]@{ CpuPct = [math]::Round($cpuPct, 3); MemMB = [math]::Round($memMB, 1) }
    $prevCpu = $cpuNow
    $prevTime = $now
}

if ($samples.Count -eq 0) {
    Write-Error "No samples collected."
    exit 1
}

$avgCpu = [math]::Round(($samples | Measure-Object -Property CpuPct -Average).Average, 3)
$maxMem = [math]::Round(($samples | Measure-Object -Property MemMB -Maximum).Maximum, 1)

Write-Host ""
Write-Host "Samples: $($samples.Count)"
Write-Host "Average CPU: $avgCpu %"
Write-Host "Peak memory (process tree working set): $maxMem MB"
Write-Host ""
Write-Host "Budgets (fill the correct column in docs/perf-results.md):"
Write-Host "  CPU closed < $budgetCpuClosed % | CPU open < $budgetCpuOpen %"
Write-Host "  Mem closed <= $budgetMemClosedMB MB | Mem open <= $budgetMemOpenMB MB"
Write-Host ""
Write-Host "Record these numbers in docs/perf-results.md."
