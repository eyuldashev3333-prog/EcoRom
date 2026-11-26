# Ввод таблицы оконных систем руководителя в живую WinStudio ЧЕРЕЗ ИНТЕРФЕЙС (тапы и цифровая клавиатура).
# Данные: docs/winstudio-study/owner-price.json. Каждая ячейка сравнивается с экраном; вводится, только если отличается.
# В конце — проход по всей таблице и список ячеек «экран ≠ видео» (должен быть пустым).
param([switch]$VerifyOnly)
. "D:\Eco Rom\scripts\winstudio\live_lib.ps1"
$J = Get-Content "D:\Eco Rom\docs\winstudio-study\owner-price.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$hdr = [ordered]@{
  system_frame = '^профиль каркаса'; system_impost = '^профиль импоста'; system_leaf = '^профиль створки'; system_door_leaf = '^профиль дверной'
  system_sandwiches = '^сэндвич панель'; system_shtapik = '^штапик'; system_rubber_sealant = '^уплотнитель резиновый'
  system_glazing_bars = '^шпросы'; system_glazing_bars_connector = '^соединитель для шпрос'
  system_firm_frame = '^армировка каркаса'; system_firm_impost = '^армировка импоста'; system_firm_leaf = '^армировка створки'; system_firm_door_leaf = '^армировка дверей'
  system_mullion_french = '^штульп '; system_firm_corner_frame = '^усилитель угла рамы'; system_firm_corner_leaf = '^усилитель угла створки'
  system_impost_connector = '^коннектор импоста'; system_joint_90_deg = '^соединительный профиль 90'
}
$want = @{}   # имя -> @{ ключ -> значение }
foreach ($row in $J.systems) { $m = @{}; for ($i = 0; $i -lt $J.systems_cols.Count; $i++) { $m[$J.systems_cols[$i]] = [double]$row[$i + 1] }; $want[$row[0].Replace('/', '-')] = $m }
$names = @($J.systems | ForEach-Object { $_[0].Replace('/', '-') })

function Norm($t) { ($t -replace '\s+', ' ').Trim() }
function Top($n) { [int](($n.bounds -split '[\[\],]')[2]) }
function Left($n) { [int](($n.bounds -split '[\[\],]')[1]) }
function Right($n) { [int](($n.bounds -split '[\[\],]')[4]) }
function Bottom($n) { [int](($n.bounds -split '[\[\],]')[5]) }
$script:keys = $null
function EnterNum([int]$x, [int]$y, [double]$v) {
  TapXY $x $y 900
  if (-not $script:keys) { $script:keys = @{}; Dump | Where-Object { $_.'resource-id' -like '*keypad_dig_*' } | ForEach-Object { $script:keys[$_.'resource-id'.Split('_')[-1]] = Center $_ } }
  $k = $script:keys; $c = $k['dell']; TapXY $c[0] $c[1] 150
  foreach ($ch in ([string]$v).Replace(',', '.').ToCharArray()) { $c = $k[$(if ($ch -eq '.') { 'point' } else { [string]$ch })]; TapXY $c[0] $c[1] 120 }
  $c = $k['yes']; TapXY $c[0] $c[1] 900
}
function ResetLeft { for ($i = 0; $i -lt 14; $i++) { Adb "input swipe 80 700 700 700 150" }; Start-Sleep -Milliseconds 600 }
function SysHeader($n) { $n | Where-Object { (Norm $_.text) -eq 'оконная система' } | Select-Object -First 1 }
function RowsOf($n) {
  $h = SysHeader $n; if (-not $h) { throw 'нет шапки таблицы систем на экране' }; $hb = Bottom $h
  $plus = $n | Where-Object { $_.text -eq '+' -and (Top $_) -gt $hb } | Sort-Object { Top $_ } | Select-Object -First 1
  $lim = if ($plus) { Top $plus } else { 1440 }
  @($n | Where-Object { $_.text -and (Left $_) -lt 20 -and (Top $_) -ge $hb -and (Top $_) -lt $lim -and (Right $_) -gt 120 } | Sort-Object { Top $_ })
}

# в самый верх, затем заголовок «таблица оконных систем» — к верху экрана (медленный свайп без инерции)
for ($i = 0; $i -lt 30; $i++) { Adb "input swipe 360 300 360 1350 300"; if ($i % 5 -eq 4 -and ((Dump) | Where-Object { $_.text -eq 'валюта прайсов' })) { break } }; Start-Sleep -Milliseconds 800
$ok = $false
for ($t = 0; $t -lt 10; $t++) {
  $n = Dump; $h = $n | Where-Object { $_.text -eq 'таблица оконных систем' } | Select-Object -First 1
  if (-not $h) { Adb "input swipe 360 1100 360 500 2000"; Start-Sleep -Milliseconds 700; continue }
  $d = (Top $h) - 50; if ([math]::Abs($d) -lt 15) { $ok = $true; break }
  $d = [math]::Max([math]::Min($d, 900), -900); Adb "input swipe 360 1250 360 $(1250 - $d) 2000"; Start-Sleep -Milliseconds 700
}
if (-not $ok) { throw 'заголовок таблицы систем не найден' }
# сдвиг таблицы вбок — в начало (свайп по строкам самой таблицы систем)
for ($i = 0; $i -lt 14; $i++) { Adb "input swipe 80 300 700 300 150" }; Start-Sleep -Milliseconds 800
if (-not (SysHeader (Dump))) { throw 'колонка названий систем не видна' }
if (-not $VerifyOnly) {
  # строки: чужое имя (в т.ч. new_win_system) — переименовать в недостающее; если все имена свои и строк < 20 — «+»
  # (WinStudio не создаёт вторую new_win_system, пока есть первая: имя = имя файла прайса)
  for ($t = 0; $t -lt 60; $t++) {
    $n = Dump; $rows = RowsOf $n; $have = @($rows | ForEach-Object { $_.text }); $missing = @($names | Where-Object { $have -notcontains $_ })
    if ($missing.Count -eq 0) { break }
    $bad = $rows | Where-Object { $names -notcontains $_.text } | Select-Object -First 1
    if ($bad) { $c = Center $bad; TapXY $c[0] $c[1] 1100; TapText '◀◀' -ms 300; TypeText $missing[0]; TapText '✔' -ms 1300; continue }
    $h = SysHeader $n; $plus = $n | Where-Object { $_.text -eq '+' -and (Top $_) -gt (Bottom $h) } | Sort-Object { Top $_ } | Select-Object -First 1
    if (-not $plus) { throw 'нет кнопки + под таблицей систем' }
    $c = Center $plus; TapXY $c[0] $c[1] 1300
  }
}
# проход вбок: заполнение и проверка
$n0 = Dump; $h0 = SysHeader $n0; $hTop = Top $h0; $hb = Bottom $h0; $rows = RowsOf $n0; $rowY = @{}; foreach ($r in $rows) { $rowY[$r.text] = (Center $r)[1] }
"rows: $($rows.Count)"
$done = @{}; $diff = @()
for ($pass = 0; $pass -lt 90; $pass++) {
  $n = Dump
  $heads = @($n | Where-Object { $_.text -and (Top $_) -ge $hTop - 5 -and (Bottom $_) -le $hb + 5 -and (Norm $_.text) -ne 'оконная система' })
  foreach ($hd in $heads) {
    $ht = Norm $hd.text; if ($done[$ht]) { continue }
    $l = Left $hd; $r = Right $hd; if ($r - $l -lt 60 -or $l -lt 3 -or $r -gt 717) { continue }   # только целиком видимые колонки
    $key = ($hdr.Keys | Where-Object { $ht -match $hdr[$_] } | Select-Object -First 1)
    $x = [int](($l + $r) / 2)
    foreach ($nm in $names) {
      $y = $rowY[$nm]; if (-not $y) { $diff += "нет строки $nm"; continue }
      $target = if ($key) { $want[$nm][$key] } else { 0 }
      $cell = $n | Where-Object { $_.text -ne '' -and $_.text -ne $null -and (Left $_) -le $x -and (Right $_) -ge $x -and (Top $_) -le $y -and (Bottom $_) -ge $y } | Select-Object -Last 1
      $cur = if ($cell) { [double]($cell.text.Trim() -replace ',', '.') } else { [double]::NaN }
      if ([math]::Abs($cur - $target) -gt 0.0001) {
        if ($VerifyOnly) { $diff += "$nm | $ht | экран $cur | видео $target" } else { EnterNum $x $y $target; $n = Dump }
      }
    }
    $done[$ht] = $true
  }
  if ($heads | Where-Object { $_.text -match 'доборный' -and $_.text -match '100' -and (Right $_) -le 717 }) { break }
  Adb "input swipe 600 $($rowY[$names[0]]) 400 $($rowY[$names[0]]) 1000"; Start-Sleep -Milliseconds 700
}
"колонок пройдено: $($done.Count)"
$done.Keys | Sort-Object
"расхождений: $($diff.Count)"; $diff
