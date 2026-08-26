---
name: vision-ai-dev
description: Padrões de desenvolvimento da Vision AI para qualquer mudança nos sistemas (vision-ai-sistema, AJM, sites). Use SEMPRE que for escrever código, criar migration, Edge Function, ou prompt para Lovable. Ative quando o usuário mencionar 'feature', 'bug', 'migration', 'edge function', 'deploy', 'Supabase', 'Lovable', ou nomes de módulos (CRM, Prospecção, Financeiro, Contratos, Comunicações).
---

# Vision AI — Skill de Desenvolvimento

## Identificação de projeto (passo 0 obrigatório)
Antes de qualquer mudança, confirme QUAL projeto:
| Projeto | Supabase ref | Repo |
|---|---|---|
| Vision AI interno | `sfezwprbanvxsnwgvkhh` | Vision-AI03/vision-ai-sistema |
| AJM Transportes | `mzmohsypcdywevqvafan` | (Lovable) |
| Site Vision AI | — | Vision-AI03/site-vision-ai |

Se o pedido for ambíguo, PERGUNTE antes de escrever SQL.

## Formato de entrega (sempre)
1. **SQL primeiro** (se houver): bloco único, pronto para colar no SQL Editor do Supabase do projeto correto.
2. **Código depois**: arquivos completos ou diffs cirúrgicos — nunca "..." no meio de arquivo.
3. **Deploy ao final**: comandos PowerShell sequenciais (sem `&&`):
   ```powershell
   git add .
   git commit -m "feat: descrição"
   git push
   ```
4. Edge Function nova: incluir `supabase functions deploy NOME --project-ref REF`.

## Padrões de código
- Toda lista nova: botões editar + excluir + confirmação de exclusão (AlertDialog).
- Toda ação: toast de sucesso/erro.
- Edge Functions: copiar boilerplate de auth/CORS de função existente do mesmo projeto.
- Migrations: novo arquivo timestampado; nunca editar migration antiga; sempre `IF NOT EXISTS` / idempotente quando possível.
- Operações longas (scraping, IA em lote): arquitetura assíncrona com webhook + tabela de status, nunca request síncrono > 25s.
- IA: Claude Sonnet para extração/geração; Haiku para classificação/triagem barata.

## Anti-padrões (recusar/alertar)
- Refatoração ampla não pedida.
- Misturar mudanças de dois projetos no mesmo prompt.
- Hardcode de tokens/keys no frontend — sempre Deno.env / variável Vercel.
- Polling síncrono de APIs lentas (Apify, geração de PDF).
