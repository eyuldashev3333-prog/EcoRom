# Пробы ключей прайса, которые раньше не снимали: system_door_leaf, system_firm_door_leaf, system_sandwiches.
# Заказ PR/PG: окно 1 — глухая сэндвич-панель 1000x1200, окно 2 — створка + сэндвич 1000x1200, окно 3 — дверь 1000x2100. Результат → probes.txt (строки DS).
. "D:\Eco Rom\scripts\winstudio\probe_lib.ps1"
$out = "D:\Eco Rom\docs\winstudio-study\probes.txt"
$base = "/sdcard/Android/data/com.blogspot.turbocolor.winstudio/files/WindowsStudio/Customers"
$b = "C:\wsre\probe_build_g"
Remove-Item $b -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$b\PR\PG" | Out-Null
$sysA = "ПВХ система " + [string][char]0x0410
$tmpl = (Get-Content "C:\wsre\probe_orders\20261123041053.wnd" -Raw -Encoding UTF8)
$single = { param($w, $h) "wblock{vsx{0.0 $w.0}vsx vsy{0.0 $h.0}vsy pns{0:0 1:1}pns frs{0:1}frs ops{0:1}ops imps{}imps opsfrs{0}opsfrs impsfrs{-1}impsfrs}wblock" }
function Wnd($code, $ops, $doors, $sand) {
  $t = $tmpl
  foreach ($kv in @(@('winCode', $code), @('winOpeningsArray', $ops), @('winIsDoorArray', $doors), @('winMosquitoNetArray', ' false'), @('winSystem', $sysA), @('winFurniture', 'белая тип 1'), @('winMoskitonet', 'сетка белая'), @('winGlass', 'простое 4-6-4'), @('winIsSandwiches', $sand))) {
    $t = [regex]::Replace($t, "(?m)^$($kv[0]) ::: .*$", "$($kv[0]) ::: $($kv[1])")
  }
  $t
}
$enc = New-Object Text.UTF8Encoding $false
$G = @(
  @('20261124000061', (& $single 1000 1200), ' OPEN_NONE', ' false', 'true false false'),
  @('20261124000062', (& $single 1000 1200), ' OPEN_RIGHT', ' false', 'true false false'),
  @('20261124000063', (& $single 1000 2100), ' OPEN_RIGHT', ' true', 'false false false'))
foreach ($w in $G) { [IO.File]::WriteAllText("$b\PR\PG\$($w[0]).wnd", (Wnd $w[1] $w[2] $w[3] $w[4]), $enc) }
[IO.File]::WriteAllText("$b\PR\PG\order.extra", "ordID{}ordID", $enc)
& $adb -s $dev shell "rm -rf '$base/PR/PG'"
& $adb -s $dev push "$b\PR\PG" "$base/PR/" | Out-Null
$M = '1000000'
$SYS = $SYS_KEYS + 'system_door_leaf', 'system_firm_door_leaf', 'system_sandwiches'
foreach ($k in 'system_door_leaf', 'system_firm_door_leaf', 'system_sandwiches', 'system_leaf', 'system_firm_leaf') {
  PushPrice "winsystems/ПВХ система $A.wprc" $SYS @{ $k = $M }
  OpenProbeOrder 'PG'
  $r = @{}
  foreach ($j in 3,2,1) {
    & $adb -s $dev shell "input tap 1540 $(180 + 120 * (3 - $j))"; Start-Sleep -Milliseconds 1200
    $tx = Texts; $i = [array]::IndexOf($tx, ([string][char]0x0432 + [char]0x0441 + [char]0x0435 + [char]0x0433 + [char]0x043E)); $v = $null
    if ($i -ge 0) { for ($q = $i + 1; $q -lt [math]::Min($tx.Count, $i + 4); $q++) { if ($tx[$q] -match '^([0-9.,]+)\s') { $v = [double]($Matches[1] -replace ',', '.'); break } } }
    $r[$j] = $v
  }
  $line = "DS PG $k=1e6 : " + ((1..3 | ForEach-Object { "w$_=$($r[$_])" }) -join ' ')
  Add-Content $out $line -Encoding UTF8; $line
}
