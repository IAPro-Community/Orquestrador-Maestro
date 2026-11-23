
# Trilha demonstrativa — criação de tela de lançamento de notas

**Tipo:** demonstração de contrato e fixture de descoberta, **não é E2E de entrega**.  
**Referência:** ADR 0068, issues #67 e #48.  
**Fixture executável existente:** `runtime/planner/__tests__/context-preflight-stack-signals.test.js` (sinais de stack; não implementa a tela e não usa provider real).

## Pedido inicial

> Quero criar uma tela de lançamento de notas seguindo todos os padrões da aplicação. Analise o que já existe, prepare o necessário e implemente até ficar validado.

Não há sintaxe `/goal` obrigatória para o desenvolvedor e nenhum padrão escolar deve ser embutido no Maestro.

## Fluxo esperado versus comprovado

| Passo | Exemplo de resultado desejado | Estado no Maestro |
| --- | --- | --- |
| 1. Abrir projeto existente | Descobrir React e Java/Maven no monorepo por arquivos concretos, sem inventar regra de domínio | **Parcial:** fixture testa `package.json` + `pom.xml`, provenance no ContextEngine |
| 2. Verificar arquitetura e reuso | Identificar biblioteca UI, data-grid/fachada, formulário, cliente API, autenticação, serviços e testes com caminhos/hash | **Não demonstrado:** ainda falta indexação contextual real de componentes e referências |
| 3. Resolver ambiguidades | Perguntar escala de nota, escopo da edição e workflow de aprovação somente se não constarem de contratos existentes | **Parcial:** IntentSpec/Question Scheduler existem; não houve ensaio end-to-end nesse caso |
| 4. Gerar Spec curta | Critérios derivados do projeto: comportamento, segurança por papel, validação e integração; comandos verificadores exatos aprovados | **Parcial:** TaskGraph e acceptanceCriteria existem; verificador versionado/revisão exata não completos |
| 5. Aprovar | Exibir owner, provider/versão/superfície, worktree, limites e operações proibidas; registrar recibo imutável | **Parcial:** receipts e manifest existem; aprovação bounded para correções ainda não |
| 6. Executar | Provider implementa no worktree, com um único owner e cancelamento fenced; sem push/deploy implícito | **Parcial:** Runs simples e worker existem; Goal overnight nativo/managed não |
| 7. Verificar | Teste de negócio e integração em código correto, inspeção UI/responsividade/a11y, vínculo ao Run/artefato/HEAD e verificadores não adulterados | **Parcial:** P0 verifica scripts Node modificados durante Run durável; e2e visual/stack geral não |
| 8. Concluir/relatar | `VALIDATED` somente por evidência independente por critério ou `BLOCKED_NEEDS_USER` com motivo concreto | **Não homologado** para este caso |

## Trace de hipótese — sem simular resultado real

Um projeto com `package.json` React e `pom.xml` Maven tem dois sinais auditáveis; isso **não** prova que o Maestro identificou o componente de tabela correto, e portanto não autoriza gerar layout arbitrário nem anunciar reuso. Se as regras de escala ou aprovação não estiverem disponíveis, a decisão correta na fase de Spec é perguntar, não inventar um default.

Se o provider disser “tela concluída” e `npm test` retornar exit 0 por ter sido adulterado no mesmo Run, o P0 recém-adicionado registra `VERIFICATION_CONFIG_DRIFT` e mantém o Run como falho. O teste `application-submission-ports.test.js` materializa esse cenário com provider simulado e fixture Node; **a aprovação do teste deve ser conferida no CI do commit exato**. A versão genérica de prova de binding com outros arquivos/build systems ainda não existe.

## Critérios de homologação futuros

1. Criar fixture realista contendo UI existente, API, testes funcionais e padrões de arquitetura com evidências rastreáveis.
2. Confirmar que o ContextEngine aponta caminhos concretos e instruções de reuso em vez de nomes inventados.
3. Definir perguntas impeditivas mínimas e Spec curta aprovada, com hash de critérios/verificadores.
4. Provar falha funcional inicial, correção no mesmo ownership e verificação independente, sem alterar gates para forçar sucesso.
5. Executar com dois providers realmente instalados (registrar versões/OS/superfície), cancel/restart e outcomes com receipts; sem fake como certificação.
6. Exercitar UI/responsividade/acessibilidade com ferramenta apropriada quando exigidos; não usar apenas build para declarar layout validado.

**Resultado observado nesta auditoria:** nenhum ensaio end-to-end com esses requisitos foi executado. Essa lacuna faz parte do backlog, não de uma promessa de “entrega garantida”.
