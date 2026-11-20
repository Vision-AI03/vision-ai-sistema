# Roda a produção diária de conteúdo (skill conteudo-instagram) sem interação.
# Chamado pela tarefa "VisionAI - Conteudo diario" do Agendador do Windows.
# Log em .conteudo/logs/<data>.log (pasta ignorada pelo git).

$repo = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
Set-Location $repo
$logs = Join-Path $repo ".conteudo\logs"
New-Item -ItemType Directory -Force $logs | Out-Null
$log = Join-Path $logs ((Get-Date -Format "yyyy-MM-dd_HHmm") + ".log")

$prompt = "/conteudo-instagram Rodada diaria automatica: leia o estado da fila, refaca primeiro os pedidos de alteracao e depois produza o feed que falta, seguindo a skill a risca (inclusive a revisao visual)."
$ferramentas = "Bash,Read,Edit,Write,Glob,Grep,WebSearch,WebFetch,Skill"

"[$(Get-Date -Format s)] inicio" | Out-File -FilePath $log -Encoding utf8
& "$env:APPDATA\npm\claude.cmd" -p $prompt --allowedTools $ferramentas --permission-mode acceptEdits 2>&1 | Out-File -FilePath $log -Encoding utf8 -Append
"[$(Get-Date -Format s)] fim (codigo $LASTEXITCODE)" | Out-File -FilePath $log -Encoding utf8 -Append
