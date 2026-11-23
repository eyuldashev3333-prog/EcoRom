. "D:\Eco Rom\scripts\winstudio\probe_lib.ps1"
$out = "D:\Eco Rom\docs\winstudio-study\lamination.csv"
"win,area,frame,impost,bead,gasket,sash,doorsash,glass,sandwich,shpros,lam_in,lam_out" | Set-Content $out -Encoding UTF8
OpenProbeOrder 'PF'
foreach ($j in 6,5,4,3,2,1) {
  $y = if ($j -eq 1) { 750 } else { 180 + 120 * (6 - $j) }
  & $adb -s $dev shell "input tap 1540 $y"; Start-Sleep -Milliseconds 1200
  $t = Texts
  $i = -1; for ($k = 8; $k -lt $t.Count; $k++) { if ($t[$k] -match '^[0-9]+\.[0-9]+ (m2|m)$') { $i = $k; break } }
  $row = $t[$i..($i+12)] | ForEach-Object { $_ -replace ' (m2|m)$','' }
  "w$j," + ($row -join ',') | Add-Content $out -Encoding UTF8
}
Get-Content $out
