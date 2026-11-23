. "D:\Eco Rom\scripts\winstudio\lib.ps1"
$out = "D:\Eco Rom\docs\winstudio-study\grid.csv"
# tpl: 1 = две вертикальные, 2 = три вертикальные, 4 = две горизонтальные, 5 = три горизонтальные (все глухие)
foreach ($t in 1,2) { NewWindow $t; Measure-Grid "fx_tpl$t" @(1500,1800,2200,3000) @(900,1200,1500,2000) $out }
foreach ($t in 4,5) { NewWindow $t; Measure-Grid "fx_tpl$t" @(600,1000,1500,2000) @(1500,1800,2200,3000) $out }
