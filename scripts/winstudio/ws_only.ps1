# Только сторона WinStudio: строит вариант в живой WinStudio и записывает её цифры (строки как в owner-compare.csv, колонка ECOROM пустая)
# в docs/winstudio-study/owner-compare.csv — оттуда их берёт ours_only.ps1. Нужен, когда наша сторона занята другим прогоном.
param([Parameter(Mandatory)][string[]]$Ids)
. "D:\Eco Rom\scripts\winstudio\ws_win.ps1"
$wsName = { param($s) ($s -replace ("['" + [char]0x02BB + [char]0x2018 + [char]0x2019 + "]"), '').Replace('/', '-') }
$csv = 'D:\Eco Rom\docs\winstudio-study\owner-compare.csv'
if (-not (Test-Path $csv)) { 'вариант;колонка;строка;WinStudio;ECOROM;разница;итог' | Out-File $csv -Encoding utf8 }
# BuildWin берём из owner_run.ps1 (одна реализация)
$src = Get-Content 'D:\Eco Rom\scripts\winstudio\owner_run.ps1' -Raw -Encoding UTF8
$fn = $src.Substring($src.IndexOf('function BuildWin'), $src.IndexOf('BuildWin $V') - $src.IndexOf('function BuildWin'))
Invoke-Expression $fn
foreach ($id in $Ids) {
  try {
    $V = Get-Content "D:\Eco Rom\scripts\e2e\owner\$id.json" -Raw -Encoding UTF8 | ConvertFrom-Json
    CleanScreen; ClearWindows
    BuildWin $V
    foreach ($m in @($V.more)) { if ($m) { BuildWin $m } }
    Shot "cmp\${id}_ws"; Copy-Item "C:\wsre\live\cmp\${id}_ws.png" "D:\Eco Rom\scripts\e2e\shots\owner_${id}_ws.png" -Force
    $WS = ReadTable
    $lines = @(); foreach ($c in $WS.cols.Keys) { foreach ($r in $WS.cols[$c].Keys) { $lines += "$id;$c;$r;$($WS.cols[$c][$r]);;;WS" } }
    foreach ($r in $WS.total.Keys) { $lines += "$id;всего;$r;$($WS.total[$r]);;;WS" }
    $lines | Out-File $csv -Append -Encoding utf8
    "${id}: WinStudio записана, всего $($WS.total['стоимость'])"
  } catch { "${id}: СБОЙ: $($_.Exception.Message)" }
}
