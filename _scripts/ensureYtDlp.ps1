function Get-Sha256([string] $filePath) {
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($filePath)
  try {
    return ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
  } finally {
    $stream.Dispose()
    $algorithm.Dispose()
  }
}
$ErrorActionPreference = 'Stop'

$version = '2026.07.04'
$sha256 = '52fe3c26dcf71fbdc85b528589020bb0b8e383155cfa81b64dd447bbe35e24b8'
$downloadUrl = "https://github.com/yt-dlp/yt-dlp/releases/download/$version/yt-dlp.exe"
$outputDirectory = Join-Path $PSScriptRoot '..\.cache\freetube\yt-dlp'
$outputPath = Join-Path $outputDirectory 'yt-dlp.exe'

if (Test-Path -LiteralPath $outputPath) {
  $actualHash = Get-Sha256 $outputPath
  if ($actualHash -eq $sha256) {
    exit 0
  }
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$temporaryPath = "$outputPath.download"
Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue

try {
  Start-BitsTransfer -Source $downloadUrl -Destination $temporaryPath
  $actualHash = Get-Sha256 $temporaryPath
  if ($actualHash -ne $sha256) {
    throw 'The downloaded yt-dlp.exe checksum does not match the pinned release.'
  }

  Move-Item -LiteralPath $temporaryPath -Destination $outputPath -Force
  Write-Output "Prepared yt-dlp $version for Windows export."
} catch {
  Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
  throw
}
