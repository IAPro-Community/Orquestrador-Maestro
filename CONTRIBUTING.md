# Como contribuir com o Orquestrador Maestro

Obrigado por considerar uma contribuição! O Maestro é um projeto aberto a melhorias em código, documentação, testes, integrações e experiência de uso. Você não precisa conhecer toda a arquitetura para participar.

Este repositório distribui software instalável e conteúdo público. As mudanças devem preservar compatibilidade, verificabilidade e privacidade.

## Por onde começar

- **Encontrou um problema?** Confira as [issues existentes](https://github.com/IAPro-Community/Orquestrador-Maestro/issues) e, se necessário, abra uma nova com cenário, comportamento esperado, comportamento observado e passos para reprodução (sem dados privados).
- **Tem uma ideia?** Descreva o problema que deseja resolver, exemplos de uso e alternativas. Mudanças maiores devem passar pela [discussão de RFCs](docs/rfcs/README.md).
- **Quer ajudar sem programar?** Melhorias em exemplos, documentação, traduções, testes e revisões também são contribuições.
- **Primeira contribuição?** Prefira uma mudança pequena, delimitada e que possa ser verificada independentemente.

Antes de investir numa alteração extensa, vale discutir o escopo em uma issue para reduzir retrabalho. Uma issue prévia não é obrigatória para correções pequenas.

## Preparar o ambiente

Você vai precisar de Git, Node.js **20.19 ou superior** e npm. PowerShell é necessário para executar o conjunto completo de validações públicas; em Linux e macOS ele pode ser instalado como `pwsh`.

Para trabalhar a partir do código, faça um fork (ou utilize um clone, caso tenha acesso de escrita), selecione a branch estável `v1` e instale as dependências:

```bash
git clone --branch v1 https://github.com/IAPro-Community/Orquestrador-Maestro.git
cd Orquestrador-Maestro
npm ci
git switch -c docs/minha-melhoria
```

Para enviar mudanças sem acesso de escrita ao repositório original, clone **seu fork** em vez da URL acima e abra o pull request para `IAPro-Community/Orquestrador-Maestro`, com destino à branch `v1`.

O [guia de instalação](docs/installation.md) é voltado a usuários do Maestro; contribuir com o código não exige executar uma instalação global na sua máquina.

## Fluxo de contribuição

1. Entenda o comportamento existente e delimite o problema. Consulte o [README](README.md) e a documentação pertinente.
2. Para mudanças que afetem arquitetura, memória, privacidade, compatibilidade, instaladores ou várias ferramentas, proponha uma [RFC](docs/rfcs/README.md) antes da implementação extensa.
3. Faça alterações pequenas e coesas, preservando contratos existentes. Inclua testes quando modificar comportamento.
4. Atualize documentação, exemplos e changelog quando a mudança alterar a experiência ou o contrato público.
5. Execute as verificações relevantes e descreva quaisquer limitações de ambiente.
6. Abra um **pull request para `v1`** explicando o motivo, a solução, as evidências de teste, os riscos e a eventual migração.

Pull requests podem receber pedidos de ajuste. Discussões técnicas devem focar comportamento, impacto e evidências, não a pessoa que propôs a mudança. A aprovação e a incorporação dependem da revisão dos mantenedores.

### Checklist para o pull request

- [ ] O problema e a solução estão descritos de forma objetiva.
- [ ] A alteração é compatível ou apresenta plano de migração e rollback.
- [ ] Testes e verificações pertinentes foram executados, com resultado registrado.
- [ ] Documentação e changelog foram atualizados quando necessário.
- [ ] Não há credenciais, dados pessoais, conteúdo local privado nem material de terceiros sem autorização.

## Verificação e qualidade

Na raiz do repositório, depois de `npm ci`:

```bash
npm run validate
npm test
npm run verify:pr
npm run audit
npm pack --dry-run
git diff --check
```

Esses comandos exercitam verificações diferentes. `npm run verify:pr` inclui testes, smoke checks, integridade e verificações contra publicação acidental de conteúdo sensível; `npm run audit` verifica dependências, podendo depender da rede. `npm pack --dry-run` permite inspecionar o que entraria no pacote npm.

**Atenção:** sem PowerShell, `npm run validate` entra no modo **`DEGRADED`**, que verifica somente um subconjunto dos contratos JSON. Um resultado positivo nesse modo **não equivale à validação pública completa**. Para executar a validação completa, use Windows com PowerShell ou instale `pwsh` em Linux/macOS e rode novamente `npm run validate`. Informe no PR quando algum teste não puder ser executado.

Se alterar scripts Bash, verifique a sintaxe dos arquivos modificados com `bash -n caminho/do/script.sh`. Para mudanças apenas em documentação, confira ao menos os links alterados, a formatação Markdown e `git diff --check`; os demais checks podem ser solicitados na revisão.

Não altere resultados de testes ou exemplos de benchmark para sugerir melhorias que não foram medidas. Afirmações quantitativas precisam de metodologia e evidência reproduzível, conforme o [guia de benchmark](docs/benchmark.md).

## Organização do código e Skills

O projeto inclui o CLI npm em `bin/`, o núcleo em `orquestrador/`, runtime em `runtime/`, scripts em `scripts/`, perfis em `tool-profiles/` e documentação em `docs/`. Evite copiar regras entre ferramentas sem necessidade; procure primeiro a fonte canônica.

Skills canônicas ficam em `orquestrador/skills/` e seguem o [contrato de Skills](docs/skills/README.md). Para gerar uma nova Skill, o script atual exige, entre outros campos, **capability** e **output**:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\new-canonical-skill.ps1 `
  -Name "skill-exemplo" `
  -Description "Descreve quando esta capacidade deve ser usada" `
  -Category "general" `
  -Risk "low" `
  -Capability "repo-analysis" `
  -Output "analysis-report"
```

Os valores acima são ilustrativos: escolha capabilities e outputs compatíveis com o contrato do projeto. Depois, valide o catálogo:

```bash
node scripts/skill-catalog.js validate
node scripts/public-skill-catalog.js check
npm run skills:contract-audit
```

Não edite apenas cópias/espelhos em `.codex`, `.claude`, `.opencode`, `.cursor`, `.gemini`, `.windsurf` ou `.agents`: altere primeiro a fonte canônica e siga o mecanismo de geração/sincronização do repositório. Evite editar arquivos marcados como gerados.

## Segurança e privacidade

Este é um repositório público e sanitizado. **Nunca inclua** em commits, issues, PRs, logs ou capturas de tela:

- tokens, chaves, cookies, senhas, recovery codes, conteúdo de `.env` ou credenciais;
- sessões, caches, backups, memórias pessoais e conteúdo local da pasta `DEV/`;
- prompts ou históricos de terceiros, dados pessoais, informações de clientes e caminhos de usuário identificáveis;
- saídas de depuração contendo informações privadas ou dados de produção.

Substitua dados reais por exemplos sintéticos e use caminhos genéricos, como `$HOME`, `%USERPROFILE%` e `{{USER_NAME}}`.

Se identificar uma vulnerabilidade que possa expor usuários, **não divulgue detalhes exploráveis em uma issue pública**. Busque contato privado com os mantenedores ou, se estiver habilitado no repositório, use o mecanismo de reporte privado de vulnerabilidades do GitHub. Para outras questões de segurança, consulte o [modelo de privacidade](docs/privacy-model.md).

## Documentação e histórico de mudanças

Use linguagem direta, exemplos reproduzíveis e links relativos para documentos internos. Documente limitações, diferenças entre plataformas e comportamentos que exigem ação do usuário.

O histórico de versões fica em [`CHANGELOG.md`](CHANGELOG.md). Para mudanças relevantes ainda não publicadas, registre-as sob `## Unreleased`, quando essa seção existir, sem inventar uma versão já lançada. Na publicação, siga o padrão utilizado pelo arquivo:

```markdown
## x.y.z - YYYY-MM-DD

### Melhorias

- Descrição objetiva da mudança e do impacto para quem utiliza o Maestro.
```

Não altere a versão do pacote nem anuncie releases por conta própria. Decisões de versionamento e publicação pertencem ao fluxo de manutenção.

## Licença e reconhecimento

Ao contribuir, envie apenas conteúdo que você tem direito de disponibilizar sob a [licença Apache 2.0 do projeto](LICENSE). Não copie código, imagens, textos ou assets de terceiros sem verificar os termos de uso; quando relevante, documente a origem e as condições.

Toda contribuição é bem-vinda, independentemente de tamanho ou formato. O [histórico de contribuidores do GitHub](https://github.com/IAPro-Community/Orquestrador-Maestro/graphs/contributors) reúne autores de commits, mas não representa todas as formas de colaboração. O reconhecimento no [README](README.md#contribuidores) não define uma hierarquia ou impede a inclusão de novas pessoas.
