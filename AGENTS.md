# AGENTS.md

## Escopo

Este repositório é um espelho público e sanitizado de uma configuração Orquestrador/Codex. Ele deve continuar instalável, revisável e seguro para publicação.

## Regras De Edição

- Não inclua dados pessoais, caminhos reais de usuário, tokens, logs, backups, memórias locais ou arquivos de cache.
- Prefira alterar a fonte local em `~/.orquestrador` e depois rodar `scripts/sync-from-local.ps1`.
- Depois de qualquer sync ou edição, rode `scripts/validate-public.ps1`.
- Não faça commit nem push automaticamente.
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

## Política de branches e pull requests — execução por frente

- Antes de criar qualquer branch ou PR, **listar os PRs abertos** e identificar se já existe um branch de integração para a mesma issue, objetivo ou release. Se existir, **trabalhar exclusivamente nele**, adicionando commits e testes ao PR existente.
- Para a execução durável do Maestro (#48), o branch de integração atual é `feat/durable-admission-ledger-20261103`, PR #59, base `v1`. Incrementos de persistência, supervisor, Bridge, retry, cancel e QA pertencem a essa linha enquanto permanecer aberta.
- Não criar PRs encadeados por etapas, nem branches paralelos para 'continuação', 'fase 2' ou 'correção' da mesma entrega. Use commits pequenos, checklist de escopo, comentários e evidências no PR único.
- Separar um PR apenas quando o assunto for **arquiteturalmente independente** (por exemplo, site institucional), hotfix isolado, ou exigir ciclo de homologação distinto. Não misturar frentes sem relação só para reduzir a contagem de PRs.
- Um PR antigo só pode ser fechado depois de verificar o que foi efetivamente incorporado, registrar o commit de destino e listar conteúdo exclusivo ainda pendente; não apagar branches com artefatos não migrados.
- Não alterar `main`; o trabalho de runtime passa por `v1` após revisão e testes no commit exato. Nunca inferir que checks antigos validam um novo HEAD.
