# Pacote npm

O Orquestrador Maestro pode ser distribuído como CLI npm pelo pacote:

```bash
@iapro/orquestrador-maestro-cli
```

O binário instalado é:

```bash
orquestrador-maestro
```

## Por Que Esse Nome

`@iapro/orquestrador-maestro-cli` é mais claro que `@iapro/maestro-cli` porque:

- preserva o nome público do projeto;
- evita confusão com CLIs genéricos chamados Maestro;
- melhora busca por `orquestrador`, `maestro`, `ai agents`, `codex skills` e `iapro`;
- mantém o pacote dentro do escopo da comunidade Grupo IAPro.

Para publicar nesse nome, a conta npm precisa ser o usuário `iapro` ou ter permissão na organização npm `iapro`.

## Instalação Pelo Usuário

Instalação automática recomendada no macOS/Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/FernandoBolzan/Orquestrador-Maestro/main/scripts/bootstrap-install.sh | bash
```

No Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/FernandoBolzan/Orquestrador-Maestro/main/scripts/bootstrap-install.ps1 | iex
```

Esses bootstraps detectam permissões do npm, configuram um prefixo no perfil do usuário quando necessário, ajustam o `PATH`, instalam a CLI e executam `install` e `verify`. A instalação normal não deve usar `sudo` nem executar como Administrador.

Consulte [installation-troubleshooting.md](installation-troubleshooting.md) para corrigir instalações antigas feitas como root, erros `EACCES`, mensagens `ONLY[@]: unbound variable` e problemas de `PATH`.

Instalar o Orquestrador no home do usuário:

```bash
orquestrador-maestro install
```

Verificar:

```bash
orquestrador-maestro verify
```

Atualizar a CLI e aplicar a versão atualizada no home:

```bash
orquestrador-maestro update
orquestrador-maestro verify
orquestrador-maestro doctor
```

O comando `update` primeiro atualiza a própria CLI para a versão `latest` do npm e, em seguida, reaplica os arquivos dessa versão no home. Para atualizar somente o pacote npm sem reaplicar os arquivos, use:

```bash
npm install -g @iapro/orquestrador-maestro-cli@latest --force --prefer-online
```

No Linux e no macOS, o comando `doctor` exige `pwsh` ou `powershell` disponível no `PATH`.

Para preparar um projeto com a hierarquia DEV nova:

```bash
orquestrador-maestro init-dev --project-path .
orquestrador-maestro check-dev-gates --project-path . --max-entries 12 --strict
orquestrador-maestro compact-worklog --project-path . --keep 12
```

## Canal De Release

O canal público atual é o `latest` do npm. Esse é o único caminho recomendado para usuários finais:

```bash
npm install -g @iapro/orquestrador-maestro-cli@latest
```

Canais como `preview`, `beta` ou `nightly` só devem ser criados quando o projeto tiver:

- changelog separado por canal;
- validação automatizada do pacote;
- instruções claras de rollback;
- política de compatibilidade para instaladores e entrypoints;
- aviso explícito de risco para quem já usa o Orquestrador em projetos reais.

Enquanto isso não existir, a regra é simples: publicar versões estáveis no `latest` e documentar toda migração no README.

## Comandos

```bash
orquestrador-maestro install
orquestrador-maestro update
orquestrador-maestro verify
orquestrador-maestro doctor
orquestrador-maestro changelog
orquestrador-maestro init-dev
orquestrador-maestro compact-worklog
orquestrador-maestro check-dev-gates
orquestrador-maestro uninstall
orquestrador-maestro list-targets
orquestrador-maestro dry-run
orquestrador-maestro telemetry
orquestrador-maestro version
orquestrador-maestro version --check
```

`install` e `update` chamam os instaladores oficiais do repositório:

- Windows: `install.ps1`;
- Linux/macOS: `install.sh`.

`verify` chama:

- Windows: `scripts/verify-install.ps1`;
- Linux/macOS: `scripts/verify-install.sh`.

`doctor` chama o diagnóstico operacional empacotado:

- Windows: `orquestrador/doctor.ps1`;
- Linux/macOS: `pwsh` ou `powershell` executando `orquestrador/doctor.ps1`.

`init-dev` cria a estrutura padrao `DEV/` com `HANDOFF.md`, `SPECS/ACTIVE.md`, `VERIFY.md` e `WORKLOG.md`.

`compact-worklog` arquiva entradas antigas de `DEV/WORKLOG.md` em `DEV/HANDOFFS/WORKLOG_ARCHIVE.md` e atualiza `DEV/HANDOFF.md`.

`check-dev-gates` valida se o combo `spec + handoff + verify + worklog` esta presente e ainda compacto o bastante para evitar loops e excesso de contexto. O flag `--max-entries` deixa explicito qual limite de entradas o `WORKLOG` pode ter antes de falhar.

`changelog` lê o `CHANGELOG.md` empacotado no próprio pacote:

- `orquestrador-maestro changelog`: mostra as entradas mais recentes;
- `orquestrador-maestro changelog --full`: imprime o histórico completo incluído na release instalada.

`orquestrador-maestro version --check` consulta o `latest` diretamente no npm e compara com a versão instalada. Se houver diferença, informa o comando exato para atualizar; se não houver, confirma que a CLI já está atualizada.

## Prévia Segura

Antes de alterar arquivos:

```bash
orquestrador-maestro dry-run
orquestrador-maestro list-targets
```

Teste isolado em outro home:

```bash
orquestrador-maestro install --home-path /tmp/orquestrador-test --core-only
orquestrador-maestro verify --home-path /tmp/orquestrador-test --core-only
```

No Windows:

```powershell
orquestrador-maestro install --home-path "$env:TEMP\orquestrador-test" --core-only
orquestrador-maestro verify --home-path "$env:TEMP\orquestrador-test" --core-only
```

## Telemetria

O CLI tem suporte a telemetria anônima de runtime para medir uso real do pacote. Ela fica desabilitada por padrão. Nenhum evento é enviado sem endpoint configurado e sem habilitação explícita do usuário com `orquestrador-maestro telemetry enable`. Configurações antigas sem consentimento versionado são carregadas como desabilitadas e precisam de novo `telemetry enable`.

Eventos coletáveis:

- `install`;
- `update`;
- `verify`;
- `doctor`;
- `changelog`;
- `init-dev`;
- `compact-worklog`;
- `check-dev-gates`;
- `uninstall`;
- `dry-run`;
- `list-targets`.

Payload permitido:

- comando executado;
- flags usadas, sem valores;
- versão do pacote;
- plataforma;
- arquitetura;
- versão major do Node.js;
- exit code;
- sucesso ou falha;
- identificador anônimo aleatório.

O payload nunca deve conter:

- telefone;
- nome de usuário;
- caminho local;
- conteúdo de projeto;
- token;
- prompt;
- log;
- nomes de arquivos privados.

Status:

```bash
orquestrador-maestro telemetry
```

Configurar endpoint:

```bash
orquestrador-maestro telemetry endpoint https://seu-dominio.example/api/orquestrador-telemetry
```

Atalho equivalente:

```bash
orquestrador-maestro telemetry enable --endpoint https://seu-dominio.example/api/orquestrador-telemetry
```

Habilitar:

```bash
orquestrador-maestro telemetry enable
```

Enviar evento de teste:

```bash
orquestrador-maestro telemetry test
```

Desabilitar:

```bash
orquestrador-maestro telemetry disable
```

Desabilitar por variável de ambiente:

```bash
ORQUESTRADOR_MAESTRO_TELEMETRY=0 orquestrador-maestro install
```

No Windows PowerShell:

```powershell
$env:ORQUESTRADOR_MAESTRO_TELEMETRY = "0"
orquestrador-maestro install
```

O endpoint também pode ser configurado por variável de ambiente, mas isso não habilita telemetria sozinho:

```bash
ORQUESTRADOR_MAESTRO_TELEMETRY_ENDPOINT=https://seu-dominio.example/api/orquestrador-telemetry
```

Antes do publish, o mantenedor pode gravar um endpoint sugerido em `package.json`, mas a telemetria continuará exigindo `orquestrador-maestro telemetry enable` no usuário:

```json
{
  "config": {
    "telemetryEndpoint": "https://seu-dominio.example/api/orquestrador-telemetry"
  }
}
```

Sem endpoint e sem `telemetry enable`, a telemetria fica pronta no CLI, mas nenhum evento é enviado.

Exemplo de evento:

```json
{
  "schemaVersion": 1,
  "packageName": "@iapro/orquestrador-maestro-cli",
  "packageVersion": "0.1.2",
  "event": "cli_command",
  "command": "install",
  "flags": ["--core-only"],
  "exitCode": 0,
  "success": true,
  "errorName": null,
  "platform": "win32",
  "arch": "x64",
  "nodeMajor": 22,
  "ci": false,
  "anonymousId": "uuid-aleatorio",
  "timestamp": "2026-05-25T00:00:00.000Z"
}
```

Métricas complementares:

- downloads públicos do npm;
- stars e forks do GitHub;
- issues e PRs recebidas;
- uso documentado pela comunidade.

## Publicação

Antes de publicar:

```bash
npm login
npm whoami
npm pack --dry-run
```

Valide o pacote:

```powershell
npm run validate
```

Publicar como pacote público scoped:

```bash
npm publish --access public
```

Pacotes scoped públicos exigem `--access public` no primeiro publish.

### 2FA E Token Granular

Se o npm retornar:

```text
Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.
```

use um destes caminhos:

- 2FA com app autenticador: ative `Authorization and writes`, gere o OTP no app e publique com `npm publish --access public --otp <codigo>`.
- Token granular: crie um token em `Account > Access Tokens > Generate New Token > Granular Access Token`, libere publish para o escopo `@iapro` ou para o pacote e habilite bypass 2FA quando o npm oferecer essa opção.

Não cole senha, recovery code ou token em chat. Se for usar token granular, configure-o diretamente no terminal do mantenedor:

```powershell
npm config set //registry.npmjs.org/:_authToken "<token-granular>"
npm whoami
npm publish --access public
```

Security key/passkey funciona para proteger a conta, mas pode não fornecer um OTP numérico para `npm publish` em terminais não interativos. Nessa situação, prefira o token granular de publish.

## Atualização De Versão

Para um patch:

```bash
npm version patch
npm publish --access public
```

Depois, usuários atualizam com:

```bash
orquestrador-maestro update
orquestrador-maestro verify
orquestrador-maestro doctor
```

## O Que Não Entra No Pacote

O pacote deve excluir:

- `.git/`;
- `.omx/`;
- `.local/`;
- `DEV/`;
- `node_modules/`;
- logs;
- backups;
- `.env`;
- arquivos temporários;
- memórias locais;
- caches.

Essas exclusões ficam em `.npmignore` e também são cobertas pelo modelo de privacidade do projeto.
