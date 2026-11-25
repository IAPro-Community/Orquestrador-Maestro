# Release

Este guia é para mantenedores que publicam uma versão. Ele mantém releases rastreáveis e reversíveis; não é necessário para instalar ou usar o Maestro.

O release segue um único contrato: a versão do `package.json`, do `package-lock.json` e do `CHANGELOG.md` deve ser igual à tag anotada (`vX.Y.Z` para estável ou `vX.Y.Z-alpha.N`/`beta.N`/`rc.N` para pré-release).

## Fluxo do mantenedor

A migração planejada para publicação exclusiva pela `main` está documentada em [BRANCH_RELEASE_TRANSITION.md](architecture/BRANCH_RELEASE_TRANSITION.md). Ela ainda não está ativa: siga as regras vigentes abaixo até autorização e validação do cutover.

1. Atualize `package.json`, `package-lock.json`, os dois manifestos em `plugins/maestro-openai/`, os bootstraps e `docs/product/CAPABILITY_MATRIX.json`. Crie a seção correspondente no `CHANGELOG.md`.
2. Rode `npm ci`, `npm run verify:pr`, `npm run validate` e `npm run skills:contract-audit:strict`. Para a linha V1, use `VERIFY_BASE_REF=origin/v1` no gate de ancestralidade.
3. Para versões `1.x`, integre o candidato homologado em `v1`; a linha histórica `0.x` usa `main`. Alterar a versão ou fazer push não autoriza criar tags nem publicar. Verifique se os workflows manuais desta revisão já estão presentes na branch de publicação antes de alterar a versão.

> **Release candidate:** a linha 1.2 começa em `1.2.0-rc.1`, publicada no dist-tag npm `next` e marcada como prerelease no GitHub (`latest` continua apontando a estável `1.1.1`). O gate de ancestralidade exige que o commit da tag já esteja em `origin/v1`; por isso a branch de RC precisa ser integrada em `v1` antes da tag. Um número de versão já publicado no npm não pode ser reutilizado: correções saem como `1.2.0-rc.2`.

O script PowerShell local é exclusivamente validatório (inclusive RC):

```powershell
.\scripts\release.ps1 -Version 1.2.0-rc.2
```

Os parâmetros legados `-CreateTag` e `-PushTag` são rejeitados. O script usa o gate canônico de manifestos, verifica o checkout limpo e interrompe em qualquer falha dos gates.

## Publicação com autorização explícita

A criação de tags e a publicação são duas operações independentes e manuais. Nenhum push ou tag aciona a publicação nesta revisão.

1. Execute Tests e Security checks na branch de release oficial, para o SHA final exato. Runs de PR não certificam o commit da tag, porque podem testar um merge sintético. O gate exige branch, SHA e tentativa exatos, os dez jobs da matriz Tests e os dois de Security, além de suas etapas obrigatórias. Rejeita runs ausentes, pendentes, cancelados, falhos ou com etapas essenciais ignoradas.
2. Dispare `Prepare authorized release tag` na branch `v1` (ou `main` na linha 0.x), informe `expected_sha` completo e confirme `confirm`. O workflow cria a tag anotada, mas não publica.
3. Dispare [Release](../.github/workflows/release.yml) nessa mesma branch, com `tag`, `expected_sha` e `confirm`. O checkout da tag precisa corresponder ao SHA aprovado e estar na ancestralidade da linha oficial. O environment `npm-release` continua necessário.

Um rerun exige a mesma tag imutável e o mesmo SHA. Nenhum resultado de validação local é interpretado automaticamente como aprovação de CI hospedada.

Releases estáveis usam o dist-tag npm `latest`; `alpha` usa `alpha`, `beta` usa `beta` e outros pré-releases/RC usam `next`. O workflow:

- confere se tag e pacote têm a mesma versão;
- exige a entrada correspondente no changelog;
- verifica a ancestralidade na branch da linha de release;
- executa testes, validação pública e auditoria estrita das skills;
- gera um único tarball com checksum e testa sua instalação e atualização em home isolado;
- publica exatamente o artefato validado; toda versão inédita entra primeiro no dist-tag temporário `staged`, sem alterar `latest`, `next`, `alpha` ou `beta`;
- aguarda a visibilidade da versão no registry (até 20 minutos), confere SHA-512 e recupera o tarball para comparar seu SHA-256 do pacote já testado; não executa código do pacote no processo que mantém credenciais de publicação;
- promove o canal somente após confirmação, sem regredir nenhum canal promovido; se `next` ainda apontar para uma RC da mesma versão, gradua esse canal também;
- reconfirma os dist-tags antes de autorizar a release GitHub;
- cria a release GitHub com changelog, tarball e checksum; versões estáveis viram `Latest`, pré-releases ficam identificadas como tal.

Configure o secret `NPM_TOKEN` no ambiente `npm-release`, com permissão de publicação e atualização de dist-tags para `@iapro/orquestrador-maestro-cli`. Como alternativa, configure trusted publishing para este repositório e workflow com `id-token: write`; habilite também a permissão `Allow npm dist-tag` do trusted publisher. O job usa npm 12.2.0, compatível com essa operação via OIDC. Dist-tags que já apontam para a versão desejada dispensam escrita. Para alterações, OIDC tem prioridade; se essa operação for recusada e houver um token configurado, o job tenta a autenticação tradicional com esse token.

Se a versão já existir, o workflow compara sua integridade SHA-512 com a do artefato validado antes de retomar os dist-tags e a release GitHub. Um pacote diferente com o mesmo número de versão reprova o fluxo. As publicações são serializadas no mesmo grupo de concorrência, para evitar disputa entre canais. Um erro de propagação não autoriza republicar a versão; retome a execução pela tag imutável. Configure required reviewers no environment `npm-release` antes de autorizar uma versão estável; a declaração YAML não configura essa aprovação por si só.

A tag permanece imutável mesmo quando a branch avança. A checagem de ancestralidade exige que o commit da tag esteja no histórico da linha de release; não exige que a tag contenha commits posteriores da branch. Assim, uma retomada manual preserva o pacote original. A preparação da tag não permite movê-la; retome explicitamente pela tag original.


## Homologação local sem créditos do GitHub Actions

Em um checkout limpo do SHA candidato (Linux/macOS com Node e PowerShell),
sem credenciais de publicação no ambiente de testes:

```bash
git fetch origin --tags
git rev-parse HEAD
bash scripts/homologate-release.sh "$(git rev-parse HEAD)"
```

O script roda os gates locais, valida conteúdo e audit de dependências,
cria um tarball fora do checkout e testa instalação e atualização em um
home temporário. Em caso de sucesso, grava `EVIDENCE.json` com SHA,
versão, OS/arch, Node, SHA-256 e SHA-512 do tarball. Qualquer falha interrompe
a homologação sem produzir evidência de sucesso. Não cria tag, não altera
versão, não muda dist-tags nem publica. PowerShell ausente bloqueia a
validação pública completa; não trate modo degradado como PASS.

No Windows, execute os mesmos gates em PowerShell e faça o smoke do mesmo
tarball em um home/prefixo temporário, anexando logs e checksum à #86.
Registre os demais OS/versões e CodeQL como NOT_TESTED quando indisponíveis.
Provider real exige homologação separada. A evidência local substitui
operacionalmente a execução hospedada apenas mediante decisão registrada
do mantenedor, não uma aprovação automatizada de CI.

### Publicação local autorizada (alternativa administrativa à CI hospedada)

O fluxo local é uma operação de mantenedor para a linha 1.x; não transforma
uma evidência local em aprovação da CI. Use somente se a execução hospedada
estiver indisponível e o owner tiver autorizado a exceção na #86, indicando
SHA, versão, SHA-256 e plataformas/gates não homologados. Não execute
publicação local e hospedada simultaneamente: o grupo de concorrência
do GitHub não serializa processos externos. Confirme janela exclusiva,
restrições de tags e credenciais npm/GitHub escopadas, sem exportá-las
para o ambiente de testes. Não desative as proteções hospedadas.

1. Prepare uma versão npm inédita (por exemplo RC.2), confirme que a branch
   oficial `v1` contém o SHA final e rode a homologação novamente nesse SHA.
   O diretório de evidências é exibido pelo script. Não reutilize RC.1.
2. Com autorização separada para criar tag, confira `git rev-parse HEAD`,
   a versão e o SHA no GitHub; crie uma tag anotada imutável no SHA aprovado
   e envie apenas essa tag (por exemplo `git tag -a v1.2.0-rc.2 -m "Release v1.2.0-rc.2"`
   e `git push origin refs/tags/v1.2.0-rc.2`). Não force ou mova tags.
   Esse passo exige autorização do owner e deve respeitar o ruleset.
3. Abra um ambiente de publicação separado, com acesso npm e `gh`
   configurados. No checkout limpo da `v1` autorizada, execute:

   ```bash
   bash scripts/publish-local-release.sh DIRETORIO_EVIDENCIA SHA_COMPLETO SHA256_APROVADO --confirm
   ```

O script exige os gates registrados no `EVIDENCE.json`, SHA completo,
checksums SHA-256/SHA-512, branch oficial remota exata e tag anotada que
aponte ao mesmo commit. Copia o tarball aprovado para um diretório temporário,
usa a mesma lógica de publicação do workflow, recupera e verifica o pacote
no registry antes de promover o canal, e cria a GitHub Release sem
sobrescrever uma release divergente. Uma nova tentativa nunca altera
um pacote npm de conteúdo diferente. Não execute o helper de registry
isoladamente como substituto dos gates.

A autorização e o relatório local são evidências administrativas, não
assinaturas criptográficas ou prova da matriz multi-OS. Se faltar PowerShell,
acesso ao registry, autenticação ou aprovação, interrompa. CodeQL e a
homologação de providers reais continuam explicitamente separados.
Não há bypass de CI no workflow remoto.

## Rollback

Uma versão publicada no npm não deve ser sobrescrita. Em caso de problema, publique uma nova versão corrigida e, se necessário, use `npm deprecate` com uma mensagem objetiva. A tag GitHub permanece como registro imutável do artefato publicado.

## Canais da V1

Instale a V1 estável pelo canal padrão:

```bash
npm install -g @iapro/orquestrador-maestro-cli@latest
orquestrador-maestro update
orquestrador-maestro verify
```

Para experimentar a release candidate:

```bash
npm install -g @iapro/orquestrador-maestro-cli@next
```

O comando `orquestrador-maestro update` preserva o canal da versão instalada. Na graduação para `1.0.0`, o canal `beta` também aponta para a estável, permitindo que instalações beta migrem pelo comando habitual. Após a migração, o CLI estável consulta `latest`. Na graduação de uma RC estável, `next` é movido para a estável somente se ainda apontar para uma RC da mesma versão. Futuras pré-releases podem mover seus canais novamente; para escolher a linha estável explicitamente, use `@latest`.

Ao atualizar, `orquestrador-maestro update` faz backup e reaplica o núcleo. A versão 1.0.1 também consolida a instalação na raiz `.orquestrador`, migrando memória e configuração de `.orquestrador-maestro` antes de remover a raiz antiga.
