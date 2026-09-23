# Orquestrador Maestro

<p align="center">
  <img src="assets/orquestrador-maestro-logo.png" alt="Orquestrador Maestro" width="360">
</p>

<p align="center"><a href="README.en.md">English</a> · <a href="docs/skills/README.md">Skills</a> · <a href="docs/installation.md">Instalar</a> · <a href="docs/benchmark.md">Benchmark</a> · <a href="CONTRIBUTING.md">Contribuir</a></p>

> Use o mesmo processo com diferentes ferramentas de IA: entender o pedido, ler o contexto necessário, executar com limites, verificar o resultado e deixar um rastro útil para a próxima sessão.

O Orquestrador Maestro é para quem usa Codex, Claude, OpenCode, Cursor, Gemini e outras ferramentas de IA em projetos reais. Ele não é um modelo nem substitui sua ferramenta favorita: prepara o ambiente para que ela trabalhe com menos desperdício, mais previsibilidade e evidência antes de dizer que terminou.

### Escolha seu próximo passo

| Você quer… | Vá direto para… |
| --- | --- |
| Começar do zero em 10 minutos | [Comece aqui](docs/START-HERE.md) |
| Entender a ideia em 1 minuto | [Como funciona](#um-processo-várias-ferramentas) |
| Instalar agora | [Comece em dois minutos](#comece-em-dois-minutos) |
| Entender a evolução 0.5 → V1 | [Veja o que mudou e por quê](#da-050-à-v1-contexto-e-roteamento-proporcionais-ao-problema) |
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
- **Conclusão verificável.** O [Maestro Resolution Engine](docs/maestro-resolution-engine.md) diferencia processo encerrado de `Validated Outcome`, preservando Evidence, Proof Bundle, budget e histórico de resolução.
- **Menos recomeço entre sessões.** O estado útil fica no projeto, legível por pessoas e por outras ferramentas.

## Comece em dois minutos

Requer Node.js 20.19 ou superior.

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

Em desenvolvimento (Unreleased): melhoria de UX/UI por screenshots e referências visuais,
com análise, prompt de implementação e validação de evidências. Veja a
[referência da skill](docs/skills/reference/skill-melhorar-ux-ui-por-referencia.md).

Skills são capacidades especializadas que o Maestro roteia conforme objetivo, risco e ambiente. Nem toda skill precisa estar instalada em todas as ferramentas: algumas são **nativas**, outras ficam **sob demanda** na biblioteca e algumas são **condicionais**, pois exigem um serviço, navegador ou autorização.

Escolha o caminho mais útil:

- [Escolher por objetivo](docs/skills/choose.md)
- [Consultar receitas e combinações](docs/skills/recipes.md)
- [Abrir o catálogo completo](docs/skills/reference/README.md)

## Da 0.5.0 à V1: contexto e roteamento proporcionais ao problema

A `0.5.0` consolidou a base de execução confiável do Maestro: Resolution Engine, Evidence, Proof Bundle, memória, telemetria, persistência e integração provider-neutral. Essa fundação resolveu uma pergunta essencial: **“o processo terminou ou o resultado foi realmente validado?”**

A próxima limitação estava antes da execução. O fluxo ainda tinha decisões mais estáticas do que o produto precisava: roteamento centrado principalmente em triggers e um orçamento de exploração de codebase próximo de **8k tokens** no caminho legado, independentemente de a tarefa ser um typo ou uma mudança arquitetural.

A V1 move essa decisão para o início do fluxo:

```text
pedido
  ↓
Complexity Gate
  ↓
Router v3
  ↓
Skill Intelligence
  ↓
Context Budget
  ↓
Provider
  ↓
Verification / Resolution
```

O objetivo não é simplesmente “usar menos contexto”. É **usar contexto proporcional ao problema**: reduzir agressivamente o que é carregado em tarefas pequenas e permitir mais profundidade quando a evidência indica uma tarefa realmente complexa.

![Budget de contexto da 0.5.0 comparado à V1](docs/diagrams/v1-context-budget.svg)

| Complexidade | 0.5.0 — fluxo legado | V1 | Mudança de teto |
| --- | ---: | ---: | ---: |
| `MICRO` | ~8.000 | 1.500 | −81,3% |
| `SIMPLE` | ~8.000 | 3.000 | −62,5% |
| `STANDARD` | ~8.000 | 6.000 | −25% |
| `COMPLEX` | ~8.000 | 10.000 | +25% |
| `DEEP` | ~8.000 | 16.000 | +100% |

Esses números são **limites configurados no runtime**, não uma promessa de consumo real. O uso efetivo depende do repositório, provider, tarefa e contexto encontrado.

### Como chegamos a esse desenho

A evolução foi incremental:

1. **Primeiro, confiabilidade de conclusão.** A linha 0.5 passou a separar processo encerrado de `Validated Outcome`, preservando verificação e evidência.
2. **Depois, identidade e contrato das Skills.** A V1 introduz Manifest V3 e Skill Contract V2 para que routing, contexto necessário, outputs e verificação tenham uma fonte canônica.
3. **Em seguida, complexidade antes de contexto.** O Complexity Gate classifica `MICRO | SIMPLE | STANDARD | COMPLEX | DEEP` antes de decidir quanto carregar.
4. **Router v3 como caminho padrão.** O Router v3 considera evidência positiva e negativa, capabilities, aliases, sinais do projeto e budget. O Router v2 permanece apenas como comparação/rollback explícito durante a pré-release.
5. **Fan-out continua deliberado.** Complexidade alta não cria automaticamente vários agentes. Multiagent exige intenção explícita e complexidade compatível para evitar amplification desnecessária.

A mudança no catálogo é pequena em quantidade e grande em contrato:

![Evolução do catálogo e contrato de Skills](docs/diagrams/v1-skill-evolution.svg)

| Indicador | 0.5.0 | V1 proposta |
| --- | ---: | ---: |
| Skills canônicas Maestro | 52 | 56 |
| Skills públicas únicas | 75 | 79 |
| Manifest canônico | V2 | V3 |
| Skill Contract V2 nativo | parcial/não canônico | obrigatório para `maestro/*` |
| Negative routing | limitado | explícito |
| Context requirements por skill | não canônico | explícito |
| Outputs / verification por skill | distribuídos | canônicos |

Ou seja: a principal mudança **não é ter mais quatro Skills**. É tornar a seleção explicável, versionada e verificável.

### O que já conseguimos provar

O conjunto comportamental versionado hoje contém **16 intents rotuladas** usadas para comparar Router v2 e Router v3. O gate atual exige que ambos acertem os 16 casos e que o v3 não introduza regressões nesses cenários conhecidos.

Isso é evidência de **não regressão na baseline atual**, não prova de superioridade do v3. Por isso este README não publica uma porcentagem inventada de “melhoria de roteamento”.

Também conseguimos verificar diretamente no código e nos manifests:

- Router v3 é o default da linha V1;
- Router v2 é rollback explícito;
- Complexity Gate governa o budget normal de contexto;
- tarefas `MICRO` e `SIMPLE` não habilitam subagents;
- mesmo `COMPLEX` e `DEEP` só permitem subagents quando multiagent foi solicitado explicitamente;
- Skills externas sem routing confiável permanecem `explicit-only`;
- o catálogo canônico não depende de carregar todas as Skills no prompt.

### Como isso deve melhorar o uso real

Se o desenho se comportar como esperado, a V1 deve melhorar quatro dimensões:

- **Eficiência:** tarefas pequenas deixam de pagar o mesmo custo de contexto de tarefas arquiteturais.
- **Precisão:** positive/negative routing e capabilities reduzem seleção por coincidência textual.
- **Profundidade quando necessário:** tarefas complexas podem usar budgets maiores sem obrigar todo o sistema a trabalhar sempre no pior caso.
- **Explicabilidade:** `orquestrador-maestro route explain` mostra intenção, complexidade, Skill escolhida, evidência e budget estimado em vez de esconder a decisão.

O resultado desejado é este:

```text
menos tarefa simples → contexto demais
menos tarefa complexa → contexto de menos
menos skill irrelevante → prompt
menos fan-out automático → custo

mais decisão explicável
mais contexto quando a evidência pede
mais verificação antes de "done"
```

### O que ainda precisa de benchmark A/B

Há métricas que **não devem virar claim público apenas porque a arquitetura sugere melhora**. Para comparar `0.5.0` e V1 de forma válida, o benchmark precisa usar as mesmas tarefas, repositórios, provider/modelo e critérios de aceitação.

As próximas comparações devem medir:

| Métrica | Pergunta que ela responde |
| --- | --- |
| TTVO — Tokens To Validated Outcome | Quantos tokens foram necessários até um resultado realmente validado? |
| Context tokens por tarefa | A V1 carregou menos contexto onde não precisava? |
| First-pass validation | Mais tarefas passaram sem retry? |
| Validation rate | A economia manteve ou melhorou a qualidade? |
| Skills selecionadas por tarefa | O Router v3 evitou carregar capacidades irrelevantes? |
| Retries / provider calls | Houve menos retrabalho e amplification? |
| Time To Validated Outcome | O caminho até conclusão válida ficou mais curto? |
| Fan-out por tarefa | Tarefas simples permaneceram solo? |
| Regressões v2 → v3 | Algum caso conhecido piorou? |

Esses resultados só devem ser publicados quando passarem pelo mesmo [evidence gate](docs/benchmark.md#evidence-gate) usado pelo benchmark do projeto.

**Resumo:** a V1 muda o Maestro de um fluxo com contexto mais uniforme para um sistema que tenta gastar **o mínimo suficiente** por tarefa, sem reduzir os requisitos de validação. A economia é uma consequência esperada; a regra principal continua sendo chegar a um `Validated Outcome` com evidência.

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
| Instalar ou atualizar | [Guia de instalação](docs/installation.md) · [migração para V1](docs/migration-v1.md) · [opções](docs/installer-options.md) |
| Entender o método | [Guia operacional para IAs](docs/ai-agent-operating-guide.md) · [referência técnica](docs/orquestrador-reference.md) |
| Reduzir custo de contexto | [Economia de contexto](docs/context-economy.md) |
| Exigir qualidade verificável | [Engenharia guiada](docs/engineering-quality.md) · [Resolution Engine](docs/maestro-resolution-engine.md) |
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

A telemetria vem **desabilitada por padrão** (opt-in via `orquestrador-maestro telemetry enable`). Quando ativada, o CLI mede **instalações anônimas ativas**, nunca pessoas únicas. Envia somente comando, resultado, versão e ambiente técnico ao endpoint configurado; não envia caminhos, argumentos, prompts, arquivos, nomes, IP armazenado pelo produto ou credenciais. Desative com `orquestrador-maestro telemetry disable` ou `ORQUESTRADOR_MAESTRO_TELEMETRY=0`.

**Próximo passo:** [confira o modelo completo de privacidade](docs/privacy-model.md) antes de sincronizar uma instalação pública.

## Próximo passo

**[Instale em dois minutos](docs/installation.md)** para usar o mesmo processo nas suas ferramentas de IA. Depois, **[rode o benchmark](docs/benchmark.md#quick-start)** para ver os dados no seu ambiente. Encontrou algo que pode melhorar? **[Contribua](CONTRIBUTING.md)**.

## Licença

Consulte [LICENSE](LICENSE). Este projeto organiza o processo de trabalho; decisões, credenciais e efeitos externos continuam sob controle humano.
