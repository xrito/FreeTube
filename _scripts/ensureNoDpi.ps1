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

function Assert-Sha256([string] $filePath, [string] $expectedHash) {
  if ((Get-Sha256 $filePath) -ne $expectedHash) {
    throw "Checksum validation failed for $filePath"
  }
}

$ErrorActionPreference = 'Stop'

$version = '2.2'
$archiveSha256 = 'acbbbe336c3c26d4fd55756daeb6efcaa84ef4c4df6a14dfb641a90ae05a9b07'
$executableSha256 = '9856e4c64e8407b20f93f274e52d898816e1f8b2312d7cbd6642050e99e7ce95'
$blacklistSha256 = '92a8af979ef6efc0ebbf3f58783d793a21a9f11374ab595ab404df7f43c64e2c'
$licenseSha256 = '3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986'
$archiveUrl = "https://github.com/GVCoder09/NoDPI/releases/download/v$version/nodpi_v${version}_win_x64.zip"
$licenseUrl = "https://raw.githubusercontent.com/GVCoder09/NoDPI/v$version/LICENSE"
$outputDirectory = Join-Path $PSScriptRoot '..\.cache\freetube\nodpi'
$outputExecutable = Join-Path $outputDirectory 'nodpi.exe'
$outputBlacklist = Join-Path $outputDirectory 'blacklist.txt'
$outputLicense = Join-Path $outputDirectory 'LICENSE'

if ((Test-Path -LiteralPath $outputExecutable) -and
    (Test-Path -LiteralPath $outputBlacklist) -and
    (Test-Path -LiteralPath $outputLicense)) {
  if ((Get-Sha256 $outputExecutable) -eq $executableSha256 -and
      (Get-Sha256 $outputBlacklist) -eq $blacklistSha256 -and
      (Get-Sha256 $outputLicense) -eq $licenseSha256) {
    Write-Output 'NoDPI dependency is already prepared.'
    return
  }
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "freetube-nodpi-$([System.Guid]::NewGuid())"
$archivePath = Join-Path $temporaryDirectory 'nodpi.zip'
$licensePath = Join-Path $temporaryDirectory 'LICENSE'
$expandedDirectory = Join-Path $temporaryDirectory 'expanded'

try {
  New-Item -ItemType Directory -Force -Path $temporaryDirectory | Out-Null
  Start-BitsTransfer -Source $archiveUrl -Destination $archivePath
  Assert-Sha256 $archivePath $archiveSha256
  Expand-Archive -LiteralPath $archivePath -DestinationPath $expandedDirectory

  $archiveRoot = Join-Path $expandedDirectory "nodpi_v${version}_win_x64"
  $extractedExecutable = Join-Path $archiveRoot 'nodpi.exe'
  $extractedBlacklist = Join-Path $archiveRoot 'blacklist.txt'
  Assert-Sha256 $extractedExecutable $executableSha256
  Assert-Sha256 $extractedBlacklist $blacklistSha256

  Start-BitsTransfer -Source $licenseUrl -Destination $licensePath
  Assert-Sha256 $licensePath $licenseSha256

  Copy-Item -LiteralPath $extractedExecutable -Destination $outputExecutable -Force
  Copy-Item -LiteralPath $extractedBlacklist -Destination $outputBlacklist -Force
  Copy-Item -LiteralPath $licensePath -Destination $outputLicense -Force
  Write-Output "Prepared NoDPI v$version."
} finally {
  if (Test-Path -LiteralPath $temporaryDirectory) {
    Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
  }
}
