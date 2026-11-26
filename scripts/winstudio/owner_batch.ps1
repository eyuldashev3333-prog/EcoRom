# Пакетный прогон вариантов: каждый — по очереди WinStudio → ECOROM → сравнение (owner_run.ps1); ошибка варианта не останавливает пакет.
param([Parameter(Mandatory)][string[]]$Ids, [string]$Log = 'C:\wsre\live\batch.log')
$d = 'D:\Eco Rom\scripts\e2e\owner'
foreach ($id in $Ids) {
  try {
    $out = & 'D:\Eco Rom\scripts\winstudio\owner_run.ps1' -File "$d\$id.json" 2>&1 | ForEach-Object { "$_" }
    $out | Select-Object -First 1 | Add-Content $Log -Encoding UTF8
    $out | Select-Object -Skip 1 | Select-Object -First 12 | ForEach-Object { "   $_" } | Add-Content $Log -Encoding UTF8
  } catch { "${id}: СБОЙ ПРОГОНА: $($_.Exception.Message)" | Add-Content $Log -Encoding UTF8 }
}
'ПАКЕТ ЗАКОНЧЕН' | Add-Content $Log -Encoding UTF8
