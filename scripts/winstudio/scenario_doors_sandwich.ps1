. "D:\Eco Rom\scripts\winstudio\lib.ps1"
$out = "D:\Eco Rom\docs\winstudio-study\grid.csv"
# Configure imp opening door sandwich net at
function RunC($tpl, $name, $cfg, $centers, $W, $H) {
  NewWindow $tpl
  for ($i=0; $i -lt $cfg.Count; $i++) { $c=$cfg[$i]; Configure 'none' $c[0] $c[1] $c[2] $false $centers[$i] }
  Measure-Grid $name $W $H $out
}
$v2 = @(@(609,392),@(871,392)); $h2 = @(@(740,261),@(740,523)); $v3 = @(@(565,392),@(740,392),@(915,392))
$sv=@(1500,2200,3000); $hv=@(900,1500,2000); $sh=@(600,1500,2000); $hh=@(1500,2200,3000)
# (opening, door, sandwich)
$DR=@(3,$true,$false); $FX=@(4,$false,$false); $SF=@(4,$false,$true); $SS=@(3,$false,$true)
RunC 1 'dr2_v_dr_fx' @($DR,$FX) $v2 $sv $hv
RunC 1 'dr2_v_fx_dr' @($FX,$DR) $v2 $sv $hv
RunC 1 'dr2_v_dr_dr' @($DR,$DR) $v2 $sv $hv
RunC 4 'dr2_h_dr_fx' @($DR,$FX) $h2 $sh $hh
RunC 4 'dr2_h_fx_dr' @($FX,$DR) $h2 $sh $hh
RunC 2 'dr3_v_fx_dr_fx' @($FX,$DR,$FX) $v3 $sv $hv
RunC 0 'swF_1' @($SF) @(,@(740,392)) $sv $hv
RunC 0 'swS_1' @($SS) @(,@(740,392)) $sv $hv
RunC 1 'swF_v_sw_fx' @($SF,$FX) $v2 $sv $hv
RunC 1 'swF_v_fx_sw' @($FX,$SF) $v2 $sv $hv
RunC 1 'swS_v_sw_fx' @($SS,$FX) $v2 $sv $hv
RunC 4 'swF_h_sw_fx' @($SF,$FX) $h2 $sh $hh
RunC 4 'swF_h_fx_sw' @($FX,$SF) $h2 $sh $hh
RunC 2 'swF_v_fx_sw_fx' @($FX,$SF,$FX) $v3 $sv $hv
