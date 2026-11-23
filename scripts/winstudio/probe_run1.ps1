. "D:\Eco Rom\scripts\winstudio\probe_lib.ps1"
$out = "D:\Eco Rom\docs\winstudio-study\probes.txt"
$runs = @(
  @{ n='mech rot=1 hor=1e3 vert=1e6'; s=@{ system_mehanic_rot=1; system_mehanic_hor=1000; system_mehanic_vert=1000000 } },
  @{ n='corner_frame=1 corner_leaf=1e3 connector=1e6'; s=@{ system_firm_corner_frame=1; system_firm_corner_leaf=1000; system_impost_connector=1000000 } },
  @{ n='handles regular=1 lock=1e3 balcony=1e6'; s=@{}; f=@{ furniture_handle_regular=1; furniture_handle_with_lock=1000; furniture_handle_balcony=1000000 } },
  @{ n='firm_frame=1'; s=@{ system_firm_frame=1 } },
  @{ n='firm_impost=1'; s=@{ system_firm_impost=1 } },
  @{ n='firm_leaf=1'; s=@{ system_firm_leaf=1 } },
  @{ n='leaf=1'; s=@{ system_leaf=1 } },
  @{ n='impost=1'; s=@{ system_impost=1 } },
  @{ n='shtapik=1'; s=@{ system_shtapik=1 } },
  @{ n='rubber=1'; s=@{ system_rubber_sealant=1 } }
)
foreach ($r in $runs) {
  $fur = if ($r.f) { $r.f } else { @{} }
  $line = Probe $r.n $r.s $fur | Select-Object -Last 1
  Add-Content $out $line -Encoding UTF8
  $line
}
