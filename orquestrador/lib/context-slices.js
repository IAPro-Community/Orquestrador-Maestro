"use strict";

/**
 * Fatias de contexto orientadas a snapshot.
 *
 * Um briefing que concatena arquivos do início até esgotar o orçamento entrega o trecho
 * mais ANTIGO de cada documento e omite o mais recente — exatamente o inverso do que um
 * agente precisa para reidratar. Estas funções escolhem a fatia certa de cada arquivo
 * DEV/ com regras determinísticas e devolvem proveniência (estratégia, intervalo de
 * linhas e digests) para o manifesto do briefing.
 *
 * Convenções reconhecidas:
 * - DEV/HANDOFF.md: snapshots em seções `## ...`, o mais recente primeiro.
 * - DEV/SPECS/ACTIVE.md: bloco YAML cercado (contrato `change:` / spec) + seções de
 *   estado/objetivo/aceite.
 * - DEV/CONTEXT.md: seções de estado/restrições/limitações quando existem; caso
 *   contrário, a cauda do arquivo (o estado mais recente costuma estar no fim).
 *
 * Sem dependências externas.
 */

const crypto = require("node:crypto");

const STATE_HEADING_WORDS = [
  "estado", "state", "status", "situacao", "situação",
  "restricoes", "restrições", "constraints", "limitacoes", "limitações", "limitations",
  "riscos", "risks", "bloqueios", "blockers", "proxim", "próxim", "next"
];
const SPEC_HEADING_WORDS = [
  "objetivo", "objective", "goal", "estado", "state", "status",
  "aceite", "acceptance", "verification", "verificacao", "verificação", "escopo", "scope"
];

function sha256(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

function normalizeHeading(value) {
  return String(value || "")
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Divide um markdown em seções por cabeçalho ATX (`#`..`######`), ignorando linhas de
 * cabeçalho dentro de blocos cercados. Devolve intervalos de linha (1-based, inclusivos).
 */
function splitSections(content) {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const sections = [];
  let inFence = false;
  let current = null;
  const close = (endLine) => {
    if (current) {
      current.endLine = endLine;
      current.text = lines.slice(current.startLine - 1, endLine).join("\n").trim();
      sections.push(current);
    }
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
    }
    const match = !inFence && line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (match) {
      close(index);
      current = { level: match[1].length, title: match[2].trim(), startLine: index + 1, endLine: null, text: "" };
    }
  }
  close(lines.length);
  return sections;
}

function preamble(content, firstSection) {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const end = firstSection ? firstSection.startLine - 1 : lines.length;
  return lines.slice(0, end).join("\n").trim();
}

function makeSlice(text, strategy, range, source) {
  const output = String(text || "").trim();
  return {
    text: output,
    strategy,
    range,
    chars: output.length,
    sourceChars: String(source || "").length,
    digest: sha256(output),
    sourceDigest: sha256(String(source || ""))
  };
}

function fullSlice(content, strategy = "full") {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  return makeSlice(content, strategy, { startLine: 1, endLine: lines.length }, content);
}

function extendSectionWithSubsections(content, sections, sectionIndex) {
  const section = sections[sectionIndex];
  let lastIndex = sectionIndex;
  for (let cursor = sectionIndex + 1; cursor < sections.length; cursor += 1) {
    if (sections[cursor].level <= section.level) break;
    lastIndex = cursor;
  }
  const endLine = sections[lastIndex].endLine;
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const text = lines.slice(section.startLine - 1, endLine).join("\n").trim();
  return { ...section, endLine, text, lastIndex };
}

/**
 * HANDOFF: título do documento + PRIMEIRA seção `##` (snapshot mais recente).
 */
function sliceHandoff(content) {
  const allSections = splitSections(content);
  const sections = allSections.filter((section) => section.level === 2);
  if (sections.length === 0) {
    return fullSlice(content, "full (sem seções ##)");
  }
  const first = extendSectionWithSubsections(content, allSections, allSections.indexOf(sections[0]));
  const title = allSections.find((section) => section.level === 1);
  const head = title ? `# ${title.title}\n\n` : "";
  const note = sections.length > 1 ? `\n\n[handoff: ${sections.length - 1} snapshot(s) anteriores omitidos — peça por cabeçalho se precisar]` : "";
  return makeSlice(`${head}${first.text}${note}`, "handoff-first-section", { startLine: first.startLine, endLine: first.endLine }, content);
}

/**
 * ACTIVE spec: cabeçalho, primeiro bloco YAML cercado (contrato) e seções cujo título
 * indica objetivo/estado/aceite/escopo. Seções longas de histórico ficam de fora.
 */
function sliceActiveSpec(content) {
  const text = String(content || "").replace(/\r\n/g, "\n");
  const sections = splitSections(text);
  const parts = [];
  let firstLine = null;
  let lastLine = null;
  const title = sections.find((section) => section.level === 1);
  if (title) {
    parts.push(`# ${title.title}`);
    firstLine = title.startLine;
  }
  const fence = text.match(/^```(?:yaml|yml)?[ \t]*\n([\s\S]*?)^```[ \t]*$/m);
  if (fence) {
    parts.push("```yaml\n" + fence[1].trim() + "\n```");
    const before = text.slice(0, fence.index).split("\n").length;
    firstLine = firstLine === null ? before : Math.min(firstLine, before);
    lastLine = before + fence[0].split("\n").length - 1;
  }
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex];
    if (section.level < 2) continue;
    const heading = normalizeHeading(section.title);
    if (SPEC_HEADING_WORDS.some((word) => heading.includes(normalizeHeading(word)))) {
      const extended = extendSectionWithSubsections(text, sections, sectionIndex);
      parts.push(extended.text);
      firstLine = firstLine === null ? section.startLine : Math.min(firstLine, section.startLine);
      lastLine = lastLine === null ? extended.endLine : Math.max(lastLine, extended.endLine);
      sectionIndex = extended.lastIndex;
    }
  }
  if (parts.length <= (title ? 1 : 0)) {
    return fullSlice(content, "full (spec sem contrato/estado reconhecível)");
  }
  const lines = text.split("\n").length;
  return makeSlice(parts.join("\n\n"), "spec-contract-and-state", { startLine: firstLine || 1, endLine: lastLine || lines }, content);
}

/**
 * CONTEXT: seções de estado/restrições/limitações/riscos quando existem; senão a cauda
 * do arquivo (fração `tailRatio`), porque o estado mais recente costuma estar no fim.
 */
function sliceContext(content, tailRatio = 0.4) {
  const text = String(content || "").replace(/\r\n/g, "\n");
  const sections = splitSections(text);
  const title = sections.find((section) => section.level === 1);
  const stateSections = [];
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    if (section.level < 2 || !STATE_HEADING_WORDS.some((word) => normalizeHeading(section.title).includes(normalizeHeading(word)))) continue;
    const extended = extendSectionWithSubsections(text, sections, index);
    stateSections.push(extended);
    index = extended.lastIndex;
  }
  if (stateSections.length > 0) {
    const head = title ? `# ${title.title}\n\n` : "";
    const body = stateSections.map((section) => section.text).join("\n\n");
    return makeSlice(`${head}${body}`, "context-state-sections", {
      startLine: stateSections[0].startLine,
      endLine: stateSections[stateSections.length - 1].endLine
    }, content);
  }
  const lines = text.split("\n");
  const keep = Math.max(1, Math.round(lines.length * tailRatio));
  const startLine = lines.length - keep + 1;
  const head = title && title.startLine < startLine ? `# ${title.title}\n\n[contexto: ${startLine - 1} linhas anteriores omitidas]\n\n` : "";
  return makeSlice(`${head}${lines.slice(startLine - 1).join("\n")}`, "context-tail", { startLine, endLine: lines.length }, content);
}

/**
 * Extrai UMA seção por cabeçalho (qualquer nível). `query` casa por prefixo ou por
 * conteúdo do título, sem acentos e sem diferenciar maiúsculas (ex.: "D11" casa
 * "### D11 — Esta ADR não autoriza…"). A seção inclui subseções de nível inferior.
 */
function extractSectionByHeading(content, query) {
  const wanted = normalizeHeading(query);
  if (!wanted) return null;
  const sections = splitSections(content);
  const index = sections.findIndex((section) => {
    const title = normalizeHeading(section.title);
    return title === wanted || title.startsWith(`${wanted} `) || title.startsWith(`${wanted}—`) || title.startsWith(`${wanted} —`) || title.startsWith(`${wanted}:`) || title.includes(wanted);
  });
  if (index === -1) return null;
  const head = sections[index];
  const extended = extendSectionWithSubsections(content, sections, index);
  const endLine = extended.endLine;
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const text = lines.slice(head.startLine - 1, endLine).join("\n").trim();
  return { heading: head.title, level: head.level, range: { startLine: head.startLine, endLine }, text, chars: text.length, digest: sha256(text) };
}

/**
 * Lê o contrato `change:` de uma spec no formato PUE-UH (YAML cercado, sem parser YAML):
 * chaves conhecidas por indentação. Devolve null quando não há bloco `change:`.
 */
function parsePueChange(specContent) {
  const text = String(specContent || "").replace(/\r\n/g, "\n");
  const fence = text.match(/^```(?:yaml|yml)?[ \t]*\n([\s\S]*?)^```[ \t]*$/m);
  const yaml = fence ? fence[1] : text;
  if (!/^change:\s*$/m.test(yaml)) return null;
  const lines = yaml.split("\n");
  const pick = (pathKeys) => {
    let depth = 0;
    let matched = 0;
    for (const raw of lines) {
      if (!raw.trim() || raw.trim().startsWith("#")) continue;
      const indent = raw.match(/^\s*/)[0].length;
      const match = raw.match(/^\s*([A-Za-z_][\w-]*):\s*(.*)$/);
      if (!match) continue;
      const [, key, value] = match;
      if (matched < pathKeys.length && key === pathKeys[matched] && (matched === 0 ? indent === 0 : indent > depth)) {
        matched += 1;
        depth = indent;
        if (matched === pathKeys.length) {
          return value.replace(/^["']|["']$/g, "").replace(/\s+#.*$/, "").trim();
        }
        continue;
      }
      if (matched > 0 && indent <= depth && matched < pathKeys.length) {
        matched = 0;
        depth = 0;
        if (key === pathKeys[0] && indent === 0) {
          matched = 1;
        }
      }
    }
    return "";
  };
  return {
    id: pick(["change", "id"]),
    declaredClass: pick(["change", "declared_class"]),
    architectureStatus: pick(["architecture", "status"]),
    authorizationStatus: pick(["implementation_authorization", "status"])
  };
}

module.exports = {
  extractSectionByHeading,
  fullSlice,
  parsePueChange,
  sha256,
  sliceActiveSpec,
  sliceContext,
  sliceHandoff,
  splitSections
};
