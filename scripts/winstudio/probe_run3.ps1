. "D:\Eco Rom\scripts\winstudio\probe_lib.ps1"
$out = "D:\Eco Rom\docs\winstudio-study\probes.txt"
$runs = @(
  @{ n='PC seat=1 dorsill=1e3 corner_jamb=1e6'; o='PC'; s=@{ system_seat_profile=1; system_dorsill=1000; system_corner_jamb_profile=1000000 } },
  @{ n='PC joint=1'; o='PC'; s=@{ system_joint_profile=1 } },
  @{ n='PC joint=1 PD'; o='PD'; s=@{ system_joint_profile=1 } },
  @{ n='PD gap=1'; o='PD'; s=@{ system_gap_profile=1 } },
  @{ n='PD ext20=1 ext40=1e3 ext60=1e6'; o='PD'; s=@{ system_extender_profile_20=1; system_extender_profile_40=1000; system_extender_profile_60=1000000 } },
  @{ n='PD ext80=1 ext100=1e3'; o='PD'; s=@{ system_extender_profile_80=1; system_extender_profile_100=1000 } }
)
foreach ($r in $runs) {
  $line = Probe $r.n $r.s @{} @{} @{} $r.o | Select-Object -Last 1
  Add-Content $out $line -Encoding UTF8
  $line
}
