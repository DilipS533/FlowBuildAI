Param(
  [switch]$Install,
  [switch]$Build,
  [switch]$Preview,
  [switch]$Commit,
  [switch]$Push
)

<#
  run-all.ps1
  Usage examples:
    # Install and build only
    .\scripts\run-all.ps1 -Install -Build

    # Install, build, commit and push
    .\scripts\run-all.ps1 -Install -Build -Commit -Push

    # Install, build and start preview in background
    .\scripts\run-all.ps1 -Install -Build -Preview
#>

Set-StrictMode -Version Latest

# Move to repo root (script lives in scripts/)
Push-Location -Path "$PSScriptRoot\.."

Write-Output "Running automation script from: $(Get-Location)"

if ($Install) {
  Write-Output "[Step] npm install"
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit $LASTEXITCODE)" }
}

if ($Build) {
  Write-Output "[Step] npm run build"
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "build failed (exit $LASTEXITCODE)" }
}

if ($Commit) {
  Write-Output "[Step] git add & commit"
  git add -A
  git commit -m "Automated commit: build and changes" || Write-Output "No changes to commit"
}

if ($Push) {
  Write-Output "[Step] git push"
  git push
}

if ($Preview) {
  Write-Output "[Step] Starting preview at http://localhost:5173/FlowBuildAI/"
  Start-Process -NoNewWindow -FilePath "node" -ArgumentList "node_modules/vite/bin/vite.js","preview","--port","5173"
  Write-Output "Preview started (background). Use the browser to open http://localhost:5173/FlowBuildAI/"
}

Pop-Location
Write-Output "Automation script finished."