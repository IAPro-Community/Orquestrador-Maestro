"use strict";
/**
 * Container runner for isolated benchmark execution.
 *
 * Uses spawn with manual timeout to ensure Docker containers are
 * properly killed on timeout (execFile timeout doesn't kill containers).
 *
 * @module container/runner
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
exports.ContainerRunner = void 0;
exports.verifyContainerIsolation = verifyContainerIsolation;
var node_child_process_1 = require("node:child_process");
var node_crypto_1 = require("node:crypto");
var node_path_1 = require("node:path");
var run_cmd_js_1 = require("../utils/run-cmd.js");
/** Container lifecycle management. */
var ContainerRunner = /** @class */ (function () {
    function ContainerRunner(options) {
        var _a, _b;
        this.image = (_a = options === null || options === void 0 ? void 0 : options.image) !== null && _a !== void 0 ? _a : 'node:20-slim';
        this.dockerPath = (_b = options === null || options === void 0 ? void 0 : options.dockerPath) !== null && _b !== void 0 ? _b : 'docker';
    }
    /**
     * Check if Docker is available in the environment.
     */
    ContainerRunner.prototype.isDockerAvailable = function () {
        return __awaiter(this, void 0, void 0, function () {
            var stdout, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, run_cmd_js_1.runCmd)(this.dockerPath, ['--version'], {
                                timeout: 5000,
                            })];
                    case 1:
                        stdout = (_b.sent()).stdout;
                        return [2 /*return*/, stdout.includes('Docker version')];
                    case 2:
                        _a = _b.sent();
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Run a command inside a fresh container.
     *
     * Uses spawn with manual timeout to ensure the container is killed
     * on timeout (execFile timeout only kills the docker client, not the container).
     */
    ContainerRunner.prototype.run = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var containerName, startMs, args;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        containerName = "benchmark-".concat((0, node_crypto_1.randomUUID)().slice(0, 8));
                        startMs = Date.now();
                        // Pull image if needed
                        return [4 /*yield*/, this.pullImage((_a = options.image) !== null && _a !== void 0 ? _a : this.image)];
                    case 1:
                        // Pull image if needed
                        _b.sent();
                        args = this.buildArgs(containerName, options);
                        return [2 /*return*/, new Promise(function (resolve) {
                                var _a, _b;
                                var child = (0, node_child_process_1.spawn)(_this.dockerPath, args, {
                                    stdio: ['ignore', 'pipe', 'pipe'],
                                    timeout: options.timeoutMs,
                                });
                                var stdout = '';
                                var stdoutLen = 0;
                                var stderr = '';
                                var stderrLen = 0;
                                var MAX_OUTPUT = 100 * 1024 * 1024; // 100MB
                                (_a = child.stdout) === null || _a === void 0 ? void 0 : _a.on('data', function (chunk) {
                                    if (stdoutLen < MAX_OUTPUT) {
                                        var str = chunk.toString();
                                        stdout += str;
                                        stdoutLen += str.length;
                                    }
                                });
                                (_b = child.stderr) === null || _b === void 0 ? void 0 : _b.on('data', function (chunk) {
                                    if (stderrLen < MAX_OUTPUT) {
                                        var str = chunk.toString();
                                        stderr += str;
                                        stderrLen += str.length;
                                    }
                                });
                                // Manual timeout: kill the container if it exceeds timeoutMs
                                var timer = setTimeout(function () { return __awaiter(_this, void 0, void 0, function () {
                                    var durationMs;
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0:
                                                child.kill('SIGKILL');
                                                return [4 /*yield*/, this.removeContainer(containerName)];
                                            case 1:
                                                _a.sent();
                                                durationMs = Date.now() - startMs;
                                                resolve({
                                                    exitCode: 124, // timeout exit code (like `timeout` command)
                                                    output: stdout + stderr,
                                                    containerId: containerName,
                                                    durationMs: durationMs,
                                                    cleanedUp: true,
                                                });
                                                return [2 /*return*/];
                                        }
                                    });
                                }); }, options.timeoutMs);
                                child.on('close', function (code) { return __awaiter(_this, void 0, void 0, function () {
                                    var durationMs;
                                    return __generator(this, function (_a) {
                                        clearTimeout(timer);
                                        durationMs = Date.now() - startMs;
                                        // --rm handles cleanup on clean exit
                                        resolve({
                                            exitCode: code !== null && code !== void 0 ? code : 1,
                                            output: stdout + stderr,
                                            containerId: containerName,
                                            durationMs: durationMs,
                                            cleanedUp: true,
                                        });
                                        return [2 /*return*/];
                                    });
                                }); });
                                child.on('error', function (err) { return __awaiter(_this, void 0, void 0, function () {
                                    var durationMs, cleanedUp;
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0:
                                                clearTimeout(timer);
                                                durationMs = Date.now() - startMs;
                                                return [4 /*yield*/, this.removeContainer(containerName)];
                                            case 1:
                                                cleanedUp = _a.sent();
                                                resolve({
                                                    exitCode: 1,
                                                    output: "".concat(stdout).concat(stderr, "\n").concat(err.message),
                                                    containerId: containerName,
                                                    durationMs: durationMs,
                                                    cleanedUp: cleanedUp,
                                                });
                                                return [2 /*return*/];
                                        }
                                    });
                                }); });
                            })];
                }
            });
        });
    };
    /**
     * Run a benchmark task inside an isolated container.
     */
    ContainerRunner.prototype.runBenchmark = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var workDir, fixtureDir;
            var _a;
            return __generator(this, function (_b) {
                workDir = '/benchmark';
                fixtureDir = (0, node_path_1.join)(workDir, 'fixture');
                return [2 /*return*/, this.run({
                        image: this.image,
                        workDir: workDir,
                        mounts: [
                            { host: options.workspace, container: workDir },
                            { host: options.fixturePath, container: fixtureDir, readonly: true },
                        ],
                        env: __assign(__assign({}, options.env), { BENCHMARK_TASK: options.task, BENCHMARK_FIXTURE: fixtureDir }),
                        command: options.command,
                        timeoutMs: options.timeoutMs,
                        memoryLimit: options.memoryLimit,
                        networkMode: (_a = options.networkMode) !== null && _a !== void 0 ? _a : 'none',
                    })];
            });
        });
    };
    ContainerRunner.prototype.buildArgs = function (containerName, options) {
        var _a, _b, _c;
        var args = ['run', '--rm', '--name', containerName];
        // Network isolation for official benchmarks
        if (options.networkMode) {
            args.push("--network=".concat(options.networkMode));
        }
        // Memory limit
        if (options.memoryLimit) {
            args.push("--memory=".concat(options.memoryLimit));
        }
        // CPU limit
        if (options.cpuLimit) {
            args.push("--cpus=".concat(options.cpuLimit));
        }
        // Volume mounts
        for (var _i = 0, _d = (_a = options.mounts) !== null && _a !== void 0 ? _a : []; _i < _d.length; _i++) {
            var mount = _d[_i];
            var ro = mount.readonly ? ':ro' : '';
            args.push('-v', "".concat(mount.host, ":").concat(mount.container).concat(ro));
        }
        // Environment variables
        for (var _e = 0, _f = Object.entries((_b = options.env) !== null && _b !== void 0 ? _b : {}); _e < _f.length; _e++) {
            var _g = _f[_e], key = _g[0], value = _g[1];
            args.push('-e', "".concat(key, "=").concat(value));
        }
        // Working directory
        args.push('-w', options.workDir);
        // Image
        args.push((_c = options.image) !== null && _c !== void 0 ? _c : this.image);
        // Command
        args.push.apply(args, options.command);
        return args;
    };
    ContainerRunner.prototype.pullImage = function (image) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, run_cmd_js_1.runCmd)(this.dockerPath, ['pull', image], {
                                timeout: 120000,
                            })];
                    case 1:
                        _b.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        _a = _b.sent();
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    ContainerRunner.prototype.removeContainer = function (name) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, run_cmd_js_1.runCmd)(this.dockerPath, ['rm', '-f', name], {
                                timeout: 10000,
                            })];
                    case 1:
                        _b.sent();
                        return [2 /*return*/, true];
                    case 2:
                        _a = _b.sent();
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return ContainerRunner;
}());
exports.ContainerRunner = ContainerRunner;
/**
 * Container integrity check — ensures official benchmarks
 * ran in isolated containers.
 */
function verifyContainerIsolation(evidence) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            if (!evidence.container) {
                return [2 /*return*/, {
                        valid: false,
                        reason: 'Official benchmark requires container isolation (--container=true)',
                    }];
            }
            if (!evidence.containerImage) {
                return [2 /*return*/, {
                        valid: false,
                        reason: 'Container image must be specified for official benchmarks',
                    }];
            }
            if (evidence.isolated === false) {
                return [2 /*return*/, {
                        valid: false,
                        reason: 'Official benchmark must be isolated (isolated=true)',
                    }];
            }
            return [2 /*return*/, { valid: true }];
        });
    });
}
