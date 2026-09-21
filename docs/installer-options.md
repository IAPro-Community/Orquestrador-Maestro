# Opções Do Instalador

Use este guia quando a instalação padrão não é suficiente: dry-run, instalação parcial, home temporário ou remoção conservadora. Para o caminho usual, comece pelo [guia de instalação](installation.md).

O instalador tem dois níveis:

- wrapper da raiz: `install.ps1` no Windows e `install.sh` no Linux/macOS;
- motor avançado: `scripts/install.ps1` e `scripts/install.sh`.

Use o wrapper para instalação normal. Use o motor avançado quando precisar testar, listar alvos, instalar uma parte específica ou depurar.

## Fluxo Seguro Recomendado

Antes de instalar em uma máquina real:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -DryRun
```

Linux/macOS:

```bash
bash install.sh --dry-run
```

Depois instale e verifique:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-install.ps1
```

Linux/macOS:

```bash
bash install.sh
bash scripts/verify-install.sh
```

Por padrão, `DryRun`, `ListTargets`, instalação, uninstall e verificação mostram IDs simbólicos ou `[redacted]`, sem caminhos absolutos. Use `-VerbosePaths` ou `--verbose-paths` somente para depuração local.

## Wrapper Windows

| Opção | Efeito |
|---|---|
| `-HomePath <path>` | Instala em outro home. Útil para teste. |
| `-NoForce` | Não sobrescreve `.orquestrador` e `AGENTS.md` existentes. |
| `-NoToolProfiles` | Não instala perfis/hook files das ferramentas. |
| `-CoreOnly` | Instala apenas `.orquestrador` e `AGENTS.md`. |
| `-SkipCommunitySkills` | Não copia a biblioteca comunitária para raízes de compatibilidade. |
| `-SkipSkillSync` | Não roda o sincronizador de skills ao final. |
| `-Only <id>` | Limita extras a um componente simbólico, mantendo o core. |
| `-DryRun` | Mostra o plano sem copiar, apagar ou criar backup; lista como etapas planejadas a criação de `logs`, o sync de skills e a descoberta (sem executar). |
| `-ListTargets` | Lista os alvos que seriam tratados. |
| `-Uninstall` | Remove de forma conservadora os arquivos mapeados pelo snapshot. |
| `-NonInteractive` | Reservado para automação; não altera o comportamento atual porque o instalador já não pergunta. |
| `-VerbosePaths` | Mostra paths completos em listagem/dry-run. |

## Wrapper Linux/macOS

| Opção | Efeito |
|---|---|
| `--home-path PATH` | Instala em outro home. |
| `--no-force` | Não força sobrescrita do core. |
| `--no-tool-profiles` | Não instala perfis das ferramentas. |
| `--core-only` | Instala apenas o core. |
| `--skip-community-skills` | Não copia a biblioteca comunitária para `.orquestrador/skill-library/community-skills`. |
| `--skip-skill-sync` | Não roda sync ao final. |
| `--only ID` | Limita extras a um componente simbólico. |
| `--dry-run` | Mostra o plano sem efeitos colaterais; lista como etapas planejadas a criação de `logs`, o `chmod +x`, o sync de skills e a descoberta (sem executar). |
| `--list-targets` | Lista alvos planejados. |
| `--uninstall` | Remove arquivos mapeados pelo snapshot e preserva backups. |
| `--non-interactive` | Reservado para automação. |
| `--verbose-paths` | Mostra paths completos em listagem/dry-run. |

## IDs Para `Only`

IDs aceitos:

```text
all
core
skills
community-skills
codex
agents
freebuff
claude
opencode
cursor
gemini
windsurf
antigravity
mimo
kimi
grok
tool-profiles
codex-skills
codex-agents
codex-prompts
prompts
```

Exemplos:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Only codex -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Only antigravity
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Only freebuff -Force
orquestrador-maestro install --only codex,cursor,claude --dry-run
```

Linux/macOS:

```bash
bash install.sh --only codex --dry-run
bash install.sh --only antigravity
orquestrador-maestro install --only=codex,cursor,claude --dry-run
```

Mesmo com `Only`, o core é mantido no plano porque os perfis das ferramentas apontam para `.orquestrador` e `AGENTS.md`.

No CLI npm, `--only` aceita um componente, componentes repetidos ou lista separada por vírgula:

```bash
orquestrador-maestro install --only cursor
orquestrador-maestro install --only cursor --only claude
orquestrador-maestro install --only cursor,claude,opencode
orquestrador-maestro install --only=cursor,claude,opencode
```

No modo `Uninstall`, `Only` limita o que será removido. Exemplo: `-Uninstall -Only codex` remove apenas os arquivos mapeados do componente Codex; não remove `.orquestrador` nem `AGENTS.md`.

## Uninstall Conservador

O uninstall não aceita caminhos arbitrários. Ele usa apenas os alvos conhecidos do pacote.

Comportamento:

- remove `.orquestrador` e `AGENTS.md` do home informado;
- faz backup recursivo completo do core antes de remover (preserva arquivos gerados como `logs/`, `SKILLS_DISCOVERY.json` e offloads);
- em diretórios compartilhados, remove apenas arquivos que existem no snapshot público;
- reverte os espelhos criados por `sync --apply` (remove apenas diretórios gerenciados sob o manifesto/política, nunca arquivos do usuário fora das raízes gerenciadas);
- cria backup antes de remover quando o destino existe;
- recusa remover algo fora do home informado;
- não remove credenciais, logins, caches, OAuth, projetos ou configs fora dos alvos mapeados.

Prévia:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Uninstall -DryRun
```

Execução:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Uninstall
```

Linux/macOS:

```bash
bash install.sh --uninstall --dry-run
bash install.sh --uninstall
```

## Teste Em Home Temporário

Windows:

```powershell
$tempHome = Join-Path $env:TEMP "orquestrador-test-home"
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -HomePath $tempHome -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -HomePath $tempHome
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-install.ps1 -HomePath $tempHome
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -HomePath $tempHome -Uninstall
```

Linux/macOS:

```bash
tmp_home="$(mktemp -d)"
bash install.sh --home-path "$tmp_home" --dry-run
bash install.sh --home-path "$tmp_home"
bash scripts/verify-install.sh --home-path "$tmp_home"
bash install.sh --home-path "$tmp_home" --uninstall
```

Para um teste rápido do core:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -HomePath $tempHome -CoreOnly -SkipSkillSync
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-install.ps1 -HomePath $tempHome -CoreOnly
```

Linux/macOS:

```bash
bash install.sh --home-path "$tmp_home" --core-only --skip-skill-sync
bash scripts/verify-install.sh --home-path "$tmp_home" --core-only
```

Os smoke tests automatizam esse fluxo:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-install.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-install.ps1 -Full
```

Linux/macOS:

```bash
bash scripts/test-install.sh
```
