# Сквозная сверка цены окна: 6 разных окон с набором опций, у всех статей прайса «свои» разные цены. Читаем стоимость окон из живой WinStudio
# и сохраняем фикстуру app/src/lib/__fixtures__/winstudio-full.json (цены + окна + ответы), по ней тест quote.full.test.ts сверяет наш расчёт.
# Эмулятор в горизонтальном режиме (wm size reset).
. "D:\Eco Rom\scripts\winstudio\probe_lib.ps1"
$B = [string][char]0x0412
$sysName = "ПВХ система $B"
$base = "/sdcard/Android/data/com.blogspot.turbocolor.winstudio/files/WindowsStudio/Customers"
$enc = New-Object Text.UTF8Encoding $false
# ---- цены (разные, «некруглые») ----
$sysP = [ordered]@{ system_frame='301.5'; system_impost='289.25'; system_leaf='262.4'; system_shtapik='91.7'; system_rubber_sealant='15.35'; system_firm_frame='221.1'; system_firm_impost='231.6'; system_firm_leaf='233.3'; system_mehanic_rot='1411.5'; system_mehanic_hor='987.25'; system_mehanic_vert='891.75'; system_firm_corner_frame='7.5'; system_firm_corner_leaf='6.25'; system_impost_connector='44.4'; system_seat_profile='83.9'; system_dorsill='295.5'; system_corner_jamb_profile='150.3'; system_joint_profile='290.5'; system_gap_profile='24.5'; system_extender_profile_20='202.3'; system_extender_profile_40='265.2'; system_extender_profile_60='285.3'; system_extender_profile_80='380.2'; system_extender_profile_100='394.2'; system_door_leaf='271.9'; system_firm_door_leaf='238.4'; system_sandwiches='512.5' }
$glP = [ordered]@{ glass_glass1='490'; glass_glass2='491'; glass_glass3='492'; glass_film='3.3'; glass_spacers='1.57'; glass_dryer='2.12'; glass_butil_stripe='1.41'; glass_sealant='2.52'; glass_gas='4.4' }
$furP = [ordered]@{ furniture_handle_regular='483'; furniture_handle_with_lock='692'; furniture_handle_balcony='60' }
$netP = [ordered]@{ mosquito_grid='153'; mosquito_profile='165'; mosquito_gum='4.1'; mosquito_corners='2.5'; mosquito_holders='2.6'; mosquito_handles='11.5' }
function W([string]$rel, $h) { PushRaw $rel (($h.GetEnumerator() | ForEach-Object { "$($_.Key):::$($_.Value)" }) -join "`n") }
W "winsystems/$sysName.wprc" $sysP
W "winglasses/простое 4-6-4-6-4.wprc" $glP
W "furniture/белая тип 1.wprc" $furP
W "mosquitonet/сетка белая.wprc" $netP
PushRaw "lamination/светлый дуб.wprc" "lamination_cost_m2:::190.5"
PushRaw "sillsinner/белый 300.wprc" "sillinner_body:::736.5`nsillinner_cap:::20.5"
PushRaw "sillsouter/отлив белый 200.wprc" "sillouter_body:::213.5`nsillouter_cap:::40.5"
PushRaw "jobs/монтаж.wprc" "jobs_cost:::689.5"
PushRaw "extramaterials/пена монтажная.wprc" "extras_cost:::615.5"

# ---- окна ----
$tmpl = (Get-Content "C:\wsre\probe_orders\20261123041053.wnd" -Raw -Encoding UTF8)
$single = { param($w, $h) "wblock{vsx{0.0 $w.0}vsx vsy{0.0 $h.0}vsy pns{0:0 1:1}pns frs{0:1}frs ops{0:1}ops imps{}imps opsfrs{0}opsfrs impsfrs{-1}impsfrs}wblock" }
$v2 = { param($w, $h) "wblock{vsx{0.0 750.0 $w.0}vsx vsy{0.0 $h.0}vsy pns{0:0 1:0 1:1 2:1}pns frs{0:3}frs ops{0:2 1:3}ops imps{1:2}imps opsfrs{0|1}opsfrs impsfrs{0}impsfrs}wblock" }
$v3 = { param($w, $h) "wblock{vsx{0.0 600.0 1200.0 $w.0}vsx vsy{0.0 $h.0}vsy pns{0:0 1:0 1:1 2:0 2:1 3:1}pns frs{0:5}frs ops{0:2 1:4 3:5}ops imps{1:2 3:4}imps opsfrs{0|1|2}opsfrs impsfrs{0|1}impsfrs}wblock" }
$wins = @(
  @{ code = (& $single 1200 1500); ops = ' OPEN_TOP_LEFT'; doors = ' false'; nets = ' true'; extra = @{ winGlass='простое 4-6-4-6-4'; winInnerSill='белый 300'; winOuterSill='отлив белый 200'; winWorks='монтаж'; winAditions='пена монтажная'; winLaminationInner='светлый дуб'; winLaminationOuter='светлый дуб' } },
  @{ code = (& $single 800 2100); ops = ' OPEN_RIGHT'; doors = ' true'; nets = ' false'; extra = @{ winGlass='простое 4-6-4-6-4'; winWorks='монтаж'; winAddonSeatProfile='true'; winAddonDorsill='true'; winAddonCornerJamb='true' } },
  @{ code = (& $v2 1800 1400); ops = ' OPEN_TOP_LEFT OPEN_NONE'; doors = ' false false'; nets = ' true false'; extra = @{ winGlass='простое 4-6-4-6-4'; winAddonJointProfile='true false true false'; winAddonGapProfile='false true false false'; winAddonExtender20='false true false true'; winAddonExtender100='true false false false' } },
  @{ code = (& $v3 2400 1500); ops = ' OPEN_RIGHT OPEN_NONE OPEN_LEFT'; doors = ' false false false'; nets = ' false false false'; extra = @{ winGlass='простое 4-6-4-6-4'; winLaminationInner='светлый дуб'; winInnerSill='белый 300' } },
  @{ code = (& $single 1000 1000); ops = ' OPEN_BOTTOM'; doors = ' false'; nets = ' false'; extra = @{ winGlass='простое 4-6-4-6-4'; winAddonJointProfile90deg='true true true true'; winAddonJointProfile135deg='false false true true'; winAddonExtender15='true false false false'; winAddonExtender60='false false true false'; winAddonExtender80='false true false false' } },
  @{ code = (& $single 900 1200); ops = ' OPEN_NONE'; doors = ' false'; nets = ' false'; extra = @{ winGlass='простое 4-6-4-6-4'; winIsSandwiches='true false false' } })
$b = "C:\wsre\probe_build_h"
Remove-Item $b -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$b\PR\PH" | Out-Null
$i = 70
foreach ($w in $wins) {
  $t = $tmpl
  $fields = @{ winCode = $w.code; winOpeningsArray = $w.ops; winIsDoorArray = $w.doors; winMosquitoNetArray = $w.nets; winSystem = $sysName; winFurniture = 'белая тип 1'; winMoskitonet = 'сетка белая'; winGlass = ''; winFinance = '' }
  foreach ($k in $w.extra.Keys) { $fields[$k] = $w.extra[$k] }
  foreach ($k in $fields.Keys) { $t = [regex]::Replace($t, "(?m)^$k ::: .*$", ("$k ::: " + $fields[$k]).Replace('$', '$$')) }
  [IO.File]::WriteAllText("$b\PR\PH\202611240000$i.wnd", $t, $enc); $i++
}
[IO.File]::WriteAllText("$b\PR\PH\order.extra", "ordID{}ordID", $enc)
& $adb -s $dev shell "rm -rf '$base/PR/PH'"
& $adb -s $dev push "$b\PR\PH" "$base/PR/" | Out-Null
OpenProbeOrder 'PH'
$res = ReadWindowTotals
$out = [ordered]@{ prices = [ordered]@{ system = $sysP; glass = $glP; furniture = $furP; net = $netP; lamination = 190.5; sillInner = @(736.5, 20.5); sillOuter = @(213.5, 40.5); job = 689.5; extra = 615.5 }
  windows = @(); expected = @() }
for ($j = 0; $j -lt $wins.Count; $j++) { $out.windows += @{ code = $wins[$j].code; ops = $wins[$j].ops.Trim(); doors = $wins[$j].doors.Trim(); nets = $wins[$j].nets.Trim(); extra = $wins[$j].extra } }
foreach ($j in 1..6) { $out.expected += $res[$j] }
($out | ConvertTo-Json -Depth 6) | Set-Content "D:\Eco Rom\app\src\lib\__fixtures__\winstudio-full.json" -Encoding UTF8
"EXPECTED: " + (($res.GetEnumerator() | Sort-Object Name | ForEach-Object { "w$($_.Name)=$($_.Value)" }) -join ' ')
