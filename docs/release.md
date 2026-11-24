# Release

Este guia é para mantenedores que publicam uma versão. Ele mantém releases rastreáveis e reversíveis; não é necessário para instalar ou usar o Maestro.

O release segue um único contrato: a versão do `package.json`, do `package-lock.json` e do `CHANGELOG.md` deve ser igual à tag anotada (`vX.Y.Z` para estável ou `vX.Y.Z-alpha.N`/`beta.N`/`rc.N` para pré-release).

## Fluxo do mantenedor

1. Atualize `package.json`, `package-lock.json`, os dois manifestos em `plugins/maestro-openai/`, os bootstraps e `docs/product/CAPABILITY_MATRIX.json`. Crie a seção correspondente no `CHANGELOG.md`.
2. Rode `npm ci`, `npm run verify:pr`, `npm run validate` e `npm run skills:contract-audit:strict`. Para a linha V1, use `VERIFY_BASE_REF=origin/v1` no gate de ancestralidade.
3. Para versões `1.x`, faça commit e envie essas alterações à branch `v1`. O workflow de auto-tag testa o código, confere a versão no npm, cria a tag anotada e dispara explicitamente o workflow de publicação. A linha histórica `0.x` continua usando `main`.

> **Release candidate:** a linha 1.2 começa em `1.2.0-rc.1`, publicada no dist-tag npm `next` e marcada como prerelease no GitHub (`latest` continua apontando a estável `1.1.1`). O gate de ancestralidade exige que o commit da tag já esteja em `origin/v1`; por isso a branch de RC precisa ser integrada em `v1` antes da tag. Um número de versão já publicado no npm não pode ser reutilizado: correções saem como `1.2.0-rc.2`.

Também é possível validar e criar a tag pelo script local:

   ```powershell
   .\scripts\release.ps1 -Version 1.2.0-rc.2
   ```

   ```powershell
   .\scripts\release.ps1 -Version 1.2.0-rc.2 -CreateTag -PushTag
   ```

O script exige working tree limpo, verifica a versão dos manifestos, confere o changelog, executa `npm run validate`, gera a prévia do pacote e valida espaços inválidos.

## Publicação automática

O envio manual de uma tag SemVer (`vX.Y.Z` ou pré-release) dispara [`.github/workflows/release.yml`](../.github/workflows/release.yml). Tags criadas pelo `GITHUB_TOKEN` não disparam outro workflow por evento de push; por isso, o auto-tag usa `workflow_dispatch`. Para retomar uma publicação, execute o workflow Release com a tag correspondente, usando a branch `v1` para versões `1.x`.

Releases estáveis usam o dist-tag npm `latest`; `alpha` usa `alpha`, `beta` usa `beta` e outros pré-releases/RC usam `next`. O workflow:

- confere se tag e pacote têm a mesma versão;
- exige a entrada correspondente no changelog;
- verifica a ancestralidade na branch da linha de release;
- executa testes, validação pública e auditoria estrita das skills;
- gera um único tarball com checksum e testa sua instalação e atualização em home isolado;
- publica exatamente o artefato validado; uma versão estável entra primeiro no dist-tag temporário `staged`, sem alterar `latest`;
- aguarda a visibilidade da versão no registry (até 20 minutos), confere SHA-512 e recupera o tarball para comparar seu SHA-256 e executar smoke de versão;
- promove o canal somente após confirmação, sem regredir `latest`; se `next` ainda apontar para uma RC da mesma versão, gradua esse canal também;
- reconfirma os dist-tags antes de autorizar a release GitHub;
- cria a release GitHub com changelog, tarball e checksum; versões estáveis viram `Latest`, pré-releases ficam identificadas como tal.

Configure o secret `NPM_TOKEN` no ambiente `npm-release`, com permissão de publicação e atualização de dist-tags para `@iapro/orquestrador-maestro-cli`. Como alternativa, configure trusted publishing para este repositório e workflow com `id-token: write`; habilite também a permissão `Allow npm dist-tag` do trusted publisher. O job usa npm 12.2.0, compatível com essa operação via OIDC. Dist-tags que já apontam para a versão desejada dispensam escrita. Para alterações, OIDC tem prioridade; se essa operação for recusada e houver um token configurado, o job tenta a autenticação tradicional com esse token.

Se a versão já existir, o workflow compara sua integridade SHA-512 com a do artefato validado antes de retomar os dist-tags e a release GitHub. Um pacote diferente com o mesmo número de versão reprova o fluxo. As publicações são serializadas no mesmo grupo de concorrência, para evitar disputa entre canais. Um erro de propagação não autoriza republicar a versão; retome a execução pela tag imutável. Configure required reviewers no environment `npm-release` antes de autorizar uma versão estável; a declaração YAML não configura essa aprovação por si só.

A tag permanece imutável mesmo quando a branch avança. A checagem de ancestralidade exige que o commit da tag esteja no histórico da linha de release; não exige que a tag contenha commits posteriores da branch. Assim, uma retomada manual preserva o pacote original. O auto-tag não despacha uma tag antiga como se fosse o HEAD atual; retome explicitamente pela tag original.

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
