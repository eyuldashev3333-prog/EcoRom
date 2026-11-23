# Пробы прайса WinStudio: в прайсах оставляем нужные статьи с заданной ценой, остальные 0; стоимость окна = количество статьи.
# Пробный заказ PR/PA (6 окон) собирается скриптом build_probe_order.ps1 (файлы .wnd), окна нумеруются 1..6 справа сверху вниз 6..1.
$adb = "C:\wsre\adb.exe"; $dev = "127.0.0.1:5555"
$PRICES = "/sdcard/Android/data/com.blogspot.turbocolor.winstudio/files/WindowsStudio/Prices"
$A = [string][char]0x0410
$SYS_KEYS = 'system_frame','system_impost','system_leaf','system_shtapik','system_rubber_sealant','system_firm_frame','system_firm_impost','system_firm_leaf','system_mehanic_rot','system_mehanic_hor','system_mehanic_vert','system_firm_corner_frame','system_firm_corner_leaf','system_impost_connector','system_seat_profile','system_dorsill','system_corner_jamb_profile','system_joint_profile','system_gap_profile','system_extender_profile_20','system_extender_profile_40','system_extender_profile_60','system_extender_profile_80','system_extender_profile_100'
$FUR_KEYS = 'furniture_handle_regular','furniture_handle_with_lock','furniture_handle_balcony'
$NET_KEYS = 'mosquito_grid','mosquito_profile','mosquito_gum','mosquito_corners','mosquito_holders','mosquito_handles'
$GLASS_KEYS = 'glass_glass1','glass_glass2','glass_glass3','glass_film','glass_spacers','glass_dryer','glass_butil_stripe','glass_sealant','glass_gas'

function PushPrice([string]$remote, [string[]]$keys, [hashtable]$vals) {
  $body = ($keys | ForEach-Object { if ($vals.ContainsKey($_)) { "$_:::$($vals[$_])" } else { "$_:::0" } }) -join "`n"
  $tmp = "C:\wsre\probe_tmp.wprc"
  [IO.File]::WriteAllText($tmp, $body + "`n", (New-Object Text.UTF8Encoding $false))
  & $adb -s $dev push $tmp "$PRICES/$remote" | Out-Null
}
function SetPrices([hashtable]$sys, [hashtable]$fur = @{}, [hashtable]$net = @{}, [hashtable]$glass = @{}) {
  PushPrice "winsystems/ПВХ система $A.wprc" $SYS_KEYS $sys
  PushPrice "furniture/белая тип 1.wprc" $FUR_KEYS $fur
  PushPrice "mosquitonet/сетка белая.wprc" $NET_KEYS $net
  PushPrice "winglasses/простое 4-6-4.wprc" $GLASS_KEYS $glass
}
function Texts() {
  & $adb -s $dev shell "uiautomator dump /sdcard/ui.xml" | Out-Null
  & $adb -s $dev pull /sdcard/ui.xml "$env:TEMP\probe_ui.xml" | Out-Null
  [xml]$x = Get-Content "$env:TEMP\probe_ui.xml" -Raw -Encoding UTF8
  @($x.SelectNodes("//node") | ForEach-Object { $_.text } | Where-Object { $_ -ne '' })
}
function OpenProbeOrder([string]$order = 'PA') {
  & $adb -s $dev shell "am force-stop com.blogspot.turbocolor.winstudio"; Start-Sleep 2
  & $adb -s $dev shell "monkey -p com.blogspot.turbocolor.winstudio -c android.intent.category.LAUNCHER 1" | Out-Null; Start-Sleep 7
  & $adb -s $dev shell "input tap 1148 816"; Start-Sleep 1
  & $adb -s $dev shell "input tap 800 344"; Start-Sleep 3
  $tx = Texts; & $adb -s $dev shell "uiautomator dump /sdcard/ui.xml" | Out-Null; & $adb -s $dev pull /sdcard/ui.xml "$env:TEMP\probe_ui.xml" | Out-Null; [xml]$xx = Get-Content "$env:TEMP\probe_ui.xml" -Raw -Encoding UTF8; $node = $xx.SelectNodes("//node") | Where-Object { $_.text -like "$order  *" } | Select-Object -First 1; if ($node -and $node.bounds -match "\[(\d+),(\d+)\]\[(\d+),(\d+)\]") { $cy = [int](([int]$Matches[2] + [int]$Matches[4]) / 2); & $adb -s $dev shell "input tap 300 $cy" } else { & $adb -s $dev shell "input tap 300 146" }; Start-Sleep 1
  & $adb -s $dev shell "input tap 730 840"; Start-Sleep 4
}
# стоимость окон 1..6: тап по миниатюре (6 сверху … 1 снизу), затем «всего» в строке цены выбранного окна
function ReadWindowTotals() {
  $res = @{}
  foreach ($j in 6,5,4,3,2,1) {
    $y = if ($j -eq 1) { 750 } else { 180 + 120 * (6 - $j) }
    & $adb -s $dev shell "input tap 1540 $y"; Start-Sleep -Milliseconds 1200
    $t = Texts
    $i = [array]::IndexOf($t, ([string][char]0x0432 + [char]0x0441 + [char]0x0435 + [char]0x0433 + [char]0x043E))
    $val = $null
    if ($i -ge 0) { for ($k = $i + 1; $k -lt [math]::Min($t.Count, $i + 4); $k++) { if ($t[$k] -match '^([0-9.,]+)\s') { $val = [double]($Matches[1] -replace ',', '.'); break } } }
    $res[$j] = $val
  }
  $res
}
function Probe([string]$name, [hashtable]$sys, [hashtable]$fur = @{}, [hashtable]$net = @{}, [hashtable]$glass = @{}, [string]$order = 'PA') {
  SetPrices $sys $fur $net $glass
  OpenProbeOrder $order
  $r = ReadWindowTotals
  "$name : " + ((1..6 | ForEach-Object { "w$_=$($r[$_])" }) -join ' ')
}




function PushRaw([string]$remote, [string]$body) {
  $tmp = "C:\wsre\probe_tmp.wprc"
  [IO.File]::WriteAllText($tmp, $body + "`n", (New-Object Text.UTF8Encoding $false))
  & $adb -s $dev push $tmp "$PRICES/$remote" | Out-Null
}