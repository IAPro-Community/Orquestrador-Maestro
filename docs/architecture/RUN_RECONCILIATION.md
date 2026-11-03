# Diagnóstico e reconciliação operacional de Runs — fase 2

A fila de admissão do Maestro é persistente, mas a execução de providers em segundo plano **continua indisponível**. Este incremento acrescenta diagnóstico e tratamento conservador de leases expirados, sem simular um executor.

## Comandos

- `orquestrador-maestro runs admissions --project-path /repo [--limit 100]`: projeção read-only de status, contagens e reservas, sem prompt, hash de aprovação, credenciais, tokens ou output bruto.
- `orquestrador-maestro runs reconcile --project-path /repo [--limit 100]`: dry-run; mostra claims cujo lease expirou.
- `orquestrador-maestro runs reconcile --project-path /repo --apply`: marca atomicamente claims expirados como `RECONCILIATION_REQUIRED`. Não aprova nova execução, não mata provider nem concede retry.

`RECONCILIATION_REQUIRED` **mantém a reserva do workspace**, porque o processo antigo pode ter produzido alterações externas. A inspeção e o apply usam o RunStore canônico; o apply revalida a expiração sob lock multiprocesso, de modo que um worker que renovou o lease não seja sobrescrito.

## Gate seguinte

O próximo incremento precisa de worker Maestro-owned supervisionado, com plano aprovado persistido, validação de fingerprint real Git/worktree, lease/epoch/cancel, revalidação de provider antes do dispatch e correlação com o Run criado.

`runs.submit` continua respondendo `-32601`, e `initialize.capabilities.runsSubmit=false`. O Nexus não deve habilitar execução de planos Maestro antes desse gate.

Referências: https://github.com/IAPro-Community/Orquestrador-Maestro/issues/48 e https://github.com/IAPro-Community/nexus/issues/185.
