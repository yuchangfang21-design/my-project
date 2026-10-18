# Capture native packaging errors without changing npm's exit status or publishing a Release.
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path desktop-test-results | Out-Null
npm run desktop:dist -- --win --x64 2>&1 | Tee-Object -FilePath desktop-test-results/package-build.log
$packageBuildExit = $LASTEXITCODE
if ($packageBuildExit -ne 0) {
  $packageErrorLines = Get-Content desktop-test-results/package-build.log |
    Where-Object { $_ -match '(?i)error|failed|cannot|not set|invalid|⨯' } |
    Select-Object -Last 8
  $packageError = if ($packageErrorLines) { $packageErrorLines -join "`n" } else { 'No diagnostic error line was emitted; inspect the packaging log.' }
  $packageError = $packageError -replace '\x1b\[[0-?]*[ -/]*[@-~]', ''
  if ($packageError.Length -gt 4000) { $packageError = $packageError.Substring(0, 4000) }
  $packageError = $packageError.Replace('%', '%25').Replace("`r", '%0D').Replace("`n", '%0A')
  Write-Output "::error title=Windows packaging failed::$packageError"
}
exit $packageBuildExit
