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

# yt-dlp's official EJS solver requires Node.js 22 or newer. The runtime is
# bundled only in the Windows installer, so an installed app never needs a
# global Node.js installation to export a video.
$version = '22.22.0'
$sha256 = 'bae898add4643fcf890a83ad8ae56e20dce7e781cab161a53991ceba70c99ffb'
$downloadUrl = "https://nodejs.org/dist/v$version/win-x64/node.exe"
$outputDirectory = Join-Path $PSScriptRoot '..\.cache\freetube\node'
$outputPath = Join-Path $outputDirectory 'node.exe'

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
