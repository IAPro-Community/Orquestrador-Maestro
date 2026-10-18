# Site do Orquestrador Maestro

Site público em React/Docusaurus para GitHub Pages.

## Princípios

- **Markdown-first:** `README*.md` e `docs/**/*.md` são indexados e renderizados diretamente; o site não mantém uma segunda documentação manual.
- **Skills dinâmicas:** o catálogo é reconstruído de `SKILLS_MANIFEST.json`, `SKILLS_ROUTER.json`, `SKILL_ALIASES.json`, `SKILL_CHAINS.json` e `PUBLIC_SKILLS_MANIFEST.json` a cada build.
- **Roteamento fiel:** o simulador usa uma implementação browser do algoritmo v2 e `tests/router-parity.test.mjs` compara seus resultados com `runtime/planner/intent-router.js`.
- **Claims baseados em evidência:** a página de benchmark não publica redução fixa de tokens; números devem vir do harness e passar pelo evidence gate.
- **Logo oficial:** o build copia `assets/orquestrador-maestro-logo.png`; não existe logo paralela.

## Desenvolvimento

```bash
cd site
npm install
npm run start
```

## Validação

```bash
npm run check:router-parity
npm run build
```

A publicação usa `.github/workflows/pages.yml`.
