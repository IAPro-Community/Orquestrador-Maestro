# Maestro — Resumo Executivo (PRODUCT_BRIEF)

**O que é?** Um control plane local-first que organiza o trabalho de agentes de
IA: regras, contexto, skills, planejamento, execução, verificação e evidência.
Você escolhe a IA. O Maestro organiza o trabalho.

**Para quem é?** Para quem usa mais de uma ferramenta de IA e quer o mesmo
padrão; equipes que precisam de verificação e continuidade entre sessões;
autores de skills e automações.

**Que problema resolve?** Cada ferramenta tem contrato próprio; sem camada comum,
trocar de ferramenta perde padrão, memória e verificabilidade.

**Como funciona?** Instala o contrato (`orquestrador-maestro install`), a
ferramenta lê `AGENTS.md`/regras/skills, o Runtime opcional executa via um dos
4 providers (`codex`, `claude`, `opencode`, `agy`), verifica e registra evidência.

**Diferenciais.** Local-first com privacidade por construção; 51 skills com
roteamento por evidência; memória DEV + episódica; evidence gate no benchmark
(sem marketing numérico sem prova); 4 providers reais com cancelamento/timeout;
Cockpit TUI + cliente VS Code opcionais.

**Como começar?** `orquestrador-maestro install`, depois `verify` e `doctor`.
Detalhes em `PRODUCT_SPEC.md`. Sem claims quantitativos sem evidência:
rode `benchmark` no seu ambiente para dados reais.
