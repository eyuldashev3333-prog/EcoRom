# Импосты внутри ячейки (левая колонка окна «импосты / открывание»): живые замеры метров.
# Эмулятор в горизонтальном режиме (wm size reset); окно открыто в редакторе заказа Test2/Addr1 (первая строка списка).
# Результат: docs/winstudio-study/leaf_imposts.csv  (tag, w, h, колонки таблицы метров)
. "D:\Eco Rom\scripts\winstudio\lib.ps1"
$out = "D:\Eco Rom\docs\winstudio-study\leaf_imposts.csv"
function OpenTest2() {
  & $adb -s $dev shell "am force-stop com.blogspot.turbocolor.winstudio"; Start-Sleep 2
  & $adb -s $dev shell "monkey -p com.blogspot.turbocolor.winstudio -c android.intent.category.LAUNCHER 1" | Out-Null; Start-Sleep 7
  & $adb -s $dev shell "input tap 1148 816"; Start-Sleep 1
  & $adb -s $dev shell "input tap 800 344"; Start-Sleep 3
  & $adb -s $dev shell "input tap 300 150"; Start-Sleep 1
  & $adb -s $dev shell "input tap 730 840"; Start-Sleep 4
}
OpenTest2
$sizes = @(@(1500,1500), @(1200,1800), @(2100,1100), @(900,1400))
# (метка, ячейка открывания по lib.ps1: 4 глухое, 6 поворотно-откидная, дверь = 3 + галочка)
$kinds = @(@('fixed', 4, $false, $false), @('tt', 6, $false, $false), @('door', 3, $true, $false), @('sandwich', 4, $false, $true))
foreach ($k in $kinds) {
  foreach ($imp in 'none','v2','h2','v3','h3') {
    NewWindow 0
    Configure $imp $k[1] $k[2] $k[3] $false
    foreach ($s in $sizes) {
      SetSize 'W' $s[0]; SetSize 'H' $s[1]
      $row = ReadRow
      if ($row) {
        $line = "$($k[0])_$imp,$($s[0]),$($s[1])," + (($row | ForEach-Object { ($_ -replace ' (m2|m)$','') }) -join ',')
        if (-not (Test-Path $out)) { "tag,w,h," + ($cols -join ',') | Set-Content $out -Encoding utf8 }
        Add-Content $out $line -Encoding utf8; $line
      } else { "no row $($k[0])_$imp $($s[0])x$($s[1])" }
    }
  }
}
