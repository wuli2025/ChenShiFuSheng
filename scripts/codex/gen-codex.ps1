# 用 codex(ChatGPT 原生图像生成 / GPT-image)为剧情场景批量出「分镜」配图。
# —— 应用已集成 codex 作为对话引擎(src-tauri/src/engine.rs),这里把同一个 codex CLI 复用为「出图引擎」。
# 每张走一次 `codex exec`:codex 用内置图像工具出图 → 落到 ~/.codex/generated_images → 自己拷到目标路径。
# 复用 scripts/pollinations/jobs/*.json 里逐场景 prompt;强制 WIDE LANDSCAPE 1536x1024 电影分镜构图。
# 幂等:目标已存在(>3KB)且未 -Force 则跳过,可断点续跑;失败自动重试一次;逐图写日志。
# 用法:
#   pwsh scripts/codex/gen-codex.ps1 musk,karl,zhuyuanzhang            # 补齐缺图
#   pwsh scripts/codex/gen-codex.ps1 musk,karl,zhuyuanzhang -Force     # 全部重出(视觉重构)
param([string]$games = "musk,karl,zhuyuanzhang", [switch]$Force, [int]$TimeoutSec = 300, [string]$CodexHome = "")
$ErrorActionPreference = "Continue"
# 并发出图时,若多条线共用默认 ~/.codex,codex「取 generated_images 里最新一张」的拷贝逻辑会抓到
# 别的线刚生成的图 → 跨线错配。给每条线独立 CODEX_HOME 即可彻底隔离(仅需带 auth.json+config.toml)。
if ($CodexHome) {
  # 按需自建隔离 home:只从真实 ~/.codex 拷 auth.json+config.toml(其余 codex 自建),
  # 避免把 144MB 的 logs sqlite 一起搬,也让脚本可独立复现(无需手工准备 home)。
  New-Item -ItemType Directory -Force -Path $CodexHome | Out-Null
  $realHome = Join-Path $env:USERPROFILE ".codex"
  foreach ($f in "auth.json", "config.toml", "version.json", "installation_id") {
    if ((Test-Path (Join-Path $realHome $f)) -and -not (Test-Path (Join-Path $CodexHome $f))) {
      Copy-Item (Join-Path $realHome $f) $CodexHome -Force
    }
  }
  $env:CODEX_HOME = $CodexHome
}
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$artDir = Join-Path $root "public\story-art"
$logFile = Join-Path $PSScriptRoot ("gen-" + (($games -replace '[^a-zA-Z0-9]', '')) + ".log")
# 确保 codex 可解析(D 盘 npm 全局)
if (Test-Path "D:\Users\mi\npm") { $env:PATH = "D:\Users\mi\npm;$env:PATH" }
Add-Type -AssemblyName System.Drawing

function Log($msg) {
  $line = "$(Get-Date -Format 'HH:mm:ss')  $msg"
  Write-Output $line
  Add-Content -Path $logFile -Value $line -Encoding utf8
}

# 单张出图:构造分镜指令 → 管道喂给 codex exec → 校验落盘且是横构图。返回 $true/$false。
function Invoke-CodexShot($prompt, $abs) {
  $instr = @"
You are producing ONE cinematic STORYBOARD KEYFRAME for a visual-novel game.
Requirements (hard):
- WIDE LANDSCAPE orientation, horizontal, size 1536x1024. The image MUST be wider than tall.
- Single dramatic composition, film-still quality, rich detail, strong staging and lighting.
- Absolutely NO text, letters, captions, watermarks, logos or signatures in the image.
Scene to depict: $prompt
Steps: use your image generation tool to render the scene in landscape orientation, then copy the newly generated PNG to the absolute path '$abs' (create parent dirs, overwrite if it exists). Reply only DONE when the landscape file is saved.
"@
  $done = $false
  # 生成前删掉旧目标:否则 codex 失败时,残留旧文件会让下面的存在性校验误判成功。
  if (Test-Path $abs) { Remove-Item $abs -Force -ErrorAction SilentlyContinue }
  # 注意:param 不能叫 $home —— 那是 PowerShell 只读自动变量,赋值会让整个 job 崩掉。
  $job = Start-Job -ScriptBlock {
    param($instr, $cxHome)
    if (Test-Path "D:\Users\mi\npm") { $env:PATH = "D:\Users\mi\npm;$env:PATH" }
    if ($cxHome) { $env:CODEX_HOME = $cxHome }
    $instr | codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox *> $null
  } -ArgumentList $instr, $env:CODEX_HOME
  if (Wait-Job $job -Timeout $TimeoutSec) { $done = $true } else { Stop-Job $job }
  Remove-Job $job -Force
  if ((Test-Path $abs) -and ((Get-Item $abs).Length -gt 3000)) { return $true }
  return $false
}

$ok = 0; $skip = 0; $fail = 0; $failed = @()
Log "=== codex 出图开始 (Force=$Force) games=$games ==="
foreach ($g in ($games -split ",")) {
  $g = $g.Trim()
  $jobsFile = Join-Path $root "scripts\pollinations\jobs\$g.json"
  if (-not (Test-Path $jobsFile)) { Log "缺 jobs: $g"; continue }
  $jobs = Get-Content $jobsFile -Raw | ConvertFrom-Json
  $i = 0
  foreach ($j in $jobs) {
    $i++
    $rel = ($j.key -replace "/", "\") + ".png"
    $abs = Join-Path $artDir $rel
    if (-not $Force -and (Test-Path $abs) -and ((Get-Item $abs).Length -gt 3000)) {
      $skip++; Log "[$g $i/$($jobs.Count)]  .  $($j.key) (skip)"; continue
    }
    New-Item -ItemType Directory -Force -Path (Split-Path $abs -Parent) | Out-Null
    $good = Invoke-CodexShot $j.prompt $abs
    if (-not $good) {
      Log "[$g $i/$($jobs.Count)]  retry $($j.key)"
      Start-Sleep -Seconds 3
      $good = Invoke-CodexShot $j.prompt $abs
    }
    if ($good) {
      try { $im = [System.Drawing.Image]::FromFile($abs); $dim = "$($im.Width)x$($im.Height)"; $land = $im.Width -ge $im.Height; $im.Dispose() } catch { $dim = "?"; $land = $true }
      $ok++; Log "[$g $i/$($jobs.Count)] OK  $($j.key)  $dim$(if(-not $land){' (⚠竖构图)'})"
    } else {
      $fail++; $failed += $j.key; Log "[$g $i/$($jobs.Count)] XX  $($j.key)"
    }
    Start-Sleep -Seconds 1
  }
}
Log "=== codex 出图结束: ok=$ok skip=$skip fail=$fail ==="
if ($failed.Count) { Log ("FAILED: " + ($failed -join ", ")) }
