# Dependências — candidato 1.2.0

Baseline `62abebf827131393a8c6d93e68c9bdd62ae4cf20`. Candidato de manutenção isolado, sem merge ou publicação até os checks. Mantém Node >=20.19.0 (benchmark >=20.0.0), matriz Node 20.19/22/24 e contratos do Runtime. Não alterar dist-tags, versão ou regras de branches nesta tarefa.

| PR | Decisão e evidência |
| --- | --- |
| #73/#77 | TypeScript 7.0.2 nos dois manifestos/locks; `types: ["node"]` no tsconfig do benchmark. Logs 137454802098 e 138894837401 registram TS2591; restantes erros devem ser reavaliados no CI. Não afrouxar strict/typecheck. |
| #78 | UUID 14.0.3 dev-only, preservando o UUID 11.1.1 aninhado de node-notifier. Testar import ESM/CommonJS em todos os runtimes suportados. |
| #75/#79 | React e React DOM 19.3.1 juntos, scheduler 0.28.0. Docusaurus 3.10.2 declara peers React/DOM 18 ou 19; log 137476732015 demonstra ERESOLVE com React 19 e DOM 18. Inspeção dos nove JSX próprios não detectou APIs ReactDOM legadas. Não usar --force ou --legacy-peer-deps; validar npm ci, audit, router parity e build do site. |
| #84 | setup-node 7.1.0 já usado em CI; alinhar validação e smoke da release ao SHA pinado. Job que publica mantém v6 deliberadamente, até confirmar autenticação npm/OIDC; não publicar para testar. |
| #76 | Node Notifier 12.1.0 declara engines ^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0 no lock do PR; incompatível com Node 20. Preservar 10.0.1 e override atual, avaliar alternativa compatível ou nova política de suporte em issue. |
| #74 | Manter @types/node 22 no benchmark; tipos 26 podem mascarar APIs ausentes nos runtimes suportados. Falha antiga 137454823134 era pinning de Actions, não prova de incompatibilidade da lib. A raiz já usa tipos 26; avaliar alinhamento com a matriz em issue própria. |

Lockfiles consolidados por registros exatos provenientes dos PRs, com versões e integridades preservadas; não copiar lockfile inteiro de base antiga. O diff React isolado modifica centenas de registros sem relação direta; reaproveitar somente os registros React/DOM/scheduler. npm ci é o gate decisivo; não há acesso DNS ao npm/GitHub no ambiente local desta revisão, portanto não afirmar regeneração por npm ou testes executados.

Dependabot: agrupar minor/patch por componente, React/DOM em um grupo; majors restantes separados; security updates sem atraso deliberado; pinning de SHA obrigatório; sem automerge. `npm run outdated:all` inclui site e benchmark.

## Gate de merge

- CI full e security no candidato; Pages build, npm ci/audit site e benchmark; verificar smoke e TypeScript estrito.
- Confirmar SHA da base atualizado antes de merge; rerun da linha v1 no SHA integrado. Fechar PRs substituídos apenas com evidência e referência ao PR consolidado.
- Manter notifier/Node types como decisões explícitas de compatibilidade, com tarefa rastreável; não declará-los atualizados. #84 só concluído após validação do publisher.
- Sem autorização para tag, npm ou mudança de branch padrão. #86 continua aberta.
