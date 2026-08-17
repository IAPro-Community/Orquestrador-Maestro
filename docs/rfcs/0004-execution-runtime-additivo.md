# RFC-0004: Execution Runtime aditivo para o Maestro

- Status: `Accepted`
- Data: 2026-08-10
- Área: arquitetura, compatibilidade e execução local

## Problema e motivação

O Maestro atual distribui regras, skills, integrações e memória de projeto de forma portátil, mas não possui uma execução local rastreável de coding agents. A evolução precisa adicionar essa capacidade sem converter o produto em uma reescrita ou retirar o caminho manual que os usuários já adotaram.

## Objetivos

- adicionar um Execution Runtime local e opcional;
- representar Task, Run, Step, Artifact, Execution e Verification de forma rastreável;
- executar providers por adapters orientados a capabilities;
- conservar Skills, `DEV/`, regras, hooks, sync, doctor, verify e instalação atuais;
- criar uma API interna estável para CLI e futura extensão VS Code.

## Não objetivos

- substituir a instalação, o sync de skills, `DEV/`, regras, hooks ou o fluxo manual;
- criar daemon, servidor HTTP, IDE própria, marketplace, download ou instalação automática de skills;
- executar agentes com escrita paralela no mesmo workspace;
- introduzir infraestrutura distribuída, RAG/vetores, sandbox de container ou deploy automático nesta etapa.

## Decisões

1. Provider não é role: Codex, Claude e equivalentes são `Provider`; Developer, Architect, Reviewer, Tester, Security e Documentation são `ExecutionProfile`.
2. `ExecutionPolicy` é independente de `ExecutionProfile`. Os perfis legados de skills continuam compatíveis e não são redefinidos silenciosamente.
3. O Core é domínio isolado; ProviderAdapter encapsula detecção, capabilities e execução específica do provider.
4. Cada execução passa por um `ExecutionPackage` independente do provider antes de qualquer tradução para CLI ou API externa.
5. A primeira Integration API será JSON-RPC 2.0 versionado sobre stdio. A extensão VS Code será cliente dessa API e não duplicará lógica de domínio.
6. O Skill Registry envolverá, sem substituir, o mecanismo atual. Ele distinguirá `source` de `verification`, e somente a origem oficial do bundle poderá receber `maestro_verified`.
7. `DEV/` permanece memória humana e documental. O futuro Run Store manterá estado operacional, eventos, sessões, artefatos e resultados de verificação.
8. Verification requer comandos realmente executados, com comando, exit code, stdout, stderr e duração. Uma alegação do agente não encerra uma Task.
9. Codex é o primeiro adapter real; Claude é o segundo teste de abstração, não uma exceção embutida no Core.

## Alternativas consideradas

- Reescrever o Maestro: rejeitada por quebrar contratos e aumentar risco de adoção.
- Acoplar o runtime ao CLI atual: rejeitada porque impede clientes futuros e mistura domínio com processo.
- Servidor HTTP ou daemon obrigatório: rejeitado; stdio resolve a integração inicial local.
- Substituir Skills e `DEV/` por banco operacional: rejeitado; ambos preservam responsabilidades distintas e contratos existentes.

## Compatibilidade, segurança e reversibilidade

O runtime será aditivo e inicialmente experimental quando apropriado. Funcionalidade legada não poderá depender de banco, provider instalado, bridge ou extensão. Nenhuma skill de usuário será copiada, modificada, instalada ou marcada como verificada por autodeclaração. O runtime não fará push, deploy, reset destrutivo, migração externa ou execução automática de comandos destrutivos.

Permissões e sandbox devem ser descritos por nível real: política instrucional, permissão nativa do provider, restrição de runtime e sandbox de SO/container. Nenhum nível será apresentado como proteção mais forte do que realmente é.

## Critérios de aceite

- as fases de implementação mantêm e verificam os contratos da Compatibility Baseline;
- `orquestrador-maestro run` pode, posteriormente, produzir um Run local com provider, mudanças observadas e verification real;
- Skill Registry lista fontes oficial, usuário e projeto sem instalação automática;
- Codex e Claude usam o mesmo contrato de execução sem lógica específica no Core;
- a extensão VS Code permanece opcional e apenas cliente da Integration API;
- workflows só avançam para multiagent após artifacts, verificação e isolamento de workspace estarem sólidos.

## Próximos passos

Executar a Phase 1: transformar a Compatibility Baseline em testes de contrato focados antes de introduzir contratos do Core.
