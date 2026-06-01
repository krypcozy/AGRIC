$path = 'C:\Program Files\PostgreSQL\14\data\pg_hba.conf'
$bak = 'C:\Program Files\PostgreSQL\14\data\pg_hba.conf.bak'
if (-not (Test-Path $bak)) {
  Copy-Item $path $bak -Force
}
(Get-Content $path) | ForEach-Object {
  if ($_ -eq 'local   all             all                                     scram-sha-256') {
    'local   all             all                                     trust'
  } elseif ($_ -eq 'host    all             all             127.0.0.1/32            scram-sha-256') {
    'host    all             all             127.0.0.1/32            trust'
  } elseif ($_ -eq 'host    all             all             ::1/128                 scram-sha-256') {
    'host    all             all             ::1/128                 trust'
  } else {
    $_
  }
} | Set-Content $path
Restart-Service -Name postgresql-x64-14 -Force
Start-Sleep -Seconds 3
& 'C:\Program Files\PostgreSQL\14\bin\psql.exe' -U postgres -h 127.0.0.1 -d postgres -c "ALTER USER postgres PASSWORD 'SmartFarmPG2026!'"
Copy-Item $bak $path -Force
Restart-Service -Name postgresql-x64-14 -Force
Start-Sleep -Seconds 3
Get-Service -Name postgresql-x64-14 | Select-Object Name,Status
