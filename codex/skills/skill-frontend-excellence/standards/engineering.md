# Engineering standards

Apply only when the target app already uses this stack or is migrating to it.

- React + TypeScript.
- Componentes públicos do design system adotado antes de componentes locais.
- Use tokens semânticos e variáveis CSS documentadas; não fixe cores quando existir um token.
- No inline styles except when a runtime value cannot be expressed in CSS.
- No `!important` without a recorded reason.
- Small components. App-specific composition stays in the app.
- i18n: do not introduce English UI copy in products that already localize.
- Tree-shaking: siga o estilo de importação existente e as subpaths públicas documentadas pelo projeto.
- Do not add barrel re-exports that pull optional peers (`react-hook-form`, `pdfjs-dist`) into unrelated screens.

Apps with a legitimate different architecture (legacy server-rendered apps, older client frameworks, game engines) keep their architecture. Do not force a design system onto unrelated stacks in the same change.
