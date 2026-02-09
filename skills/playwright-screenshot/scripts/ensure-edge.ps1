<#
.SYNOPSIS
    Ensure Edge is running with debug port 9222
.DESCRIPTION
    Checks if Edge debug port is available. If not, kills existing Edge and restarts with debug port.
#>

$DebugPort = 9222
$EdgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

function Test-DebugPort {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$DebugPort/json/version" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

# Check if debug port is already available
if (Test-DebugPort) {
    Write-Host "[OK] Edge debug port $DebugPort is already available" -ForegroundColor Green
    exit 0
}

Write-Host "[INFO] Debug port not available, restarting Edge..." -ForegroundColor Yellow

# Kill existing Edge processes
Write-Host "[INFO] Killing existing Edge processes..."
$edgeProcesses = Get-Process -Name "msedge" -ErrorAction SilentlyContinue
if ($edgeProcesses) {
    $edgeProcesses | Stop-Process -Force
    Start-Sleep -Seconds 2
    Write-Host "[OK] Killed $($edgeProcesses.Count) Edge processes" -ForegroundColor Green
} else {
    Write-Host "[INFO] No Edge processes found"
}

# Start Edge with debug port
Write-Host "[INFO] Starting Edge with debug port $DebugPort..."
Start-Process -FilePath $EdgePath -ArgumentList "--remote-debugging-port=$DebugPort"
Start-Sleep -Seconds 3

# Verify
if (Test-DebugPort) {
    Write-Host "[OK] Edge started successfully with debug port $DebugPort" -ForegroundColor Green
    exit 0
} else {
    Write-Host "[ERROR] Failed to start Edge with debug port" -ForegroundColor Red
    exit 1
}
