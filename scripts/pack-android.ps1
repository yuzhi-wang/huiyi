param([string]$HBuilderCli = (Join-Path $env:USERPROFILE 'HBuilderX/cli.exe'))
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $HBuilderCli)) { throw 'HBuilderX CLI not found. Pass -HBuilderCli with the installed cli.exe path.' }
$taskRoot = Split-Path -Parent $PSScriptRoot
$signingDir = Join-Path $taskRoot '.local/signing'
$keystorePath = Join-Path $signingDir 'huiyi-release.jks'
$passwordPath = Join-Path $signingDir 'password.txt'
if (-not (Test-Path -LiteralPath $keystorePath) -or -not (Test-Path -LiteralPath $passwordPath)) {
    throw 'Fixed signing key missing. Run scripts/create-signing.ps1 before the FIRST release; restore the original signing backup for updates.'
}
$signingPassword = [IO.File]::ReadAllText($passwordPath).Trim()
$configuration = @{
    project = $taskRoot; platform = 'android'; iscustom = $false; safemode = $false
    sourceMap = $false; isconfusion = $false; splashads = $false; rpads = $false; unimpads = $false
    android = @{
        packagename = 'com.huiyi.meetingdemo'; androidpacktype = '0'
        certalias = 'huiyi-release'; certfile = $keystorePath
        certpassword = $signingPassword; storePassword = $signingPassword
    }
}
$configPath = Join-Path $taskRoot '.local/pack-android.json'
[IO.File]::WriteAllText($configPath, ($configuration | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding $false))
$configuration = $null
$signingPassword = $null
& $HBuilderCli project open --path $taskRoot
if ($LASTEXITCODE -ne 0) { throw 'Cannot open project in HBuilderX.' }
& $HBuilderCli pack --config $configPath
if ($LASTEXITCODE -ne 0) { throw 'HBuilderX cloud packaging did not complete. Check the sanitized IDE error.' }
