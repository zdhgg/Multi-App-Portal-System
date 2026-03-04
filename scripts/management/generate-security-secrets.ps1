param(
  [int]$JwtBytes = 48,
  [int]$Pm2ConfirmBytes = 24,
  [int]$TotpBytes = 20
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function New-HexSecret {
  param([int]$ByteCount)
  if ($ByteCount -lt 16) {
    throw "ByteCount must be >= 16"
  }
  $bytes = New-Object byte[] $ByteCount
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
}

function New-Base32Secret {
  param([int]$ByteCount)
  if ($ByteCount -lt 10) {
    throw "ByteCount must be >= 10"
  }

  $alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  $bytes = New-Object byte[] $ByteCount
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }

  $bitBuffer = 0
  $bitCount = 0
  $result = New-Object System.Text.StringBuilder

  foreach ($b in $bytes) {
    $bitBuffer = ($bitBuffer -shl 8) -bor $b
    $bitCount += 8

    while ($bitCount -ge 5) {
      $index = ($bitBuffer -shr ($bitCount - 5)) -band 31
      [void]$result.Append($alphabet[$index])
      $bitCount -= 5
    }
  }

  if ($bitCount -gt 0) {
    $index = ($bitBuffer -shl (5 - $bitCount)) -band 31
    [void]$result.Append($alphabet[$index])
  }

  return $result.ToString()
}

$jwtSecret = New-HexSecret -ByteCount $JwtBytes
$pm2ConfirmToken = New-HexSecret -ByteCount $Pm2ConfirmBytes
$totpSecret = New-Base32Secret -ByteCount $TotpBytes

Write-Output ""
Write-Output "# ===== Backend (detection-api/.env or configs/production.env) ====="
Write-Output "JWT_SECRET=$jwtSecret"
Write-Output "PM2_CONFIRMATION_TOKEN=$pm2ConfirmToken"
Write-Output "ADMIN_MFA_TOTP_SECRET=$totpSecret"

Write-Output ""
Write-Output "# ===== Frontend (main-portal/.env.production) ====="
Write-Output "VITE_PM2_CONFIRM_TOKEN=$pm2ConfirmToken"

Write-Output ""
Write-Output "# Generated at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
