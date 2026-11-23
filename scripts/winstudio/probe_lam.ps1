# Точные площади ламинации: цена ламинации 1 000 000 → стоимость окна = площадь с 6 знаками.
# Заказы PL (только внутренняя) и PM (только внешняя) по 6 окон — те же, что в fit_lamination.ts. Результат → docs/winstudio-study/lam_exact.txt
. "D:\Eco Rom\scripts\winstudio\probe_lib.ps1"
$base = "/sdcard/Android/data/com.blogspot.turbocolor.winstudio/files/WindowsStudio/Customers"
$enc = New-Object Text.UTF8Encoding $false
$B = [string][char]0x0412
$sysName = "ПВХ система $B"
$tmpl = (Get-Content "C:\wsre\probe_orders\20261123041053.wnd" -Raw -Encoding UTF8)
$single = { param($w, $h) "wblock{vsx{0.0 $w.0}vsx vsy{0.0 $h.0}vsy pns{0:0 1:1}pns frs{0:1}frs ops{0:1}ops imps{}imps opsfrs{0}opsfrs impsfrs{-1}impsfrs}wblock" }
$v2 = 'wblock{vsx{0.0 750.0 1500.0}vsx vsy{0.0 1500.0}vsy pns{0:0 1:0 1:1 2:1}pns frs{0:3}frs ops{0:2 1:3}ops imps{1:2}imps opsfrs{0|1}opsfrs impsfrs{0}impsfrs}wblock'
$v3 = 'wblock{vsx{0.0 600.0 1200.0 1500.0}vsx vsy{0.0 1500.0}vsy pns{0:0 1:0 1:1 2:0 2:1 3:1}pns frs{0:5}frs ops{0:2 1:4 3:5}ops imps{1:2 3:4}imps opsfrs{0|1|2}opsfrs impsfrs{0|1}impsfrs}wblock'
$wins = @(
  @((& $single 1000 1200), ' OPEN_NONE', ' false'), @((& $single 1000 1200), ' OPEN_RIGHT', ' false'), @((& $single 2000 1200), ' OPEN_RIGHT', ' false'),
  @($v2, ' OPEN_RIGHT OPEN_NONE', ' false false'), @((& $single 1000 2100), ' OPEN_RIGHT', ' true'), @($v3, ' OPEN_TOP_LEFT OPEN_NONE OPEN_RIGHT', ' false false false'),
  @((& $single 1500 1500), ' OPEN_NONE', ' false'), @((& $single 1200 1500), ' OPEN_TOP_LEFT', ' false'))
PushRaw "winsystems/$sysName.wprc" ($SYS_KEYS | ForEach-Object { "$($_):::0" } | Out-String).Trim()
PushRaw "lamination/светлый дуб.wprc" "lamination_cost_m2:::1000000"
foreach ($ord in @(@('PL', 'winLaminationInner'), @('PM', 'winLaminationOuter'))) {
  $b = "C:\wsre\probe_build_l"; Remove-Item $b -Recurse -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Force "$b\PR\$($ord[0])" | Out-Null
  $i = 80
  foreach ($w in $wins) {
    $t = $tmpl
    foreach ($kv in @(@('winCode', $w[0]), @('winOpeningsArray', $w[1]), @('winIsDoorArray', $w[2]), @('winMosquitoNetArray', (' false ' * ($w[2].Trim().Split(' ').Count)).TrimEnd()), @('winSystem', $sysName), @('winFurniture', ''), @('winMoskitonet', ''), @('winGlass', ''), @($ord[1], 'светлый дуб'))) {
      $t = [regex]::Replace($t, "(?m)^$($kv[0]) ::: .*$", ("$($kv[0]) ::: " + $kv[1]).Replace('$', '$$'))
    }
    [IO.File]::WriteAllText("$b\PR\$($ord[0])\202611240000$i.wnd", $t, $enc); $i++
  }
  [IO.File]::WriteAllText("$b\PR\$($ord[0])\order.extra", "ordID{}ordID", $enc)
  & $adb -s $dev shell "rm -rf '$base/PR/$($ord[0])'"
  & $adb -s $dev push "$b\PR\$($ord[0])" "$base/PR/" | Out-Null
}
# окон 8: лента прокручивается — читаем по очереди, листая ленту
function ReadTotal() { $t = Texts; $i = [array]::IndexOf($t, ([string][char]0x0432 + [char]0x0441 + [char]0x0435 + [char]0x0433 + [char]0x043E)); if ($i -ge 0) { for ($k = $i + 1; $k -lt [math]::Min($t.Count, $i + 4); $k++) { if ($t[$k] -match '^([0-9.,]+)\s') { return [double]($Matches[1] -replace ',', '.') } } }; $null }
foreach ($ord in 'PL', 'PM') {
  OpenProbeOrder $ord
  $vals = @()
  # окна сверху вниз 8..1: первые шесть видны сразу, остальные после прокрутки вниз
  foreach ($y in 180, 300, 420, 540, 660, 750) { & $adb -s $dev shell "input tap 1540 $y"; Start-Sleep -Milliseconds 1200; $vals += (ReadTotal) }
  & $adb -s $dev shell "input swipe 1540 700 1540 100 300" | Out-Null; Start-Sleep -Milliseconds 800
  foreach ($y in 180, 300) { & $adb -s $dev shell "input tap 1540 $y"; Start-Sleep -Milliseconds 1200; $vals += (ReadTotal) }
  $line = "LAM $ord (сверху вниз, 8..1 + прокрутка): " + ($vals -join ' ')
  Add-Content "D:\Eco Rom\docs\winstudio-study\lam_exact.txt" $line -Encoding UTF8; $line
}
