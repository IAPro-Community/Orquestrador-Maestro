from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path("docs/assets")
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1440, 810
BG_TOP = (9, 13, 19)
BG_BOTTOM = (14, 19, 28)
PANEL = "#111827"
PANEL_SOFT = "#16202b"
MAIN = "#1b2938"
MAIN_EDGE = "#36516a"
LINE = "#314155"
TEXT = "#f8fafc"
MUTED = "#aab4c0"
DIM = "#64748b"
BLUE = "#38bdf8"
GREEN = "#22c55e"
AMBER = "#f59e0b"
VIOLET = "#a78bfa"
RED = "#fb7185"

FONT_CANDIDATES = {
    "regular": ["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf"],
    "semibold": ["C:/Windows/Fonts/seguisb.ttf", "C:/Windows/Fonts/arialbd.ttf"],
    "bold": ["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf"],
    "mono": ["C:/Windows/Fonts/consola.ttf", "C:/Windows/Fonts/cour.ttf"],
}


def font(kind, size):
    for candidate in FONT_CANDIDATES[kind]:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


F_LOGO = font("semibold", 22)
F_TITLE = font("bold", 48)
F_SUB = font("regular", 23)
F_SIDE = font("semibold", 21)
F_SIDE_SMALL = font("regular", 15)
F_NUM = font("bold", 42)
F_CARD_TITLE = font("bold", 38)
F_BODY = font("regular", 23)
F_CHIP = font("semibold", 18)
F_MONO = font("mono", 20)
F_NOTE = font("regular", 19)
F_SMALL = font("regular", 16)


def text_width(draw, text, text_font):
    box = draw.textbbox((0, 0), text, font=text_font)
    return box[2] - box[0]


def wrap_text(draw, text, text_font, max_width, max_lines=None):
    lines = []
    for paragraph in text.split("\n"):
        words = paragraph.split(" ")
        line = ""
        for word in words:
            candidate = word if not line else f"{line} {word}"
            if text_width(draw, candidate, text_font) <= max_width:
                line = candidate
            else:
                if line:
                    lines.append(line)
                    if max_lines and len(lines) >= max_lines:
                        return lines
                line = word
        if line:
            lines.append(line)
            if max_lines and len(lines) >= max_lines:
                return lines
    return lines


def draw_text_block(draw, x, y, text, text_font, fill, max_width, line_gap=8, max_lines=None):
    for line in wrap_text(draw, text, text_font, max_width, max_lines):
        draw.text((x, y), line, font=text_font, fill=fill)
        y += text_font.size + line_gap
    return y


def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def gradient_background(image):
    draw = ImageDraw.Draw(image)
    for y in range(H):
        ratio = y / max(H - 1, 1)
        color = tuple(int(BG_TOP[i] * (1 - ratio) + BG_BOTTOM[i] * ratio) for i in range(3))
        draw.line((0, y, W, y), fill=color)
    for x in range(0, W, 80):
        draw.line((x, 0, x, H), fill="#101722", width=1)
    for y in range(0, H, 80):
        draw.line((0, y, W, y), fill="#101722", width=1)


def draw_chip(draw, x, y, label, color):
    width = text_width(draw, label, F_CHIP) + 32
    rounded(draw, (x, y, x + width, y + 38), 19, "#0c141d", color, 2)
    draw.text((x + 16, y + 8), label, font=F_CHIP, fill=color)
    return x + width + 12


def draw_code_box(draw, x, y, code, max_width):
    lines = wrap_text(draw, code, F_MONO, max_width - 36)
    height = 44 + max(0, len(lines) - 1) * 28
    rounded(draw, (x, y, x + max_width, y + height), 10, "#070b10", "#273447", 1)
    yy = y + 12
    for line in lines:
        draw.text((x + 18, yy), line, font=F_MONO, fill=AMBER)
        yy += 28
    return y + height


def draw_header(draw, title, subtitle):
    rounded(draw, (64, 46, 304, 88), 21, "#0c1620", BLUE, 2)
    draw.text((86, 56), "Orquestrador Maestro", font=F_LOGO, fill=TEXT)
    rounded(draw, (1164, 46, 1350, 88), 21, "#0d1f18", GREEN, 2)
    draw.text((1194, 56), "público seguro", font=F_LOGO, fill=GREEN)
    draw.text((64, 116), title, font=F_TITLE, fill=TEXT)
    draw.text((66, 176), subtitle, font=F_SUB, fill=MUTED)


def draw_sidebar(draw, steps, active):
    rounded(draw, (48, 220, 392, 730), 18, "#0c121a", "#1f2a38", 1)
    draw.text((80, 250), "Fluxo", font=F_LOGO, fill=MUTED)

    for index, step in enumerate(steps):
        y = 306 + index * 78
        is_active = index == active
        is_done = index < active
        color = BLUE if is_active else (GREEN if is_done else DIM)

        if is_active:
            rounded(draw, (74, y - 12, 362, y + 54), 14, "#112435", BLUE, 2)

        draw.ellipse((88, y, 126, y + 38), outline=color, width=3, fill="#071018")
        draw.text((107, y + 8), str(index + 1), font=F_SMALL, fill=color, anchor="mm")
        draw.text((140, y - 1), step["short"], font=F_SIDE, fill=TEXT if is_active else MUTED)
        draw.text((140, y + 27), step["micro"], font=F_SIDE_SMALL, fill=color if is_active else DIM)

        if index < len(steps) - 1:
            draw.line((107, y + 42, 107, y + 66), fill=GREEN if is_done else "#263241", width=3)


def draw_flow_strip(draw, steps, active):
    x0, y, gap = 488, 650, 130
    draw.text((488, 616), "Resumo do caminho", font=F_SMALL, fill=DIM)

    for index, step in enumerate(steps):
        x = x0 + index * gap
        color = BLUE if index == active else (GREEN if index < active else DIM)
        draw.ellipse((x, y, x + 42, y + 42), fill="#071018", outline=color, width=3)
        draw.text((x + 21, y + 10), str(index + 1), font=F_SMALL, fill=color, anchor="mm")
        draw.text((x - 18, y + 52), step["short"], font=F_SMALL, fill=color)
        if index < len(steps) - 1:
            draw.line((x + 46, y + 21, x + gap - 8, y + 21), fill=GREEN if index < active else "#263241", width=3)


def draw_main_card(draw, steps, active):
    step = steps[active]
    panel = (440, 236, 1368, 590)
    rounded(draw, panel, 24, MAIN, MAIN_EDGE, 2)

    draw.ellipse((486, 282, 574, 370), fill="#071018", outline=BLUE, width=4)
    draw.text((530, 299), str(active + 1), font=F_NUM, fill=BLUE, anchor="mm")
    draw.text((604, 282), step["title"], font=F_CARD_TITLE, fill=TEXT)

    body_bottom = draw_text_block(draw, 606, 342, step["body"], F_BODY, MUTED, 690, 9, max_lines=3)
    chip_y = body_bottom + 18
    x = 606
    for label, color in step["chips"]:
        x = draw_chip(draw, x, chip_y, label, color)

    command_y = chip_y + 58
    if step.get("command"):
        draw_code_box(draw, 606, command_y, step["command"], 700)

    result_box = (486, 522, 1298, 562)
    rounded(draw, result_box, 12, "#0c121a", "#263241", 1)
    draw.text((508, 531), "Resultado:", font=F_CHIP, fill=GREEN)
    draw.text((612, 531), step["result"], font=F_NOTE, fill=TEXT)

    draw_flow_strip(draw, steps, active)


def render_gif(filename, title, subtitle, steps):
    frames = []
    for active in range(len(steps)):
        image = Image.new("RGB", (W, H), BG_TOP)
        gradient_background(image)
        draw = ImageDraw.Draw(image)
        draw_header(draw, title, subtitle)
        draw_sidebar(draw, steps, active)
        draw_main_card(draw, steps, active)
        frames.append(image)

    path = OUT / filename
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=1250, loop=0, optimize=True)
    return path


INSTALL_STEPS = [
    {
        "short": "npm",
        "micro": "baixar CLI",
        "title": "Instalar a CLI pública",
        "body": "O usuário instala uma CLI versionada com o snapshot público e pronto para Windows, Linux e macOS.",
        "chips": [("npm", BLUE), ("multiplataforma", GREEN), ("sem dados locais", AMBER)],
        "command": "npm install -g @iapro/orquestrador-maestro-cli",
        "result": "comando global orquestrador-maestro disponível",
    },
    {
        "short": "install",
        "micro": "copiar base",
        "title": "Aplicar no home do usuário",
        "body": "O instalador copia regras, skills, hooks e perfis para as pastas corretas do usuário atual.",
        "chips": [("%USERPROFILE%", BLUE), ("$HOME", GREEN), ("backup automático", AMBER)],
        "command": "orquestrador-maestro install",
        "result": "hierarquia criada sem editar caminhos manualmente",
    },
    {
        "short": "entrypoints",
        "micro": "ferramentas",
        "title": "Conectar as ferramentas de IA",
        "body": "Codex, Claude, Cursor, OpenCode, Gemini, Windsurf e Antigravity passam a ler o mesmo contrato.",
        "chips": [("AGENTS.md", BLUE), ("tool profiles", VIOLET), ("hooks", GREEN)],
        "command": "orquestrador-maestro list-targets",
        "result": "diferentes ferramentas de IA encontram o Orquestrador por padrão",
    },
    {
        "short": "verify",
        "micro": "validar",
        "title": "Verificar a instalação",
        "body": "A verificação confirma arquivos, diretórios, skills e perfis esperados com saída segura.",
        "chips": [("checagem local", BLUE), ("saída segura", GREEN), ("sem segredo", AMBER)],
        "command": "orquestrador-maestro verify",
        "result": "instalação auditável antes do uso diário",
    },
    {
        "short": "uso",
        "micro": "rodar tarefas",
        "title": "Usar no projeto real",
        "body": "A IA lê o Orquestrador, aplica a hierarquia e usa DEV como memória operacional local.",
        "chips": [("Maestro", BLUE), ("Orquestrador", GREEN), ("DEV", VIOLET)],
        "command": "Leia o AGENTS.md global e aplique o Orquestrador Maestro.",
        "result": "menos repetição, menos tokens e mais consistência",
    },
]

RUNTIME_STEPS = [
    {
        "short": "pedido",
        "micro": "objetivo",
        "title": "O Maestro define a intenção",
        "body": "A tarefa começa com objetivo, limite e autorização. O processo não precisa ser reinventado.",
        "chips": [("escopo", BLUE), ("autorização", GREEN), ("clareza", AMBER)],
        "command": None,
        "result": "a IA entende o que deve resolver e o que não deve tocar",
    },
    {
        "short": "hierarquia",
        "micro": "leitura",
        "title": "Ler em camadas",
        "body": "A IA lê rules, maestro, AGENTS do usuário, AGENTS do projeto e documentos DEV necessários.",
        "chips": [("rules", BLUE), ("AGENTS", GREEN), ("DEV", VIOLET)],
        "command": "rules -> maestro -> AGENTS -> projeto -> DEV",
        "result": "contexto pequeno antes de abrir arquivos longos",
    },
    {
        "short": "skills",
        "micro": "rotear",
        "title": "Escolher a skill mínima",
        "body": "Aliases, router, chains e perfis indicam a skill certa sem carregar a biblioteca inteira.",
        "chips": [("router", BLUE), ("profiles", GREEN), ("token budget", AMBER)],
        "command": "SKILLS_ROUTER.json + SKILL_EXECUTION_PROFILES.json",
        "result": "a IA gasta contexto no que realmente importa",
    },
    {
        "short": "hooks",
        "micro": "executar",
        "title": "Executar com guardrails",
        "body": "Hooks orientam verificação, segurança, documentação, multiagentes e atualização de memória.",
        "chips": [("verificar", GREEN), ("documentar", BLUE), ("segurança", RED)],
        "command": "hooks.md + PROJECT_DEV_HIERARCHY.md",
        "result": "execução previsível em diferentes ferramentas",
    },
    {
        "short": "worklog",
        "micro": "memória",
        "title": "Registrar o que importa",
        "body": "O resumo final vai para DEV/WORKLOG.md com mudança, motivo, verificação e próximo contexto.",
        "chips": [("WORKLOG", BLUE), ("handoff", GREEN), ("menos tokens", AMBER)],
        "command": "DEV/WORKLOG.md",
        "result": "a próxima IA retoma sem reexplorar tudo",
    },
]

UPDATE_STEPS = [
    {
        "short": "fonte",
        "micro": "evoluir",
        "title": "Evoluir a fonte local",
        "body": "O mantenedor melhora regras, skills e perfis na hierarquia local sem expor memória privada.",
        "chips": [("fonte local", BLUE), ("privado", RED), ("compatível", GREEN)],
        "command": "~/.orquestrador",
        "result": "a evolução nasce no ambiente real sem expor dados locais",
    },
    {
        "short": "sync",
        "micro": "sanitizar",
        "title": "Exportar e sanitizar",
        "body": "O repositório recebe uma cópia pública filtrada contra logs, tokens, caches e caminhos reais.",
        "chips": [("sync", BLUE), ("validate", GREEN), ("privacy", AMBER)],
        "command": "sync-from-local -> validate-public",
        "result": "snapshot revisável e seguro antes do commit",
    },
    {
        "short": "changelog",
        "micro": "explicar",
        "title": "Versionar e explicar",
        "body": "Cada mudança relevante recebe versão, tipo de alteração, impacto e instrução de migração.",
        "chips": [("Added", GREEN), ("Changed", BLUE), ("Security", RED)],
        "command": "README.md / Changelog",
        "result": "quem instala entende o que mudou antes de atualizar",
    },
    {
        "short": "publicar",
        "micro": "GitHub/npm",
        "title": "Publicar nos canais certos",
        "body": "O GitHub guarda código e documentação. O npm entrega a CLI para instalação global.",
        "chips": [("GitHub", BLUE), ("npm", RED), ("release", GREEN)],
        "command": "git push + npm publish --access public",
        "result": "documentação e pacote ficam alinhados",
    },
    {
        "short": "update",
        "micro": "usuário",
        "title": "Atualizar a máquina do usuário",
        "body": "Quem já usa atualiza a CLI, reaplica entrypoints e roda verificação para confirmar a versão.",
        "chips": [("update", BLUE), ("verify", GREEN), ("backup", AMBER)],
        "command": "npm update -g @iapro/orquestrador-maestro-cli\norquestrador-maestro update\norquestrador-maestro verify",
        "result": "ambiente local recebe a versão nova com backups",
    },
]


def main():
    outputs = [
        render_gif(
            "install-flow.gif",
            "Instalação portátil",
            "Do npm ao home do usuário, com paths portáveis e verificação local.",
            INSTALL_STEPS,
        ),
        render_gif(
            "runtime-flow.gif",
            "Funcionamento da orquestração",
            "Hierarquia, roteamento de skills, hooks e memória DEV trabalhando juntos.",
            RUNTIME_STEPS,
        ),
        render_gif(
            "update-flow.gif",
            "Atualização segura",
            "Da fonte local ao GitHub/npm, com sanitização, changelog e update do usuário.",
            UPDATE_STEPS,
        ),
    ]

    for path in outputs:
        print(f"{path.as_posix()} {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
