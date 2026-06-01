@echo off
setlocal
set PGPASSWORD=SmartFarmPG2026!
"C:\Program Files\PostgreSQL\14\bin\psql.exe" -U postgres -h 127.0.0.1 -d postgres -c "SELECT 1;"
endlocal
