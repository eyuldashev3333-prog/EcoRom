# Обход каталога шаблонов: для каждого шаблона создаём окно (размер по умолчанию), читаем таблицу метров.
# Структура окна (сетка vsx/vsy/pns) потом берётся из сохранённого файла .wnd (adb pull).
param([int]$From = 0, [int]$To = 71, [string]$Out = "D:\Eco Rom\docs\winstudio-study\templates.csv")
. "D:\Eco Rom\scripts\winstudio\lib.ps1"
$colsHdr = "tpl,area,frame,impost,bead,gasket,sash,doorsash,glass,sandwich,shpros,lamin_in,lamin_out,works,sills"
if (-not (Test-Path $Out)) { $colsHdr | Set-Content $Out -Encoding utf8 }
$colX = @(560,800,1039)
for ($n = $From; $n -le $To; $n++) {
  $row = [math]::Floor($n / 3); $col = $n % 3
  $y0 = 158 + 217.5 * $row
  $k = [math]::Max(0, [math]::Floor(($y0 - 110) / 550))
  Tap @(1540,60); Start-Sleep -Milliseconds 900
  for ($i = 0; $i -lt $k; $i++) { & $adb -s $dev shell "input swipe 800 700 800 150 600" | Out-Null; Start-Sleep -Milliseconds 700 }
  $y = [int]($y0 - 550 * $k)
  Tap @($colX[$col], $y)
  Tap @(920,838); Start-Sleep -Milliseconds 1000
  $r = ReadRow
  if ($r) { "$n," + (($r | ForEach-Object { ($_ -replace ' (m2|m)$','') }) -join ',') | Add-Content $Out -Encoding utf8; "tpl $n ok" } else { "tpl $n no row" }
}

