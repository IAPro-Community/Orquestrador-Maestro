# 1.2.0 — revisão independente e hardening

Baseline: `342ad3b9471ca823496d4bd8c436e8e105c78a20`. Esta revisão não autoriza
publicação, alteração de versão, migração para main ou ativação de Goal Loop
autônomo. Cada gate deve ser executado no SHA definitivo.

| Achado | Alteração / situação |
|---|---|
| B01 sandbox | Sandbox explícito, provider/model default e timeout vinculados ao dispatch. `none` não pede escalonamento de privilégio; é ausência de garantia explícita. |
| B02 locking | Serialização dos recuperadores, remoção somente de dono comprovadamente morto, snapshots de leitura independentes. Teste multiprocesso adicionado. |
| B03 identidade | IDs de runtime vinculados a projeto/submissão/manifesto/task; IDs de plano vinculados ao digest completo e projeto. RunStore e Goal assessor usam vínculos, com leitura de histórico compatível. |
| H01 autorização | Bridge v1 somente trusted-local; SHA-256 não autentica a pessoa. Autoridade independente para integração remota permanece pendente. |
| H02 caminho direto | Workspace restrito ao projeto/worktree do mesmo Git common dir; campos internos recusados. runs.create continua compatibilidade local, não admissão durável. |
| H03/H04 processos | Timeout de detecção, escalonamento, grupos Unix, taskkill Windows best effort e encerramento incerto em quarentena. Homologar subprocessos reais nos OS. |
| H05/M09 verificação | Timeout nunca conta como sucesso; metadados de falha/truncamento. |
| H06 ambiente | Bloqueio adicional por formato de nomes de credenciais; não é isolamento integral de secrets, filesystem ou ambiente. |
| H07 limites | Timeout de provider limitado pelo manifesto. Limite financeiro absoluto e duração total de todas as fases não certificados; Goal corretivo continua bloqueado com custo desconhecido. |
| H08 | Grupos Run/Step/Task/Execution persistidos atomicamente na criação/início, Run/Step na conclusão. Eventos, artefatos e demais operações continuam transações separadas. |
| H09/M05 | Frames stdio limitados a 1 Mi de caracteres e 32 requests em voo por padrão; encerra transporte ao exceder; métodos herdados rejeitados. |
| H10/M15 | Inspeção de ancestrais reparse antes de operações destrutivas PS; raiz de backup Unix privada. Homologação Windows, ACL e rollback integral pendentes. |
| M01/M02 | Offset e limit no store; ainda lê o JSON inteiro. Retenção/arquivamento sem política automática. |
| M03/M04 | Locks de memória não interpretam EPERM como morte. Consolidação completa e recuperação de gates abandonados requerem protocolo separado. |
| M06 | Serviços ausentes ainda podem retornar vazio por compatibilidade; revisar versão do contrato. |
| M07/M08 | Limite de terminais, serialização de startup e limpeza de filas; testar concorrência e cancelamento. |
| M10/M11 | Contrato de comandos tipados e prova independente por critério ainda pendentes. |
| M12–M14 | Modularização ampla e rollback integral cross-platform não homologados; evitar reescrita pré-release. |
| M16/M17 | Publicação local/hospedada exclusiva por decisão do owner; testar recuperação de staging e upgrade real 1.1.1. |
| M18 | Documentar limites e distinguir implementação, testes e homologação. |

## Operação e recuperação

- Nunca exponha Bridge stdio v1 a clientes remotos ou não confiáveis sem
  uma autoridade externa autenticada e uma autorização independente.
  `approvedBy` é informação declarada, não identidade autenticada. A execução
  direta é um contrato legado do operador local; não substitui `runs.submit`.
- Se a terminação não puder ser confirmada, não inicie outro provider para
  a mesma tarefa. Reconcilie o estado persistido e os processos no host
  primeiro. Processos que escapam do grupo Unix ou da árvore Windows
  não são garantidamente contidos.
- Locks de recuperação abandonados ou malformados exigem inspeção offline:
  pare todos os processos Maestro que usam o store, faça backup do estado e
  confira identidade/PID e ausência de escritor. Não remova um lock de um
  processo vivo. Locks são locais ao host, não um protocolo distribuído.
- A API de memória e o runtime utilizam os stores existentes; nenhuma nova
  dependência externa, scheduler, banco, execução corretiva ou integração
  Nexus foi introduzida.

## Dependabot

Atualizações de checkout, CodeQL e Clack 1.9.0 reconciliadas sobre a linha
v1 sem descartar os gates. Setup-node 7.1.0 nos workflows sem publicação;
o workflow Release mantém v6 até homologar a mudança de autenticação npm.
React e React DOM 19 devem ser tratados juntos, TypeScript 7 nos dois
pacotes em conjunto, @types/node alinhado aos runtimes de suporte, UUID
e node-notifier verificados com overrides/imports existentes. Não mesclar
PRs conflitantes por substituição integral de lockfiles de outras branches.

## Gates finais

- `npm ci`, `npm run verify:pr`, `npm run validate`, `npm run skills:contract-audit:strict`,
  `npm run validate:paths`, `bash scripts/homologate-release.sh "$(git rev-parse HEAD)"`.
- Testes novos de identidade, sandbox/timeout, lock multiprocesso, atomicidade,
  detecção e cancelamento de processos, método RPC e frame excessivo.
- Testes adicionais com providers reais, cancelamento/restart Windows e Unix,
  upgrade do pacote anterior, rollback e publicação em versão inédita.
- Não reutilizar RC.1 nem fechar issues com aceites de homologação pendentes.

Estado: correções versionadas; revisão estática não equivale a homologação
integral. Sem publicação.
