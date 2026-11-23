# Пробные заказы для замеров прайса: PR/PA (окна по типам открывания) и PR/PB (двери и москитные сетки). Запуск: powershell -File build_probe_orders.ps1
$adb = "C:\wsre\adb.exe"; $dev = "127.0.0.1:5555"
$base = "/sdcard/Android/data/com.blogspot.turbocolor.winstudio/files/WindowsStudio/Customers"
$b = "C:\wsre\probe_build"
Remove-Item $b -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$b\PR\PA", "$b\PR\PB", "$b\PR\PC", "$b\PR\PD" | Out-Null
$sysA = "ПВХ система " + [string][char]0x0410
$tmpl = (Get-Content "C:\wsre\probe_orders\20261123041053.wnd" -Raw -Encoding UTF8)
function Wnd($code, $ops, $doors, $nets, $extra = @{}) {
  $t = $tmpl
  foreach ($kv in @(@('winCode', $code), @('winOpeningsArray', $ops), @('winIsDoorArray', $doors), @('winMosquitoNetArray', $nets), @('winSystem', $sysA), @('winFurniture', 'белая тип 1'), @('winMoskitonet', 'сетка белая'), @('winGlass', 'простое 4-6-4'))) {
    $t = [regex]::Replace($t, "(?m)^$($kv[0]) ::: .*$", "$($kv[0]) ::: $($kv[1])")
  }
  foreach ($k in $extra.Keys) { $t = [regex]::Replace($t, "(?m)^$k ::: .*$", "$k ::: $($extra[$k])") }
  $t
}
$single = { param($w, $h) "wblock{vsx{0.0 $w.0}vsx vsy{0.0 $h.0}vsy pns{0:0 1:1}pns frs{0:1}frs ops{0:1}ops imps{}imps opsfrs{0}opsfrs impsfrs{-1}impsfrs}wblock" }
$v2 = "wblock{vsx{0.0 750.0 1500.0}vsx vsy{0.0 1500.0}vsy pns{0:0 1:0 1:1 2:1}pns frs{0:3}frs ops{0:2 1:3}ops imps{1:2}imps opsfrs{0|1}opsfrs impsfrs{0}impsfrs}wblock"
$v3 = "wblock{vsx{0.0 600.0 1200.0 1500.0}vsx vsy{0.0 1500.0}vsy pns{0:0 1:0 1:1 2:0 2:1 3:1}pns frs{0:5}frs ops{0:2 1:4 3:5}ops imps{1:2 3:4}imps opsfrs{0|1|2}opsfrs impsfrs{0|1}impsfrs}wblock"
$h2 = "wblock{vsx{0.0 1000.0}vsx vsy{0.0 1000.0 2100.0}vsy pns{0:0 0:1 1:1 1:2}pns frs{0:3}frs ops{0:2 1:3}ops imps{1:2}imps opsfrs{0|1}opsfrs impsfrs{0}impsfrs}wblock"
$PA = @(
  @('20261124000001', (& $single 1000 1200), ' OPEN_RIGHT', ' false', ' false'),
  @('20261124000002', (& $single 1000 1200), ' OPEN_TOP_LEFT', ' false', ' false'),
  @('20261124000003', (& $single 1000 1200), ' OPEN_BOTTOM', ' false', ' false'),
  @('20261124000004', (& $single 1000 2100), ' OPEN_RIGHT', ' true', ' false'),
  @('20261124000005', $v2, ' OPEN_RIGHT OPEN_LEFT', ' false false', ' false false'),
  @('20261124000006', $v3, ' OPEN_TOP_LEFT OPEN_NONE OPEN_RIGHT', ' false false false', ' false false false'))
$PB = @(
  @('20261124000011', (& $single 1000 2100), ' OPEN_TOP_LEFT', ' true', ' false'),
  @('20261124000012', $v2, ' OPEN_RIGHT OPEN_NONE', ' true false', ' false false'),
  @('20261124000013', $h2, ' OPEN_BOTTOM OPEN_RIGHT', ' false true', ' false false'),
  @('20261124000014', (& $single 1000 1200), ' OPEN_RIGHT', ' false', ' true'),
  @('20261124000015', $v2, ' OPEN_RIGHT OPEN_LEFT', ' false false', ' true true'),
  @('20261124000016', (& $single 1000 2100), ' OPEN_RIGHT', ' true', ' true'))
$enc = New-Object Text.UTF8Encoding $false
foreach ($w in $PA) { [IO.File]::WriteAllText("$b\PR\PA\$($w[0]).wnd", (Wnd $w[1] $w[2] $w[3] $w[4]), $enc) }
foreach ($w in $PB) { [IO.File]::WriteAllText("$b\PR\PB\$($w[0]).wnd", (Wnd $w[1] $w[2] $w[3] $w[4]), $enc) }
$one = (& $single 1000 1200)
function Ad($k, $v) { @{ $k = $v } }
$PC = @(
  @('20261124000021', $one, ' OPEN_RIGHT', ' false', ' false', (Ad 'winAddonSeatProfile' 'true')),
  @('20261124000022', $one, ' OPEN_RIGHT', ' false', ' false', (Ad 'winAddonDorsill' 'true')),
  @('20261124000023', $one, ' OPEN_RIGHT', ' false', ' false', (Ad 'winAddonCornerJamb' 'true')),
  @('20261124000024', $one, ' OPEN_RIGHT', ' false', ' false', (Ad 'winAddonJointProfile' 'true false false false')),
  @('20261124000025', $one, ' OPEN_RIGHT', ' false', ' false', (Ad 'winAddonJointProfile' 'false true false false')),
  @('20261124000026', $one, ' OPEN_RIGHT', ' false', ' false', (Ad 'winAddonJointProfile' 'false false true false')))
$PD = @(
  @('20261124000031', $one, ' OPEN_RIGHT', ' false', ' false', (Ad 'winAddonJointProfile' 'false false false true')),
  @('20261124000032', $one, ' OPEN_RIGHT', ' false', ' false', (Ad 'winAddonJointProfile90deg' 'true false false false')),
  @('20261124000033', $one, ' OPEN_RIGHT', ' false', ' false', (Ad 'winAddonJointProfile135deg' 'true false false false')),
  @('20261124000034', $one, ' OPEN_RIGHT', ' false', ' false', (Ad 'winAddonGapProfile' 'true false false false')),
  @('20261124000035', $one, ' OPEN_RIGHT', ' false', ' false', (Ad 'winAddonExtender20' 'false true false false')),
  @('20261124000036', $one, ' OPEN_RIGHT', ' false', ' false', (Ad 'winAddonExtender100' 'false false false true')))
foreach ($w in $PC) { [IO.File]::WriteAllText("$b\PR\PC\$($w[0]).wnd", (Wnd $w[1] $w[2] $w[3] $w[4] $w[5]), $enc) }
foreach ($w in $PD) { [IO.File]::WriteAllText("$b\PR\PD\$($w[0]).wnd", (Wnd $w[1] $w[2] $w[3] $w[4] $w[5]), $enc) }
[IO.File]::WriteAllText("$b\PR\PC\order.extra", "ordID{}ordID", $enc)
[IO.File]::WriteAllText("$b\PR\PD\order.extra", "ordID{}ordID", $enc)
$sizeA = (& $single 1000 1200); $sizeB = (& $single 1500 2000)
$PE = @(
  @('20261124000041', $sizeA, ' OPEN_RIGHT', ' false', ' false', @{ winLaminationInner = 'светлый дуб' }),
  @('20261124000042', $sizeB, ' OPEN_RIGHT', ' false', ' false', @{ winLaminationOuter = 'светлый дуб' }),
  @('20261124000043', $sizeB, ' OPEN_RIGHT', ' false', ' false', @{ winInnerSill = 'белый 300' }),
  @('20261124000044', $sizeA, ' OPEN_RIGHT', ' false', ' false', @{ winOuterSill = 'отлив белый 200' }),
  @('20261124000045', $sizeB, ' OPEN_RIGHT', ' false', ' false', @{ winWorks = 'монтаж' }),
  @('20261124000046', $sizeA, ' OPEN_RIGHT', ' false', ' false', @{ winAditions = 'пена монтажная'; winColors = 'клен' }))
New-Item -ItemType Directory -Force "$b\PR\PE" | Out-Null
foreach ($w in $PE) { [IO.File]::WriteAllText("$b\PR\PE\$($w[0]).wnd", (Wnd $w[1] $w[2] $w[3] $w[4] $w[5]), $enc) }
[IO.File]::WriteAllText("$b\PR\PE\order.extra", "ordID{}ordID", $enc)
$lam = @{ winLaminationInner = 'светлый дуб'; winLaminationOuter = 'светлый дуб' }
$PF = @(
  @('20261124000051', (& $single 1000 1200), ' OPEN_NONE', ' false', ' false', $lam),
  @('20261124000052', (& $single 1000 1200), ' OPEN_RIGHT', ' false', ' false', $lam),
  @('20261124000053', (& $single 2000 1200), ' OPEN_RIGHT', ' false', ' false', $lam),
  @('20261124000054', $v2, ' OPEN_RIGHT OPEN_NONE', ' false false', ' false false', $lam),
  @('20261124000055', (& $single 1000 2100), ' OPEN_RIGHT', ' true', ' false', $lam),
  @('20261124000056', $v3, ' OPEN_TOP_LEFT OPEN_NONE OPEN_RIGHT', ' false false false', ' false false false', $lam))
New-Item -ItemType Directory -Force "$b\PR\PF" | Out-Null
foreach ($w in $PF) { [IO.File]::WriteAllText("$b\PR\PF\$($w[0]).wnd", (Wnd $w[1] $w[2] $w[3] $w[4] $w[5]), $enc) }
[IO.File]::WriteAllText("$b\PR\PF\order.extra", "ordID{}ordID", $enc)
[IO.File]::WriteAllText("$b\PR\customer.info", "-phone-`n`n-email-`n`n-note-`n", $enc)
[IO.File]::WriteAllText("$b\PR\PA\order.extra", "ordID{}ordID", $enc)
[IO.File]::WriteAllText("$b\PR\PB\order.extra", "ordID{}ordID", $enc)
& $adb -s $dev shell "rm -rf '$base/PR'"
& $adb -s $dev push "$b\PR" "$base/" | Select-Object -Last 1
