"use strict";
/**
 * External verifier — runs acceptance criteria against a workspace.
 *
 * The verifier is external to the agent's workspace and never lets the
 * agent decide if it finished correctly.
 * @module verifier
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
exports.verifyAcceptanceSuite = verifyAcceptanceSuite;
var node_child_process_1 = require("node:child_process");
var node_util_1 = require("node:util");
var execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
/**
 * Run a single shell command with a timeout.
 * Returns `{ stdout, stderr, exitCode }`.
 */
function runCommand(command, cwd, timeoutSec) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, stdout, stderr, err_1, nodeErr;
        var _b, _c, _d, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    _g.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, execAsync(command, {
                            cwd: cwd,
                            timeout: timeoutSec * 1000,
                            maxBuffer: 10 * 1024 * 1024,
                            env: __assign(__assign({}, process.env), { CI: 'true', NO_COLOR: '1' }),
                        })];
                case 1:
                    _a = _g.sent(), stdout = _a.stdout, stderr = _a.stderr;
                    return [2 /*return*/, { stdout: stdout, stderr: stderr, exitCode: 0 }];
                case 2:
                    err_1 = _g.sent();
                    nodeErr = err_1;
                    return [2 /*return*/, {
                            stdout: (_b = nodeErr.stdout) !== null && _b !== void 0 ? _b : '',
                            stderr: (_d = (_c = nodeErr.stderr) !== null && _c !== void 0 ? _c : nodeErr.message) !== null && _d !== void 0 ? _d : String(err_1),
                            exitCode: (_f = (_e = nodeErr.status) !== null && _e !== void 0 ? _e : nodeErr.code) !== null && _f !== void 0 ? _f : 1,
                        }];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/** Default timeout per criterion in seconds. */
var DEFAULT_TIMEOUT = 120;
/**
 * Verify acceptance criteria against a workspace.
 *
 * Each criterion runs sequentially. Hidden tests run in the workspace
 * directory (the command itself is self-contained). If a hiddenTestPath
 * is configured AND exists, hidden tests run there instead for isolation.
 *
 * @param workspace    Path to the agent workspace to evaluate.
 * @param acceptance   Acceptance configuration with ordered criteria.
 * @param hiddenTestPath  Optional override for hidden test directory.
 */
function verifyAcceptanceSuite(workspace, acceptance, hiddenTestPath) {
    return __awaiter(this, void 0, void 0, function () {
        var results, _i, _a, criterion, timeoutSec, startTime, passed, output, error, hiddenDir, cwd, result, result, passedCount, acceptanceRate;
        var _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    results = [];
                    _i = 0, _a = acceptance.criteria;
                    _e.label = 1;
                case 1:
                    if (!(_i < _a.length)) return [3 /*break*/, 7];
                    criterion = _a[_i];
                    timeoutSec = (_b = criterion.timeout) !== null && _b !== void 0 ? _b : DEFAULT_TIMEOUT;
                    startTime = Date.now();
                    passed = false;
                    output = '';
                    error = void 0;
                    if (!(criterion.type === 'hidden_tests')) return [3 /*break*/, 3];
                    hiddenDir = hiddenTestPath !== null && hiddenTestPath !== void 0 ? hiddenTestPath : acceptance.hiddenTestPath;
                    cwd = hiddenDir && hiddenDir.length > 0 ? hiddenDir : workspace;
                    return [4 /*yield*/, runCommand((_c = criterion.command) !== null && _c !== void 0 ? _c : 'echo "no hidden test command specified"', cwd, timeoutSec)];
                case 2:
                    result = _e.sent();
                    passed = result.exitCode === 0;
                    output = [result.stdout, result.stderr].filter(Boolean).join('\n');
                    if (!passed) {
                        error = result.stderr || "exit code ".concat(result.exitCode);
                    }
                    return [3 /*break*/, 5];
                case 3: return [4 /*yield*/, runCommand((_d = criterion.command) !== null && _d !== void 0 ? _d : 'echo "no command specified"', workspace, timeoutSec)];
                case 4:
                    result = _e.sent();
                    passed = result.exitCode === 0;
                    output = [result.stdout, result.stderr].filter(Boolean).join('\n');
                    if (!passed) {
                        error = result.stderr || "exit code ".concat(result.exitCode);
                    }
                    _e.label = 5;
                case 5:
                    results.push({
                        type: criterion.type,
                        name: criterion.name,
                        passed: passed,
                        duration: Date.now() - startTime,
                        output: output,
                        error: error,
                    });
                    _e.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 1];
                case 7:
                    passedCount = results.filter(function (r) { return r.passed; }).length;
                    acceptanceRate = results.length > 0 ? passedCount / results.length : 1;
                    return [2 /*return*/, {
                            passed: results.length === 0 || acceptanceRate === 1,
                            criteria: results,
                            acceptanceRate: acceptanceRate,
                        }];
            }
        });
    });
}
