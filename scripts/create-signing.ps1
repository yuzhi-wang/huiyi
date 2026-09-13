param([string]$Keytool = 'keytool')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$signingDir = Join-Path $taskRoot '.local/signing'
New-Item -ItemType Directory -Force -Path $signingDir | Out-Null
$keystorePath = Join-Path $signingDir 'huiyi-release.jks'
$passwordPath = Join-Path $signingDir 'password.txt'
if (Test-Path -LiteralPath $keystorePath) {
    Write-Output 'Fixed signing key already exists; it has not been replaced.'
    exit 0
}
if (Test-Path -LiteralPath $passwordPath) { throw 'Existing password file found. Inspect previous signing attempt before continuing.' }
$randomBytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($randomBytes) } finally { $rng.Dispose() }
$signingPassword = [Convert]::ToBase64String($randomBytes)
[IO.File]::WriteAllText($passwordPath, $signingPassword, [Text.Encoding]::ASCII)
$signingPassword = $null
& $Keytool -genkeypair -keystore $keystorePath -storetype JKS -alias huiyi-release -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Huiyi Meeting Demo, O=Huiyi' -storepass:file $passwordPath -keypass:file $passwordPath
if ($LASTEXITCODE -ne 0) { throw 'Signing key generation failed.' }
& $Keytool -exportcert -rfc -keystore $keystorePath -alias huiyi-release -storepass:file $passwordPath -file (Join-Path $signingDir 'huiyi-release.pem')
if ($LASTEXITCODE -ne 0) { throw 'Certificate export failed.' }
Write-Output 'Fixed signing key and password are saved in .local/signing. Back up this directory privately for future updates.'
