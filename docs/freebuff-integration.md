# Integração com Freebuff

O Freebuff entra no Maestro como uma ferramenta de execução, no mesmo nível operacional de OpenCode e Antigravity. O Maestro prepara o contrato compartilhado; o Freebuff continua responsável pelo próprio runtime, modelos, login, sessões, cache e histórico.

## O que fica persistente

Depois da instalação, o Freebuff encontra o contrato do Maestro em cada novo processo porque os arquivos ficam no home do usuário e no projeto:

- `%USERPROFILE%\AGENTS.md` ou `$HOME/AGENTS.md`: contrato global;
- `%USERPROFILE%\.agents\skills` ou `$HOME/.agents/skills`: skills compartilhadas, incluindo `orquestrador-maestro`;
- `AGENTS.md` e `knowledge.md` na raiz do projeto: contexto específico do repositório;
- `.agents/agents` e `.agents/mcp.json`: agentes e MCP opcionais do próprio projeto.

Não há daemon do Maestro para iniciar no boot. Ao reiniciar o computador, basta abrir o Freebuff no projeto: ele relê esses arquivos persistentes. A memória operacional do projeto continua em `DEV/` e o estado do Maestro continua no diretório `.orquestrador-maestro` do usuário.

## Instalação local

Em uma máquina nova, faça a instalação completa uma vez; ela prepara o contrato global e todas as raízes compatíveis:

```powershell
orquestrador-maestro install --force
orquestrador-maestro verify
```

Se o Maestro já estiver instalado e você só quiser acrescentar ou atualizar o Freebuff:

```powershell
orquestrador-maestro install --only freebuff --force
orquestrador-maestro verify
```

No clone do repositório, o fluxo completo equivalente é:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Force
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-install.ps1
```

Para uma instalação já existente, o recorte específico é `.install.ps1 -Only freebuff -Force`; o verificador completo deve ser executado sobre uma instalação que já tenha os demais perfis ou usando o smoke test seletivo da própria skill.

Linux/macOS:

```bash
orquestrador-maestro install --only freebuff --force
orquestrador-maestro verify
```

Para atualizar apenas as skills depois de uma mudança no Maestro:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File $HOME\.orquestrador-maestro\sync-skills.ps1 -Apply -Only freebuff
```

O alias `freebuff` sincroniza a raiz compatível `.agents/skills`; ele não cria uma raiz proprietária nem sobrescreve configuração do Freebuff.

## Uso

Instale o CLI do Freebuff conforme a documentação oficial e abra o projeto normalmente:

```text
freebuff
```

O uso segue o modelo interativo do Freebuff. As skills e o `AGENTS.md` do Maestro entram como contexto para o trabalho. O catálogo também reconhece agentes locais, subagentes e MCP, mas esses arquivos precisam ser criados e aprovados pelo operador no projeto.

O Freebuff documenta SDK em `@codebuff/sdk`, agentes locais em `.agents` e MCP em `.agents/mcp.json`. Um exemplo mínimo de MCP, para ser adaptado ao serviço real, é:

```json
{
  "mcpServers": {
    "meu-servico": {
      "command": "node",
      "args": ["./tools/meu-mcp-server.js"]
    }
  }
}
```

Não colocamos tokens nesse arquivo público. Variáveis de ambiente e autorização ficam com cada usuário.

## Limite atual de automação

O adaptador de memória do Maestro já entende eventos estruturados do Freebuff (`tool_call`, `tool_result`, `subagent_start`, `subagent_finish` e `error`). Isso permite integrar observações quando uma ponte ou SDK fornecer esses eventos.

O CLI oficial ainda é interativo; não registramos Freebuff como provider headless do runtime. Assim, o Maestro não inventa flags `--headless`, `--json` ou um protocolo não confirmado. Quando o Freebuff estabilizar uma superfície headless/JSON, o próximo passo será ligar esse adaptador ao executor de providers.

## Para outras pessoas usarem

1. Publicar o commit do Maestro no GitHub.
2. Publicar a versão da CLI no npm pelo workflow já existente.
3. Orientar cada pessoa a instalar o Freebuff e depois executar `orquestrador-maestro install --only freebuff --force`.
4. Em cada projeto, versionar apenas `AGENTS.md`, `knowledge.md`, `.agents/skills` selecionadas, agentes e MCP que sejam realmente compartilháveis.
5. Manter segredos, login, cache, sessões e histórico fora do repositório.

Referências oficiais: [Freebuff](https://freebuff.com/), [repositório](https://github.com/CodebuffAI/freebuff), [SDK](https://github.com/CodebuffAI/freebuff/tree/main/sdk) e [agentes e ferramentas](https://github.com/CodebuffAI/freebuff/blob/main/docs/agents-and-tools.md).
