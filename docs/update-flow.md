# Fluxo De Atualização

Este é o guia de manutenção do snapshot público. Ele existe para manter o projeto instalável e sanitizado; usuários finais normalmente devem seguir a instalação ou atualização pela CLI.

## Fonte Da Verdade

Edite primeiro a instalação local:

```text
Windows: %USERPROFILE%\.orquestrador
Linux/macOS: $HOME/.orquestrador
```

Depois gere o snapshot público nesta pasta.

## Atualizar Snapshot

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-from-local.ps1
```

Se precisar remover termos privados específicos durante a exportação:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-from-local.ps1 -PrivateTerm "NomeDoProjeto" -PrivateTerm "ClienteInterno"
```

Também é possível manter termos privados em `.local/private-terms.txt`, um por linha. Essa pasta é ignorada pelo Git.

## Validar

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-skills.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-public.ps1
```

## Atualizar Release Notes

Antes de publicar, atualize:

- `CHANGELOG.md` como histórico canônico;
- o resumo do changelog no `README.md`, incluindo a data da revisão pública mais recente;
- qualquer radar novo em `docs/research/` quando a mudança vier de referências externas.

## Revisar E Subir

```powershell
git diff -- .
git add .
git commit -m "Update public orchestrator snapshot"
git push
```

O processo não faz commit nem push automaticamente.

## Pacotes Gerados

O sync atualiza:

- `orquestrador/` com o núcleo canônico.
- `codex/` com skills, agentes e prompts Codex.
- `skill-library/community-skills/` com a biblioteca deduplicada que passa a ser instalada em `.orquestrador/skill-library/community-skills`, fora das raízes nativas.
- `tool-profiles/` com hooks e perfis textuais selecionados.

Para gerar apenas o núcleo:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-from-local.ps1 -SkipCodexPack -SkipCommunitySkills -SkipToolProfiles
```

## Testar Instalação

Antes de publicar uma mudança de instalador ou documentação, teste em um home temporário:

```powershell
$tempHome = Join-Path $env:TEMP "orquestrador-public-test"
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -HomePath $tempHome
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-install.ps1 -HomePath $tempHome
```

No Linux/macOS:

```bash
bash install.sh --home-path /tmp/orquestrador-public-test
bash scripts/verify-install.sh --home-path /tmp/orquestrador-public-test
```

## Testar Fluxo De Update Do Pacote

Antes do próximo publish npm, valide também o fluxo do usuário final:

```powershell
npm pack --dry-run
node .\bin\orquestrador-maestro.js changelog
node .\bin\orquestrador-maestro.js update --home-path $tempHome --core-only
node .\bin\orquestrador-maestro.js verify --home-path $tempHome --core-only
node .\bin\orquestrador-maestro.js doctor --home-path $tempHome
```

Para usuários finais, `orquestrador-maestro update` atualiza primeiro a CLI global para `latest` e depois reaplica o pacote atualizado. O fluxo equivalente manual é `npm install -g @iapro/orquestrador-maestro-cli@latest --force --prefer-online`, seguido de `orquestrador-maestro update`.

Os modos `--dry-run` e `--list-targets` continuam somente leitura e não atualizam a CLI global.
