. "D:\Eco Rom\scripts\winstudio\lib.ps1"
$out = "D:\Eco Rom\docs\winstudio-study\grid.csv"
NewWindow 0
Configure 'none' 3 $false $false $false
Measure-Grid "win_turnR_1leaf" @(600,800,1000,1500,2000,3000) @(600,900,1200,1500,2000) $out
