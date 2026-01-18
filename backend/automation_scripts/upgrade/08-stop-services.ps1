$ErrorActionPreference = "Stop"

try {
    Write-Host "Discovering backend services..."

    # Discover backend services dynamically
    # Only Windows services related to IConduct backend
    $serviceNames = Get-Service |
        Where-Object {
            $_.Name -match 'IConduct|Gateway|Metadata|DataBus|Scheduler|Repository|Noti|Nats|license'
        } |
        Select-Object -ExpandProperty Name

    if (-not $serviceNames -or $serviceNames.Count -eq 0) {
        Write-Error "No backend services found to stop"
        exit 1
    }

    Write-Host "Found $($serviceNames.Count) backend services"
}
catch {
    Write-Error "Failed to discover backend services - $($_.Exception.Message)"
    exit 1
}

try {
    $stoppedCount = 0

    Write-Host "`nStopping $($serviceNames.Count) services..."

    # STEP 1: Kill all ServIT.IConduct.WinService.exe processes FIRST
    Write-Host "`nKilling ServIT.IConduct.WinService.exe processes..."
    $processes = Get-Process -Name "ServIT.IConduct.WinService" -ErrorAction SilentlyContinue

    if ($processes) {
        foreach ($process in $processes) {
            try {
                Stop-Process -Id $process.Id -Force
                Write-Host "Killed process: ServIT.IConduct.WinService (PID $($process.Id))"
            }
            catch {
                Write-Host "Could not kill process PID $($process.Id) - $($_.Exception.Message)"
            }
        }
        Start-Sleep -Seconds 2
    }
    else {
        Write-Host "No ServIT.IConduct.WinService processes found"
    }

    # STEP 2: Stop services in REVERSE order
    Write-Host "`nStopping services..."

    $reverseOrder = @(
        "*Gateway*",
        "*MetadataAPI*",
        "*Cloud*Agent*0*",
        "*license-service*",
        "*DataBus*",
        "IConductService01",
        "IConductService02",
        "*Scheduler*Storage*",
        "*Repository*",
        "*Noti*",
        "*Nats*"
    )

    foreach ($pattern in $reverseOrder) {
        $matchingServices = $serviceNames | Where-Object { $_ -like $pattern }

        foreach ($serviceName in $matchingServices) {
            try {
                $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

                if ($service) {
                    if ($service.Status -eq 'Running') {
                        Write-Host "Stopping service $($serviceName)"
                        Stop-Service -Name $serviceName -Force -ErrorAction Stop

                        # Wait up to 30 seconds
                        $timeout = 30
                        $elapsed = 0
                        $service.Refresh()

                        while ($service.Status -ne 'Stopped' -and $elapsed -lt $timeout) {
                            Start-Sleep -Seconds 2
                            $elapsed += 2
                            $service.Refresh()
                        }

                        if ($service.Status -eq 'Stopped') {
                            Write-Host "Stopped service $($serviceName)"
                            $stoppedCount++
                        }
                        else {
                            Write-Host "WARNING: Service $($serviceName) did not stop, forcing..."
                            $serviceProcess = Get-WmiObject -Class Win32_Service -Filter "Name='$serviceName'" |
                                Select-Object -ExpandProperty ProcessId

                            if ($serviceProcess -and $serviceProcess -gt 0) {
                                Stop-Process -Id $serviceProcess -Force -ErrorAction SilentlyContinue
                                Write-Host "Force killed process for service $($serviceName) (PID $serviceProcess)"
                                Start-Sleep -Seconds 2
                            }

                            $stoppedCount++
                        }

                        Start-Sleep -Seconds 5
                    }
                    else {
                        Write-Host "Service already stopped $($serviceName)"
                    }
                }
                else {
                    Write-Host "Service not found $($serviceName)"
                }
            }
            catch {
                Write-Host "Failed to stop service $($serviceName) - $($_.Exception.Message)"
            }
        }
    }

    # STEP 3: Final cleanup - kill remaining zombie processes
    Start-Sleep -Seconds 2
    $remainingProcesses = Get-Process -Name "ServIT.IConduct.WinService" -ErrorAction SilentlyContinue

    if ($remainingProcesses) {
        foreach ($process in $remainingProcesses) {
            Stop-Process -Id $process.Id -Force
            Write-Host "Killed remaining zombie process ServIT.IConduct.WinService (PID $($process.Id))"
        }
    }

    Write-Host "`nStopped $stoppedCount service(s) and killed all zombie processes"
}
catch {
    Write-Error "Failed to stop services - $($_.Exception.Message)"
    exit 1
}
