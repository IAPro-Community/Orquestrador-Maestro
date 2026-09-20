# Registro de tratamento: telemetria do CLI

Este registro descreve a configuração planejada e deve ser confirmado pelo responsável e por orientação jurídica antes do lançamento.

| Campo | Decisão |
| --- | --- |
| Finalidade | Medir adoção e uso técnico do CLI: instalações anônimas ativas, comandos, versões, plataformas e erros agregados. |
| Base legal | A definir pelo controlador com orientação jurídica; não presumir consentimento ou conformidade automática. Opt-out técnico permanece obrigatório. |
| Titularidade/escopo | Instalação do CLI, não pessoa identificada. Uma pessoa em dois computadores conta duas instalações. |
| Origem | O próprio CLI, no encerramento de comandos suportados. |
| Dados | ID aleatório persistido localmente, comando principal, flags sem valores, sucesso/falha, categoria genérica de erro, versão do pacote, sistema operacional, arquitetura, major do Node e data UTC. |
| Não coletado | Caminhos, valores de argumentos, prompts, conteúdo de arquivos/projetos, nomes, telefone, IP armazenado pelo produto, logs, cookies, replay, heatmaps, tokens e credenciais. |
| Compartilhamento | PostHog Cloud, como provedor de analytics; endpoint US (Virginia). |
| Retenção | Meta operacional: 12 meses. Confirmar e configurar a retenção efetiva no projeto PostHog antes do lançamento. |
| Eliminação | Excluir eventos pelo procedimento do PostHog e remover o projeto quando aplicável; documentar confirmação operacional. |
| Controles | Desabilitada por padrão (opt-in via `telemetry enable` + endpoint + chave), `telemetry disable`, variável `ORQUESTRADOR_MAESTRO_TELEMETRY=0`, timeout curto, falha silenciosa, configuração versionada (`consentVersion: 2`) e sem autocaptura. |

O lançamento fica condicionado à revisão do aviso de privacidade, base legal, contrato/subprocessadores, região, retenção e exclusão no provedor.
