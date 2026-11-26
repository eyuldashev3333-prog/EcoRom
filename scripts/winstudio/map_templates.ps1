# Точное соответствие плиток диалога «конфигурация» WinStudio и наших шаблонов: строим плитку k в живой WinStudio,
# читаем сохранённый файл окна (.wnd, winCode) и ищем такой же код в app/src/lib/winstudioTemplates.ts.
. "D:\Eco Rom\scripts\winstudio\ws_win.ps1"
$ours = [regex]::Matches((Get-Content 'D:\Eco Rom\app\src\lib\winstudioTemplates.ts' -Raw), "'(wblock\{[^']+\}wblock)'") | ForEach-Object { $_.Groups[1].Value }
"наших шаблонов: $($ours.Count)"
$dir = '/sdcard/Android/data/com.blogspot.turbocolor.winstudio/files/WindowsStudio/Customers/SVERKA OWNER/T1'
$map = [ordered]@{}
$codes = [ordered]@{}
for ($k = 0; $k -lt 63; $k++) {
  CleanScreen
  ClearWindows
  TapXY 60 1380 1500; PickTemplate $k
  if ((Dump) | Where-Object { $_.text -eq 'конфигурация' }) { TapText 'ДА' -ms 2500 }
  Start-Sleep -Milliseconds 800
  $f = (& $adb -s $dev shell "ls '$dir'" 2>$null) | Where-Object { $_ -match '\.wnd$' } | Select-Object -Last 1
  & $adb -s $dev pull "$dir/$f" C:\wsre\live\tpl.wnd 2>$null | Out-Null
  $code = (Get-Content C:\wsre\live\tpl.wnd -Encoding UTF8 | Where-Object { $_ -match '^winCode ::: ' }) -replace '^winCode ::: ', ''
  $idx = [array]::IndexOf($ours, $code.Trim())
  $map["$k"] = $idx; $codes["$k"] = $code.Trim()
  "WinStudio $k -> наш $idx"
}
$map | ConvertTo-Json | Out-File 'D:\Eco Rom\docs\winstudio-study\template-map.json' -Encoding utf8
$codes | ConvertTo-Json | Out-File 'D:\Eco Rom\docs\winstudio-study\winstudio-dialog-templates.json' -Encoding utf8
