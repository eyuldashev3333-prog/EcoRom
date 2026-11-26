# Единица расчёта работ и «разного» в живой WinStudio через интерфейс: тап по ячейке колонки «шт»/«m2» нужной строки.
# После каждого тапа — проверка файла прайса (ExtPiece / ExtArea).
. "D:\Eco Rom\scripts\winstudio\live_lib.ps1"
function B($n, $i) { [int](($n.bounds -split '[\[\],]')[$i]) }
$base = "/sdcard/Android/data/com.blogspot.turbocolor.winstudio/files/WindowsStudio/Prices"
$plan = @(
  @{ title = 'таблица работ'; dir = 'jobs'; rows = [ordered]@{ 'Montaj (Alyumin)' = 'm2'; 'Montaj (Plast)' = 'm2'; 'Montaj (Termo)' = 'm2'; 'Demontaj' = 'шт'; 'Yetkazib berish' = 'шт'; 'Otliv montaji' = 'шт'; 'Podokonnik montaji' = 'шт'; 'Ostona montaji' = 'шт'; 'Betonga montaj' = 'шт'; 'Qiyaliklarni bezash' = 'шт' } }
  @{ title = 'таблица разного'; dir = 'extramaterials'; rows = [ordered]@{ 'Samorez-kopik' = 'm2'; 'Shuruplar komplekti' = 'шт'; 'Montaj kopigi' = 'шт' } }
)
$code = @{ 'шт' = 'ExtPiece'; 'm2' = 'ExtArea' }
function Unit($dir, $nm) { $l = & $adb -s $dev shell "cat '$base/$dir/$nm.wprc'" 2>$null; if ("$l" -match '::(Ext\w+)') { $Matches[1] } else { 'ExtPiece?' } }
foreach ($p in $plan) {
  foreach ($nm in $p.rows.Keys) {
    $need = $code[$p.rows[$nm]]
    if ((Unit $p.dir $nm) -eq $need) { "$nm уже $need"; continue }
    for ($try = 0; $try -lt 4; $try++) {
      # 1) таблица в начале по горизонтали, заголовок у верха экрана
      for ($i = 0; $i -lt 30; $i++) {
        $n = Dump; $t = $n | Where-Object { $_.text -eq $p.title } | Select-Object -First 1
        if ($t -and (B $t 2) -ge 60 -and (B $t 2) -le 700) { break }
        if ($t) { $d = (B $t 2) - 300; Adb "input swipe 240 1500 240 $(1500 - $d) 2000" } else { Adb "input swipe 240 1500 240 800 2000" }
        Start-Sleep -Milliseconds 600
      }
      $ty = (B $t 2)
      for ($i = 0; $i -lt 8; $i++) { Adb "input swipe 60 $($ty + 90) 460 $($ty + 90) 150" }; Start-Sleep -Milliseconds 600
      $n = Dump; $r = $n | Where-Object { $_.text -eq $nm -and (B $_ 2) -gt $ty } | Select-Object -First 1
      if (-not $r) { "нет строки $nm"; break }
      $y = [int](((B $r 2) + (B $r 5)) / 2)
      # 2) сдвиг вбок, пока колонка единицы не видна целиком; тап в ту же строку (y не меняется)
      $hdr = $null
      for ($s = 0; $s -lt 6; $s++) {
        $n = Dump; $hdr = $n | Where-Object { $_.text -eq $p.rows[$nm] -and (B $_ 2) -gt $ty -and (B $_ 2) -lt $ty + 120 -and (B $_ 1) -ge 3 -and (B $_ 4) -le 477 -and ((B $_ 4) - (B $_ 1)) -ge 40 } | Select-Object -First 1
        if ($hdr) { break }
        Adb "input swipe 400 $y 300 $y 1000"; Start-Sleep -Milliseconds 700
      }
      if (-not $hdr) { "нет колонки $($p.rows[$nm]) для $nm"; break }
      $x = [int](((B $hdr 1) + (B $hdr 4)) / 2)
      TapXY $x $y 1000
      if ((Dump) | Where-Object { $_.'resource-id' -like '*keypad_dig_no' }) { TapText '✕' -ms 600; "открылась клавиатура — отмена"; continue }
      if ((Unit $p.dir $nm) -eq $need) { "$nm -> $need"; break }
    }
  }
}
foreach ($p in $plan) { & $adb -s $dev shell "cd $base/$($p.dir) && grep -H . *" 2>$null }
