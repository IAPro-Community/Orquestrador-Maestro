# Engenharia guiada e definição de pronto

## O benefício em uma frase

Uma tarefa só fica pronta quando há evidência proporcional ao que ela mudou. O Maestro mantém ajustes simples leves e adiciona disciplina quando a mudança pede arquitetura, segurança ou testes mais profundos.

**Leia este guia** para entender como qualidade e verificação entram no fluxo sem transformar toda tarefa em burocracia. Para o processo completo da IA, veja o [guia operacional](ai-agent-operating-guide.md).

O usuário descreve o resultado; o roteador deriva capacidades como arquitetura, backend, modelagem de dados, semântica, segurança e estratégia de testes sem exigir que a pessoa conheça o catálogo.

## Roteamento proporcional

O perfil `guided-engineering` é opt-in e usa `SKILLS_ROUTER.json` como fonte de seleção. Ele não carrega a biblioteca inteira: skills nativas são selecionadas apenas quando o pedido corresponde à capacidade. A análise arquitetural profunda `improve-codebase-architecture` continua na biblioteca comunitária e é descoberta sob demanda, sem duplicação nativa.

Modelagem de dados e migrations são intenções distintas. Testes de regras puras não ativam E2E; jornadas críticas podem ativar o fluxo web. UI/UX também não substitui revisão de arquitetura frontend.

## Contrato de engenharia

Para uma execução guiada, o runtime envia ao agente um contrato aditivo com objetivo, escopo, constraints, classe de mudança, domínio, boundaries afetadas, capacidades, expectativas de qualidade, critérios de aceitação e estratégia de verificação. O mesmo contrato é persistido nos metadados da execução para permitir revisão posterior.

## Definição de pronto

Quando há critérios de aceitação, todos precisam de evidência válida. Verificação falha ou evidência ausente impede conclusão. Em execução guiada, findings determinísticos de qualidade com severidade `BLOCKER` ou `HIGH` também impedem `completed`; findings menores são reportados sem transformar toda tarefa em refatoração.

O review local cobre sinais objetivos e conservadores, como arquivo excessivamente grande, erro engolido, `any` inseguro e nomes de operação genéricos. Essas heurísticas são sinais para revisão contextual, não regras universais de estilo.

## Compatibilidade e limites

Os perfis legados continuam disponíveis, os campos de tarefa permanecem aditivos e projetos sem Git podem receber a verificação por inventário local. O Maestro não faz commit, push, merge, publicação, deploy ou outros efeitos externos para satisfazer esse gate.
