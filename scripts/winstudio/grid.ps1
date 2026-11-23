param([string]$Tag="case",[int[]]$Widths=@(600,800,1000,1500,2000,3000),[int[]]$Heights=@(600,900,1200,1500,2000),[string]$Out="D:\Eco Rom\docs\winstudio-study\grid.csv")
. "D:\Eco Rom\scripts\winstudio\lib.ps1"
Measure-Grid $Tag $Widths $Heights $Out

