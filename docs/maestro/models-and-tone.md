# Modelos, providers, perfis e tom

## Regra principal

O usuário não precisa ajustar modelo, provider ou tom para receber as melhorias. O padrão é informativo e preserva a escolha existente.

| Item | Comportamento padrão |
| --- | --- |
| Provider | não é trocado |
| Modelo | não é trocado |
| Perfil | não é substituído automaticamente |
| Tom | preservado |
| Prompt nativo | preservado |
| Contexto de governança | fora do prompt, salvo opt-in ou `strict` |
| Hooks | desligados |

## Quem gerencia o modelo

O CLI favorito continua responsável por selecionar e executar o modelo. O Maestro pode exibir provider/modelo como informação de diagnóstico, mas não faz roteamento automático nessa camada de compatibilidade.

Isso evita respostas mais caras, lentas, prolixas ou com personalidade diferente após uma atualização.

## Quando há mudança intencional

Uma equipe pode escolher um modo mais rigoroso ou incluir contexto de governança explicitamente. Essa decisão deve ser versionada no projeto, comunicada aos usuários e validada antes de adoção ampla.

## Política conservadora

Se o usuário já obtém bons resultados, a atualização não deve “otimizar” automaticamente o prompt. Melhorias de governança ficam disponíveis como recomendação e só influenciam gates ou contexto quando ativadas.

![Custo relativo da configuração](./assets/token-cost.svg)
