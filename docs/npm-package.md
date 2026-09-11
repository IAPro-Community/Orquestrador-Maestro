# Pacote npm

Este guia atende quem instala, publica ou mantém a CLI npm. Se você só quer começar a usar o Maestro, siga primeiro o [guia de instalação](installation.md).

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
curl -fsSL https://raw.githubusercontent.com/IAPro-Community/Orquestrador-Maestro/main/scripts/bootstrap-install.sh | bash
```

No Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/IAPro-Community/Orquestrador-Maestro/main/scripts/bootstrap-install.ps1 | iex
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

O CLI envia, por padrão, telemetria anônima mínima para medir adoção e uso técnico do pacote. O provedor inicial é o PostHog Cloud na região US (Virginia), por captura server-side, sem SDK de sessão, replay, cookies, heatmaps ou autocaptura. O mantenedor deve revisar privacidade, retenção, eliminação e transferência internacional do projeto PostHog antes de publicar.

O indicador é **instalação anônima ativa**, não pessoa única. Uma pessoa em dois computadores conta duas instalações, e remover a configuração pode gerar outro ID. A base legal e o aviso de privacidade devem ser revisados com orientação jurídica; esta documentação não afirma conformidade automática.

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
- identificador anônimo aleatório persistido localmente;
- data UTC, sem horário preciso.

O payload nunca deve conter:

- telefone;
- nome de usuário;
- caminho local;
- conteúdo de projeto;
- token;
- prompt;
- log;
- nomes de arquivos privados;
- IP armazenado pelo produto, prompts ou valores de argumentos.

Status:

```bash
orquestrador-maestro telemetry
```

Consultar o estado e instruções simples:

```bash
orquestrador-maestro telemetry status
```

Reabilitar depois de um opt-out:

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

O endpoint e a chave pública de ingestão do projeto PostHog são definidos pelo mantenedor no release ou por variáveis de ambiente:

```bash
ORQUESTRADOR_MAESTRO_TELEMETRY_ENDPOINT=https://us.i.posthog.com/capture/
ORQUESTRADOR_MAESTRO_TELEMETRY_API_KEY=<chave-publica-do-projeto>
```

Antes do publish, o mantenedor pode gravar o endpoint sugerido em `package.json`. O usuário pode desligar a telemetria a qualquer momento:

```json
{
  "config": {
    "telemetryEndpoint": "https://us.i.posthog.com/capture/"
  }
}
```

Sem a chave pública do projeto, nenhum evento é enviado. Configurações antigas sem a versão atual são carregadas desabilitadas.

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
  "errorCategory": null,
  "platform": "win32",
  "arch": "x64",
  "nodeMajor": 22,
  "anonymousId": "uuid-aleatorio",
  "date": "2026-05-25"
}
```

Métricas recomendadas no painel: `active_installations` (distinct IDs que emitiram evento no período), `new_installations` (primeiro evento por ID), comandos mais usados, funil `install` → `verify`, versões em uso, plataforma aproximada e taxa de erro por comando. Não use os dados para marketing individual, publicidade, perfilização ou venda.

Registro de tratamento: finalidade medir adoção e uso técnico; origem CLI instalado; categorias identificador pseudônimo de instalação, comando, resultado, versão e ambiente técnico; compartilhamento com PostHog como operador de analytics; retenção conforme a configuração mínima aprovada no projeto PostHog; eliminação pela exclusão dos eventos/projeto conforme o procedimento vigente do provedor. Confirme prazo, região, subprocessadores e transferências no contrato antes do lançamento.

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
