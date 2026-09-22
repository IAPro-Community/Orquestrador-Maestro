"use strict";
/**
 * Run orchestrator — coordinates the full benchmark execution lifecycle.
 *
 * For each scenario × condition pair:
 * 1. Validates scenario
 * 2. Copies golden fixture to temp workspace
 * 3. Initializes git repo in workspace (for diff tracking)
 * 4. Runs agent via Driver
 * 5. Runs external Verifier
 * 6. Checks integrity
 * 7. Captures evidence
 * 8. Produces RunReport
 *
 * @module orchestrator
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orchestrateRun = orchestrateRun;
exports.orchestratePair = orchestratePair;
var node_crypto_1 = require("node:crypto");
var node_path_1 = require("node:path");
var promises_1 = require("node:fs/promises");
var node_url_1 = require("node:url");
var tokens_js_1 = require("../utils/tokens.js");
var index_js_1 = require("../fixtures/index.js");
var index_js_2 = require("../verifier/index.js");
var integrity_js_1 = require("../verifier/integrity.js");
var index_js_3 = require("../evidence/index.js");
var run_cmd_js_1 = require("../utils/run-cmd.js");
var runner_js_1 = require("../container/runner.js");
var __filename = (0, node_url_1.fileURLToPath)(import.meta.url);
var __dirname = (0, node_path_1.dirname)(__filename);
var HARNESS_ROOT = (0, node_path_1.resolve)(__dirname, '..', '..');
/**
 * Run a single benchmark: scenario + condition + driver.
 */
function orchestrateRun(options) {
    return __awaiter(this, void 0, void 0, function () {
        var scenario, condition, driver, maestroDriver, evidenceBase, _a, useContainer, _b, env, timeoutMs, overrideModel, pairId, replicate, activeDriver, runId, startMs, fixtureHash, workspace, evidenceDir, taskHash, driverOptions, task, environment, driverResult, containerRunner, containerResult, hiddenTestPath, verifierResult, integrityResult, status_1, failureType, filesChanged, gitDiff, evidence, endMs, report, error_1, endMs, errorMsg, errorEvidenceDir, errorReport, _c;
        var _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
        return __generator(this, function (_s) {
            switch (_s.label) {
                case 0:
                    scenario = options.scenario, condition = options.condition, driver = options.driver, maestroDriver = options.maestroDriver, evidenceBase = options.evidenceBase, _a = options.useContainer, useContainer = _a === void 0 ? false : _a, _b = options.env, env = _b === void 0 ? {} : _b, timeoutMs = options.timeoutMs, overrideModel = options.model, pairId = options.pairId, replicate = options.replicate;
                    activeDriver = (condition === 'maestro' || condition === 'maestro-focus') && maestroDriver
                        ? maestroDriver
                        : driver;
                    runId = (0, node_crypto_1.randomUUID)();
                    startMs = Date.now();
                    _s.label = 1;
                case 1:
                    _s.trys.push([1, 16, , 22]);
                    return [4 /*yield*/, (0, index_js_1.hashFixture)(scenario.fixture.path)];
                case 2:
                    fixtureHash = _s.sent();
                    return [4 /*yield*/, (0, index_js_1.copyFixtureToTemp)(scenario.fixture.path, runId)];
                case 3:
                    workspace = _s.sent();
                    // 3. Initialize git repo in workspace (for diff tracking)
                    return [4 /*yield*/, initGitRepo(workspace)];
                case 4:
                    // 3. Initialize git repo in workspace (for diff tracking)
                    _s.sent();
                    evidenceDir = (0, node_path_1.join)(evidenceBase, runId);
                    return [4 /*yield*/, (0, promises_1.mkdir)(evidenceDir, { recursive: true })];
                case 5:
                    _s.sent();
                    taskHash = computeHash(scenario.task);
                    driverOptions = {
                        workspace: workspace,
                        fixture: scenario.fixture.path,
                        timeoutMs: (_d = timeoutMs !== null && timeoutMs !== void 0 ? timeoutMs : scenario.limits.maxTimeMs) !== null && _d !== void 0 ? _d : 300000,
                        model: (_f = (_e = overrideModel !== null && overrideModel !== void 0 ? overrideModel : scenario.model) !== null && _e !== void 0 ? _e : process.env.BENCHMARK_MODEL) !== null && _f !== void 0 ? _f : 'deepseek/deepseek-v4-flash',
                        env: env,
                    };
                    task = condition === 'maestro-focus'
                        ? "".concat(scenario.task, "\n\nInteraction profile: focus\nCommunication requirements: expose current state; show next action when required; suppress unrelated tangents; completion requires evidence.")
                        : scenario.task;
                    environment = {
                        os: process.platform,
                        arch: process.arch,
                        container: useContainer,
                        nodeVersion: process.version,
                        isolated: useContainer,
                    };
                    driverResult = void 0;
                    if (!useContainer) return [3 /*break*/, 7];
                    containerRunner = new runner_js_1.ContainerRunner({ image: (_h = (_g = driverOptions.env) === null || _g === void 0 ? void 0 : _g.BENCHMARK_IMAGE) !== null && _h !== void 0 ? _h : 'node:20-slim' });
                    return [4 /*yield*/, containerRunner.runBenchmark({
                            task: task,
                            workspace: workspace,
                            fixturePath: scenario.fixture.path,
                            command: [activeDriver.name === 'maestro' ? 'orquestrador-maestro' : 'opencode', 'run', '--dir', '/benchmark', '--model', driverOptions.model, '--format', 'json', task],
                            env: __assign(__assign({}, env), { BENCHMARK_MODEL: driverOptions.model }),
                            timeoutMs: driverOptions.timeoutMs,
                        })];
                case 6:
                    containerResult = _s.sent();
                    driverResult = {
                        output: containerResult.output,
                        exitCode: containerResult.exitCode,
                        tokens: null,
                        durationMs: containerResult.durationMs,
                        sessionFile: '',
                        agentOutput: containerResult.output,
                        toolUsage: null,
                    };
                    // Record container provenance
                    environment = {
                        os: process.platform,
                        arch: process.arch,
                        container: true,
                        nodeVersion: process.version,
                        isolated: true,
                        containerImage: (_k = (_j = driverOptions.env) === null || _j === void 0 ? void 0 : _j.BENCHMARK_IMAGE) !== null && _k !== void 0 ? _k : 'node:20-slim',
                        containerId: containerResult.containerId,
                    };
                    return [3 /*break*/, 9];
                case 7: return [4 /*yield*/, activeDriver.execute(task, driverOptions)];
                case 8:
                    driverResult = _s.sent();
                    _s.label = 9;
                case 9:
                    hiddenTestPath = scenario.acceptance.hiddenTestPath
                        ? (0, node_path_1.resolve)(HARNESS_ROOT, scenario.acceptance.hiddenTestPath)
                        : undefined;
                    return [4 /*yield*/, (0, index_js_2.verifyAcceptanceSuite)(workspace, scenario.acceptance, hiddenTestPath)];
                case 10:
                    verifierResult = _s.sent();
                    return [4 /*yield*/, (0, integrity_js_1.checkBenchmarkIntegrity)({
                            scenarioHash: (_l = scenario.integrity) === null || _l === void 0 ? void 0 : _l.scenarioHash,
                            hiddenTestsHash: (_m = scenario.integrity) === null || _m === void 0 ? void 0 : _m.hiddenTestsHash,
                            verifierHash: (_o = scenario.integrity) === null || _o === void 0 ? void 0 : _o.verifierHash,
                            workspace: workspace,
                        })];
                case 11:
                    integrityResult = _s.sent();
                    failureType = void 0;
                    if (!integrityResult.valid) {
                        status_1 = 'benchmark-integrity-violation';
                        failureType = integrityResult.violations.join('; ');
                    }
                    else if (driverResult.exitCode !== 0 && !verifierResult.passed) {
                        status_1 = 'failed';
                        failureType = 'agent-error-and-acceptance-failure';
                    }
                    else if (driverResult.exitCode !== 0) {
                        status_1 = 'failed';
                        failureType = 'agent-error';
                    }
                    else if (!verifierResult.passed) {
                        status_1 = 'failed';
                        failureType = 'acceptance-failure';
                    }
                    else {
                        status_1 = 'passed';
                    }
                    return [4 /*yield*/, getFilesChanged(workspace)];
                case 12:
                    filesChanged = _s.sent();
                    return [4 /*yield*/, getGitDiff(workspace)];
                case 13:
                    gitDiff = _s.sent();
                    return [4 /*yield*/, (0, index_js_3.preserveRawEvidence)({
                            workspace: workspace,
                            runId: runId,
                            agentOutput: driverResult.output,
                            agentExitCode: driverResult.exitCode,
                            verifierOutput: JSON.stringify(verifierResult, null, 2),
                            verifierExitCode: verifierResult.passed ? 0 : 1,
                            sessionFile: driverResult.sessionFile,
                            gitDiff: gitDiff,
                            filesChanged: filesChanged,
                            evidenceBase: evidenceBase,
                        })];
                case 14:
                    evidence = _s.sent();
                    endMs = Date.now();
                    report = {
                        runId: runId,
                        scenarioId: scenario.id,
                        pairId: pairId,
                        replicate: replicate,
                        model: driverOptions.model,
                        provider: activeDriver.name,
                        scenarioHash: (_p = scenario.integrity) === null || _p === void 0 ? void 0 : _p.scenarioHash,
                        fixtureHash: fixtureHash,
                        condition: condition,
                        driver: {
                            name: activeDriver.name,
                            version: activeDriver.version,
                            config: { model: driverOptions.model },
                        },
                        fixture: {
                            path: scenario.fixture.path,
                            hash: fixtureHash,
                        },
                        taskHash: taskHash,
                        environment: environment,
                        status: status_1,
                        failureType: failureType,
                        results: {
                            acceptanceRate: verifierResult.acceptanceRate,
                            accepted: verifierResult.passed,
                            criteria: verifierResult.criteria.map(function (c) { return (__assign(__assign({}, c), { output: (0, index_js_3.sanitizeSecrets)(c.output) })); }),
                        },
                        tokens: (_q = driverResult.tokens) !== null && _q !== void 0 ? _q : (0, tokens_js_1.createUnavailableTokens)(),
                        toolUsage: (_r = driverResult.toolUsage) !== null && _r !== void 0 ? _r : null,
                        timing: {
                            startMs: startMs,
                            endMs: endMs,
                            durationMs: endMs - startMs,
                        },
                        evidence: {
                            rawDir: evidence.rawDir,
                            agentOutput: evidence.agentOutput,
                            verifierOutput: evidence.verifierOutput,
                            agentExitCode: driverResult.exitCode,
                            verifierExitCode: verifierResult.passed ? 0 : 1,
                            filesChanged: filesChanged,
                            gitDiff: gitDiff,
                            sessionFile: driverResult.sessionFile,
                        },
                        createdAt: new Date().toISOString(),
                    };
                    // 12. Write report to evidence directory
                    return [4 /*yield*/, (0, promises_1.writeFile)((0, node_path_1.join)(evidence.rawDir, 'run-report.json'), JSON.stringify(report, null, 2), 'utf-8')];
                case 15:
                    // 12. Write report to evidence directory
                    _s.sent();
                    return [2 /*return*/, {
                            report: report,
                            success: status_1 === 'passed',
                        }];
                case 16:
                    error_1 = _s.sent();
                    endMs = Date.now();
                    errorMsg = error_1 instanceof Error ? error_1.message : String(error_1);
                    errorEvidenceDir = (0, node_path_1.join)(evidenceBase, runId);
                    _s.label = 17;
                case 17:
                    _s.trys.push([17, 20, , 21]);
                    return [4 /*yield*/, (0, promises_1.mkdir)(errorEvidenceDir, { recursive: true })];
                case 18:
                    _s.sent();
                    errorReport = {
                        runId: runId,
                        scenarioId: scenario.id,
                        condition: condition,
                        driver: { name: activeDriver.name, version: activeDriver.version },
                        fixture: { path: scenario.fixture.path, hash: '' },
                        status: 'error',
                        failureType: errorMsg,
                        results: { acceptanceRate: 0, criteria: [] },
                        tokens: (0, tokens_js_1.createUnavailableTokens)(),
                        timing: { startMs: startMs, endMs: endMs, durationMs: endMs - startMs },
                        evidence: {
                            rawDir: errorEvidenceDir,
                            agentOutput: '',
                            verifierOutput: '',
                        },
                        createdAt: new Date().toISOString(),
                    };
                    return [4 /*yield*/, (0, promises_1.writeFile)((0, node_path_1.join)(errorEvidenceDir, 'run-report.json'), JSON.stringify(errorReport, null, 2), 'utf-8')];
                case 19:
                    _s.sent();
                    return [2 /*return*/, {
                            report: errorReport,
                            success: false,
                            error: errorMsg,
                        }];
                case 20:
                    _c = _s.sent();
                    // Fallback if even evidence write fails
                    return [2 /*return*/, {
                            report: {
                                runId: runId,
                                scenarioId: scenario.id,
                                condition: condition,
                                driver: { name: activeDriver.name, version: activeDriver.version },
                                fixture: { path: scenario.fixture.path, hash: '' },
                                status: 'error',
                                failureType: errorMsg,
                                results: { acceptanceRate: 0, criteria: [] },
                                tokens: (0, tokens_js_1.createUnavailableTokens)(),
                                timing: { startMs: startMs, endMs: endMs, durationMs: endMs - startMs },
                                evidence: { rawDir: '', agentOutput: '', verifierOutput: '' },
                                createdAt: new Date().toISOString(),
                            },
                            success: false,
                            error: errorMsg,
                        }];
                case 21: return [3 /*break*/, 22];
                case 22: return [2 /*return*/];
            }
        });
    });
}
/**
 * Run paired benchmarks: same scenario, both conditions.
 */
function orchestratePair(options) {
    return __awaiter(this, void 0, void 0, function () {
        var vanillaDriver, maestroDriver, pairId, vanilla, maestro, maestroFocus;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    vanillaDriver = options.driver;
                    maestroDriver = (_a = options.maestroDriver) !== null && _a !== void 0 ? _a : options.driver;
                    pairId = (_b = options.pairId) !== null && _b !== void 0 ? _b : "pair-".concat(Date.now());
                    return [4 /*yield*/, orchestrateRun({
                            scenario: options.scenario,
                            condition: 'vanilla',
                            driver: vanillaDriver,
                            evidenceBase: options.evidenceBase,
                            useContainer: true,
                            model: options.model,
                            env: options.vanillaEnv,
                            timeoutMs: options.vanillaTimeoutMs,
                            pairId: pairId,
                            replicate: 0,
                        })];
                case 1:
                    vanilla = _e.sent();
                    return [4 /*yield*/, orchestrateRun({
                            scenario: options.scenario,
                            condition: 'maestro',
                            driver: vanillaDriver,
                            maestroDriver: maestroDriver,
                            evidenceBase: options.evidenceBase,
                            useContainer: true,
                            model: options.model,
                            env: options.maestroEnv,
                            timeoutMs: options.maestroTimeoutMs,
                            pairId: pairId,
                            replicate: 1,
                        })];
                case 2:
                    maestro = _e.sent();
                    return [4 /*yield*/, orchestrateRun({
                            scenario: options.scenario,
                            condition: 'maestro-focus',
                            driver: vanillaDriver,
                            maestroDriver: maestroDriver,
                            evidenceBase: options.evidenceBase,
                            useContainer: true,
                            model: options.model,
                            env: (_c = options.maestroFocusEnv) !== null && _c !== void 0 ? _c : __assign(__assign({}, options.maestroEnv), { MAESTRO_INTERACTION_PROFILE: 'focus' }),
                            timeoutMs: (_d = options.maestroFocusTimeoutMs) !== null && _d !== void 0 ? _d : options.maestroTimeoutMs,
                            pairId: pairId,
                            replicate: 2,
                        })];
                case 3:
                    maestroFocus = _e.sent();
                    return [2 /*return*/, { vanilla: vanilla, maestro: maestro, maestroFocus: maestroFocus }];
            }
        });
    });
}
// --- Helpers ---
function computeHash(input) {
    return (0, node_crypto_1.createHash)('sha256').update(input).digest('hex');
}
/**
 * Initialize a git repo in the workspace so git diff works.
 * This enables tracking files changed by the agent.
 */
function initGitRepo(workspace) {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, (0, run_cmd_js_1.runCmd)('git', ['init'], { cwd: workspace, timeout: 5000 })];
                case 1:
                    _b.sent();
                    return [4 /*yield*/, (0, run_cmd_js_1.runCmd)('git', ['add', '-A'], { cwd: workspace, timeout: 5000 })];
                case 2:
                    _b.sent();
                    return [4 /*yield*/, (0, run_cmd_js_1.runCmd)('git', ['commit', '-m', 'initial: golden fixture', '--allow-empty'], { cwd: workspace, timeout: 5000 })];
                case 3:
                    _b.sent();
                    return [3 /*break*/, 5];
                case 4:
                    _a = _b.sent();
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function getFilesChanged(workspace) {
    return __awaiter(this, void 0, void 0, function () {
        var stdout, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, run_cmd_js_1.runCmd)('git', ['diff', '--name-only', 'HEAD'], {
                            cwd: workspace,
                            timeout: 5000,
                        })];
                case 1:
                    stdout = (_b.sent()).stdout;
                    return [2 /*return*/, stdout.split('\n').filter(Boolean)];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, []];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function getGitDiff(workspace) {
    return __awaiter(this, void 0, void 0, function () {
        var stdout, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, run_cmd_js_1.runCmd)('git', ['diff', 'HEAD'], {
                            cwd: workspace,
                            timeout: 10000,
                        })];
                case 1:
                    stdout = (_b.sent()).stdout;
                    return [2 /*return*/, stdout];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, ''];
                case 3: return [2 /*return*/];
            }
        });
    });
}
