$projectRoot = "C:\Users\eu\Documents\New project\microfinance-app"
$nodeExe = "C:\Program Files\nodejs\node.exe"
$appUrl = "http://localhost:3100"
$healthUrl = "$appUrl/api/source"

function Test-AppReady {
  try {
    $response = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

if (-not (Test-AppReady)) {
  Start-Process -FilePath $nodeExe -ArgumentList "server.mjs" -WorkingDirectory $projectRoot -WindowStyle Hidden

  for ($index = 0; $index -lt 20; $index++) {
    Start-Sleep -Seconds 1
    if (Test-AppReady) {
      break
    }
  }
}

Start-Process $appUrl
