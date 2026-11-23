. "D:\Eco Rom\scripts\winstudio\probe_lib.ps1"
$out = "D:\Eco Rom\docs\winstudio-study\probes.txt"
$O = 'PB'
$runs = @(
  @{ n='PB mech rot=1 hor=1e3 vert=1e6'; s=@{ system_mehanic_rot=1; system_mehanic_hor=1000; system_mehanic_vert=1000000 } },
  @{ n='PB handles regular=1 lock=1e3 balcony=1e6'; s=@{}; f=@{ furniture_handle_regular=1; furniture_handle_with_lock=1000; furniture_handle_balcony=1000000 } },
  @{ n='PB leaf=1'; s=@{ system_leaf=1 } },
  @{ n='PB corner_leaf=1'; s=@{ system_firm_corner_leaf=1 } },
  @{ n='PB net grid=1'; s=@{}; net=@{ mosquito_grid=1 } },
  @{ n='PB net profile=1'; s=@{}; net=@{ mosquito_profile=1 } },
  @{ n='PB net gum=1'; s=@{}; net=@{ mosquito_gum=1 } },
  @{ n='PB net corners=1'; s=@{}; net=@{ mosquito_corners=1 } },
  @{ n='PB net holders=1'; s=@{}; net=@{ mosquito_holders=1 } },
  @{ n='PB net handles=1'; s=@{}; net=@{ mosquito_handles=1 } }
)
foreach ($r in $runs) {
  $fur = if ($r.f) { $r.f } else { @{} }
  $net = if ($r.net) { $r.net } else { @{} }
  $line = Probe $r.n $r.s $fur $net @{} $O | Select-Object -Last 1
  Add-Content $out $line -Encoding UTF8
  $line
}
