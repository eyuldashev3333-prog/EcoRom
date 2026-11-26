# Живое управление WinStudio через интерфейс (как пользователь): дамп uiautomator, тап по тексту, ввод, снимок.
# Портрет телефона: wm size 720x1440, density 320. Координаты — в пикселях устройства (bounds из дампа).
$adb = "C:\wsre\adb.exe"; $dev = "127.0.0.1:5555"
function Adb([string]$cmd) { & $adb -s $dev shell $cmd 2>$null }
function Dump() {
  cmd /c "$adb -s $dev shell uiautomator dump /sdcard/ui.xml >nul 2>&1"
  cmd /c "$adb -s $dev pull /sdcard/ui.xml `"$env:TEMP\live_ui.xml`" >nul 2>&1"
  [xml]$x = Get-Content "$env:TEMP\live_ui.xml" -Raw -Encoding UTF8
  $x.SelectNodes("//node")
}
function Center($n) { if ($n.bounds -match "\[(\d+),(\d+)\]\[(\d+),(\d+)\]") { @([int](([int]$Matches[1] + [int]$Matches[3]) / 2), [int](([int]$Matches[2] + [int]$Matches[4]) / 2)) } }
function Find([string]$text, [switch]$Like) { $n = Dump; if ($Like) { $n | Where-Object { $_.text -like $text } | Select-Object -First 1 } else { $n | Where-Object { $_.text -eq $text } | Select-Object -First 1 } }
function TapXY([int]$x, [int]$y, [int]$ms = 900) { Adb "input tap $x $y"; Start-Sleep -Milliseconds $ms }
function TapText([string]$text, [switch]$Like, [int]$ms = 1200) {
  $n = if ($Like) { Find $text -Like } else { Find $text }
  if (-not $n) { throw "нет на экране: $text" }
  $c = Center $n; TapXY $c[0] $c[1] $ms
}
function Texts() { @(Dump | ForEach-Object { $_.text } | Where-Object { $_ -ne '' }) }
function Shot([string]$name) { cmd /c "$adb -s $dev exec-out screencap -p > C:\wsre\live\$name.png" }
function TypeText([string]$t) { Adb ("input text '" + ($t -replace ' ', '%s') + "'"); Start-Sleep -Milliseconds 400 }
function Back() { Adb "input keyevent 4"; Start-Sleep -Milliseconds 900 }
