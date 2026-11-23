. "D:\Eco Rom\scripts\winstudio\probe_lib.ps1"
$out = "D:\Eco Rom\docs\winstudio-study\probes.txt"
# все остальные прайсы обнуляем, одну статью включаем
function Zero() {
  SetPrices @{} @{} @{} @{}
  PushRaw "lamination/светлый дуб.wprc" "lamination_cost_m2:::0"
  PushRaw "sillsinner/белый 300.wprc" "sillinner_body:::0`nsillinner_cap:::0"
  PushRaw "sillsouter/отлив белый 200.wprc" "sillouter_body:::0`nsillouter_cap:::0"
  PushRaw "jobs/монтаж.wprc" "jobs_cost:::0"
  PushRaw "extramaterials/пена монтажная.wprc" "extras_cost:::0"
}
$runs = @(
  @{ n='PE lamination=1'; set={ PushRaw "lamination/светлый дуб.wprc" "lamination_cost_m2:::1" } },
  @{ n='PE sill_inner body=1 cap=1000'; set={ PushRaw "sillsinner/белый 300.wprc" "sillinner_body:::1`nsillinner_cap:::1000" } },
  @{ n='PE sill_outer body=1 cap=1000'; set={ PushRaw "sillsouter/отлив белый 200.wprc" "sillouter_body:::1`nsillouter_cap:::1000" } },
  @{ n='PE jobs=1'; set={ PushRaw "jobs/монтаж.wprc" "jobs_cost:::1" } },
  @{ n='PE extras=1'; set={ PushRaw "extramaterials/пена монтажная.wprc" "extras_cost:::1" } }
)
foreach ($r in $runs) {
  Zero
  & $r.set
  OpenProbeOrder 'PE'
  $res = ReadWindowTotals
  $line = "$($r.n) : " + ((1..6 | ForEach-Object { "w$_=$($res[$_])" }) -join ' ')
  Add-Content $out $line -Encoding UTF8
  $line
}
