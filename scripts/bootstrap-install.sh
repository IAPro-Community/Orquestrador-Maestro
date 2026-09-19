#!/usr/bin/env bash
set -euo pipefail

# Bootstrap oficial para macOS/Linux. Pode ser executado antes da CLI existir.
PACKAGE="@iapro/orquestrador-maestro-cli"
PACKAGE_VERSION="0.4.1"
BOOTSTRAP_VERSION="2026.09.08.2"
PREFIX="${ORQUESTRADOR_NPM_PREFIX:-$HOME/.npm-global}"

echo "Orquestrador Maestro bootstrap $BOOTSTRAP_VERSION"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Erro: Node.js e npm são necessários. Instale o Node.js LTS e execute novamente." >&2
  exit 1
fi

if [ "$(id -u)" -eq 0 ]; then
  echo "Erro: execute o bootstrap como usuário normal, sem sudo/root." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || true)"
case "$NODE_MAJOR" in
  ''|*[!0-9]*)
    echo "Erro: não foi possível identificar a versão do Node.js." >&2
    exit 1
    ;;
esac
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Erro: Node.js 20 ou superior é necessário. Versão atual: $(node --version)." >&2
  exit 1
fi

CURRENT_PREFIX="$(npm config get prefix 2>/dev/null || true)"
CURRENT_BIN="$CURRENT_PREFIX/bin"
CURRENT_ROOT="$(npm root -g 2>/dev/null || true)"

if [ -n "$CURRENT_PREFIX" ] && [ -d "$CURRENT_BIN" ] && [ -w "$CURRENT_BIN" ] && [ -d "$CURRENT_ROOT" ] && [ -w "$CURRENT_ROOT" ]; then
  PREFIX="$CURRENT_PREFIX"
fi

if [ "$PREFIX" != "$CURRENT_PREFIX" ]; then
  echo "Configurando npm no diretório do usuário: $PREFIX"
  npm config set prefix "$PREFIX"
fi

BIN_DIR="$PREFIX/bin"
mkdir -p "$BIN_DIR"

PATH_LINE="export PATH=\"$BIN_DIR:\$PATH\""
SHELL_VALUE="${SHELL:-}"
SHELL_NAME="${SHELL_VALUE##*/}"
SHELL_RC="$HOME/.profile"
if [ "$SHELL_NAME" = "zsh" ]; then
  SHELL_RC="${ZDOTDIR:-$HOME}/.zshrc"
elif [ "$SHELL_NAME" = "bash" ]; then
  SHELL_RC="$HOME/.bashrc"
fi

mkdir -p "$(dirname "$SHELL_RC")"
touch "$SHELL_RC"
if ! grep -Fqx "$PATH_LINE" "$SHELL_RC"; then
  printf '\n# Orquestrador Maestro npm bin\n%s\n' "$PATH_LINE" >> "$SHELL_RC"
fi

export PATH="$BIN_DIR:$PATH"
npm install -g "$PACKAGE@$PACKAGE_VERSION" --force --prefer-online
hash -r 2>/dev/null || true

GLOBAL_ROOT="$(npm root -g)"
INSTALLED_VERSION="$(node -p "require('$GLOBAL_ROOT/@iapro/orquestrador-maestro-cli/package.json').version" 2>/dev/null || true)"
if [ -z "$INSTALLED_VERSION" ]; then
  echo "Erro: não foi possível confirmar a instalação da CLI em $PREFIX." >&2
  exit 1
fi
if [ "$INSTALLED_VERSION" != "$PACKAGE_VERSION" ]; then
  echo "Erro: versão instalada $INSTALLED_VERSION; esperada $PACKAGE_VERSION." >&2
  exit 1
fi
echo "Versão instalada: $INSTALLED_VERSION"

echo "Orquestrador instalado em: $(command -v orquestrador-maestro)"
orquestrador-maestro install
orquestrador-maestro verify
echo "Instalação concluída. Abra um novo terminal se o comando não estiver disponível em outra sessão."
