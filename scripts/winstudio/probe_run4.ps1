. "D:\Eco Rom\scripts\winstudio\probe_lib.ps1"
$out = "D:\Eco Rom\docs\winstudio-study\probes.txt"
foreach ($r in @(
  @{ n='PA glass1=1'; o='PA'; g=@{ glass_glass1=1 } },
  @{ n='PA glass2=1'; o='PA'; g=@{ glass_glass2=1 } },
  @{ n='PA spacers=1'; o='PA'; g=@{ glass_spacers=1 } },
  @{ n='PB spacers=1'; o='PB'; g=@{ glass_spacers=1 } },
  @{ n='PA sealant=1'; o='PA'; g=@{ glass_sealant=1 } }
)) { $line = Probe $r.n @{} @{} @{} $r.g $r.o | Select-Object -Last 1; Add-Content $out $line -Encoding UTF8; $line }
