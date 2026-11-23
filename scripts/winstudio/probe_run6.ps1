# Точные количества: цена статьи 1 000 000 → стоимость окна = количество с 6 знаками (раньше цена 1 давала только 2 знака).
# Запуск: эмулятор в горизонтальном режиме 1600x900 (wm size reset). Результат дописывается в docs/winstudio-study/probes.txt
. "D:\Eco Rom\scripts\winstudio\probe_lib.ps1"
$out = "D:\Eco Rom\docs\winstudio-study\probes.txt"
$order = if ($args.Count -gt 0) { $args[0] } else { 'PA' }
$M = '1000000'
$sysKeys = 'system_frame','system_impost','system_leaf','system_shtapik','system_rubber_sealant','system_firm_frame','system_firm_impost','system_firm_leaf'
$glassKeys = 'glass_glass1','glass_glass2','glass_glass3','glass_film','glass_spacers','glass_dryer','glass_butil_stripe','glass_sealant','glass_gas'
foreach ($k in $sysKeys) {
  $r = Probe "X6 $order $k=1e6" @{ $k = $M } @{} @{} @{} $order
  Add-Content $out $r -Encoding UTF8; $r
}
foreach ($k in $glassKeys) {
  $r = Probe "X6 $order $k=1e6" @{} @{} @{} @{ $k = $M } $order
  Add-Content $out $r -Encoding UTF8; $r
}
