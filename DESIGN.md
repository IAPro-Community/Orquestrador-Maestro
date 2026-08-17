# Maestro ADE — Design System

## Direção

O Maestro usa a densidade de um ambiente de desenvolvimento: informação operacional sempre visível, hierarquia forte e pouca ornamentação. A interface não replica outro produto; usa a identidade local-first do Maestro e organiza o trabalho em `projeto → missão → piloto e especialistas`.

## Estrutura

- Barra superior: produto, projeto atual, conexão do runtime e agentes ativos.
- Navegador lateral: projetos registrados, estado, caminho e contagem operacional.
- Abas: missões do projeto sem interromper processos ao alternar.
- Cartão de missão: objetivo fixo, tarefas, bloqueios e verificação.
- Deck: piloto dominante à esquerda e até cinco especialistas à direita; paginação automática a partir do sétimo painel.
- Barra de ação: assistentes contextuais para agente, missão, shell e paleta.
- Rodapé: atalhos, foco e mensagens do runtime.

## Tokens

- Canvas `#05070b`, superfície `#0a0f16`, superfície elevada `#101722`.
- Texto `#e6edf5`, secundário `#8391a5`, borda `#243244`.
- Codex/ciano `#31d7ff`, sucesso/verde `#31e6a1`, OpenCode/lima `#b6f36b`, Claude/laranja `#ffb454`, Agy/violeta `#b99aff`, falha/vermelho `#ff6b7a`.
- Bordas e cor comunicam seleção e estado; cor nunca é o único indicador.

## Interação

- Mouse e teclado têm paridade nos projetos, missões e painéis.
- `A`, `M` e `S` abrem assistentes, não linhas de comando.
- Missões novas começam ativas; rascunhos existentes exibem `R Iniciar missão` como próxima ação.
- Painéis mostram `Enter para interagir` apenas quando a PTY está conectada; painéis indisponíveis explicam a recuperação.
- `1` a `6` selecionam diretamente os painéis visíveis e `S` abre um shell interativo sem formulário.
- `Ctrl+P`, `Ctrl+M` e `Ctrl+K` focam projetos, missões e paleta.
- `Enter` direciona o teclado ao PTY; `Ctrl+]` retorna ao cockpit. Dentro da PTY, `Ctrl+C`, Enter, Tab, espaço e setas pertencem ao agente.
- Abaixo de 120 colunas a grade reduz para quatro painéis; abaixo de 80 mostra somente o painel selecionado.

## Conteúdo

Rótulos são curtos e operacionais. Estados usam português claro: iniciando, aguardando autorização, ativo, verificando, concluído, falhou e desconectado. Saída integral de terminal, prompts e input nunca são persistidos.
