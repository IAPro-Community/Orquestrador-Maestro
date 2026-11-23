# AGENTS.md

## Escopo

Este repositório é um espelho público e sanitizado de uma configuração Orquestrador/Codex. Ele deve continuar instalável, revisável e seguro para publicação.

## Regras De Edição

- Não inclua dados pessoais, caminhos reais de usuário, tokens, logs, backups, memórias locais ou arquivos de cache.
- Prefira alterar a fonte local em `~/.orquestrador` e depois rodar `scripts/sync-from-local.ps1`.
- Depois de qualquer sync ou edição, rode `scripts/validate-public.ps1`.
- Commit e push exigem autorização explícita do responsável; nunca publique conteúdo privado ou crie uma release fora dos gates.
- Trate `DEV/` neste clone como memória operacional local ignorada pelo Git; publique a convenção em `docs/` e scripts, não o worklog local.
- Use UTF-8 e corrija texto quebrado ou mojibake antes de concluir.

## Arquivos Gerados

- `orquestrador/` é snapshot exportado e sanitizado.
- `codex/` contém skills, agentes e prompts Codex exportados de forma sanitizada.
- `skill-library/community-skills/` contém a biblioteca deduplicada de skills.
- `tool-profiles/` contém hooks e perfis textuais selecionados.
- `home/AGENTS.md` é o contrato global que será instalado no home do usuário.
- `.local/` é privado, ignorado pelo Git e pode guardar listas locais de termos privados para sanitização.

## Publicação

Antes de subir:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-public.ps1
git diff -- .
```


## Política de integração e release

- A branch `v1` é a linha canônica do desenvolvimento e release 1.x. `main` permanece histórica; não mover trabalho de runtime entre ambas sem decisão explícita.
- Mantenedores ou agentes explicitamente autorizados podem integrar diretamente em `v1`, com commits pequenos, testes relevantes e evidência no SHA. Não criar branches internas nem PRs sucessivos apenas para continuar a mesma tarefa.
- Contribuições externas chegam por fork e pull request para `v1`, conforme [CONTRIBUTING.md](CONTRIBUTING.md).
- Antes de integrar, sincronize com o estado atual da branch; não faça force push nem sobrescreva mudanças de terceiros.
- Estar na branch não prova homologação: `runs.submit` permanece desabilitado até execução durável E2E verificada.
- A publicação npm depende de versionamento e gates próprios, não apenas de commits em `v1`.
- Em `.github/workflows/`, use SHA completo de 40 caracteres em toda referência `uses:` e anote a versão correspondente. O GitHub rejeita refs de Actions por tag neste repositório; confirme SHA e versão no repositório oficial antes de editar.
