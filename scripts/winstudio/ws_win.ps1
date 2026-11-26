# Управление окном живой WinStudio через интерфейс (портрет 720x1440): опции, размеры, чтение нижней таблицы.
. "D:\Eco Rom\scripts\winstudio\live_lib.ps1"
function B($n, $i) { [int](($n.bounds -split '[\[\],]')[$i]) }
function Norm($t) { ($t -replace '\s+', ' ').Trim() }

# ---- панель «настройки окна» ----
function OpenOptions { if (-not ((Dump) | Where-Object { $_.text -eq 'настройки окна' })) { TapXY 659 1379 1800 } }
function CloseOptions { $ok = (Dump) | Where-Object { $_.text -eq 'ОК' -and $_.class -match 'Button' } | Select-Object -First 1; if ($ok) { $c = Center $ok; TapXY $c[0] $c[1] 1800 } }
# панель листается свайпом по правой части экрана; ищем секцию, затем пункт внутри неё
function PanelTop { for ($i = 0; $i -lt 25; $i++) { Adb "input swipe 535 250 535 1300 250"; if ($i % 4 -eq 3 -and ((Dump) | Where-Object { $_.text -eq 'количество' })) { return } } }
function FindInSection([string]$section, [string]$item) {
  PanelTop; $seenSec = $false
  for ($i = 0; $i -lt 70; $i++) {
    $n = Dump
    $sec = $n | Where-Object { $_.text -eq $section -and $_.class -match 'TextView' } | Select-Object -First 1
    if ($sec) { $seenSec = $true }
    if ($seenSec) {
      $from = if ($sec) { B $sec 2 } else { 30 }
      # следующий заголовок секции (TextView на всю ширину панели, x=350)
      $next = $n | Where-Object { $_.class -match 'TextView' -and (B $_ 1) -eq 350 -and ((B $_ 4) - (B $_ 1)) -ge 360 -and (B $_ 2) -gt $from -and $_.text } | Sort-Object { B $_ 2 } | Select-Object -First 1
      $lim = if ($next) { B $next 2 } else { 1350 }
      $it = $n | Where-Object { (Norm $_.text) -eq $item -and (B $_ 2) -gt $from -and (B $_ 2) -lt $lim -and (B $_ 5) -le 1350 } | Select-Object -First 1
      if ($it) { return $it }
      if ($next -and (B $next 2) -lt 1300) { return $null }
    }
    Adb "input swipe 535 1200 535 800 1200"; Start-Sleep -Milliseconds 400
  }
  $null
}function Pick([string]$section, [string]$item) {
  $it = FindInSection $section $item
  if (-not $it) { throw "нет пункта «$item» в секции «$section»" }
  if ($it.checked -ne 'true') { $c = Center $it; TapXY $c[0] $c[1] 700 }
}
function Qty([int]$q) {
  PanelTop; $n = Dump; $v = $n | Where-Object { (B $_ 2) -ge 60 -and (B $_ 5) -le 135 -and $_.class -match 'TextView' -and $_.text -match '^\d+$' } | Select-Object -First 1
  $cur = [int]$v.text; $btn = if ($q -gt $cur) { '+' } else { '-' }
  for ($i = 0; $i -lt [math]::Abs($q - $cur); $i++) { $b = $n | Where-Object { (Norm $_.text) -eq $btn -and $_.class -match 'Button' } | Select-Object -First 1; $c = Center $b; TapXY $c[0] $c[1] 400 }
}

# ---- нижняя таблица: все колонки (листается вбок), строки окно/цена/все окна/стоимость ----
function ReadTable {
  $rowsY = @{}; $cols = [ordered]@{}; $stuck = 0
  # в начало
  for ($i = 0; $i -lt 10; $i++) { Adb "input swipe 150 1250 650 1250 150" }; Start-Sleep -Milliseconds 500
  $seen = @{}
  for ($pass = 0; $pass -lt 25; $pass++) {
    $n = Dump
    if (-not $rowsY.Count) { foreach ($r in 'окно', 'цена', 'все окна', 'стоимость') { $x = $n | Where-Object { $_.text -eq $r -and (B $_ 1) -eq 0 } | Select-Object -First 1; if ($x) { $rowsY[$r] = Center $x } } }
    $hdrY = (B ($n | Where-Object { $_.text -eq 'позиция' } | Select-Object -First 1) 2)
    $heads = @($n | Where-Object { (B $_ 2) -eq $hdrY -and $_.text -and $_.text -ne 'позиция' -and $_.text -ne 'всего' -and (B $_ 1) -ge 108 })
    $new = $false
    foreach ($h in $heads) {
      $l = B $h 1; $r = B $h 4; if ($r - $l -lt 30) { continue }
      $name = Norm $h.text; if ($seen[$name]) { continue }
      # колонка видна целиком? (не обрезана справа «всего»)
      $tot = $n | Where-Object { $_.text -eq 'всего' } | Select-Object -First 1
      if ($r -gt (B $tot 1) + 2) { continue }
      $vals = [ordered]@{}
      foreach ($rn in 'окно', 'цена', 'все окна', 'стоимость') { $y = $rowsY[$rn][1]; $c = $n | Where-Object { (B $_ 1) -eq $l -and (B $_ 2) -le $y -and (B $_ 5) -ge $y -and $_.text } | Select-Object -First 1; $vals[$rn] = if ($c) { Norm $c.text } else { '' } }
      $cols[$name] = $vals; $seen[$name] = $true; $new = $true
    }
    if ($heads | Where-Object { $_.text -match 'добор' -and $_.text -match '100' -and $seen[(Norm $_.text)] }) { break }
    if (-not $new -and $pass -gt 0) { $stuck++ ; if ($stuck -gt 6) { break } } else { $stuck = 0 }
    $y0 = $rowsY['окно'][1]; $dur = if ($stuck % 2) { 500 } else { 1000 }; $tl = B ($n | Where-Object { $_.text -eq 'всего' } | Select-Object -First 1) 1; $sx = $tl - 15; $ex = [math]::Max(115, $sx - 200); Adb "input swipe $sx $y0 $ex $y0 $dur"; Start-Sleep -Milliseconds 500
  }
  $n = Dump; $tot = $n | Where-Object { $_.text -eq 'всего' } | Select-Object -First 1
  $totals = [ordered]@{}; foreach ($rn in 'окно', 'цена', 'все окна', 'стоимость') { $y = $rowsY[$rn][1]; $c = $n | Where-Object { (B $_ 1) -ge (B $tot 1) - 5 -and (B $_ 2) -le $y -and (B $_ 5) -ge $y -and $_.text -and $_.text.Trim() } | Select-Object -First 1; $totals[$rn] = if ($c) { Norm $c.text } else { '' } }
  [ordered]@{ cols = $cols; total = $totals }
}

# ---- размеры: подпись общего размера — середина самой нижней (ширина) / самой левой (высота) длинной тёмной линии чертежа ----
Add-Type -AssemblyName System.Drawing
function DimLabel([string]$which) {
  # самая длинная сплошная тёмно-серая линия (разрывы ≤ 6 px): ширина — самая нижняя, высота — самая левая
  Shot 'dim'; $bmp = [System.Drawing.Bitmap]::FromFile('C:\wsre\live\dim.png')
  $dark = { param($x, $y) $q = $bmp.GetPixel($x, $y); $q.R -lt 170 -and $q.G -lt 170 -and $q.B -lt 170 -and [math]::Abs($q.R - $q.B) -lt 25 }
  $run = { param($pts) $best = @(0, 0, 0); $st = $null; $prev = $null; foreach ($p in $pts) { if ($null -eq $prev -or $p - $prev -gt 6) { $st = $p }; if ($p - $st -gt $best[0]) { $best = @(($p - $st), $st, $p) }; $prev = $p }; $best }
  try {
    $hit = $null
    if ($which -eq 'W') {
      for ($y = 62; $y -lt 715; $y++) { $xs = @(); for ($x = 580; $x -lt 1020; $x++) { if (& $dark $x $y) { $xs += $x } }; $r = & $run $xs; if ($r[0] -ge 75 -and $xs.Count -ge 150) { $hit = @((($xs[0] + $xs[-1]) / 2), $y) } }
    } else {
      for ($x = 1020; $x -gt 578; $x--) { $ys = @(); for ($y = 62; $y -lt 715; $y++) { if (& $dark $x $y) { $ys += $y } }; $r = & $run $ys; if ($r[0] -ge 75 -and $ys.Count -ge 150) { $hit = @($x, (($ys[0] + $ys[-1]) / 2)) } }
    }
  } finally { $bmp.Dispose() }
  if (-not $hit) { throw "нет линии размера $which" }
  @([int](($hit[0] - 575) / 0.625), [int]($hit[1] / 0.625))
}function SetDim([string]$which, [int]$v) {
  $p = DimLabel $which; TapXY $p[0] $p[1] 1000
  $k = @{}; Dump | Where-Object { $_.'resource-id' -like '*keypad_dig_*' } | ForEach-Object { $k[$_.'resource-id'.Split('_')[-1]] = Center $_ }
  if (-not $k['yes']) { throw "не открылась клавиатура размера ($which)" }
  TapXY $k['dell'][0] $k['dell'][1] 150
  foreach ($ch in "$v".ToCharArray()) { $c = $k[[string]$ch]; TapXY $c[0] $c[1] 120 }
  TapXY $k['yes'][0] $k['yes'][1] 1200
  # вопрос «выровнять размеры?» — НЕТ
  $no = (Dump) | Where-Object { $_.text -eq 'НЕТ' -and $_.class -match 'Button' } | Select-Object -First 1; if ($no) { $c = Center $no; TapXY $c[0] $c[1] 800 }
}
# ---- ячейка: тап по доле окна → диалог «импосты / открывание» ----
function WinBox {
  Shot 'box'; $bmp = [System.Drawing.Bitmap]::FromFile('C:\wsre\live\box.png')
  try { $x0 = 9999; $x1 = 0; $y0 = 9999; $y1 = 0
    for ($y = 130; $y -lt 720; $y += 2) { for ($x = 580; $x -lt 1020; $x += 2) { $p = $bmp.GetPixel($x, $y); if ($p.B -ge $p.R + 18 -and $p.B -ge 200 -and $p.G -ge 190) { if ($x -lt $x0) { $x0 = $x }; if ($x -gt $x1) { $x1 = $x }; if ($y -lt $y0) { $y0 = $y }; if ($y -gt $y1) { $y1 = $y } } } }
  } finally { $bmp.Dispose() }
  @((($x0 - 575) / 0.625), ($y0 / 0.625), (($x1 - 575) / 0.625), ($y1 / 0.625))
}
$OPEN = @('slide_r', 'tilt', 'slide_l', 'turn_r', 'fixed', 'turn_l', 'tt_r', 'top', 'tt_l', 'fixed_sash')
$SUB = @{ none = @(211, 475); v2 = @(86, 599); h2 = @(211, 599); v3 = @(86, 723); h3 = @(211, 723) }
function CellCfg($c) {
  $b = WinBox; $x = [int]($b[0] + ($b[2] - $b[0]) * $c.at[0]); $y = [int]($b[1] + ($b[3] - $b[1]) * $c.at[1])
  $m = Markers | Sort-Object { [math]::Pow($_.x - $x, 2) + [math]::Pow($_.y - $y, 2) } | Select-Object -First 1; if ($m) { $x = $m.x; $y = $m.y }
  TapXY $x $y 1300
  if (-not ((Dump) | Where-Object { $_.text -eq 'открывание' })) { TapXY $x $y 1300 }
  if (-not ((Dump) | Where-Object { $_.text -eq 'открывание' })) { throw "не открылся диалог ячейки ($x,$y)" }
  if ($c.sub) { $p = $SUB[$c.sub]; TapXY $p[0] $p[1] 500 }
  if ($c.open) { $i = [array]::IndexOf($OPEN, $c.open); if ($i -lt 9) { TapXY (351 + 138 * ($i % 3)) (494 + 163 * [math]::Floor($i / 3)) 500 } else { Adb "input swipe 489 900 489 500 600"; Start-Sleep -Milliseconds 500; $v = (Dump) | Where-Object { $_.class -match 'View' -and (B $_ 1) -eq 420 } | Sort-Object { B $_ 2 } | Select-Object -Last 1; $cc = Center $v; TapXY $cc[0] $cc[1] 500 } }
  $n = Dump
  $chk = { param($label, $want) $el = $n | Where-Object { $_.class -match 'CheckBox' -and $_.text -eq $label } | Select-Object -First 1; if ($el -and (($el.checked -eq 'true') -ne [bool]$want)) { $cc = Center $el; TapXY $cc[0] $cc[1] 400 } }
  if ($null -ne $c.door) { & $chk 'двери' $c.door }
  if ($null -ne $c.net) { $n = Dump; & $chk 'сетка' $c.net }
  if ($c.sandwich) { $n = Dump; $boxes = @($n | Where-Object { $_.class -match 'CheckBox' -and -not $_.text } | Sort-Object { B $_ 1 }); for ($i = 0; $i -lt $c.sandwich.Count; $i++) { if ($boxes[$i] -and (($boxes[$i].checked -eq 'true') -ne [bool]$c.sandwich[$i])) { $cc = Center $boxes[$i]; TapXY $cc[0] $cc[1] 400 } } }
  TapText 'ДА' -ms 1500
}
# маркеры частей окна (кружок 171,206,243 в центре каждой ячейки) → центры в координатах устройства
function Markers {
  Shot 'mk'; $bmp = [System.Drawing.Bitmap]::FromFile('C:\wsre\live\mk.png'); $pts = @()
  try { for ($y = 62; $y -lt 725; $y += 2) { for ($x = 580; $x -lt 1020; $x += 2) { $p = $bmp.GetPixel($x, $y); if ([math]::Abs($p.R - 171) -le 8 -and [math]::Abs($p.G - 206) -le 8 -and [math]::Abs($p.B - 243) -le 8) { $pts += , @($x, $y) } } } } finally { $bmp.Dispose() }
  $cl = @()
  foreach ($p in $pts) { $hit = $null; foreach ($c in $cl) { if ([math]::Abs($c.x - $p[0]) -lt 30 -and [math]::Abs($c.y - $p[1]) -lt 30) { $hit = $c; break } }; if ($hit) { $hit.sx += $p[0]; $hit.sy += $p[1]; $hit.n++; $hit.x = $hit.sx / $hit.n; $hit.y = $hit.sy / $hit.n } else { $cl += [pscustomobject]@{ x = $p[0]; y = $p[1]; sx = $p[0]; sy = $p[1]; n = 1 } } }
  @($cl | Where-Object { $_.n -ge 20 } | ForEach-Object { [pscustomobject]@{ x = [int](($_.x - 575) / 0.625); y = [int]($_.y / 0.625) } })
}
# закрыть любые открытые диалоги/панели WinStudio (остатки прошлых сбоев)
function CleanScreen {
  for ($i = 0; $i -lt 6; $i++) {
    $n = Dump; $t = @($n | ForEach-Object { $_.text })
    if ($n | Where-Object { $_.'resource-id' -like '*keypad_dig_no' }) { TapText '✕' -ms 700; continue }
    if ($t -contains 'настройки окна') { CloseOptions; continue }
    if ($t -contains 'открывание' -or $t -contains 'конфигурация' -or $t -contains 'Удалить это окно?') { TapText 'НЕТ' -ms 800; continue }
    if ($t -contains 'ОТМЕНА') { TapText 'ОТМЕНА' -ms 800; continue }
    if ($t -contains 'ПОСЛЕДНИЙ ЗАКАЗ') { TapText 'ПОСЛЕДНИЙ ЗАКАЗ' -ms 3000; continue }   # приложение перезапустилось — назад в тестовый заказ
    if (-not ($t -contains 'позиция')) { Adb 'monkey -p com.blogspot.turbocolor.winstudio -c android.intent.category.LAUNCHER 1' | Out-Null; Start-Sleep 6; continue }
    break
  }
}
# выбрать шаблон №$tpl в диалоге «конфигурация» (3 колонки, строка 174 px, список с y=405, окно списка 405..974).
# Листаем короткими шагами (< строки) и после каждого шага меряем настоящий сдвиг по фазе строк — ошибка не копится.
function RowTops { @((Dump) | Where-Object { $_.class -match 'View$' -and (B $_ 1) -eq 74 -and ((B $_ 5) - (B $_ 2)) -ge 170 -and ((B $_ 5) - (B $_ 2)) -le 180 } | ForEach-Object { B $_ 2 }) }
function PickTemplate([int]$tpl) {
  $row = [math]::Floor($tpl / 3); $col = $tpl % 3
  for ($i = 0; $i -lt 12; $i++) { $tp = RowTops; if ($tp -contains 405) { break }; Adb "input swipe 360 500 360 1000 150"; Start-Sleep -Milliseconds 400 }
  $S = 0
  for ($step = 0; $step -lt 80; $step++) {
    $tops = RowTops
    $exp = 405 + 174 * $row - $S
    $hit = $tops | Where-Object { [math]::Abs($_ - $exp) -le 4 } | Select-Object -First 1
    if ($null -ne $hit) { TapXY (170 + 191 * $col) ($hit + 87) 700; return }
    $ph0 = ((405 - $tops[0]) % 174 + 174) % 174
    Adb "input swipe 360 900 360 790 1200"; Start-Sleep -Milliseconds 600
    $t2 = RowTops; for ($w = 0; $w -lt 5; $w++) { Start-Sleep -Milliseconds 300; $t3 = RowTops; if (($t3 -join ",") -eq ($t2 -join ",")) { break }; $t2 = $t3 }; $ph1 = ((405 - $t2[0]) % 174 + 174) % 174
    $d = (($ph1 - $ph0) % 174 + 174) % 174
    if ($d -eq 0) { throw "шаблон $tpl : список не листается (S=$S)" }
    $S += $d
  }
  throw "шаблон $tpl : не дошёл до строки $row"
}
# удалить все окна текущего заказа WinStudio (корзина → «Удалить это окно?» → ДА), с ожиданием диалога
function ClearWindows {
  for ($i = 0; $i -lt 20; $i++) {
    $n = Dump; $t = @($n | ForEach-Object { $_.text })
    if ($t -contains 'Удалить это окно?') { $y = $n | Where-Object { $_.text -eq 'ДА' } | Select-Object -First 1; $c = Center $y; TapXY $c[0] $c[1] 1300; continue }
    if (-not ($t | Where-Object { $_ -match 'som' })) { return }
    TapXY 659 1117 1500
  }
  throw 'не удалось удалить окна'
}
# «дополнения по размеру»: sides = { support, threshold, corner, connect:[l,t,b,r], connect90, connect135, nashelnik, dobor:{ '15':[...] } }
# пиктограммы сторон у WinStudio: лево, верх, низ, право
function SetSides($S) {
  $ord = @{ l = 0; t = 1; b = 2; r = 3 }
  $scrollTo = { param($label) PanelTop; for ($i = 0; $i -lt 60; $i++) { $n = Dump; $h = $n | Where-Object { (Norm $_.text) -eq $label } | Select-Object -First 1; if ($h -and (B $h 2) -ge 40 -and (B $h 2) -le 1100) { return $n }; Adb "input swipe 535 1200 535 800 1200"; Start-Sleep -Milliseconds 900 }; throw "нет «$label»" }
  # тап по галочке; после — проверка (тап во время докрутки панели только останавливает её) и повтор
  $tick = { param($cb, $on) if (-not $cb -or (($cb.checked -eq 'true') -eq [bool]$on)) { return }; Start-Sleep -Milliseconds 900; $c = Center $cb
    for ($k = 0; $k -lt 3; $k++) { TapXY $c[0] $c[1] 700; $now = (Dump) | Where-Object { $_.class -match 'CheckBox' -and $_.bounds -eq $cb.bounds } | Select-Object -First 1; if ($now -and (($now.checked -eq 'true') -eq [bool]$on)) { return } }
    throw "галочка не встала: $($cb.bounds)" }
  foreach ($k in @(@('support', 'подставочный профиль'), @('threshold', 'порог'), @('corner', 'наличник угловой'))) {
    if ($S.($k[0])) { $n = & $scrollTo $k[1]; $lab = $n | Where-Object { (Norm $_.text) -eq $k[1] } | Select-Object -First 1; $cy = [int](((B $lab 2) + (B $lab 5)) / 2)
      $cb = $n | Where-Object { $_.class -match 'CheckBox' -and (B $_ 2) -le $cy -and (B $_ 5) -ge $cy -and (B $_ 1) -lt 405 } | Select-Object -First 1; & $tick $cb $true }
  }
  foreach ($k in @(@('connect', 'соединительные профили'), @('connect90', 'соединительные профили 90°'), @('connect135', 'соединительные профили 135°'), @('nashelnik', 'нащельники'))) {
    $want = @($S.($k[0])); if (-not $S.($k[0])) { continue }
    $n = & $scrollTo $k[1]; $h = $n | Where-Object { (Norm $_.text) -eq $k[1] } | Select-Object -First 1
    $row = @($n | Where-Object { $_.class -match 'CheckBox' -and (B $_ 2) -ge (B $h 5) -and (B $_ 2) -le (B $h 5) + 10 } | Sort-Object { B $_ 1 })
    foreach ($sd in $want) { & $tick $row[$ord[$sd]] $true; $n = Dump; $row = @($n | Where-Object { $_.class -match 'CheckBox' -and (B $_ 2) -ge (B $h 5) -and (B $_ 2) -le (B $h 5) + 10 } | Sort-Object { B $_ 1 }) }
  }
  if ($S.dobor) {
    foreach ($p in $S.dobor.PSObject.Properties) {
      $n = & $scrollTo 'доборные профили'
      for ($i = 0; $i -lt 6; $i++) { $lab = $n | Where-Object { (Norm $_.text) -eq $p.Name -and (B $_ 1) -ge 350 -and (B $_ 1) -lt 400 } | Select-Object -First 1; if ($lab -and (B $lab 5) -le 1340) { break }; Adb "input swipe 535 1200 535 1000 1200"; Start-Sleep -Milliseconds 400; $n = Dump }
      $cy = [int](((B $lab 2) + (B $lab 5)) / 2)
      foreach ($sd in @($p.Value)) { $row = @($n | Where-Object { $_.class -match 'CheckBox' -and (B $_ 2) -le $cy -and (B $_ 5) -ge $cy } | Sort-Object { B $_ 1 }); & $tick $row[$ord[$sd]] $true; $n = Dump }
    }
  }
}
# длина подоконника/отлива: после галочки справа в строке кнопка «A» → цифровая клавиатура (мм)
function SetLen([string]$section, [string]$item, [int]$len) {
  $it = FindInSection $section $item; if (-not $it) { throw "нет «$item»" }
  Start-Sleep -Milliseconds 800; $n = Dump; $it = $n | Where-Object { (Norm $_.text) -eq $item } | Select-Object -First 1
  $cy = [int](((B $it 2) + (B $it 5)) / 2)
  $a = $n | Where-Object { $_.clickable -eq 'true' -and $_.class -match 'TextView' -and (B $_ 1) -gt (B $it 4) - 5 -and (B $_ 2) -le $cy -and (B $_ 5) -ge $cy } | Select-Object -First 1
  if (-not $a) { throw "нет кнопки длины у «$item»" }
  $c = Center $a; TapXY $c[0] $c[1] 1200
  $k = @{}; Dump | Where-Object { $_.'resource-id' -like '*keypad_dig_*' } | ForEach-Object { $k[$_.'resource-id'.Split('_')[-1]] = Center $_ }
  if (-not $k['yes']) { throw 'не открылась клавиатура длины' }
  TapXY $k['dell'][0] $k['dell'][1] 200; foreach ($ch in "$len".ToCharArray()) { $cc = $k[[string]$ch]; TapXY $cc[0] $cc[1] 150 }; TapXY $k['yes'][0] $k['yes'][1] 1200
}
# своя цена: поле под «своя цена» в настройках окна → цифровая клавиатура WinStudio
function SetOwn([double]$v) {
  PanelTop; $n = Dump; $h = $n | Where-Object { $_.text -eq 'своя цена' } | Select-Object -First 1
  $e = $n | Where-Object { $_.class -match 'EditText' -and (B $_ 2) -ge (B $h 5) } | Sort-Object { B $_ 2 } | Select-Object -First 1
  $c = Center $e; TapXY $c[0] $c[1] 1200
  $k = @{}; Dump | Where-Object { $_.'resource-id' -like '*keypad_dig_*' } | ForEach-Object { $k[$_.'resource-id'.Split('_')[-1]] = Center $_ }
  if (-not $k['yes']) { throw 'не открылась клавиатура своей цены' }
  TapXY $k['dell'][0] $k['dell'][1] 200; foreach ($ch in "$v".Replace(',', '.').ToCharArray()) { $cc = $k[$(if ($ch -eq '.') { 'point' } else { [string]$ch })]; TapXY $cc[0] $cc[1] 150 }; TapXY $k['yes'][0] $k['yes'][1] 1200
}
# куски подоконника/отлива: кнопка справа (A/B) — новый кусок с длиной; в таблице «(n) мм шт» число штук правится тапом
function KeypadEnter([string]$v) {
  $k = @{}; Dump | Where-Object { $_.'resource-id' -like '*keypad_dig_*' } | ForEach-Object { $k[$_.'resource-id'.Split('_')[-1]] = Center $_ }
  if (-not $k['yes']) { throw 'не открылась цифровая клавиатура' }
  TapXY $k['dell'][0] $k['dell'][1] 200; foreach ($ch in $v.ToCharArray()) { $cc = $k[$(if ($ch -eq '.') { 'point' } else { [string]$ch })]; TapXY $cc[0] $cc[1] 150 }; TapXY $k['yes'][0] $k['yes'][1] 1200
}
function AddPiece([string]$section, [string]$item, [int]$len, [int]$qty) {
  $it = FindInSection $section $item; if (-not $it) { throw "нет «$item»" }
  Start-Sleep -Milliseconds 800; $n = Dump; $it = $n | Where-Object { (Norm $_.text) -eq $item } | Select-Object -First 1
  $cy = [int](((B $it 2) + (B $it 5)) / 2)
  $a = $n | Where-Object { $_.clickable -eq 'true' -and $_.class -match 'TextView' -and (B $_ 1) -gt (B $it 4) - 5 -and (B $_ 2) -le $cy -and (B $_ 5) -ge $cy } | Select-Object -First 1
  $c = Center $a; TapXY $c[0] $c[1] 1200; KeypadEnter "$len"
  if ($qty -gt 1) {
    # строка нового куска = последняя «(n)» под этим пунктом; если её не видно (ниже края) — докручиваем панель
    $q = $null
    for ($tries = 0; $tries -lt 4 -and -not $q; $tries++) {
      $n = Dump; $it = $n | Where-Object { (Norm $_.text) -eq $item } | Select-Object -First 1
      $nextItem = $n | Where-Object { $_.class -match 'CheckBox' -and (B $_ 1) -eq 350 -and (B $_ 2) -gt (B $it 2) } | Sort-Object { B $_ 2 } | Select-Object -First 1
      $nextHdr = $n | Where-Object { $_.class -match 'TextView' -and (B $_ 1) -eq 350 -and ((B $_ 4) - (B $_ 1)) -ge 360 -and (B $_ 2) -gt (B $it 2) -and $_.text } | Sort-Object { B $_ 2 } | Select-Object -First 1
      $lims = @(@($nextItem, $nextHdr) | Where-Object { $_ } | ForEach-Object { B $_ 2 }); $lim = if ($lims.Count) { ($lims | Measure-Object -Minimum).Minimum } else { 99999 }
      $rows = @($n | Where-Object { $_.text -match '^\(\d+\)$' -and (B $_ 2) -gt (B $it 2) -and (B $_ 2) -lt $lim -and (B $_ 5) -le 1350 } | Sort-Object { B $_ 2 })
      if (-not $nextItem -and -not $nextHdr -or ($lim -gt 1300)) { Adb "input swipe 535 1100 535 800 1200"; Start-Sleep -Milliseconds 900; continue }
      $r = $rows[-1]; $ry = [int](((B $r 2) + (B $r 5)) / 2)
      $q = $n | Where-Object { $_.clickable -eq 'true' -and (B $_ 1) -ge 500 -and (B $_ 1) -le 510 -and (B $_ 2) -le $ry -and (B $_ 5) -ge $ry } | Select-Object -First 1
    }
    if (-not $q) { throw "не нашёл строку количества у «$item»" }
    $c = Center $q; TapXY $c[0] $c[1] 1200; KeypadEnter "$qty"
  }
}