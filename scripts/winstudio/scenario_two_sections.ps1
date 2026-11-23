. "D:\Eco Rom\scripts\winstudio\lib.ps1"
$out = "D:\Eco Rom\docs\winstudio-study\grid.csv"
# op: 3 = поворотное со створкой, 4 = глухое стекло без створки
$combos = @( @('fx','fx',4,4), @('fx','sh',4,3), @('sh','fx',3,4), @('sh','sh',3,3) )
$sizes = @(@(1500,1500),@(1200,1620),@(1800,1200))
foreach ($dir in 'v2','h2') {
  $tpl = if ($dir -eq 'v2') { 1 } else { 4 }
  foreach ($cb in $combos) {
    foreach ($sz in $sizes) {
      $W=$sz[0]; $H=$sz[1]
      NewWindow $tpl
      SetSize 'W' $W; SetSize 'H' $H
      $sc = 526.0 / $H
      $q = [int]([math]::Round($W*$sc/4)); $qy = [int]([math]::Round($H*$sc/4))
      if ($dir -eq 'v2') { $c1=@((740-$q),392); $c2=@((740+$q),392) } else { $c1=@(740,(392-$qy)); $c2=@(740,(392+$qy)) }
      Configure 'none' $cb[2] $false $false $false $c1
      Configure 'none' $cb[3] $false $false $false $c2
      Measure-Grid ("{0}_{1}_{2}" -f $dir,$cb[0],$cb[1]) @($W) @($H) $out
    }
  }
}
