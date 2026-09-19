# Orquestrador Maestro

<p align="center">
  <img src="assets/orquestrador-maestro-logo.png" alt="Orquestrador Maestro" width="360">
</p>

<p align="center"><a href="README.en.md">English</a> · <a href="docs/skills/README.md">Skills</a> · <a href="docs/installation.md">Instalar</a> · <a href="docs/benchmark.md">Benchmark</a> · <a href="CONTRIBUTING.md">Contribuir</a></p>

> Faça qualquer IA trabalhar com o mesmo processo: entender o pedido, ler o contexto necessário, executar com limites, verificar o resultado e deixar um rastro útil para a próxima sessão.

O Orquestrador Maestro é para quem usa Codex, Claude, OpenCode, Cursor, Gemini e outras ferramentas de IA em projetos reais. Ele não é um modelo nem substitui sua ferramenta favorita: prepara o ambiente para que ela trabalhe com menos desperdício, mais previsibilidade e evidência antes de dizer que terminou.

### Escolha seu próximo passo

| Você quer… | Vá direto para… |
| --- | --- |
| Entender a ideia em 1 minuto | [Como funciona](#um-processo-várias-ferramentas) |
| Instalar agora | [Comece em dois minutos](#comece-em-dois-minutos) |
| Ver o benchmark | [Veja os números](#benchmark-veja-os-números-na-sua-máquina) |
| Descobrir qual skill usar | [Escolha por objetivo](docs/skills/choose.md) |
| Configurar memória e contexto | [Guias técnicos](#guias-técnicos) |
| Conhecer CLI, workflows e adaptadores | [Referência completa](README-technical-reference.md) |

## Por que usar

Quando uma IA recebe só um prompt, ela pode abrir contexto demais, improvisar o processo e declarar uma tarefa pronta sem prova suficiente. O Maestro organiza o caminho antes da execução.

| Sem orquestração | Com Orquestrador Maestro |
| --- | --- |
| A IA decide sozinha o que ler | Ela começa pelas regras, pelo estado e pela skill certa |
| Contexto cresce sem critério | Lê o mínimo suficiente e aprofunda sob demanda |
| “Pronto” pode ser apenas uma afirmação | Verificação e handoff fazem parte do trabalho |
| Cada ferramenta cria seu próprio ritual | O processo se mantém entre ferramentas e sessões |

![Três passos do Orquestrador Maestro](docs/diagrams/three-steps.svg)

### O que muda na prática

- **Menos contexto desnecessário.** Índices compactos e documentação de projeto evitam carregar catálogos e históricos inteiros.
- **Menos surpresa na entrega.** Regras, escopo e verificação entram antes da mudança, não no fim.
- **Menos recomeço entre sessões.** O estado útil fica no projeto, legível por pessoas e por outras ferramentas.

## Comece em dois minutos

Requer Node.js 20 ou superior.

```bash
npm install -g @iapro/orquestrador-maestro-cli@latest
orquestrador-maestro install
orquestrador-maestro verify
```

Prefere instalar pelo repositório? Use o [guia de instalação](docs/installation.md), que inclui Windows, Linux, macOS, bootstrap, dry-run e rollback.

**Próximo passo:** [verifique a instalação](docs/installation.md#verificação) e [configure o primeiro projeto](docs/project-dev-hierarchy.md).

Depois, abra sua ferramenta de IA no projeto e peça:

```text
Use o Orquestrador Maestro. Leia as instruções do usuário e do projeto,
abra somente o contexto necessário, resolva esta tarefa, verifique o resultado
e registre o estado útil para a próxima sessão.
```

## Um processo, várias ferramentas

O Maestro começa com instruções globais e locais, encontra a skill adequada e usa `DEV/` para manter objetivo, decisões, verificação e próximo passo no próprio projeto. Assim, você não depende de a conversa anterior ainda estar disponível — nem de trocar de ferramenta sem perder o método.

Ele integra fluxos para Codex, Claude Code, OpenCode, Freebuff, Cursor, Gemini CLI, Grok CLI, MiMo Code, Kimi Code, Windsurf e Antigravity. Cada ferramenta continua responsável pelo próprio runtime, login, modelo e credenciais.

O Freebuff usa o mesmo contrato de `AGENTS.md` e `.agents/skills` que o Maestro já sincroniza. Veja o [guia de integração do Freebuff](docs/freebuff-integration.md) para instalação persistente, MCP, agentes locais e publicação para outros usuários.

Para o funcionamento técnico, consulte [como o Orquestrador funciona](docs/orquestrador-reference.md), [economia de contexto](docs/context-economy.md), [memória de projeto com DEV/](docs/project-dev-hierarchy.md) e [perfis de ferramentas](docs/tool-profiles.md).

**Próximo passo:** [aprenda o fluxo que a IA deve seguir](docs/ai-agent-operating-guide.md) ou [configure um workflow declarativo](docs/workflows.md).

### Skills: especialização sob demanda

Skills são capacidades especializadas que o Maestro roteia conforme objetivo, risco e ambiente. Nem toda skill precisa estar instalada em todas as ferramentas: algumas são **nativas**, outras ficam **sob demanda** na biblioteca e algumas são **condicionais**, pois exigem um serviço, navegador ou autorização.

Escolha o caminho mais útil:

- [Escolher por objetivo](docs/skills/choose.md)
- [Consultar receitas e combinações](docs/skills/recipes.md)
- [Abrir o catálogo completo](docs/skills/reference/README.md)

## Benchmark: veja os números na sua máquina

O benchmark compara condições com o mesmo cenário, modelo e critérios de aceitação. Ele mede tokens apenas em tarefas aceitas e preserva evidência para auditoria.

![Comparação entre fluxo sem e com Orquestrador Maestro](docs/diagrams/workflow-comparison.svg)

> **Exemplo ilustrativo.** Os valores no gráfico não são uma promessa nem um resultado oficial. O efeito real varia por modelo, tarefa e ambiente. Rode o benchmark para produzir e inspecionar sua própria evidência.

![Exemplo ilustrativo de economia de tokens](docs/diagrams/token-savings.svg)

O [evidence gate](docs/benchmark.md#evidence-gate) impede que resultados sem verificação apropriada virem claim público. Em vez de pedir confiança, o projeto mostra como conferir modelo, cenário, execução e evidência.

![Fluxo de evidência do benchmark](docs/diagrams/evidence-gate.svg)

Para preparar o ambiente e executar uma comparação, siga o [quick start do benchmark](docs/benchmark.md#quick-start). A [metodologia](docs/benchmark.md) explica limites, métricas e o que os resultados não permitem concluir.

**Próximo passo:** [inspecione a evidência gerada](docs/benchmark.md#evidence) antes de transformar qualquer número em claim.

## Guias técnicos

| Se você quer… | Comece aqui |
| --- | --- |
| Instalar ou atualizar | [Guia de instalação](docs/installation.md) · [opções](docs/installer-options.md) |
| Entender o método | [Guia operacional para IAs](docs/ai-agent-operating-guide.md) · [referência técnica](docs/orquestrador-reference.md) |
| Reduzir custo de contexto | [Economia de contexto](docs/context-economy.md) |
| Exigir qualidade verificável | [Engenharia guiada](docs/engineering-quality.md) |
| Avaliar privacidade | [Modelo de privacidade](docs/privacy-model.md) |
| Retomar tarefas longas | [Workflows](docs/workflows.md) · [contratos](docs/task-and-workspace-contracts.md) |
| Organizar memória | [Hierarquia DEV/](docs/project-dev-hierarchy.md) · [escopos](docs/memory-scopes.md) |
| Trabalhar com skills | [Portal](docs/skills/README.md) · [escolher](docs/skills/choose.md) · [catálogo](docs/skills/reference/README.md) |
| Consultar CLI, arquitetura e comandos avançados | [Referência técnica completa](README-technical-reference.md) |
| Resolver problemas | [Troubleshooting](docs/installation-troubleshooting.md) |
| Ver tudo | [Índice de documentação](docs/) |

## Privacidade por padrão

Este é um snapshot público e sanitizado: compartilha estrutura e comportamento, não conteúdo privado da máquina que o originou. Credenciais, sessões, logs, caches, caminhos locais e memórias privadas ficam fora do repositório.

![Fronteira entre conteúdo público e local](docs/diagrams/privacy-boundary.svg)

Leia o [modelo de privacidade](docs/privacy-model.md) para saber exatamente o que entra, o que fica local e como a telemetria anônima funciona.

O CLI mede **instalações anônimas ativas** por padrão, nunca pessoas únicas. Envia somente comando, resultado, versão e ambiente técnico ao PostHog Cloud (US); não envia caminhos, argumentos, prompts, arquivos, nomes, IP armazenado pelo produto ou credenciais. Desative com `orquestrador-maestro telemetry disable` ou `ORQUESTRADOR_MAESTRO_TELEMETRY=0`.

**Próximo passo:** [confira o modelo completo de privacidade](docs/privacy-model.md) antes de sincronizar uma instalação pública.

## Próximo passo

**[Instale em dois minutos](docs/installation.md)** para usar o mesmo processo nas suas ferramentas de IA. Depois, **[rode o benchmark](docs/benchmark.md#quick-start)** para ver os dados no seu ambiente. Encontrou algo que pode melhorar? **[Contribua](CONTRIBUTING.md)**.

## Licença

Consulte [LICENSE](LICENSE). Este projeto organiza o processo de trabalho; decisões, credenciais e efeitos externos continuam sob controle humano.
