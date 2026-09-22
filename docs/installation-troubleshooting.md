# Solução de problemas de instalação

Se a instalação normal não terminou como esperado, use este guia para recuperar o ambiente sem improvisar comandos. Para instalar primeiro, siga o [guia de instalação](installation.md).

## Skill ausente no OpenCode/DANTE

O Codex e o OpenCode mantêm raízes nativas diferentes. Por isso, uma skill disponível em `%USERPROFILE%\.codex\skills` pode não aparecer automaticamente no DANTE/OpenCode.

Para conferir e corrigir a sincronização no Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File $HOME\.orquestrador\sync-skills.ps1 -Check
powershell -NoProfile -ExecutionPolicy Bypass -File $HOME\.orquestrador\sync-skills.ps1 -Apply
```

O `-Check` deve terminar sem ações diferentes de `ok`. A política mantém apenas compatibilidades explicitamente autorizadas por cliente; workflows que dependem de ferramentas internas do Codex/OMX não são copiados para o OpenCode. Depois de aplicar uma alteração, reinicie a ferramenta para que ela releia a raiz de skills.

## Instalação recomendada

Use uma sessão normal do usuário. Não use `sudo`, `su`, root nem PowerShell como Administrador.

macOS e Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/IAPro-Community/Orquestrador-Maestro/main/scripts/bootstrap-install.sh | bash
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/IAPro-Community/Orquestrador-Maestro/main/scripts/bootstrap-install.ps1 | iex
```

O bootstrap exige Node.js 20 ou superior, detecta um prefixo global do npm sem permissão de escrita, configura um prefixo dentro do home do usuário, atualiza o `PATH`, instala a versão estável da CLI e executa `install` e `verify`.

## Disco cheio após uma instalação antiga no macOS

As versões anteriores à `0.1.11` podiam copiar o perfil inteiro de uma ferramenta para `$HOME/.orquestrador-public-backups`. No Codex, isso podia incluir sessões e caches grandes. A partir da `0.1.11`, somente os arquivos efetivamente gerenciados pelo Orquestrador são incluídos no backup.

Para recuperar espaço, remover a instalação e reinstalar do zero sem apagar sessões, autenticação ou configurações pessoais das ferramentas, execute no Terminal do usuário normal, sem `sudo`:

```bash
# 1. Confira o espaço ocupado pelos backups antigos.
du -sh "$HOME/.orquestrador-public-backups" 2>/dev/null || true

# 2. Apague somente os backups criados pelo Orquestrador para liberar espaço.
rm -rf -- "$HOME/.orquestrador-public-backups"
df -h "$HOME"

# 3. Instale a CLI corrigida, use o desinstalador seguro e remova a CLI.
npm install -g @iapro/orquestrador-maestro-cli@latest --force --prefer-online
orquestrador-maestro uninstall
npm uninstall -g @iapro/orquestrador-maestro-cli

# 4. Remova eventuais sobras exclusivas do Orquestrador.
rm -rf -- "$HOME/.orquestrador" "$HOME/.orquestrador-public-backups"

# 5. Faça uma instalação limpa e verifique o resultado.
curl -fsSL https://raw.githubusercontent.com/IAPro-Community/Orquestrador-Maestro/main/scripts/bootstrap-install.sh | bash
orquestrador-maestro verify
```

Não remova as pastas `$HOME/.codex`, `$HOME/.claude`, `$HOME/.cursor`, `$HOME/.gemini`, `$HOME/.opencode` ou equivalentes. Elas pertencem às ferramentas e podem conter sessões, logins e configurações pessoais.

Se ainda existir uma instalação antiga feita como root em `/usr/local`, confirme primeiro os dois caminhos abaixo. Remova-os somente se apontarem para o pacote do Orquestrador:

```bash
ls -ld /usr/local/lib/node_modules/@iapro/orquestrador-maestro-cli /usr/local/bin/orquestrador-maestro 2>/dev/null
sudo rm -rf -- /usr/local/lib/node_modules/@iapro/orquestrador-maestro-cli
sudo rm -f -- /usr/local/bin/orquestrador-maestro
```

## Erro `EACCES` em `/usr/local`

Exemplo:

```text
npm error code EACCES
npm error syscall symlink
npm error dest /usr/local/bin/orquestrador-maestro
```

Esse erro ocorre antes de o código do Orquestrador ser executado. O npm está tentando gravar em um prefixo global protegido. Não corrija com `sudo npm install -g`, pois isso instala o pacote no usuário root e faz o Orquestrador usar `/var/root` ou `/private/var/root`.

Execute o bootstrap recomendado. Ele troca automaticamente para `$HOME/.npm-global` quando o prefixo atual não pode ser gravado pelo usuário.

## Erro `ONLY[@]: unbound variable`

Exemplo:

```text
install.sh: line 114: ONLY[@]: unbound variable
```

Esse erro era causado pelo Bash 3.2 incluído em versões do macOS ao expandir um array vazio com `set -u`. A correção está incluída a partir da versão `0.1.9`; a instalação atual usa uma implementação compatível e testada sem essa expansão insegura.

Se a mensagem ainda aparecer, há uma versão antiga em cache ou instalada. Execute novamente o bootstrap recomendado, que solicita a versão exata da release e valida a versão realmente instalada antes de continuar.

## Comando não encontrado após instalar

Feche e abra o Terminal ou carregue novamente o perfil:

```bash
source ~/.zshrc 2>/dev/null || source ~/.bashrc 2>/dev/null || source ~/.profile
```

Depois confirme:

```bash
command -v orquestrador-maestro
orquestrador-maestro version
orquestrador-maestro verify
```

O bootstrap já exporta o novo `PATH` durante a instalação e persiste a configuração para sessões futuras.

## Instalação executada anteriormente como root

Uma instalação feita com `sudo` pertence ao root e não configura o usuário normal. Volte ao Terminal do usuário e execute o bootstrap sem `sudo`. O bootstrap recusa execução como root para impedir uma nova instalação no home errado.

Se arquivos antigos em `/usr/local/lib/node_modules/@iapro/orquestrador-maestro-cli` continuarem bloqueando o npm, eles pertencem à instalação anterior feita como root. A remoção ou correção desses arquivos exige uma decisão administrativa específica da máquina; o bootstrap evita depender deles instalando no prefixo do usuário.

## Verificação final

O resultado esperado é:

```text
Install verification passed.
```

Também podem ser executados:

```bash
orquestrador-maestro version
orquestrador-maestro list-targets
orquestrador-maestro doctor
```

No macOS e Linux, `doctor` requer `pwsh` ou `powershell`; `verify` não possui essa dependência.

## `check-dev-gates --project-path .` procura `DEV/` no lugar errado

Em versões anteriores, a CLI podia resolver `.` contra o diretório onde o pacote npm estava instalado, em vez do diretório atual do projeto. A correção mantém o diretório de invocação ao executar os helpers DEV. Atualize a CLI e rode novamente:

```text
npm install -g @iapro/orquestrador-maestro-cli@latest --force --prefer-online
orquestrador-maestro check-dev-gates --project-path . --strict
```

O caminho explícito e absoluto continua sendo uma alternativa válida quando necessário.

## Avisos do Codex sobre subagentes, MCP e sandbox no Windows

Se o Codex mostrar `agent role 'subagent' must define a description`, o perfil local de subagente está sem o campo obrigatório `description`. No Windows, abra `%USERPROFILE%\\.codex\\config.toml` e mantenha o bloco com uma descrição, por exemplo:

```toml
[agents.subagent]
description = "Subagente Codex para tarefas independentes e delimitadas."
model = "cheap-fast"
```

Avisos como `MCP server is not logged in` pertencem à autenticação do servidor remoto, não ao Orquestrador. Faça login apenas no MCP que você pretende usar; não coloque tokens no repositório nem em arquivos de configuração publicados.

Já `windows sandbox: helper_unknown_error` é uma falha do runtime/sandbox do Codex ou do terminal que o está hospedando. Ela não é corrigida por skills, agentes ou prompts do Orquestrador. Reinicie o terminal e o Codex; se persistir, execute `orquestrador-maestro doctor` e reporte o erro completo ao mantenedor do runtime.
