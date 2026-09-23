# Release

Este guia é para mantenedores que publicam uma versão. Ele mantém releases rastreáveis e reversíveis; não é necessário para instalar ou usar o Maestro.

O release segue um único contrato: a versão do `package.json`, do `package-lock.json` e do `CHANGELOG.md` deve ser igual à tag anotada (`vX.Y.Z` para estável ou `vX.Y.Z-alpha.N`/`beta.N`/`rc.N` para pré-release).

## Fluxo do mantenedor

1. Atualize os dois manifestos e crie a seção correspondente no `CHANGELOG.md`.
2. Faça commit dessas alterações no `main`.
3. Rode a checagem local:

   ```powershell
   .\scripts\release.ps1 -Version 0.1.20
   ```

4. Crie e envie a tag:

   ```powershell
   .\scripts\release.ps1 -Version 0.1.20 -CreateTag -PushTag
   ```

O script exige working tree limpo, verifica a versão dos manifestos, confere o changelog, executa `npm run validate`, gera a prévia do pacote e valida espaços inválidos.

## Publicação automática

O envio de uma tag SemVer (`vX.Y.Z` ou pré-release) dispara [`.github/workflows/release.yml`](../.github/workflows/release.yml). Releases estáveis usam o dist-tag npm `latest`; `alpha` usa `alpha`, `beta` usa `beta` e outros pré-releases/RC usam `next`. O workflow:

- confere se tag e pacote têm a mesma versão;
- exige a entrada correspondente no changelog;
- executa os gates de validação e `npm pack --dry-run`;
- publica no canal estável `latest` do npm com provenance.

Antes de usar o fluxo, configure o secret `NPM_TOKEN` no ambiente protegido `npm-release`, com permissão de publicação para `@iapro/orquestrador-maestro-cli` e bypass de 2FA para publicação automatizada. Como alternativa, configure trusted publishing do npm para este repositório e workflow, usando o token OIDC já declarado (`id-token: write`).
O workflow consulta o npm antes de publicar. Se a versão da tag já existir, ele registra a versão como já publicada e encerra com sucesso, evitando falha por republicação ou tentativa desnecessária de OTP.
O passo de publicação valida primeiro `npm whoami` e informa o usuário autenticado. Se o registry rejeitar o upload, o workflow falha com o pacote, a versão, o usuário e a orientação para corrigir o acesso ao escopo, sem expor o token.

## Rollback

Uma versão publicada no npm não deve ser sobrescrita. Em caso de problema, publique uma nova versão corrigida e, se necessário, use `npm deprecate` com uma mensagem objetiva. A tag GitHub permanece como registro imutável do artefato publicado.
