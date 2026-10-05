# Release

Este guia é para mantenedores que publicam uma versão. Ele mantém releases rastreáveis e reversíveis; não é necessário para instalar ou usar o Maestro.

O release segue um único contrato: a versão do `package.json`, do `package-lock.json` e do `CHANGELOG.md` deve ser igual à tag anotada (`vX.Y.Z` para estável ou `vX.Y.Z-alpha.N`/`beta.N`/`rc.N` para pré-release).

## Fluxo do mantenedor

1. Atualize `package.json`, `package-lock.json`, os dois manifestos em `plugins/maestro-openai/`, os bootstraps e `docs/product/CAPABILITY_MATRIX.json`. Crie a seção correspondente no `CHANGELOG.md`.
2. Rode `npm ci`, `npm run verify:pr`, `npm run validate` e `npm run skills:contract-audit:strict`. Para a linha V1, use `VERIFY_BASE_REF=origin/v1` no gate de ancestralidade.
3. Para versões `1.x`, faça commit e envie essas alterações à branch `v1`. O workflow de auto-tag testa o código, confere a versão no npm, cria a tag anotada e dispara explicitamente o workflow de publicação. A linha histórica `0.x` continua usando `main`.

Também é possível validar e criar a tag pelo script local:

   ```powershell
   .\scripts\release.ps1 -Version 1.0.0
   ```

   ```powershell
   .\scripts\release.ps1 -Version 1.0.0 -CreateTag -PushTag
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
- publica exatamente o artefato validado no canal npm correspondente;
- cria a release GitHub com changelog, tarball e checksum; versões estáveis viram `Latest`, pré-releases ficam identificadas como tal.

Configure o secret `NPM_TOKEN` no ambiente `npm-release`, com permissão de publicação e atualização de dist-tags para `@iapro/orquestrador-maestro-cli`. Como alternativa, configure trusted publishing para este repositório e workflow com `id-token: write`; habilite também a permissão `Allow npm dist-tag` do trusted publisher. O job usa npm 12.2.0, compatível com essa operação via OIDC. Dist-tags que já apontam para a versão desejada dispensam escrita. Para alterações, OIDC tem prioridade; se essa operação for recusada e houver um token configurado, o job tenta a autenticação tradicional com esse token.

Se a versão já existir, o workflow compara sua integridade SHA-512 com a do artefato validado antes de retomar os dist-tags e a release GitHub. Um pacote diferente com o mesmo número de versão reprova o fluxo. Execuções da mesma tag são serializadas para evitar publicação concorrente.

A tag permanece imutável mesmo quando a branch avança. A checagem de ancestralidade exige que o commit da tag esteja no histórico da linha de release; não exige que a tag contenha commits posteriores da branch. Assim, uma retomada preserva o pacote original.

## Rollback

Uma versão publicada no npm não deve ser sobrescrita. Em caso de problema, publique uma nova versão corrigida e, se necessário, use `npm deprecate` com uma mensagem objetiva. A tag GitHub permanece como registro imutável do artefato publicado.

## Canais da V1

Instale a V1 estável pelo canal padrão:

```bash
npm install -g @iapro/orquestrador-maestro-cli@latest
orquestrador-maestro update
orquestrador-maestro verify
```

O comando `orquestrador-maestro update` preserva o canal da versão instalada. Na graduação para `1.0.0`, o canal `beta` também aponta para a estável, permitindo que instalações beta migrem pelo comando habitual. Após a migração, o CLI estável consulta `latest`. Futuras betas podem mover `beta` novamente; para escolher a linha estável explicitamente, use `@latest`.
