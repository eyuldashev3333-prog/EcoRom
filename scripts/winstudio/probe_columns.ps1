# В какую колонку нижней таблицы WinStudio попадает каждая ценовая статья: цена статьи = 1 000 000, читаем строку «цена» по всем колонкам.
# Эмулятор в горизонтальном режиме (wm size reset). Результат дописывается в docs/winstudio-study/probes.txt (строки COL).
. "D:\Eco Rom\scripts\winstudio\probe_lib.ps1"
$out = "D:\Eco Rom\docs\winstudio-study\probes.txt"
$M = '1000000'
function PriceRow() {
  $res = [ordered]@{}
  for ($p = 0; $p -lt 6; $p++) {
    & $adb -s $dev shell "uiautomator dump /sdcard/ui.xml" | Out-Null
    & $adb -s $dev pull /sdcard/ui.xml "$env:TEMP\probe_ui.xml" | Out-Null
    [xml]$x = Get-Content "$env:TEMP\probe_ui.xml" -Raw -Encoding UTF8
    $nodes = $x.SelectNodes("//node") | Where-Object { $_.text -ne '' } | ForEach-Object { if ($_.bounds -match '\[(\d+),(\d+)\]\[(\d+),(\d+)\]') { [pscustomobject]@{ x = [int]$Matches[1]; y = [int]$Matches[2]; t = $_.text } } }
    $hy = ($nodes | Where-Object { $_.t -eq 'позиция' } | Select-Object -First 1).y
    $py = ($nodes | Where-Object { $_.t -eq 'цена' -and $_.x -lt 20 } | Select-Object -First 1).y
    if (-not $hy -or -not $py) { break }
    foreach ($h in ($nodes | Where-Object { $_.y -eq $hy -and $_.t -ne 'позиция' -and $_.t -ne 'всего' })) {
      $c = $nodes | Where-Object { $_.y -eq $py -and [math]::Abs($_.x - $h.x) -lt 25 } | Select-Object -First 1
      if ($c -and $c.t -ne '-' -and -not $res.Contains($h.t)) { $res[$h.t] = $c.t }
    }
    & $adb -s $dev shell "input swipe 1300 840 300 840 400" | Out-Null; Start-Sleep -Milliseconds 700
  }
  ($res.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join '; '
}
function SelectWindow([int]$j) { $y = if ($j -eq 1) { 750 } else { 180 + 120 * (6 - $j) }; & $adb -s $dev shell "input tap 1540 $y"; Start-Sleep -Milliseconds 1200 }
$sysKeys = $SYS_KEYS
foreach ($k in $sysKeys) {
  SetPrices @{ $k = $M } @{} @{} @{}
  OpenProbeOrder 'PA'; SelectWindow 6
  $r = "COL PA w6 $k=1e6 : " + (PriceRow); Add-Content $out $r -Encoding UTF8; $r
}
foreach ($k in $FUR_KEYS) {
  SetPrices @{} @{ $k = $M } @{} @{}
  OpenProbeOrder 'PA'; SelectWindow 6
  $r = "COL PA w6 $k=1e6 : " + (PriceRow); Add-Content $out $r -Encoding UTF8; $r
}
foreach ($k in $NET_KEYS) {
  SetPrices @{} @{} @{ $k = $M } @{}
  OpenProbeOrder 'PB'; SelectWindow 5
  $r = "COL PB w5 $k=1e6 : " + (PriceRow); Add-Content $out $r -Encoding UTF8; $r
}
