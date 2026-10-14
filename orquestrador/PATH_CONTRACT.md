# Path Contract (1.1.0)

Regra canônica de caminhos em prosa, prompts e JSONs do Orquestrador Maestro.

## Regras

1. **JSONs sempre com `/` e placeholder de home.** Exemplos usam o placeholder de home com barras normais em todos os segmentos.
2. **Prosa sempre com `/`.** Nunca barra invertida após o placeholder de home.
3. **Exemplo Windows explícito usa `%USERPROFILE%`**, nunca o placeholder de home com barra invertida. Somente em bloco ```powershell ou seção marcada "Windows".
4. **Expansão:** o placeholder vira `%USERPROFILE%` no Windows e `$HOME` no POSIX. O instalador reescreve o placeholder e o caminho legado para a raiz real (`.orquestrador-maestro`, legado `.orquestrador`).
5. **Scripts executáveis `.cmd` estão fora deste contrato** (sintaxe batch exige barra invertida); o lint cobre somente `.md`.

## Lint

`tests/path-contract.test.js` falha se qualquer linha com o placeholder de home em `.md` sob `orquestrador/`, `tool-profiles/`, `home/`, `skill-library/`, `codex/skills/*/SKILL.md` contiver barra invertida.
