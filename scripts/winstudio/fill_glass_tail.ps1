# Хвост таблицы стеклопакетов (строки, не помещающиеся на экран вместе с шапкой): через интерфейс WinStudio.
# Экран листается так, чтобы были видны последние строки и «+»; цена «стекло 1» = ячейка сразу справа от названия (таблица в начале по горизонтали).
. "D:\Eco Rom\scripts\winstudio\live_lib.ps1"
$J = Get-Content "D:\Eco Rom\docs\winstudio-study\owner-tables.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$want = [ordered]@{}; foreach ($row in $J.glass) { $want[[string]$row[0]] = [double]$row[1].'^стекло 1' }
$names = @($want.Keys)
function B($n, $i) { [int](($n.bounds -split '[\[\],]')[$i]) }
function Top($n) { B $n 2 }; function Left($n) { B $n 1 }; function Right($n) { B $n 4 }; function Bottom($n) { B $n 5 }
$script:keys = $null
function EnterNum([int]$x, [int]$y, [double]$v) {
  TapXY $x $y 900
  if (-not $script:keys) { $script:keys = @{}; Dump | Where-Object { $_.'resource-id' -like '*keypad_dig_*' } | ForEach-Object { $script:keys[$_.'resource-id'.Split('_')[-1]] = Center $_ } }
  $k = $script:keys; if (-not $k['yes']) { throw 'цифровая клавиатура не открылась' }
  $c = $k['dell']; TapXY $c[0] $c[1] 150
  foreach ($ch in ([string]$v).Replace(',', '.').ToCharArray()) { $c = $k[$(if ($ch -eq '.') { 'point' } else { [string]$ch })]; TapXY $c[0] $c[1] 120 }
  $c = $k['yes']; TapXY $c[0] $c[1] 900
}
# видимые строки стеклопакетов: между заголовком/верхом экрана и «таблица отливов»
function GlassRows($n) {
  $ebb = $n | Where-Object { $_.text -eq 'таблица отливов' } | Select-Object -First 1
  $lim = if ($ebb) { Top $ebb } else { 1745 }
  $gt = $n | Where-Object { $_.text -eq 'таблица стеклопакетов' } | Select-Object -First 1
  $from = if ($gt) { (Bottom $gt) + 40 } else { 46 }
  @($n | Where-Object { $_.text -and (Left $_) -lt 20 -and (Top $_) -ge $from -and (Top $_) -lt $lim -and (Right $_) -gt 120 -and $_.text -ne '+' } | Sort-Object { Top $_ })
}
# экран: «таблица отливов» около y=1500
for ($t = 0; $t -lt 12; $t++) {
  $n = Dump; $e = $n | Where-Object { $_.text -eq 'таблица отливов' } | Select-Object -First 1
  if (-not $e) { $gt = $n | Where-Object { $_.text -eq 'таблица стеклопакетов' } | Select-Object -First 1; $dir = if ($gt) { 'down' } else { 'up' }; if ($dir -eq 'down') { Adb "input swipe 240 1500 240 700 2000" } else { Adb "input swipe 240 600 240 1400 2000" }; Start-Sleep -Milliseconds 700; continue }
  $d = (Top $e) - 1500; if ([math]::Abs($d) -lt 30) { break }
  $d = [math]::Max([math]::Min($d, 1000), -1000); Adb "input swipe 240 1600 240 $(1600 - $d) 2000"; Start-Sleep -Milliseconds 700
}
# таблица стеклопакетов могла остаться сдвинутой вбок — в начало
$e = (Dump) | Where-Object { $_.text -eq 'таблица отливов' } | Select-Object -First 1; $sy = (Top $e) - 120
for ($i = 0; $i -lt 14; $i++) { Adb "input swipe 60 $sy 460 $sy 150" }; Start-Sleep -Milliseconds 700
for ($t = 0; $t -lt 20; $t++) {
  $n = Dump; $rows = GlassRows $n
  # все видимые строки — свои?
  $have = @($rows | ForEach-Object { $_.text })
  $bad = $rows | Where-Object { $names -notcontains $_.text } | Select-Object -First 1
  # недостающие имена надо смотреть по всей таблице: читаем список файлов прайса стеклопакетов
  $files = @(& $adb -s $dev shell "ls /sdcard/Android/data/com.blogspot.turbocolor.winstudio/files/WindowsStudio/Prices/winglasses/" 2>$null | ForEach-Object { $_ -replace '\.wprc$', '' })
  $missing = @($names | Where-Object { $files -notcontains $_ })
  if ($bad -and $missing.Count) { $c = Center $bad; TapXY $c[0] $c[1] 1100; TapText '◀◀' -ms 300; TypeText $missing[0]; TapText '✔' -ms 1300; continue }
  if ($missing.Count -eq 0) { break }
  $ebb = $n | Where-Object { $_.text -eq 'таблица отливов' } | Select-Object -First 1
  $plus = $n | Where-Object { $_.text -eq '+' -and (Top $_) -lt (Top $ebb) } | Sort-Object { Top $_ } | Select-Object -Last 1
  $c = Center $plus; TapXY $c[0] $c[1] 1300
}
# цены «стекло 1» у видимых строк
$n = Dump; $rows = GlassRows $n; $diff = @()
foreach ($r in $rows) {
  if (-not $want.Contains($r.text)) { $diff += "чужая строка $($r.text)"; continue }
  $y = (Center $r)[1]
  $cell = $n | Where-Object { $_.text -and [math]::Abs((Left $_) - (Right $r)) -le 3 -and (Top $_) -le $y -and (Bottom $_) -ge $y } | Select-Object -Last 1
  if (-not $cell) { $diff += "нет ячейки у $($r.text)"; continue }
  $cur = [double]($cell.text.Trim() -replace ',', '.')
  if ([math]::Abs($cur - $want[$r.text]) -gt 0.0001) { $c = Center $cell; EnterNum $c[0] $c[1] $want[$r.text]; $n = Dump }
}
"видимых строк: $($rows.Count); $($diff -join '; ')"
$files = @(& $adb -s $dev shell "ls /sdcard/Android/data/com.blogspot.turbocolor.winstudio/files/WindowsStudio/Prices/winglasses/" 2>$null)
"файлов стеклопакетов: $($files.Count)"
