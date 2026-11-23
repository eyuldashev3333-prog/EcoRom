# Проба двухкамерного стеклопакета «простое 4-6-4-6-4» в живой WinStudio: окно 1500x1500 (последний заказ), система B, стеклопакет 4-6-4-6-4.
# В файле стеклопакета оставляем одну статью = 1 000 000, остальные 0; (всего - база) / 1e6 = количество по этой статье.
# Эмулятор в горизонтальном режиме (wm size reset). Результат дописывается в docs/winstudio-study/probes.txt
. "D:\Eco Rom\scripts\winstudio\probe_lib.ps1"
$out = "D:\Eco Rom\docs\winstudio-study\probes.txt"
$M = '1000000'
function OpenLast() {
  & $adb -s $dev shell "am force-stop com.blogspot.turbocolor.winstudio"; Start-Sleep 2
  & $adb -s $dev shell "monkey -p com.blogspot.turbocolor.winstudio -c android.intent.category.LAUNCHER 1" | Out-Null; Start-Sleep 7
  & $adb -s $dev shell "input tap 1148 816"; Start-Sleep 1
  & $adb -s $dev shell "input tap 800 344"; Start-Sleep 3   # список заказов; Test2 / Addr1 — первая строка
  & $adb -s $dev shell "input tap 300 150"; Start-Sleep 1
  & $adb -s $dev shell "input tap 730 840"; Start-Sleep 4
}
function Total() {
  $t = Texts
  $i = [array]::IndexOf($t, ([string][char]0x0432 + [char]0x0441 + [char]0x0435 + [char]0x0433 + [char]0x043E))
  for ($k = $i + 1; $k -lt [math]::Min($t.Count, $i + 6); $k++) { if ($t[$k] -match '^([0-9.,]+)\s') { return [double]($Matches[1] -replace ',', '.') } }
  $null
}
$file = "winglasses/простое 4-6-4-6-4.wprc"
PushRaw $file (($GLASS_KEYS | ForEach-Object { "$_:::0" }) -join "`n")
OpenLast; $base = Total
Add-Content $out "D2 base (window 1500x1500, sys B, glass 4-6-4-6-4, glass prices 0) total=$base" -Encoding UTF8
foreach ($k in $GLASS_KEYS) {
  PushRaw $file (($GLASS_KEYS | ForEach-Object { if ($_ -eq $k) { "${_}:::$M" } else { "${_}:::0" } }) -join "`n")
  OpenLast; $v = Total
  $line = "D2 $k=1e6 : qty=" + (($v - $base) / 1e6)
  Add-Content $out $line -Encoding UTF8; $line
}
# вернуть эталонные цены стеклопакета
PushRaw $file "glass_glass1:::490`nglass_glass2:::490`nglass_glass3:::490`nglass_film:::0`nglass_spacers:::1.57`nglass_dryer:::2.12`nglass_butil_stripe:::1.41`nglass_sealant:::2.52`nglass_gas:::0"
