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

A estabilização da 1.2.0 ocorre exclusivamente na `release/1.2.0`; ver [BRANCH_RELEASE_TRANSITION.md](docs/architecture/BRANCH_RELEASE_TRANSITION.md). O cutover administrativo só ocorre após homologação e aprovação.

- Durante o freeze, `release/1.2.0` é a linha de integração. A `v1` permanece preservada. O PR final deve sair diretamente de `release/1.2.0` para `main`, sem passagem pela `v1`. Após o cutover, `main` é o trunk.
- Mantenedores ou agentes explicitamente autorizados podem integrar diretamente em `release/1.2.0` durante o freeze, com commits pequenos, testes relevantes e evidência no SHA. Não criar branches internas nem PRs sucessivos apenas para continuar a mesma tarefa.
- Contribuições externas chegam por fork e pull request para `release/1.2.0` durante o freeze e `main` após o cutover, conforme [CONTRIBUTING.md](CONTRIBUTING.md).
- Antes de integrar, sincronize com o estado atual da branch; não faça force push nem sobrescreva mudanças de terceiros.
- Estar na branch não prova homologação: a admissão durável está implementada e coberta por E2E com provider shim, mas não homologada para providers reais. Não habilite autonomia por padrão nem trate o ACK como prova de execução.
- A publicação npm depende de versionamento e gates próprios, não apenas de commits ou merge. RC 1.2.0 pode ser publicada pela release; versão estável apenas pela main após aprovação e CI exato.
- Em `.github/workflows/`, use SHA completo de 40 caracteres em toda referência `uses:` e anote a versão correspondente. O GitHub rejeita refs de Actions por tag neste repositório; confirme SHA e versão no repositório oficial antes de editar.
