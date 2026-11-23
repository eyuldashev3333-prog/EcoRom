. "D:\Eco Rom\scripts\winstudio\lib.ps1"
$out = "D:\Eco Rom\docs\winstudio-study\grid.csv"
Tap @(530,838); Start-Sleep 1   # закрыть диалог, если открыт
$sizes = @(@(1000,1200),@(1500,1500),@(2000,900))
foreach ($op in 0..9) {
  Configure 'none' $op $false $false $false
  foreach ($sz in $sizes) { Measure-Grid "win_op$op" @($sz[0]) @($sz[1]) $out }
}
