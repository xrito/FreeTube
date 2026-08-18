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

$version = '2026.08.18.122307'
$sha256 = '652e154bce7170070d0f26415c9a3c35c121f5a7903cb8cde6d31c4577517fb9'
$downloadUrl = "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/download/$version/yt-dlp.exe"
$outputDirectory = Join-Path $PSScriptRoot '..\.cache\freetube\yt-dlp'
$outputPath = Join-Path $outputDirectory 'yt-dlp.exe'

if (Test-Path -LiteralPath $outputPath) {
  $actualHash = Get-Sha256 $outputPath
  if ($actualHash -eq $sha256) {
    Write-Output "Dependency is already prepared."
    return
  }
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$temporaryPath = "$outputPath.download"
Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue

try {
  Start-BitsTransfer -Source $downloadUrl -Destination $temporaryPath
  $actualHash = Get-Sha256 $temporaryPath
  if ($actualHash -ne $sha256) {
    throw "The downloaded file checksum does not match the pinned release."
  }

  Move-Item -LiteralPath $temporaryPath -Destination $outputPath -Force
  Write-Output "Prepared export dependency $version."
} catch {
  Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
  throw
}
