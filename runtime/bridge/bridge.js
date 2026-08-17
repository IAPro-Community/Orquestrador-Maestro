"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PROTOCOL_VERSION = 1;
const JSON_RPC_VERSION = "2.0";
const ERROR_CODES = Object.freeze({
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  terminalBackendUnavailable: -32010,
  terminalWorkspaceLocked: -32011,
  agentWorktreeFailed: -32012
});

function createBridge(options = {}) {
  const protocolVersion = options.protocolVersion || PROTOCOL_VERSION;
  if (!Number.isInteger(protocolVersion) || protocolVersion <= 0) {
    throw new TypeError("protocolVersion must be a positive integer");
  }

  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const services = options.services || {};
  const methods = {
    initialize: (params) => initialize(params, protocolVersion),
    "project.inspect": (params) => inspectProject(params, projectRoot, services.projectInspector),
    "projects.list": (params) => invokeList(services.runtime, "listProjects", params),
    "projects.dashboard": (params) => invokeCall(services.runtime, "dashboard", params),
    "projects.get": (params) => invokeGet(services.runtime, "getProject", params, "projectId"),
    "projects.register": (params) => invokeCall(services.runtime, "registerProject", params),
    "missions.list": (params) => invokeList(services.runtime, "listMissions", params),
    "missions.get": (params) => invokeGet(services.runtime, "getMission", params, "missionId"),
    "missions.create": (params) => invokeCall(services.runtime, "createMission", params),
    "missions.update": (params) => invokeMissionUpdate(services.runtime, params),
    "skills.list": (params) => invokeList(services.skillRegistry, "list", params),
    "providers.list": (params) => invokeList(services.providerRegistry, "list", params),
    "runs.list": (params) => invokeList(services.runStore, "listRuns", params),
    "runs.get": (params) => invokeGet(services.runStore, "getRun", params, "runId"),
    "runs.inspect": (params) => invokeGet(services.runtime, "inspectRun", params, "runId"),
    "runs.create": (params) => invokeCall(services.runtime, "executeRun", params),
    "runs.cancel": (params) => invokeCall(services.runtime, "cancelRun", params, "runId"),
    "runs.subscribe": () => unsupported("Run subscriptions are not available in protocol version 1"),
    "artifacts.list": (params) => invokeList(services.runStore, "listArtifacts", params),
    "artifacts.get": (params) => invokeGet(services.runStore, "getArtifact", params, "artifactId"),
    "verification.get": (params) => invokeGet(services.runStore, "getVerification", params, "runId"),
    "terminals.list": (params) => invokeList(services.runtime, "listTerminalSessions", params),
    "terminals.get": (params) => invokeGet(services.runtime, "getTerminalSession", params, "terminalId"),
    "terminals.create": (params) => invokeCall(services.runtime, "createTerminalSession", params),
    "terminals.attach": (params) => invokeCall(services.runtime, "attachTerminalSession", params, "terminalId"),
    "terminals.close": (params) => invokeCall(services.runtime, "closeTerminalSession", params, "terminalId"),
    "terminals.registerClient": (params) => invokeCall(services.runtime, "registerTerminalClient", params),
    "terminals.updateClientStatus": (params) => invokeCall(services.runtime, "updateTerminalClientStatus", params),
    "terminals.capabilities": () => invokeCall(services.runtime, "terminalCapabilities", {}),
    // Compatibilidade com o contrato inicial de comandos gerenciados.
    "terminals.start": (params) => invokeCall(services.runtime, "startTerminal", params),
    "terminals.stop": (params) => invokeCall(services.runtime, "stopTerminal", params, "terminalId"),
    "terminals.input": (params) => invokeTerminalInput(services.runtime, params),
    "agentSessions.create": (params) => invokeCall(services.runtime, "createTerminalSession", { ...params, backend: "pty" }),
    "agentSessions.list": (params) => invokeList(services.runtime, "listTerminalSessions", { ...params, backend: "pty" }),
    "agentSessions.get": (params) => invokeGet(services.runtime, "getTerminalSession", params, "terminalId"),
    "agentSessions.close": (params) => invokeCall(services.runtime, "closeTerminalSession", params, "terminalId"),
    "agentSessions.input": (params) => invokeAgentInput(services.runtime, params),
    "agentSessions.resize": (params) => invokeAgentResize(services.runtime, params),
    "agentSessions.focus": (params) => invokeCall(services.runtime, "focusTerminalSession", params, "terminalId"),
    "agentSessions.snapshot": (params) => invokeGet(services.runtime, "snapshotTerminalSession", params, "terminalId"),
    "panes.list": (params) => invokeList(services.runtime, "listPanes", params),
    "panes.updateLayout": (params) => invokePaneUpdate(services.runtime, params),
    "panes.page": (params) => invokeList(services.runtime, "pagePanes", params),
    "events.subscribe": () => Object.freeze({ subscribed: true }),
    "approvals.respond": () => unsupported("Approvals are not available in protocol version 1")
  };

  return Object.freeze({
    protocolVersion,
    subscribe(listener) {
      if (!services.runtime || typeof services.runtime.subscribe !== "function") return () => {};
      return services.runtime.subscribe(listener);
    },
    async handle(request) {
      return handleRequest(request, methods);
    }
  });
}

async function handleRequest(request, methods) {
  if (!isValidRequest(request)) {
    return errorResponse(null, ERROR_CODES.invalidRequest, "Invalid Request");
  }

  const isNotification = request.id === undefined;
  const method = methods[request.method];
  if (!method) {
    return isNotification ? null : errorResponse(request.id, ERROR_CODES.methodNotFound, "Method not found");
  }

  try {
    const result = await method(normalizeParams(request.params));
    return isNotification ? null : successResponse(request.id, result);
  } catch (error) {
    const response = toErrorResponse(request.id, error);
    return isNotification ? null : response;
  }
}

function isValidRequest(request) {
  return request
    && typeof request === "object"
    && !Array.isArray(request)
    && request.jsonrpc === JSON_RPC_VERSION
    && typeof request.method === "string"
    && request.method.length > 0
    && (request.id === undefined || typeof request.id === "string" || Number.isFinite(request.id) || request.id === null);
}

function normalizeParams(params) {
  if (params === undefined) {
    return {};
  }
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw invalidParams("params must be an object when provided");
  }
  return params;
}

function initialize(params, protocolVersion) {
  if (params.protocolVersion !== undefined && params.protocolVersion !== protocolVersion) {
    throw protocolError("Unsupported protocol version", {
      supportedProtocolVersions: [protocolVersion]
    });
  }

  return Object.freeze({
    protocolVersion,
    serverInfo: Object.freeze({ name: "maestro-bridge" }),
    capabilities: Object.freeze({ subscriptions: true, approvals: false })
  });
}

async function inspectProject(params, projectRoot, projectInspector) {
  if (projectInspector && typeof projectInspector.inspect === "function") {
    return projectInspector.inspect(params);
  }

  if (params.projectPath !== undefined) {
    requireNonEmptyString(params.projectPath, "projectPath");
  }
  const inspectedPath = path.resolve(params.projectPath || projectRoot);
  const packagePath = path.join(inspectedPath, "package.json");
  const packageInfo = readPackageInfo(packagePath);

  return Object.freeze({
    path: inspectedPath,
    exists: fs.existsSync(inspectedPath),
    package: packageInfo,
    git: Object.freeze({ detected: fs.existsSync(path.join(inspectedPath, ".git")) })
  });
}

function readPackageInfo(packagePath) {
  if (!fs.existsSync(packagePath)) {
    return null;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    return Object.freeze({
      name: typeof packageJson.name === "string" ? packageJson.name : null,
      version: typeof packageJson.version === "string" ? packageJson.version : null
    });
  } catch {
    return Object.freeze({ name: null, version: null });
  }
}

async function invokeList(service, method, params) {
  if (!service || typeof service[method] !== "function") {
    return Object.freeze([]);
  }
  const result = await service[method](params);
  if (!Array.isArray(result)) {
    throw new TypeError(`${method} must return an array`);
  }
  return result;
}

async function invokeGet(service, method, params, idName) {
  requireNonEmptyString(params[idName], idName);
  if (!service || typeof service[method] !== "function") {
    return null;
  }
  const result = await service[method](params[idName], params);
  return result === undefined ? null : result;
}

async function invokeCall(service, method, params, idName) {
  if (idName) requireNonEmptyString(params[idName], idName);
  if (!service || typeof service[method] !== "function") return unsupported(`${method} is unavailable`);
  return service[method](idName ? params[idName] : params);
}

async function invokeTerminalInput(service, params) {
  if (service && typeof service.inputTerminalSession === "function") {
    const session = await service.getTerminalSession?.(params.terminalId);
    if (session?.backend === "pty") return service.inputTerminalSession(params.terminalId, params.input);
  }
  requireNonEmptyString(params.terminalId, "terminalId");
  requireTerminalData(params.input, "input");
  if (!service || typeof service.sendTerminalInput !== "function") return unsupported("sendTerminalInput is unavailable");
  return service.sendTerminalInput(params.terminalId, params.input);
}

async function invokePaneUpdate(service, params) {
  requireNonEmptyString(params.terminalId, "terminalId");
  if (!service || typeof service.updatePane !== "function") return unsupported("updatePane is unavailable");
  const patch = { ...params }; delete patch.terminalId;
  return service.updatePane(params.terminalId, patch);
}

async function invokeAgentInput(service, params) {
  requireNonEmptyString(params.terminalId, "terminalId");
  const input = params.input ?? params.data;
  requireTerminalData(input, "input");
  if (!service || typeof service.inputTerminalSession !== "function") return unsupported("inputTerminalSession is unavailable");
  return service.inputTerminalSession(params.terminalId, input);
}

async function invokeAgentResize(service, params) {
  requireNonEmptyString(params.terminalId, "terminalId");
  if (!Number.isInteger(params.columns) || !Number.isInteger(params.rows)) throw invalidParams("columns and rows must be integers");
  if (!service || typeof service.resizeTerminalSession !== "function") return unsupported("resizeTerminalSession is unavailable");
  return service.resizeTerminalSession(params.terminalId, params.columns, params.rows);
}

async function invokeMissionUpdate(service, params) {
  requireNonEmptyString(params.missionId, "missionId");
  if (!service || typeof service.updateMission !== "function") return unsupported("updateMission is unavailable");
  const { missionId, ...patch } = params;
  return service.updateMission(missionId, patch);
}

function unsupported(message) {
  const error = new Error(message);
  error.code = ERROR_CODES.methodNotFound;
  throw error;
}

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalidParams(`${name} must be a non-empty string`);
  }
}

function requireTerminalData(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw invalidParams(`${name} must be a non-empty string`);
  }
}

function invalidParams(message) {
  const error = new Error(message);
  error.code = ERROR_CODES.invalidParams;
  return error;
}

function protocolError(message, data) {
  const error = new Error(message);
  error.code = ERROR_CODES.invalidParams;
  error.data = data;
  return error;
}

function successResponse(id, result) {
  return { jsonrpc: JSON_RPC_VERSION, id, result };
}

function errorResponse(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  return { jsonrpc: JSON_RPC_VERSION, id, error };
}

function toErrorResponse(id, error) {
  if (error?.code === "TERMINAL_BACKEND_UNAVAILABLE") {
    return errorResponse(id, ERROR_CODES.terminalBackendUnavailable, error.message, { backend: error.backend });
  }
  if (error?.code === "TERMINAL_WORKSPACE_LOCKED") {
    return errorResponse(id, ERROR_CODES.terminalWorkspaceLocked, error.message, error.data);
  }
  if (error?.code === "AGENT_WORKTREE_FAILED") {
    return errorResponse(id, ERROR_CODES.agentWorktreeFailed, error.message);
  }
  if (error && [ERROR_CODES.invalidParams, ERROR_CODES.methodNotFound].includes(error.code)) {
    return errorResponse(id, error.code, error.message, error.data);
  }
  return errorResponse(id, ERROR_CODES.internal, "Internal error");
}

module.exports = {
  ERROR_CODES,
  JSON_RPC_VERSION,
  PROTOCOL_VERSION,
  createBridge,
  errorResponse,
  handleRequest
};
