# Reference Packs Locais

Reference packs permitem usar uma biblioteca privada sem despejá-la no contexto ou no repositório público. Este guia define como indexar e consultar esse material com segurança.

O Orquestrador não deve publicar bibliotecas privadas ou de terceiros dentro do snapshot público. Mesmo assim, muitos usuários têm acervos úteis em Google Drive, PDFs, playbooks, apostilas, runbooks e documentação interna.

Este documento define o padrão recomendado para consumir esse material localmente sem misturar tudo no repositório público.

## Quando Usar

Use reference packs quando você tiver:

- PDFs, planilhas e docs de estudo ou operação;
- documentação interna de clientes ou times;
- exports de Google Drive;
- catálogos de produto, normas, contratos ou runbooks;
- bibliotecas grandes demais para abrir no contexto sem filtro.

## Regra Central

Não aponte a IA para uma pasta gigante e não peça para ela “ler tudo”.

O caminho correto é:

1. criar um índice curto;
2. registrar o que existe, para que serve e quando usar;
3. fazer a IA abrir primeiro o índice;
4. abrir só os arquivos necessários para a tarefa atual.

## Estrutura Recomendada

Fora deste repositório público, no home do usuário:

```text
{{USER_HOME}}/.orquestrador/private-packs/
  INDEX.md
  ux-ui/
    README.md
    sources/
  engineering/
    README.md
    sources/
  business/
    README.md
    sources/
```

## INDEX.md Global

O índice global deve ter uma linha por pack:

```md
# Private Packs Index

| Pack | Finalidade | Quando usar | Entrada |
|---|---|---|---|
| `ux-ui` | referências visuais, padrões e benchmarks | redesign, frontend polish, landing pages, dashboards | `ux-ui/README.md` |
| `engineering` | PDFs, notas técnicas, arquiteturas, normas | APIs, infra, banco, sistema distribuído | `engineering/README.md` |
```

## README.md Do Pack

Cada pack deve ter um `README.md` curto com:

- objetivo do pack;
- lista resumida das fontes;
- riscos de privacidade/licença;
- ordem de leitura;
- arquivos de entrada.

Exemplo:

```md
# UX/UI Pack

Use este pack para dashboards, landings, motion, design systems e revisão visual.

Comece por:
1. `sources/index.md`
2. `sources/frontend-aesthetics.md`
3. arquivos específicos citados nesses índices
```

## Regras De Segurança

- Não publique os packs no GitHub deste projeto.
- Não copie material de terceiros sem licença compatível.
- Não coloque segredos, tokens ou dados pessoais sensíveis nos índices.
- Não referencie caminhos reais em documentação pública; use placeholders.
- Se um pack tiver conteúdo de cliente, mantenha o pack fora de qualquer repo público.

## Como A IA Deve Ler

O comportamento esperado é:

1. abrir o índice do pack;
2. localizar a subárea relevante;
3. abrir só os arquivos necessários;
4. resumir o que foi usado;
5. nunca tratar o pack inteiro como contexto automático.

## Relação Com `DEV/`

Use `DEV/` para memória operacional do projeto atual.

Use reference packs para bibliotecas transversais, externas ao projeto, que podem servir a vários trabalhos diferentes.
