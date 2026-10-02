param(
  [Parameter(Mandatory = $true)][string]$Workbook,
  [Parameter(Mandatory = $true)][string]$Output
)

$ErrorActionPreference = "Stop"
$source = (Resolve-Path -LiteralPath $Workbook).Path
$target = [System.IO.Path]::GetFullPath($Output)
$work = Join-Path ([System.IO.Path]::GetTempPath()) ("storefront-alt-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $work | Out-Null

try {
  & tar -xf $source -C $work
  if ($LASTEXITCODE -ne 0) { throw "Could not read the xlsx archive" }

  [xml]$sharedXml = Get-Content -LiteralPath (Join-Path $work "xl\sharedStrings.xml")
  $shared = @($sharedXml.sst.si | ForEach-Object {
    if ($_.t) { [string]$_.t }
    else { ($_.r | ForEach-Object { [string]$_.t }) -join "" }
  })
  [xml]$sheet = Get-Content -LiteralPath (Join-Path $work "xl\worksheets\sheet1.xml")

  $rows = foreach ($row in @($sheet.worksheet.sheetData.row)) {
    $cells = @{}
    foreach ($cell in @($row.c)) {
      $column = ([string]$cell.r) -replace "\d", ""
      $value = [string]$cell.v
      if ($cell.t -eq "s" -and $value -ne "") { $value = $shared[[int]$value] }
      $cells[$column] = $value
    }
    $product = [string]$cells.B
    $alt = [string]$cells.D
    if ($product.Trim() -and $alt.Trim() -and $product -ne "Product") {
      [ordered]@{ product = $product.Trim(); alt = $alt.Trim(); sourceRow = [int]$row.r }
    }
  }

  $payload = [ordered]@{
    source = [System.IO.Path]::GetFileName($source)
    extractedAt = (Get-Date).ToUniversalTime().ToString("o")
    rows = @($rows)
  }
  $parent = Split-Path -Parent $target
  if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
  [System.IO.File]::WriteAllText($target, ($payload | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))
  Write-Output "Extracted $($rows.Count) alt-text rows to $target"
}
finally {
  if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
}
