# Crea (o actualiza) la tarea programada que genera la cartelera desde este PC
# cada 3 horas, para que Yelmo y Cinesa estén en la web y en la app.
#   powershell -ExecutionPolicy Bypass -File scripts\instalar-tarea-pc.ps1
# Para quitarla:
#   Unregister-ScheduledTask -TaskName "CineValencia - cartelera desde PC" -Confirm:$false

$lanzador = Join-Path $PSScriptRoot "datos-pc-oculto.vbs"
$accion = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$lanzador`""
$disparador = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) `
  -RepetitionInterval (New-TimeSpan -Hours 3)
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName "CineValencia - cartelera desde PC" `
  -Description "Genera la cartelera de CineValencia (incluidos Yelmo y Cinesa) y la sube a GitHub" `
  -Action $accion -Trigger $disparador -Settings $ajustes -Force | Out-Null

Get-ScheduledTask -TaskName "CineValencia - cartelera desde PC" |
  Select-Object TaskName, State
