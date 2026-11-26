# Один вариант окна/двери — по очереди в живой WinStudio (эмулятор) и в нашем редакторе (браузер), сравнение всех колонок.
# Вызов: owner_run.ps1 -File scripts\e2e\owner\v01.json   → строки в docs/winstudio-study/owner-compare.csv, снимки в C:\wsre\live\cmp\
param([Parameter(Mandatory)][string]$File)
. "D:\Eco Rom\scripts\winstudio\ws_win.ps1"
$V = Get-Content $File -Raw -Encoding UTF8 | ConvertFrom-Json
$wsName = { param($s) ($s -replace ("['" + [char]0x02BB + [char]0x2018 + [char]0x2019 + "]"), '').Replace('/', '-') }
New-Item -ItemType Directory -Force C:\wsre\live\cmp | Out-Null
# наша сторона (браузер) идёт ПАРАЛЛЕЛЬНО с WinStudio (эмулятор) — тот же вариант в обеих программах одновременно
$ourJob = Start-Job -ScriptBlock { param($f) Set-Location 'D:\Eco Rom\scripts\e2e'; node owner_ours.mjs $f 2>&1 | ForEach-Object { "$_" } } -ArgumentList (Resolve-Path $File).Path

# ---------- WinStudio ----------
# на экране окна заказа; закрыть остатки диалогов, старые окна удалить
CleanScreen
ClearWindows
# одно окно: «+» → шаблон → размеры → ячейки → настройки окна (вызывается и для доп. окон заказа: $V.more)
function BuildWin($W) {
  TapXY 60 1380 1500
  PickTemplate ([int]$W.tpl)
  if ((Dump) | Where-Object { $_.text -eq 'конфигурация' }) { TapText 'ДА' -ms 2500 }
  if ((Dump) | Where-Object { $_.text -eq 'конфигурация' }) { throw 'не выбрался шаблон' }
  if ($W.w) { SetDim 'W' $W.w }
  if ($W.h) { SetDim 'H' $W.h }
  foreach ($c in @($W.cells)) { if ($c) { CellCfg $c } }
  $O = $W.opts
  if ($O) {
    OpenOptions
    $map = [ordered]@{ scheme = 'финансовая схема'; system = 'оконная система'; glass = 'тип стеклопакетов'; hardware = 'фурнитура'; net = 'москитные сетки'; lamIn = 'ламинация внутренняя'; lamOut = 'ламинация внешняя' }
    foreach ($k in $map.Keys) { if ($O.$k) { $nm = & $wsName $O.$k; if ($k -eq 'scheme') { $nm = $nm -replace '^Chegirma (\d+)%$', 'скидка $1%' }; Pick $map[$k] $nm } }
    $multi = [ordered]@{ ebb = 'тип отливов'; sill = 'тип подоконников'; works = 'работы'; misc = 'разное' }
    foreach ($k in $multi.Keys) { foreach ($x in @($O.$k)) { if ($x) { $nm = if ($x -is [string]) { $x } else { $x.name }; Pick $multi[$k] (& $wsName $nm); if ($x -isnot [string] -and ($x.len -or $x.qty)) { AddPiece $multi[$k] (& $wsName $nm) ([int]$(if ($x.len) { $x.len } else { [int]$W.w })) ([int]$x.qty) }; if ($x -isnot [string]) { foreach ($p in @($x.more)) { if ($p) { AddPiece $multi[$k] (& $wsName $nm) ([int]$p.len) ([int]$p.qty) } } } } } }
    if ($O.qty -gt 1) { Qty $O.qty }
    if ($O.own) { SetOwn ([double]$O.own) }
    if ($O.sides) { SetSides $O.sides }
    CloseOptions
  }
}
BuildWin $V
foreach ($m in @($V.more)) { if ($m) { BuildWin $m } }
Shot "cmp\$($V.id)_ws"
Copy-Item C:\wsre\live\cmp\$($V.id)_ws.png "D:\Eco Rom\scripts\e2e\shots\owner_$($V.id)_ws.png" -Force
$WS = ReadTable

# ---------- ECOROM ----------
$ourJson = (Receive-Job $ourJob -Wait -AutoRemoveJob) | Where-Object { $_ -match '^\{' } | Select-Object -Last 1
$OUR = $ourJson | ConvertFrom-Json

# ---------- сравнение ----------
$colMap = [ordered]@{ 'площадь' = 'maydon'; 'рамы' = 'ramalar'; 'импосты' = 'impostlar'; 'штапики' = 'shtapiklar'; 'уплотн.' = 'zichlagich'; 'створки' = 'tavaqalar'; 'двер.створки' = 'eshik tav.'; 'стекла' = 'shishalar'; 'сэндв.п.' = 'sendv.p.'; 'шпросы' = 'shprosl.'; 'ламин.внутр.' = 'lamin.ichki'; 'ламин.внеш.' = 'lamin.tashqi'; 'работы' = 'ishlar'; 'подоконники' = 'podokonniklar'; 'отливы' = 'otlivlar'; 'фурнитура' = 'furnitura'; 'моск.сетки' = ("pashsha to" + [char]0x2018 + "ri"); 'разное' = 'har xil'; 'подстав.проф' = 'tayanch prof'; 'порог' = "bo'sag'a"; 'наличн.углов' = 'burchak pesht.'; 'соединит.проф' = 'ulovchi prof'; 'соед.проф.90°' = 'ulovchi prof 90°'; 'соед.проф.135°' = 'ulovchi prof 135°'; 'нащельники' = 'qoplamalar'; 'добор.15' = 'dobor.15'; 'добор.20' = 'dobor.20'; 'добор.40' = 'dobor.40'; 'добор.60' = 'dobor.60'; 'добор.80' = 'dobor.80'; 'добор.100' = 'dobor.100' }
$rowMap = [ordered]@{ 'окно' = 'oyna'; 'цена' = 'narx'; 'все окна' = 'barcha oynalar'; 'стоимость' = 'qiymat' }
function Num($s) { $t = ("$s" -replace '\(.*\)', '' -replace '[^\d.,-]', '').Replace(',', '.'); if ($t -eq '' -or $t -eq '-' -or $t -eq '.') { 0.0 } else { [double]$t } }
$csv = "D:\Eco Rom\docs\winstudio-study\owner-compare.csv"
if (-not (Test-Path $csv)) { 'вариант;колонка;строка;WinStudio;ECOROM;разница;итог' | Out-File $csv -Encoding utf8 }
$bad = 0; $lines = @()
foreach ($wc in $colMap.Keys) {
  $oc = $colMap[$wc]
  foreach ($wr in $rowMap.Keys) {
    $a = $WS.cols[$wc]; $wv = if ($a) { $a[$wr] } else { $null }
    $b = $OUR.cols.$oc; $ov = if ($b) { $b.($rowMap[$wr]) } else { $null }
    if ($null -eq $wv -and $wc -ne 'добор.100') { $wv = '?' }
    $x = Num $wv; $y = Num $ov
    $money = $wr -in 'цена', 'стоимость'
    $tol = if ($money) { [math]::Max(1.0, [math]::Abs($x) * 3e-7) } else { 0.0051 }
    $ok = ($wv -ne '?') -and ([math]::Abs($x - $y) -le $tol)
    if ($wc -eq 'добор.100' -and $null -eq $wv) { $ok = $true }
    if (-not $ok) { $bad++ }
    $lines += "$($V.id);$wc;$wr;$wv;$ov;$([math]::Round($y - $x, 2));$(if ($ok) { 'OK' } else { 'РАЗНИЦА' })"
  }
}
foreach ($wr in $rowMap.Keys) {
  $wv = $WS.total[$wr]; $ov = $OUR.total.($rowMap[$wr]); $x = Num $wv; $y = Num $ov; $ok = [math]::Abs($x - $y) -le [math]::Max(1.0, [math]::Abs($x) * 3e-7); if (-not $ok) { $bad++ }
  $lines += "$($V.id);всего;$wr;$wv;$ov;$([math]::Round($y - $x, 2));$(if ($ok) { 'OK' } else { 'РАЗНИЦА' })"
}
$lines | Out-File $csv -Append -Encoding utf8
"$($V.id): $(if ($bad) { "РАЗНИЦА в $bad ячейках" } else { 'совпало всё' })  | WinStudio всего: $($WS.total['стоимость'])  | ECOROM: $($OUR.total.qiymat)$(if ($OUR.errs.Count) { ' | ошибки страницы: ' + ($OUR.errs -join '; ') })"
$lines | Where-Object { $_ -match 'РАЗНИЦА$' }
