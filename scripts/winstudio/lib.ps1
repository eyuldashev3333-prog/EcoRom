$adb = "C:\wsre\adb.exe"; $dev = "127.0.0.1:5555"
$keys = @{ '7'=@(650,300);'8'=@(800,300);'9'=@(950,300);'4'=@(650,398);'5'=@(800,398);'6'=@(950,398);'1'=@(650,496);'2'=@(800,496);'3'=@(950,496);'0'=@(800,594) }
$clearAll = @(800,694); $ok = @(950,694)
$wLabel = @(740,724); $hLabel = @(402,386)
$cols = 'area','frame','impost','bead','gasket','sash','doorsash','glass','sandwich','shpros','lamin_in','lamin_out','works','sills'

function Tap($p) { & $adb -s $dev shell "input tap $($p[0]) $($p[1])" | Out-Null; Start-Sleep -Milliseconds 350 }
Add-Type -AssemblyName System.Drawing
function FindLabels {
  # подписи размеров смещаются при смене габарита: ищем по картинке
  cmd /c "$adb -s $dev exec-out screencap -p > $env:TEMP\ws_scr.png"
  $bmp = [System.Drawing.Bitmap]::FromFile("$env:TEMP\ws_scr.png")
  $hx = $null
  for ($xx = 5; $xx -lt 700; $xx++) { $c = $bmp.GetPixel($xx, 392); if ($c.R -lt 90 -and $c.G -lt 90 -and $c.B -lt 90) { $hx = $xx; break } }
  $wy = $null
  for ($yy = 745; $yy -gt 665; $yy--) { $c = $bmp.GetPixel(300, $yy); if ($c.R -lt 90 -and $c.G -lt 90 -and $c.B -lt 90) { $wy = $yy; break } }
  $bmp.Dispose()
  $script:hLabelPos = if ($null -ne $hx) { @(($hx + 22), 392) } else { $hLabel }
  $script:wLabelPos = if ($null -ne $wy) { @(740, $wy) } else { $wLabel }
}
function SetSize($label, $val) {
  FindLabels; if ($label -eq 'H') { $label = $script:hLabelPos } else { $label = $script:wLabelPos }
  Tap $label; Start-Sleep -Milliseconds 500
  Tap $clearAll
  foreach ($ch in ([string]$val).ToCharArray()) { Tap $keys[[string]$ch] }
  Tap $ok; Start-Sleep -Milliseconds 700
}
function ReadRow {
  & $adb -s $dev shell "uiautomator dump /sdcard/ui.xml" | Out-Null
  & $adb -s $dev pull /sdcard/ui.xml "$env:TEMP\ws_ui.xml" | Out-Null
  $t = Get-Content "$env:TEMP\ws_ui.xml" -Raw -Encoding UTF8
  $vals = [regex]::Matches($t,'text="([^"]*)"') | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -ne '' }
  $i = -1
  for ($k = 8; $k -lt $vals.Count; $k++) { if ($vals[$k] -match '^[0-9]+\.[0-9]+ (m2|m)$') { $i = $k; break } }
  if ($i -lt 0) { return $null }
  return $vals[$i..($i+13)]
}

# ---- настройка створки (диалог «импосты | открывание») ----
$script:openCell = @{ 0=@(788,153); 1=@(965,153); 2=@(1141,153); 3=@(788,362); 4=@(965,362); 5=@(1141,362); 6=@(788,571); 7=@(965,571); 8=@(1141,571) }
$script:imposts  = @{ grid3=@(450,142); none=@(611,142); v2=@(450,329); h2=@(611,329); v3=@(450,515); h3=@(611,515) }
function ReadChecks {
  & $adb -s $dev shell "uiautomator dump /sdcard/ui.xml" | Out-Null
  & $adb -s $dev pull /sdcard/ui.xml "$env:TEMP\ws_dlg.xml" | Out-Null
  [xml]$x = Get-Content "$env:TEMP\ws_dlg.xml" -Raw -Encoding UTF8
  $r = @{}
  $boxes = @($x.SelectNodes("//node[@class='android.widget.CheckBox']"))
  if ($boxes.Count -ge 3) { $r.sandwich = ($boxes[0].checked -eq 'true'); $r.door = ($boxes[1].checked -eq 'true'); $r.net = ($boxes[2].checked -eq 'true') }
  return $r
}
function Configure([string]$Imp, [int]$Opening, [bool]$Door, [bool]$Sandwich, [bool]$Net, [int[]]$At = @(740,392)) {
  Tap $At; Start-Sleep -Milliseconds 800
  Tap $script:imposts[$Imp]
  # сначала открывание: «двери» и «сетка» активны только у створки
  if ($Opening -le 8) { Tap $script:openCell[$Opening] }
  else { & $adb -s $dev shell "input swipe 965 650 965 200 300" | Out-Null; Start-Sleep -Milliseconds 500; Tap @(965,600) }
  Start-Sleep -Milliseconds 300
  $c = ReadChecks
  if ($c.sandwich -ne $Sandwich) { Tap @(535,662); Start-Sleep -Milliseconds 300 }
  if ($c.door -ne $Door) { Tap @(557,718); Start-Sleep -Milliseconds 300 }
  if ($c.net -ne $Net) { Tap @(557,766); Start-Sleep -Milliseconds 300 }
  Tap @(960,838); Start-Sleep -Milliseconds 900
}function Measure-Grid([string]$Tag, [int[]]$Widths, [int[]]$Heights, [string]$Out) {
  if (-not (Test-Path $Out)) { "tag,w,h," + ($cols -join ',') | Set-Content $Out -Encoding utf8 }
  foreach ($w in $Widths) { foreach ($h in $Heights) {
    SetSize 'W' $w; SetSize 'H' $h
    $row = ReadRow
    if ($row -and [math]::Abs([double](($row[0] -replace ' m2','')) - $w*$h/1e6) -gt 0.011) { "MISMATCH $w x $h : area $($row[0])"; continue }
    if ($row) { $line = "$Tag,$w,$h," + (($row | ForEach-Object { ($_ -replace ' (m2|m)$','') }) -join ','); Add-Content $Out $line -Encoding utf8; $line } else { "no row for $w x $h" }
  } }
}

# ---- новое окно из каталога шаблонов ("+"): 0 одна секция, 1 две вертикальные, 2 три вертикальные, 4 две горизонтальные, 5 три горизонтальные ----
$script:tplCell = @{ 0=@(560,158); 1=@(800,158); 2=@(1039,158); 3=@(560,375); 4=@(800,375); 5=@(1039,375) }
function NewWindow([int]$Tpl) {
  Tap @(1540,60); Start-Sleep -Milliseconds 900
  Tap $script:tplCell[$Tpl]
  Tap @(920,838); Start-Sleep -Milliseconds 1000
}


