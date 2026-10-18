# Migração 0.x ou V1 alpha/beta → V1 estável 1.1.0

A linha 1.0 introduziu uma quebra deliberada no contrato das **skills canônicas do Maestro**. A atualização 1.1.0 acrescenta migrações versionadas para o inventário gerenciado, preserva edições locais e grava um relatório de comparação ao lado do backup.

## Usuário do Maestro

```bash
npm install -g @iapro/orquestrador-maestro-cli@latest --prefer-online
orquestrador-maestro update
orquestrador-maestro verify
orquestrador-maestro version --check
```

O comando npm muda explicitamente para o canal estável. Depois, `update` atualiza a CLI nesse canal e reaplica os arquivos do Maestro com backup automático. Para instalações por clone, siga o [guia de atualização](installation.md#atualizar-uma-instalação-existente), usando a branch `main` e `git pull --ff-only`.

Cada atualização grava `update-artifacts/update-report.json` no diretório do backup. O relatório lista arquivos adicionados, atualizados ou removidos, customizações preservadas e versões dos schemas. Quando um arquivo oficial foi editado localmente, a edição continua ativa e a cópia oficial nova fica em `update-artifacts/upstream-overrides/` para comparação. Resolva a diferença antes de apagar o backup.

Cada raiz nativa também registra as hashes das árvores sincronizadas em `.orquestrador-managed-skills.json`. Um update troca a skill espelhada quando ela ainda corresponde à versão oficial anterior. Se detectar edição ou arquivo extra dentro da skill, mantém a árvore inteira e grava a nova cópia oficial e `native-skills-report.json` em `update-artifacts/native-skills/`. Em instalações anteriores a esse registro, a atualização compara com a skill do backup; sem correspondência segura, preserva o conteúdo existente para revisão.

Mesmo com `--skip-skill-sync` ou `--only`, uma instalação garante as oito raízes nativas e a skill compartilhada `orquestrador-maestro`. `verify --strict` confere esse mínimo e os aliases deprecated autorizados em cada raiz.

A correção da 1.0.0 registra os perfis aplicados em `INSTALL_PROFILES.json`. O verificador exige os arquivos desses perfis; não exige perfis ignorados pela detecção. Instalações antigas sem esse registro mantêm a verificação completa até reaplicar o instalador.

Na atualização para 1.0.1, a única raiz canônica do núcleo passa a ser `~/.orquestrador` (no Windows, `%USERPROFILE%\.orquestrador`). O comando `orquestrador-maestro update` faz backup e migra automaticamente instalações em `~/.orquestrador-maestro`, preservando os arquivos de memória e mesclando a configuração; os valores da raiz canônica têm precedência em conflitos. A raiz antiga só é removida depois que a nova instalação foi publicada. O backup fica em `~/.orquestrador-public-backups`.

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

Liste os backups do instalador com `orquestrador-maestro rollback --list` e restaure um deles com `orquestrador-maestro rollback --to STAMP`. A restauração prepara o core e os espelhos nativos registrados antes de publicar qualquer alteração; também mescla a configuração ativa e preserva arquivos adicionados ou customizados. Se uma skill nativa mudou depois do backup, o comando aborta antes de substituir o estado. O backup permanece disponível e uma restauração já aplicada pode ser repetida.

0.4.x e 1.0.x são artefatos autocontidos. Se uma pré-release 1.0 apresentar problema, reinstale a versão 0.4.x desejada ou uma alpha corrigida. Não misture arquivos canônicos de versões diferentes dentro da mesma instalação.

Router v3 é o caminho padrão da linha V1 desde a pré-release. O Router v2 pode existir durante alpha/beta/RC apenas como comparação e rollback explícito (`--router-version 2`), mas a release 1.0 não promete compatibilidade de schema das skills Maestro com a linha 0.x.
