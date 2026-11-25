# Transição de branches e política de release — plano de execução

**Estado:** estabilização na `release/1.2.0` autorizada; cutover final ainda pendente de homologação.
**Baseline auditada:** `v1@13bac05451b5f52cb8caf700287089e3fdaee09e`, 24/11/2026. A política vigente continua em [AGENTS.md](../../AGENTS.md) e [release.md](../release.md). Este documento não autoriza antecipar merge, alteração de settings, criação de tag ou publicação. A release é a origem do PR final para main.

## 1. Objetivo e política alvo

Uma única linha principal de desenvolvimento (`main`), protegida, com mudanças curtas em `feature/*`, `fix/*`, `docs/*`, `hotfix/*` e PRs. Branch `release/*` somente quando necessário, com correções reintegradas ao trunk e sem autorização de publicação. Não criar `master` nem `develop`. Não confundir versão 1.x, API v1 e schemas v1 com o nome de uma branch.

Após o cutover, toda nova publicação (alpha, beta, RC e estável) deve usar o workflow autorizado disparado em `refs/heads/main`, com tag anotada imutável, SHA homologado pertencente à main, CI Tests/Security do SHA na main, autorização explícita de mantenedor e environment npm-release. Merge não é autorização de publicação. Manter o mesmo artefato validado, verificação de integridade do registry e canais alpha/beta/next/staged/latest existentes. Não alterar tags publicadas.

A `v1` permanece como referência de compatibilidade; nenhum novo desenvolvimento ou publicação a partir dela após o cutover. Não excluir nem renomear antes de comprovar compatibilidade; conservar a referência mesmo após a transição se houver consumidores externos.

## 2. Evidências e bloqueadores

- HEAD da v1 auditado acima; Tests [45492762025](https://github.com/IAPro-Community/Orquestrador-Maestro/actions/runs/45492762025) e Security [45492762311](https://github.com/IAPro-Community/Orquestrador-Maestro/actions/runs/45492762311) concluíram com sucesso. São evidências do baseline, não de um futuro commit de migração.
- A branch padrão atual é v1; main histórica em `be7383232a69e95ff34db527e533b23a792cf4cc`. Comparação anterior mostrou main ancestral de v1, sem divergência; recalcular no cutover. `release/1.2.0` estava em `d810222b08`, anterior ao baseline; não presumir que inclui o hardening posterior.
- Ruleset 27872254 protege v1 contra exclusão e non-fast-forward. Ruleset 22163803 ("block main") apareceu ativo com include/exclude vazios e regras de criação, update, exclusão e non-fast-forward; efeito real sobre main não comprovado. Revisão pelo owner obrigatória antes da transição.
- **Risco crítico de ordem:** o arquivo auto-tag.yml da main histórica ainda contém gatilho push em main/v1, com permissão de escrita. Não promover código antigo, alterar versão, disparar workflow histórico ou mover tag. Antes da troca, confirmar que o commit promovido contém apenas workflows manuais fail-closed e que o environment bloqueia qualquer caminho antigo de publicação.
- **Risco de bypass:** scripts/release.ps1 oferece CreateTag/PushTag e aceita apenas versão estável por regex; docs/release.md exemplifica RC nesse script. Na ativação, tornar a ferramenta local somente validatória (ou rejeitar efeitos de tag com orientação explícita), centralizar a validação de versão e remover exemplos incompatíveis. Regras de tags precisam ser configuradas no servidor, não só na documentação.
- **Risco de evidência cruzada:** scripts/check-release-ci.js filtra SHA e evento, mas não exige head_branch. Após o cutover, exigir também head_branch=main e provar a matriz obrigatória de jobs (não apenas conclusion do workflow); impedir CI de v1/PR/branch arbitrária de servir como aprovação de main.
- O CI verde não é homologação real de providers ou autorização administrativa. #48, #44, #81, #86 e os gates relevantes de #82 continuam abertos. Goal/autonomia (#67) fica desabilitado; nenhuma nova promessa de produção.

## 3. Inventário inicial por superfície

| Superfície | Evidência atual | Mudança a preparar no cutover |
| --- | --- | --- |
| .github/workflows/auto-tag.yml | workflow_dispatch; ref v1 para 1.x, main para histórico | ref exata main para todos os releases novos; SHA e gate de main; sem gatilho de push |
| .github/workflows/release.yml | workflow_dispatch, release_branch por versão; npm-release | ref main em todos os jobs com efeitos; ancestralidade main; recheck do SHA e CI antes de npm e release; links de release com tag imutável |
| scripts/check-release-ci.js | workflows test.yml/security.yml; SHA + eventos push/manual | exigir branch main, matriz e latest run elegível; rejeitar ausente/skipped/cancelled/pending/falha |
| scripts/check-release-version.js | gate canônico das versões | preservar contrato; não trocar versão como parte do cutover |
| scripts/verify-pr.js | v1/release escolhem origin/v1; restante origin/main | main como default; override explícito somente para validação histórica, não publicação |
| scripts/homologate-release.sh | 1.x escolhe v1 | base main; sem efeitos; preservar checksum e EVIDENCE.json |
| scripts/release.ps1 | validação e efeitos opcionais de tag | retirar caminho normal de criação/push local; usar gate canônico |
| .github/workflows/test.yml | push main/v1, PR main/v1/feature/feat | main obrigatório; cobertura de PR; validar branch de migração antes de retirar v1 |
| .github/workflows/security.yml | push/PR apenas v1 | incluir main na preparação do cutover; validar CodeQL + audit no SHA de main |
| .github/workflows/pages.yml | push/PR v1; workflow_dispatch | deploy exclusivo de main após cutover; preservar site e previews; impedir deploy concorrente da v1 |
| .github/workflows/router-v3.yml | PR main/v1/feature/feat | preservar validação de PR para main |
| .github/workflows/benchmark-pr.yml | PR main/v1 | manter PR para main; benchmark sem credenciais continua separado de smoke |
| .github/workflows/benchmark-ci.yml e benchmark-official.yml | execução manual/agenda, referência ao contrato JSONL v1 | não substituir versão de contrato; revisar default branch e agenda |
| AGENTS.md e CONTRIBUTING.md | v1 canônica, manutenção direta autorizada, fork PR v1 | política main+PR; remover exceção geral de push direto |
| README.md, docs/installation.md, SECURITY.md | referências à v1 e clone --branch v1 | preferir npm para estável; checkout por tag para versão reproduzível; instruções de contribuição main; manter links antigos válidos |
| `scripts/bootstrap-install.{sh,ps1}`, `scripts/install.{sh,ps1}`, `bin/orquestrador-maestro.js` | busca inicial não mostrou referência literal à branch v1 | testar URLs resolvidas em execução e contratos de atualização; não substituir v1 indiscriminadamente |
| Site, catálogos, links públicos, exemplos, docs históricas e consumidores externos | inventário parcial; ainda não inspeção textual de todos os arquivos | busca completa em checkout e revisão de referências semânticas; conservar APIs, tags e schemas |

## 4. Sequência segura de transição

### Fase A — preparação (vigente)

- [x] Inventário inicial de workflows, scripts, documentação e branches.
- [x] Definir política alvo, riscos e gates; registrar evidência de CI do baseline.
- [ ] Finalizar inventário textual completo no checkout (incluindo site, manifests, bootstrap, tests e docs). Exemplo: `git grep -n -I -E 'refs/heads/v1|origin/v1|--branch[ =]v1|/(blob|tree|raw)/v1/|branches:.*v1|ref_name.*v1' -- .`. Revisar cada resultado por intenção, não substituir cegamente.
- [ ] Confirmar settings administrativos e consumidores externos. Não mexer nas regras vigentes nesta fase.

### Fase B — preparação técnica do cutover (sem publicar)

- [ ] Congelar novas features. Atualizar SHA e comparar main...v1 e release/1.2.0...v1. Preservar histórico, sem force-push.
- [ ] Preparar mudanças de workflows, scripts e docs como lote revisável, sem alterar versão nem criar tag. Não ativar branch nova como produção antes dos gates.
- [ ] Provar caminhos negativos: ref v1/release/feature/tag, confirmação falsa, SHA curto/divergente, tag ausente/errada, CI de branch incorreta, PR sintético, matriz incompleta, falha ou cancelamento, retry e artefato diferente; nenhum efeito de rede publicador.
- [ ] Provar contratos de install/update/verify/doctor/rollback com tarball em home isolado; upgrades reais de 1.1.1 e RC; clones por v1, main e tags históricas; Windows/Linux/macOS; não modificar canais npm.
- [ ] Owner configura restrições de npm-release para main e autorização independente; avalia trusted publishing, permissões de dist-tags, credenciais históricas e regras de tag. Verificar restrição efetiva também para rerun de workflow antigo em v1. Se não puder comprovar, bloquear publicação.

### Fase C — troca de branch

- [ ] Autorizar separadamente a integração. Validar commit exato antes de promover e garantir que não há gatilho de publicação por push. Integrar v1 em main preservando histórico. Não reativar workflow histórico.
- [ ] Configurar proteção de main (sem force-push/exclusão, PR obrigatório, revisão independente, status checks obrigatórios, proteção de alterações de workflows e scripts de release). Confirmar CODEOWNERS com mantenedores reais e permissão de revisão, sem inventar equipes.
- [ ] Executar Tests/Security no SHA exato da main, validar Pages e instalar a partir do pacote candidato sem publicar.
- [ ] Tornar main default somente após verificação de proteções, CI, Pages, documentação e compatibilidade. Congelar v1 para contribuição/publicação, manter referência de compatibilidade.
- [ ] Se falhar qualquer gate, interromper cutover; não alterar dist-tags nem mover tags. Restaurar configuração de branch/default/Pages a partir de snapshot administrativo, mediante autorização; manter código e histórico (revert, não force-push). Antes de reabrir publicação, repetir gates.

### Fase D — release (autorização independente)

- [ ] Fechar bloqueadores reais da #86 ou reduzir/documentar escopo experimental de modo verificável; manter Goal desabilitado. RC anterior não certifica novo SHA.
- [ ] Preparar versão inédita (ex. 1.2.0-rc.2, após confirmar registry), manifestos e changelog. Gates exatos na main. Autorizar tag e publicação separadamente; canal next. Verificar latest continua intacto.
- [ ] Homologar RC, corrigir regressões, repetir gates para 1.2.0 final; staged → latest apenas após evidências e aprovação. Não reutilizar versão ou mover tag.

## 5. Política de issues

Fechar issue por critérios de aceite demonstrados e integração no SHA relevante, não por mera publicação. Registrar commit, testes e limitações; se a entrega tiver escopo misto, separar evolução futura sem reduzir DoD silenciosamente. Acompanhar distribuição na milestone/release, sem criar milestones duplicadas.

| Issue | Disposição inicial |
| --- | --- |
| #44 | código corrigido; validar Claude/Linux reais antes de encerrar |
| #48 | validar runtime real e recuperação; manter aberta |
| #81 | governança e acesso npm/owner; incluir transição neste acompanhamento |
| #86 | gate de lançamento, RC e promoção; manter aberta |
| #41 | memória standalone endurecida; integração externa e concorrência/migração ainda não certificadas; separar somente com aceite explícito |
| #67 | Goal/autonomia fora do escopo estável enquanto desabilitado; manter aberta |
| #82 | integridade de terminal e rejeição de autodeclaração integradas; vínculo independente por critério e demais aceites não concluídos |

Não fechar as sete issues nesta preparação. Atualizar evidências no acompanhamento #81/#86; encerrar somente quando critérios reais forem satisfeitos.

## 6. Definition of Done da migração

- main é a única linha de desenvolvimento/publicação, protegida; v1 preservada como compatibilidade.
- Nenhum push/tag isolado publica npm. Nenhum workflow da v1, release/* ou SHA não homologado tem autorização de distribuição.
- Gates de main negativos e positivos aprovados, SHA e jobs exatos registrados, instalação/update/rollback comprovados, site funcionando.
- Configuração owner e npm verificadas; nenhuma credencial copiada para issues/logs.
- Release permanece operação manual separada; relatório contém riscos residuais, links de CI, lista de arquivos, decisão de cutover e responsáveis.
