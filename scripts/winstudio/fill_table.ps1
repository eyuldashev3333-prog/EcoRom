# Ввод одной таблицы прайса в живую WinStudio ЧЕРЕЗ ИНТЕРФЕЙС (тап по ячейке → цифровая клавиатура WinStudio).
# Экран эмулятора: wm size 480x1800 (строка 45 px). Данные: docs/winstudio-study/owner-tables.json, ключ -Kind.
# Каждая ячейка сверяется с экраном; вводится только отличающаяся. Колонки, которых нет в данных, должны быть 0.
# -VerifyOnly: только сверка, список «экран ≠ прайс».
param([Parameter(Mandatory)][string]$Kind, [Parameter(Mandatory)][string]$Title, [Parameter(Mandatory)][string]$NameHdr, [switch]$VerifyOnly)
. "D:\Eco Rom\scripts\winstudio\live_lib.ps1"
$J = Get-Content "D:\Eco Rom\docs\winstudio-study\owner-tables.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$want = [ordered]@{}; foreach ($row in $J.$Kind) { $m = @{}; foreach ($p in $row[1].PSObject.Properties) { $m[$p.Name] = [double]$p.Value }; $want[[string]$row[0]] = $m }
$names = @($want.Keys)

function Norm($t) { ($t -replace '\s+', ' ').Trim() }
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
function TitleNode($n) { $n | Where-Object { (Norm $_.text) -eq $Title } | Select-Object -First 1 }
function NameHead($n) { $t = TitleNode $n; if (-not $t) { return $null }; $n | Where-Object { (Norm $_.text) -eq $NameHdr -and (Top $_) -ge (Top $t) } | Select-Object -First 1 }
function RowsOf($n, [int]$hb) {
  $t = TitleNode $n; $after = if ($t) { [math]::Max((Top $t), $hb) } else { $hb }
  $plus = $n | Where-Object { $_.text -eq '+' -and (Top $_) -gt $after } | Sort-Object { Top $_ } | Select-Object -First 1
  $lim = if ($plus) { Top $plus } else { 1745 }
  @($n | Where-Object { $_.text -and (Left $_) -lt 20 -and (Top $_) -ge $after -and (Top $_) -lt $lim -and (Right $_) -gt 120 -and (Norm $_.text) -ne $NameHdr -and (Norm $_.text) -ne $Title } | Sort-Object { Top $_ })
}
function ToTop { for ($i = 0; $i -lt 40; $i++) { Adb "input swipe 240 300 240 1700 300"; if ($i % 5 -eq 4 -and ((Dump) | Where-Object { $_.text -eq 'валюта прайсов' })) { break } } }
function AlignTitle([int]$at = 50) {
  for ($t = 0; $t -lt 14; $t++) {
    $n = Dump; $h = TitleNode $n
    if (-not $h) { Adb "input swipe 240 1500 240 500 2000"; Start-Sleep -Milliseconds 700; continue }
    $d = (Top $h) - $at; if ([math]::Abs($d) -lt 60) { return }
    $d = [math]::Max([math]::Min($d, 1200), -1200); Adb "input swipe 240 1600 240 $(1600 - $d) 2000"; Start-Sleep -Milliseconds 700
  }
  $h = TitleNode (Dump); if ($h -and (Top $h) -lt 700) { return }; throw "не вывел заголовок «$Title»"
}
function ResetLeft([int]$y) { for ($i = 0; $i -lt 14; $i++) { Adb "input swipe 60 $y 460 $y 150" }; Start-Sleep -Milliseconds 700 }

ToTop; AlignTitle
$n = Dump; $t0 = TitleNode $n; ResetLeft ((Bottom $t0) + 120)
$n = Dump; $h0 = NameHead $n; if (-not $h0) { throw "нет колонки «$NameHdr»" }
$hTop = Top $h0; $hb = Bottom $h0
if (-not $VerifyOnly) {
  for ($t = 0; $t -lt 90; $t++) {
    $n = Dump; $rows = RowsOf $n $hb; $have = @($rows | ForEach-Object { $_.text }); $missing = @($names | Where-Object { $have -notcontains $_ })
    if ($missing.Count -eq 0) { break }
    $bad = $rows | Where-Object { $names -notcontains $_.text } | Select-Object -First 1
    if ($bad) { $c = Center $bad; TapXY $c[0] $c[1] 1100; TapText '◀◀' -ms 300; TypeText $missing[0]; TapText '✔' -ms 1300; continue }
    $plus = $n | Where-Object { $_.text -eq '+' -and (Top $_) -gt $hb } | Sort-Object { Top $_ } | Select-Object -First 1
    if (-not $plus -or (Top $plus) -gt 1740) { "строки не помещаются на экран: есть $($rows.Count), нужно $($names.Count)"; break }
    $c = Center $plus; TapXY $c[0] $c[1] 1300
  }
}
$rows = RowsOf (Dump) $hb; $rowY = @{}; foreach ($r in $rows) { $rowY[$r.text] = (Center $r)[1] }
"строк на экране: $($rows.Count) из $($names.Count); чужих строк: $(@($rows | Where-Object { $names -notcontains $_.text }).Count)"
$done = @{}; $diff = @()
$swY = $rowY[$rows[0].text]
for ($pass = 0; $pass -lt 60; $pass++) {
  $n = Dump
  $heads = @($n | Where-Object { $_.text -and (Top $_) -ge $hTop - 5 -and (Bottom $_) -le $hb + 5 -and (Norm $_.text) -ne $NameHdr })
  $progress = $false
  foreach ($hd in $heads) {
    $ht = Norm $hd.text; if ($done[$ht] -or $ht -eq 'X') { continue }
    $l = Left $hd; $r = Right $hd; if ($r - $l -lt 40 -or $l -lt 3 -or $r -gt 477) { continue }
    $key = $null; foreach ($rx in $want[$names[0]].Keys) { if ($ht -match $rx) { $key = $rx } }
    $x = [int](($l + $r) / 2)
    foreach ($r0 in $rows) {
      $nm = $r0.text; $y = $rowY[$nm]
      $target = if ($want.Contains($nm) -and $key) { $want[$nm][$key] } else { 0 }
      $cell = $n | Where-Object { $_.text -and (Left $_) -le $x -and (Right $_) -ge $x -and (Top $_) -le $y -and (Bottom $_) -ge $y } | Select-Object -Last 1
      if (-not $cell -or $cell.text.Trim() -notmatch '^-?[0-9.,]+$') { continue }   # не число (галочка единицы, цвет) — не трогаем
      $cur = [double]($cell.text.Trim() -replace ',', '.')
      if ([math]::Abs($cur - $target) -gt 0.0001) {
        if ($VerifyOnly) { $diff += "$nm | $ht | экран $cur | прайс $target" } else { EnterNum $x $y $target; $n = Dump }
      }
    }
    $done[$ht] = $true; $progress = $true
  }
  $last = $heads | Sort-Object { Right $_ } | Select-Object -Last 1
  if ($n | Where-Object { $_.text -match '^\s*X\s*$' -and (Top $_) -ge $hb }) { if (-not $progress) { break } }
  Adb "input swipe 400 $swY 250 $swY 1000"; Start-Sleep -Milliseconds 700
}
"колонок пройдено: $($done.Count): $(($done.Keys | Sort-Object) -join ' | ')"
"расхождений: $($diff.Count)"; $diff
