# Migração 0.x ou V1 alpha/beta → V1 estável

A linha 1.0 introduz uma quebra deliberada no contrato das **skills canônicas do Maestro**. Para usuários do CLI, a atualização continua sendo versionada e autocontida: instale a nova versão e rode a verificação normal.

## Usuário do Maestro

```bash
npm install -g @iapro/orquestrador-maestro-cli@latest --prefer-online
orquestrador-maestro update
orquestrador-maestro verify
orquestrador-maestro version --check
```

O comando npm muda explicitamente para o canal estável. Depois, `update` atualiza a CLI nesse canal e reaplica os arquivos do Maestro com backup automático. Para instalações por clone, siga o [guia de atualização](installation.md#atualizar-uma-instalação-existente), usando a branch `v1` e `git pull --ff-only`.

A correção da 1.0.0 registra os perfis aplicados em `INSTALL_PROFILES.json`. O verificador exige os arquivos desses perfis; não exige perfis ignorados pela detecção. Instalações antigas sem esse registro mantêm a verificação completa até reaplicar o instalador.

Você não precisa converter skills externas, skills instaladas diretamente em Codex/Claude/OpenCode nem skills locais do projeto.

Essas origens continuam na fronteira de compatibilidade:

```text
library / external
user skills
project skills
        ↓
compatibility adapter
        ↓
runtime Skill Contract
```

Sem routing confiável, elas continuam explicit-only.

## Mantenedor de skill canônica Maestro

Toda entrada em `orquestrador/SKILLS_MANIFEST.json` deve usar o manifesto V3 e Skill Contract V2 nativo.

Campos canônicos:

- `schemaVersion: 2`;
- `contractVersion`;
- `origin: maestro-core | maestro-domain`;
- `maturity`;
- `capabilities`;
- `routing.useWhen`;
- `routing.doNotUseWhen`;
- `context.required/useful/avoid`;
- `outputs`;
- `verification.level/requirements`;
- `costProfile.context`.

Os campos antigos abaixo não são aceitos em uma skill Maestro V1:

- `triggers`;
- `status`;
- `documentation.notFor`;
- `documentation.expectedEvidence`;
- `workflow.validation`.

Aliases, tags, provenance, workflow de execução e metadados de distribuição continuam válidos porque não duplicam o Skill Contract.

## Criar uma nova skill Maestro

Use o helper para nascer já no contrato correto:

```powershell
.\scripts\new-canonical-skill.ps1 `
  -Name "skill-example" `
  -Description "Use para..." `
  -Category "engineering" `
  -Risk "medium" `
  -Origin "maestro-domain" `
  -Capability "engineering" `
  -Output "verified-result" `
  -Trigger "example"
```

Depois complete `context`, negative routing e evidências de verificação de forma específica ao domínio.

## Gates

Antes de publicar ou abrir merge:

```bash
npm test
npm run skills:contract-audit:strict
node scripts/skill-catalog.js validate
node scripts/skill-catalog.js check
npm pack --dry-run
```

A auditoria estrita falha se:

- o manifesto não for V3;
- existir skill canônica sem V2 nativo;
- o catálogo público estiver stale;
- houver IDs conflitantes;
- o contrato estiver incompleto.

## Rollback

0.4.x e 1.0.x são artefatos autocontidos. Se uma pré-release 1.0 apresentar problema, reinstale a versão 0.4.x desejada ou uma alpha corrigida. Não misture arquivos canônicos de versões diferentes dentro da mesma instalação.

Router v3 é o caminho padrão da linha V1 desde a pré-release. O Router v2 pode existir durante alpha/beta/RC apenas como comparação e rollback explícito (`--router-version 2`), mas a release 1.0 não promete compatibilidade de schema das skills Maestro com a linha 0.x.
