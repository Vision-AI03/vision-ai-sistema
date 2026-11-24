# Rodada do operário IA (skill operario-ia), chamada a cada 5 min pela tarefa
# "VisionAI - Operario IA" do Agendador do Windows.
# 1) sobe a janela 5h/7d gravada pela status line; 2) só abre o Claude se houver pedido.
# Log em .conteudo/logs/operario-<data>.log (pasta ignorada pelo git).

$repo = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
Set-Location $repo
$logs = Join-Path $repo ".conteudo\logs"
New-Item -ItemType Directory -Force $logs | Out-Null
$log = Join-Path $logs ("operario-" + (Get-Date -Format "yyyy-MM-dd") + ".log")
$script = Join-Path $PSScriptRoot "operario.mjs"

node $script uso 2>&1 | Out-Null
$pendentes = node $script tem-pedido 2>> $log
if (-not ($pendentes -match '^\d+$') -or [int]$pendentes -eq 0) { exit 0 }

$prompt = "/operario-ia Rodada automatica: processe os pedidos pendentes da fila_ia seguindo a skill a risca."
$ferramentas = "Bash(node .claude/skills/operario-ia/scripts/operario.mjs:*),Read,Write"

"[$(Get-Date -Format s)] inicio ($pendentes pendente(s))" | Out-File -FilePath $log -Encoding utf8 -Append
& "$env:APPDATA\npm\claude.cmd" -p $prompt --allowedTools $ferramentas --permission-mode acceptEdits 2>&1 | Out-File -FilePath $log -Encoding utf8 -Append
"[$(Get-Date -Format s)] fim (codigo $LASTEXITCODE)" | Out-File -FilePath $log -Encoding utf8 -Append
node $script uso 2>&1 | Out-Null
