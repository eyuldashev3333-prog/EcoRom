# Перепроверка ТОЛЬКО нашей стороны: WinStudio не менялась, её цифры берём из последнего живого прогона каждого варианта
# (docs/winstudio-study/owner-compare-run2.csv + owner-compare.csv), наш сайт строит тот же вариант заново через интерфейс.
param([Parameter(Mandatory)][string[]]$Ids, [string]$Out = 'D:\Eco Rom\docs\winstudio-study\owner-compare-final.csv')
$src = @('D:\Eco Rom\docs\winstudio-study\owner-compare-run2.csv', 'D:\Eco Rom\docs\winstudio-study\owner-compare.csv') | Where-Object { Test-Path $_ }
# последний прогон варианта = последний непрерывный блок его строк
$ws = @{}
foreach ($f in $src) {
  $cur = $null
  foreach ($l in Get-Content $f -Encoding UTF8) {
    $p = $l -split ';'; if ($p.Count -lt 7 -or $p[0] -eq 'вариант') { continue }
    if ($p[0] -ne $cur) { $cur = $p[0]; $ws[$cur] = @{} }
    $ws[$cur]["$($p[1])|$($p[2])"] = $p[3]
  }
}
$colMap = [ordered]@{ 'площадь' = 'maydon'; 'рамы' = 'ramalar'; 'импосты' = 'impostlar'; 'штапики' = 'shtapiklar'; 'уплотн.' = 'zichlagich'; 'створки' = 'tavaqalar'; 'двер.створки' = 'eshik tav.'; 'стекла' = 'shishalar'; 'сэндв.п.' = 'sendv.p.'; 'шпросы' = 'shprosl.'; 'ламин.внутр.' = 'lamin.ichki'; 'ламин.внеш.' = 'lamin.tashqi'; 'работы' = 'ishlar'; 'подоконники' = 'podokonniklar'; 'отливы' = 'otlivlar'; 'фурнитура' = 'furnitura'; 'моск.сетки' = ("pashsha to" + [char]0x2018 + "ri"); 'разное' = 'har xil'; 'подстав.проф' = 'tayanch prof'; 'порог' = "bo'sag'a"; 'наличн.углов' = 'burchak pesht.'; 'соединит.проф' = 'ulovchi prof'; 'соед.проф.90°' = 'ulovchi prof 90°'; 'соед.проф.135°' = 'ulovchi prof 135°'; 'нащельники' = 'qoplamalar'; 'добор.15' = 'dobor.15'; 'добор.20' = 'dobor.20'; 'добор.40' = 'dobor.40'; 'добор.60' = 'dobor.60'; 'добор.80' = 'dobor.80'; 'добор.100' = 'dobor.100' }
$rowMap = [ordered]@{ 'окно' = 'oyna'; 'цена' = 'narx'; 'все окна' = 'barcha oynalar'; 'стоимость' = 'qiymat' }
function Num($s) { $t = ("$s" -replace '\(.*\)', '' -replace '[^\d.,-]', '').Replace(',', '.'); if ($t -eq '' -or $t -eq '-' -or $t -eq '.') { 0.0 } else { [double]$t } }
if (-not (Test-Path $Out)) { 'вариант;колонка;строка;WinStudio;ECOROM;разница;итог' | Out-File $Out -Encoding utf8 }
foreach ($id in $Ids) {
  if (-not $ws.ContainsKey($id)) { "${id}: нет сохранённого результата WinStudio"; continue }
  Push-Location 'D:\Eco Rom\scripts\e2e'
  $json = node owner_ours.mjs "owner\$id.json" 2>$null | Where-Object { $_ -match '^\{' } | Select-Object -Last 1
  Pop-Location
  if (-not $json) { "${id}: СБОЙ нашей стороны"; continue }
  $OUR = $json | ConvertFrom-Json
  $W = $ws[$id]; $bad = 0; $lines = @()
  foreach ($wc in $colMap.Keys) { foreach ($wr in $rowMap.Keys) {
    $wv = $W["$wc|$wr"]; $b = $OUR.cols.($colMap[$wc]); $ov = if ($b) { $b.($rowMap[$wr]) } else { $null }
    $x = Num $wv; $y = Num $ov; $money = $wr -in 'цена', 'стоимость'
    $tol = if ($money) { [math]::Max(1.0, [math]::Abs($x) * 3e-7) } else { 0.0051 }
    $ok = ($null -ne $wv) -and ([math]::Abs($x - $y) -le $tol); if ($null -eq $wv -and $wc -eq 'добор.100') { $ok = $true }
    if (-not $ok) { $bad++ }; $lines += "$id;$wc;$wr;$wv;$ov;$([math]::Round($y - $x, 2));$(if ($ok) { 'OK' } else { 'РАЗНИЦА' })" } }
  foreach ($wr in $rowMap.Keys) { $wv = $W["всего|$wr"]; $ov = $OUR.total.($rowMap[$wr]); $x = Num $wv; $y = Num $ov; $ok = [math]::Abs($x - $y) -le [math]::Max(1.0, [math]::Abs($x) * 3e-7); if (-not $ok) { $bad++ }; $lines += "$id;всего;$wr;$wv;$ov;$([math]::Round($y - $x, 2));$(if ($ok) { 'OK' } else { 'РАЗНИЦА' })" }
  $lines | Out-File $Out -Append -Encoding utf8
  "${id}: $(if ($bad) { "РАЗНИЦА в $bad ячейках" } else { 'совпало всё' })  | WinStudio: $($W['всего|стоимость'])  | ECOROM: $($OUR.total.qiymat)"
  $lines | Where-Object { $_ -match 'РАЗНИЦА$' } | Select-Object -First 8 | ForEach-Object { "   $_" }
}
'ГОТОВО'
