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

## Política de branch única de release (diretriz vigente)

- **Única branch de desenvolvimento de runtime:** `v1`. Todas as correções, etapas do Maestro, testes e documentação da execução durável ocorrem diretamente em `v1`. Não criar branches `feat/*`, `fix/*` nem PRs sucessivos para continuar o mesmo escopo.
- O [PR #59](https://github.com/IAPro-Community/Orquestrador-Maestro/pull/59) já foi integrado a `v1` no commit `5896ba429693765d0517798e187632c535440683`; os PRs #60 e #61 foram consolidados e fechados. Não usá-los como branches ativas.
- Preservar commits pequenos, testes automatizados no SHA exato e evidência de homologação. **Estar na release não transforma uma funcionalidade experimental em homologada**: manter `runs.submit` desabilitado até existir execução durável real e E2E.
- Antes de trabalhar, atualizar a cópia local a partir de `v1`; não sobrescrever alterações remotas. Não alterar `main` para desenvolvimento de runtime.
- Branches e PRs antigos podem permanecer apenas como histórico até auditoria de conteúdo; encerrar PRs redundantes depois de comprovar a incorporação, sem descartar código exclusivo.
