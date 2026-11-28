"use strict";

// Bridge/telemetry/changelog/version/desktop/route extracted verbatim.

const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");
const {
  path, rootDir, packageJson, parseRuntimeArgs, createRuntimeApplication,
  createBridge, createStdioServer,
  resolveMaestroRoot, hasV3SkillManifest, Memory,
  telemetryTimeoutMs, telemetryConsentVersion, defaultTelemetryProvider,
  defaultTelemetryEndpointUrl, getArg, normalizeArgs,
  getPublishedNpmVersion, compareVersions,
  loadGovernanceConfig
} = require("../shared-context");

async function handleBridgeCommand(args) {
  const hasStdio = args.includes("--stdio");
  const withWorker = args.includes("--with-worker");
  const options = parseRuntimeArgs(
    args.filter((arg) => arg !== "--stdio" && arg !== "--with-worker"), ["--project-path"]);
  if (!hasStdio || options.values.length !== 0) throw new Error("Uso: maestro bridge --stdio [--with-worker] [--project-path PATH]");
  const app = await createRuntimeApplication(options.projectPath);
  // Admission is durable independently of a worker; --with-worker adds an
  // in-process consumer. Without it submissions remain PENDING_WORKER.
  const worker = withWorker
    ? require(path.join(rootDir, "runtime", "runs", "submission-worker")).createSubmissionWorker({
        application: app, store: app.store, projectRoot: path.resolve(options.projectPath),
        workerId: "worker-" + crypto.randomUUID().replace(/-/g, "").slice(0, 16),
        onError: (event) => console.error(JSON.stringify({ type: "worker.error", ...event }))
      })
    : null;
  const bridge = createBridge({ projectRoot: options.projectPath, services: {
    projectInspector: { inspect: (params) => app.inspectProject(params) },
    skillRegistry: app.skills,
    providerRegistry: { list: () => app.listProviders() },
    runStore: {
      listRuns: (filters) => app.listRuns(filters),
      getRun: (id) => app.getRun(id),
      listArtifacts: (filters) => app.listArtifacts(filters),
      getArtifact: (id) => app.getArtifact(id),
      getVerification: (runId) => app.getVerification(runId),
      // Scoped Bridge observers need the real persisted submission ledger.
      // Expose only narrowly delegated methods; never provide a second
      // scheduler, approval verifier, or executor through this adapter.
      listProjects: () => app.store.listProjects(),
      getProject: (id) => app.store.getProject(id),
      listRunSubmissions: (filters) => app.store.listRunSubmissions(filters),
      getRunSubmission: (id) => app.store.getRunSubmission(id),
      requestRunSubmissionCancellation: (id) => app.store.requestRunSubmissionCancellation(id),
      // Durable admission contract (runs.submit) is delegated verbatim to the
      // same canonical store; validation stays inside the admission modules.
      putExecutableManifest: (input) => app.store.putExecutableManifest(input),
      getExecutableManifest: (id) => app.store.getExecutableManifest(id),
      saveApprovalReceipt: (receipt) => app.store.saveApprovalReceipt(receipt),
      getApprovalReceipt: (id) => app.store.getApprovalReceipt(id),
      saveTask: (task) => app.store.saveTask(task),
      getTask: (id) => app.store.getTask(id),
      listTasks: (filters) => app.store.listTasks(filters),
      admitRunSubmission: (input) => app.store.admitRunSubmission(input)
    },
    runtime: app,
    worker
  } });
  const server = createStdioServer(bridge);
  let workerFailure = null;
  const workerTask = worker?.run().catch((error) => {
    workerFailure = error;
    server.close();
  });
  const shutdown = () => server.close();
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  try {
    await server.done;
  } finally {
    process.removeListener("SIGINT", shutdown);
    process.removeListener("SIGTERM", shutdown);
    if (worker) await worker.stop();
    await workerTask;
  }
  if (workerFailure) throw new Error("Embedded worker stopped unexpectedly; inspect the worker diagnostics.");
  return 0;
}

function getTelemetryConfigPath() {
  if (process.platform === "win32") {
    const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(base, "OrquestradorMaestro", "telemetry.json");
  }

  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "orquestrador-maestro", "telemetry.json");
}

function defaultTelemetryEndpoint() {
  return process.env.ORQUESTRADOR_MAESTRO_TELEMETRY_ENDPOINT ||
    (packageJson.config && packageJson.config.telemetryEndpoint) ||
    defaultTelemetryEndpointUrl;
}

function defaultTelemetryConfig() {
  return {
    enabled: false,
    provider: defaultTelemetryProvider,
    endpoint: defaultTelemetryEndpoint(),
    anonymousId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    consentVersion: telemetryConsentVersion
  };
}

function normalizeTelemetryConfig(config) {
  const rawConfig = config && typeof config === "object" ? config : {};
  const hasCurrentConsent = rawConfig.consentVersion === telemetryConsentVersion;

  return {
    ...defaultTelemetryConfig(),
    ...rawConfig,
    enabled: hasCurrentConsent && rawConfig.enabled !== false,
    provider: rawConfig.provider || defaultTelemetryProvider,
    endpoint: rawConfig.endpoint || defaultTelemetryEndpoint(),
    consentVersion: hasCurrentConsent ? telemetryConsentVersion : (rawConfig.consentVersion || 0)
  };
}

/**
 * Read telemetry config from disk. If the file doesn't exist, creates it with defaults.
 * Side effect: writes default config to disk when first called.
 */
function readTelemetryConfig() {
  const configPath = getTelemetryConfigPath();
  if (!fs.existsSync(configPath)) {
    const config = defaultTelemetryConfig();
    writeTelemetryConfig(config);
    return config;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return normalizeTelemetryConfig(config);
  } catch {
    return defaultTelemetryConfig();
  }
}

function writeTelemetryConfig(config) {
  const configPath = getTelemetryConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function telemetryDisabledByEnv() {
  const value = String(process.env.ORQUESTRADOR_MAESTRO_TELEMETRY || "").toLowerCase();
  return value === "0" || value === "false" || value === "off" || value === "disabled";
}

function validateTelemetryEndpoint(endpoint) {
  if (!endpoint) {
    return "";
  }

  const url = new URL(endpoint);
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  const isPostHog = url.hostname === "eu.i.posthog.com" || url.hostname === "us.i.posthog.com";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost)) {
    throw new Error("Endpoint de telemetria deve usar HTTPS, exceto localhost para desenvolvimento.");
  }
  if (!isLocalhost && !isPostHog) {
    throw new Error("A telemetria usa somente endpoints oficiais do PostHog ou localhost para testes.");
  }
  return url.toString();
}

function endpointLabel(endpoint) {
  if (!endpoint) {
    return "[not configured]";
  }
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "[invalid]";
  }
}

function sanitizeFlags(args) {
  const normalized = normalizeArgs(args);
  const flags = [];
  for (const arg of normalized) {
    if (arg.startsWith("--")) {
      flags.push(arg);
    }
  }
  return Array.from(new Set(flags)).sort();
}

function readBundledFile(relativePath) {
  const filePath = path.join(rootDir, relativePath);
  if (!commandExists(filePath)) {
    throw new Error(`Arquivo nao encontrado no pacote: ${relativePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function extractMarkdownSections(markdown, limit) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const header = lines[0] && lines[0].startsWith("# ") ? lines[0] : "";
  const body = header ? lines.slice(1) : lines;
  const captured = [];
  let sectionCount = 0;
  let capturing = false;

  for (const line of body) {
    if (line.startsWith("## ")) {
      if (capturing && sectionCount >= limit) {
        break;
      }
      sectionCount += 1;
      capturing = sectionCount <= limit;
    }
    if (capturing) {
      captured.push(line);
    }
  }

  return [header, captured.join("\n").trim()].filter(Boolean).join("\n\n").trim();
}

function buildTelemetryPayload(command, args, exitCode, errorName) {
  const config = readTelemetryConfig();
  return {
    schemaVersion: 1,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    event: "cli_command",
    command,
    flags: sanitizeFlags(args),
    exitCode,
    success: exitCode === 0,
    errorCategory: errorName ? normalizeTelemetryError(errorName) : null,
    platform: process.platform,
    arch: process.arch,
    nodeMajor: Number(process.versions.node.split(".")[0]),
    anonymousId: config.anonymousId,
    date: new Date().toISOString().slice(0, 10)
  };
}

function normalizeTelemetryError(errorName) {
  const knownCategories = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "AbortError"]);
  return knownCategories.has(errorName) ? errorName : "unknown";
}

function postTelemetry(endpoint, payload) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(endpoint);
    } catch {
      resolve({ sent: false, reason: "invalid-endpoint" });
      return;
    }

    const body = JSON.stringify(payload);
    const transport = url.protocol === "http:" ? http : https;
    const request = transport.request({
      method: "POST",
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "user-agent": `${packageJson.name}/${packageJson.version}`
      },
      timeout: telemetryTimeoutMs
    }, (response) => {
      response.resume();
      response.on("end", () => {
        resolve({
          sent: response.statusCode >= 200 && response.statusCode < 300,
          reason: `http-${response.statusCode}`
        });
      });
    });

    request.on("timeout", () => {
      request.destroy();
      resolve({ sent: false, reason: "timeout" });
    });
    request.on("error", (error) => {
      resolve({ sent: false, reason: error.code || "request-error" });
    });
    request.end(body);
  });
}

async function sendTelemetry(payload) {
  if (telemetryDisabledByEnv()) {
    return { sent: false, reason: "disabled-by-env" };
  }

  const config = readTelemetryConfig();
  if (!config.enabled) {
    return { sent: false, reason: "disabled" };
  }

  let endpoint;
  try {
    endpoint = validateTelemetryEndpoint(config.endpoint || defaultTelemetryEndpoint());
  } catch {
    return { sent: false, reason: "invalid-endpoint" };
  }

  if (!endpoint) return { sent: false, reason: "no-endpoint" };

  const projectKey = process.env.ORQUESTRADOR_MAESTRO_TELEMETRY_API_KEY ||
    (packageJson.config && packageJson.config.telemetryProjectKey) || "";
  if (!projectKey) return { sent: false, reason: "no-provider-key" };

  writeTelemetryConfig({ ...config, endpoint });
  const result = await postTelemetry(endpoint, {
    api_key: projectKey,
    ip: false,
    event: payload.event,
    distinct_id: payload.anonymousId,
    properties: {
      schemaVersion: payload.schemaVersion,
      packageName: payload.packageName,
      packageVersion: payload.packageVersion,
      command: payload.command,
      flags: payload.flags,
      exitCode: payload.exitCode,
      success: payload.success,
      errorCategory: payload.errorCategory,
      platform: payload.platform,
      arch: payload.arch,
      nodeMajor: payload.nodeMajor,
      date: payload.date,
      $process_person_profile: false
    },
    timestamp: `${payload.date}T00:00:00.000Z`
  });
  if (!result.sent && process.env.ORQUESTRADOR_MAESTRO_TELEMETRY_DEBUG) {
    console.error(`Telemetry skipped: ${result.reason}`);
  }
  return result;
}

function printTelemetryStatus() {
  const config = readTelemetryConfig();
  const envDisabled = telemetryDisabledByEnv();
  const endpoint = config.endpoint || defaultTelemetryEndpoint();
  const hasProviderKey = Boolean(process.env.ORQUESTRADOR_MAESTRO_TELEMETRY_API_KEY ||
    (packageJson.config && packageJson.config.telemetryProjectKey));
  let status = "desabilitada";
  if (config.enabled && !envDisabled && endpoint && hasProviderKey) {
    status = "habilitada e enviando";
  } else if (config.enabled && !envDisabled) {
    status = "habilitada, aguardando configuração do provedor";
  }

  console.log(`Telemetria: ${status}

Endpoint: ${endpointLabel(endpoint)}
Provedor: PostHog (US Cloud)
Finalidade: medir adoção e uso técnico por instalação anônima

Payload permitido:
  - comando executado
  - flags sem valores
  - versao do pacote
  - plataforma, arquitetura e versao major do Node.js
  - exit code e sucesso/falha
  - identificador anonimo aleatorio

Nunca coletar:
  - telefone
  - nome de usuario
  - caminho local
  - conteudo de projeto
  - tokens, prompts, logs ou nomes de arquivos privados

Para desabilitar:
  orquestrador-maestro telemetry disable
  ORQUESTRADOR_MAESTRO_TELEMETRY=0 orquestrador-maestro install

Para habilitar:
  orquestrador-maestro telemetry enable`);
}

function parseTelemetryEndpoint(args) {
  const normalized = normalizeArgs(args);
  const index = normalized.indexOf("--endpoint");
  if (index === -1) {
    return "";
  }
  const endpoint = normalized[index + 1];
  if (!endpoint || endpoint.startsWith("--")) {
    throw new Error("Parametro --endpoint exige uma URL.");
  }
  return validateTelemetryEndpoint(endpoint);
}

async function handleTelemetryCommand(args) {
  const [subcommand = "status", ...rest] = args;
  const config = readTelemetryConfig();

  if (subcommand === "status") {
    printTelemetryStatus();
    return 0;
  }

  if (subcommand === "enable") {
    const endpoint = parseTelemetryEndpoint(rest) || config.endpoint || defaultTelemetryEndpoint();
    writeTelemetryConfig({
      ...config,
      enabled: true,
      endpoint,
      consentVersion: telemetryConsentVersion,
      consentedAt: new Date().toISOString()
    });
    console.log("Telemetria habilitada.");
    if (!endpoint) {
      console.log("Nenhum endpoint configurado. Use: orquestrador-maestro telemetry endpoint <url>");
    }
    return 0;
  }

  if (subcommand === "disable") {
    writeTelemetryConfig({ ...config, enabled: false });
    console.log("Telemetria desabilitada.");
    return 0;
  }

  if (subcommand === "endpoint") {
    const endpoint = validateTelemetryEndpoint(rest[0] || "");
    if (!endpoint) {
      throw new Error("Informe a URL do endpoint.");
    }
    writeTelemetryConfig({ ...config, endpoint });
    console.log(`Endpoint de telemetria atualizado: ${endpointLabel(endpoint)}`);
    return 0;
  }

  if (subcommand === "test") {
    const payload = buildTelemetryPayload("telemetry:test", rest, 0, null);
    const result = await sendTelemetry({ ...payload, event: "telemetry_test" });
    console.log(result.sent ? "Evento de teste enviado." : `Evento de teste nao enviado: ${result.reason}`);
    return result.sent ? 0 : 1;
  }

  throw new Error(`Subcomando de telemetria desconhecido: ${subcommand}`);
}

function handleChangelogCommand(args) {
  const normalized = normalizeArgs(args);
  for (const arg of normalized) {
    if (arg !== "--full") {
      throw new Error(`Parametro desconhecido: ${arg}`);
    }
  }

  const changelog = readBundledFile("CHANGELOG.md");
  const shouldPrintFull = normalized.includes("--full");
  const excerpt = shouldPrintFull ? changelog.trim() : extractMarkdownSections(changelog, 2);

  console.log(excerpt);
  console.log(`
Fluxo recomendado para quem ja tem o Orquestrador instalado:
  orquestrador-maestro update
  orquestrador-maestro verify
  orquestrador-maestro doctor`);

  if (process.platform !== "win32") {
    console.log("Obs.: em Linux/macOS, doctor usa o verificador Unix quando PowerShell não está disponível.");
  }

  return 0;
}

function handleVersionCommand(args) {
  const normalized = normalizeArgs(args);
  if (normalized.length === 0) {
    console.log(packageJson.version);
    return 0;
  }
  if (normalized.length !== 1 || normalized[0] !== "--check") {
    throw new Error(`Parametro desconhecido: ${normalized.join(" ")}`);
  }

  let published;
  try {
    published = getPublishedNpmVersion();
  } catch (error) {
    console.error(`Não foi possível verificar atualizações: ${error.message}`);
    return 1;
  }

  console.log(`Versão instalada: ${packageJson.version}`);
  if (published.exact) {
    console.log(`Versão publicada no npm (consulta exata): ${published.version}`);
    console.log(`Canal ${published.unavailableChannel} ainda não publicado no npm; exibindo a versão exata.`);
  } else {
    console.log(`Versão publicada no canal ${published.channel}: ${published.version}`);
    if (published.unavailableChannel) console.log(`Canal ${published.unavailableChannel} ainda não publicado no npm; exibindo o canal ${published.channel}.`);
  }
  const comparison = compareVersions(packageJson.version, published.version);
  const channel = published.channel;
  if (comparison < 0) {
    console.log(`Atualização disponível: npm install -g ${packageJson.name}@${channel} --force --prefer-online`);
  } else if (comparison > 0) {
    console.log(`A instalação local é mais nova que o canal ${published.channel} publicado no npm.`);
  } else if (published.exact) {
    console.log("A versão instalada existe no npm, mas o canal de atualização ainda não está disponível.");
  } else {
    console.log("A CLI já está atualizada.");
  }
  return 0;
}

function handleDesktopPluginCommand(args) {
  const [subcommand = "status", ...rest] = args;
  const options = parseRuntimeArgs(rest, ["--home-path", "--plugin-data", "--session-id"]);
  const supported = ["install", "status", "doctor", "stats", "remove"];
  if (options.values.length || !supported.includes(subcommand)) {
    throw new Error("Uso: orquestrador-maestro desktop-plugin <install|status|doctor|stats|remove> [--home-path PATH] [--plugin-data PATH] [--session-id ID]");
  }
  if (subcommand !== "stats" && (options.pluginData || options.sessionId)) {
    throw new Error("--plugin-data e --session-id são opções exclusivas de desktop-plugin stats");
  }
  const integration = require(path.join(rootDir, "runtime", "integrations", "openai"));
  const common = { home: options.homePath ? path.resolve(options.homePath) : os.homedir(), packageRoot: rootDir };
  let result;
  if (subcommand === "install") result = integration.installDesktopPlugin(common);
  else if (subcommand === "remove") result = integration.removeDesktopPlugin(common);
  else if (subcommand === "doctor") result = integration.desktopPluginDoctor(common);
  else if (subcommand === "stats") {
    result = integration.desktopPluginStats({
      pluginData: options.pluginData ? path.resolve(options.pluginData) : process.env.PLUGIN_DATA || null,
      sessionId: options.sessionId || null
    });
  } else result = integration.desktopPluginStatus(common);
  console.log(JSON.stringify(result, null, 2));
  return result?.healthy === false ? 1 : 0;
}

async function handleDesktopMcpCommand(args) {
  if (args.length !== 0) throw new Error("Uso interno: orquestrador-maestro desktop-mcp");
  const { startMcpServer } = require(path.join(rootDir, "runtime", "integrations", "openai"));
  const server = startMcpServer();
  return new Promise((resolve) => server.once("close", () => resolve(0)));
}

function handleDesktopHookCommand(args) {
  if (args.length !== 0) throw new Error("Uso interno: orquestrador-maestro desktop-hook");
  const raw = fs.readFileSync(0, "utf8");
  if (!raw.trim()) return 0;
  let event;
  try { event = JSON.parse(raw); }
  catch { throw new Error("desktop-hook recebeu JSON inválido"); }
  const { handleOpenAIHookEvent } = require(path.join(rootDir, "runtime", "integrations", "openai"));
  const result = handleOpenAIHookEvent(event, {
    pluginData: process.env.PLUGIN_DATA || null,
    mode: process.env.MAESTRO_OPENAI_MODE
  });
  if (result && Object.keys(result).length > 0) console.log(JSON.stringify(result));
  return 0;
}

function handleRouteCommand(args) {
  const [subcommand = "explain", ...rest] = args;
  if (subcommand !== "explain") {
    throw new Error("Uso: orquestrador-maestro route explain [--json] \"objetivo\"");
  }
  const options = parseRuntimeArgs(rest, ["--project-path", "--complexity"], ["--json", "--compact"]);
  const description = options.values.join(" ").trim();
  if (!description) throw new Error('Informe a intenção: orquestrador-maestro route explain "tarefa"');

  const { SkillRouterV3 } = require(path.join(rootDir, "runtime", "planner", "skill-router-v3"));
  const installedRoot = resolveMaestroRoot({ home: process.env.HOME || process.env.USERPROFILE || os.homedir() });
  const bundledRoot = path.join(rootDir, "orquestrador");
  const maestroRoot = hasV3SkillManifest(installedRoot) ? installedRoot : bundledRoot;
  const router = new SkillRouterV3({ maestroRoot });
  const workspacePath = path.resolve(options.projectPath || process.cwd());
  const { collectRoutingSignals } = require(path.join(rootDir, "runtime", "planner", "routing-signals"));
  const { classifyComplexity: classifyRoutingComplexity } = require(path.join(rootDir, "runtime", "planner", "complexity-gate"));
  const preliminaryComplexity = classifyRoutingComplexity(description, {
    overrideLevel: options.complexity || undefined
  });
  const routingSignals = collectRoutingSignals(workspacePath, {
    intent: description,
    memory: !options.compact && ["COMPLEX", "DEEP"].includes(preliminaryComplexity.level) ? new Memory() : null,
    includeWorkspaceChanges: !options.compact
  });
  const explained = router.explain(description, {
    ...routingSignals,
    overrideLevel: options.complexity || undefined
  });

  if (options.compact) {
    const { compactNativeRoute } = require(path.join(rootDir, "runtime", "integrations", "harness", "routing"));
    console.log(JSON.stringify(compactNativeRoute(explained.result)));
  } else if (options.json) {
    console.log(JSON.stringify(explained.result, null, 2));
  } else {
    console.log(explained.text);
  }
  return 0;
}


module.exports = {
  handleBridgeCommand,
  handleTelemetryCommand,
  handleChangelogCommand,
  handleVersionCommand,
  handleDesktopPluginCommand,
  handleDesktopMcpCommand,
  handleDesktopHookCommand,
  handleRouteCommand,
  sendTelemetry,
  buildTelemetryPayload
};
