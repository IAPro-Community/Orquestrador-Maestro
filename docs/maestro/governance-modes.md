# Modos de governança

| Modo | Verificação ausente | Evidência ausente | Perfil/provider/modelo |
| --- | --- | --- | --- |
| `compatibility` (padrão) | aviso | recomendação | preservados |
| `strict` (opt-in) | bloqueia | gate completo | continuam sob controle do usuário |

O modo compatível não seleciona `guided-engineering` automaticamente e não altera prompts existentes. A TUI pode exibir o estado nativo e a governança separadamente: `Tom nativo: preservado`, `Governança Maestro: compatível`, hooks ativos e avisos pendentes.
