"use strict";
/**
 * Benchmark integrity checker.
 *
 * Detects tampering with hidden tests, verifier code, scenario definitions,
 * and suspicious script patterns that could compromise benchmark validity.
 * @module integrity
 */
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
exports.checkBenchmarkIntegrity = checkBenchmarkIntegrity;
var promises_1 = require("node:fs/promises");
var node_crypto_1 = require("node:crypto");
var node_path_1 = require("node:path");
/**
 * Compute SHA-256 hash of a file's contents.
 * Returns the hex-encoded hash string.
 */
function sha256File(filePath) {
    return __awaiter(this, void 0, void 0, function () {
        var content;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, promises_1.readFile)(filePath)];
                case 1:
                    content = _a.sent();
                    return [2 /*return*/, (0, node_crypto_1.createHash)('sha256').update(content).digest('hex')];
            }
        });
    });
}
/**
 * Recursively read all files under a directory.
 */
function readAllFiles(dir) {
    return __awaiter(this, void 0, void 0, function () {
        var entries, files, _i, entries_1, entry, fullPath, _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, (0, promises_1.readdir)(dir, { withFileTypes: true })];
                case 1:
                    entries = _d.sent();
                    files = [];
                    _i = 0, entries_1 = entries;
                    _d.label = 2;
                case 2:
                    if (!(_i < entries_1.length)) return [3 /*break*/, 6];
                    entry = entries_1[_i];
                    fullPath = (0, node_path_1.join)(dir, entry.name);
                    if (!entry.isDirectory()) return [3 /*break*/, 4];
                    _b = (_a = files.push).apply;
                    _c = [files];
                    return [4 /*yield*/, readAllFiles(fullPath)];
                case 3:
                    _b.apply(_a, _c.concat([(_d.sent())]));
                    return [3 /*break*/, 5];
                case 4:
                    if (entry.isFile()) {
                        files.push(fullPath);
                    }
                    _d.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 2];
                case 6: return [2 /*return*/, files];
            }
        });
    });
}
/**
 * Compute SHA-256 hash of all files in a directory (sorted for determinism).
 */
function sha256Dir(dir) {
    return __awaiter(this, void 0, void 0, function () {
        var files, hash, _i, files_1, f, content;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, readAllFiles(dir)];
                case 1:
                    files = _a.sent();
                    files.sort();
                    hash = (0, node_crypto_1.createHash)('sha256');
                    _i = 0, files_1 = files;
                    _a.label = 2;
                case 2:
                    if (!(_i < files_1.length)) return [3 /*break*/, 5];
                    f = files_1[_i];
                    return [4 /*yield*/, (0, promises_1.readFile)(f)];
                case 3:
                    content = _a.sent();
                    hash.update(f);
                    hash.update(content);
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, hash.digest('hex')];
            }
        });
    });
}
/**
 * Scan workspace files for suspicious script patterns.
 */
function scanScriptsForCheats(workspace) {
    return __awaiter(this, void 0, void 0, function () {
        var checks, files, _a, scriptExts, scriptFiles, _i, scriptFiles_1, filePath, content, _b, relPath, skipOnlyPatterns, _c, skipOnlyPatterns_1, _d, pattern, label;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    checks = [];
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, readAllFiles(workspace)];
                case 2:
                    files = _e.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a = _e.sent();
                    return [2 /*return*/, checks];
                case 4:
                    scriptExts = new Set([
                        '.sh',
                        '.js',
                        '.ts',
                        '.mjs',
                        '.cjs',
                        '.json',
                        '.yaml',
                        '.yml',
                        '.toml',
                    ]);
                    scriptFiles = files.filter(function (f) {
                        var _a;
                        if (f.includes('node_modules/'))
                            return false;
                        var ext = '.' + ((_a = f.split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase());
                        return scriptExts.has(ext);
                    });
                    _i = 0, scriptFiles_1 = scriptFiles;
                    _e.label = 5;
                case 5:
                    if (!(_i < scriptFiles_1.length)) return [3 /*break*/, 11];
                    filePath = scriptFiles_1[_i];
                    content = void 0;
                    _e.label = 6;
                case 6:
                    _e.trys.push([6, 8, , 9]);
                    return [4 /*yield*/, (0, promises_1.readFile)(filePath, 'utf-8')];
                case 7:
                    content = _e.sent();
                    return [3 /*break*/, 9];
                case 8:
                    _b = _e.sent();
                    return [3 /*break*/, 10];
                case 9:
                    relPath = filePath.replace(workspace + '/', '');
                    skipOnlyPatterns = [
                        { pattern: /\.skip\s*\(/g, label: 'test/suite skip' },
                        { pattern: /\.only\s*\(/g, label: 'test/suite only' },
                        { pattern: /describe\.skip\s*\(/g, label: 'describe.skip' },
                        { pattern: /it\.skip\s*\(/g, label: 'it.skip' },
                        { pattern: /xit\s*\(/g, label: 'xit' },
                        { pattern: /xdescribe\s*\(/g, label: 'xdescribe' },
                        { pattern: /pending\s*\(\s*["'].*?["']\s*\)/g, label: 'test pending' },
                        { pattern: /test\.only\s*\(/g, label: 'test.only (hardcoded focus)' },
                    ];
                    for (_c = 0, skipOnlyPatterns_1 = skipOnlyPatterns; _c < skipOnlyPatterns_1.length; _c++) {
                        _d = skipOnlyPatterns_1[_c], pattern = _d.pattern, label = _d.label;
                        if (pattern.test(content)) {
                            checks.push({
                                name: "cheat:".concat(label),
                                passed: false,
                                message: "Found ".concat(label, " in ").concat(relPath),
                            });
                        }
                    }
                    // Check for `|| true` which suppresses failures
                    if (/\|\|\s*true/.test(content)) {
                        checks.push({
                            name: 'cheat:or-true',
                            passed: false,
                            message: "Found \"|| true\" in ".concat(relPath),
                        });
                    }
                    // Check for process.exit(0) which forces success
                    if (/process\.exit\s*\(\s*0\s*\)/.test(content)) {
                        checks.push({
                            name: 'cheat:process-exit',
                            passed: false,
                            message: "Found \"process.exit(0)\" in ".concat(relPath),
                        });
                    }
                    _e.label = 10;
                case 10:
                    _i++;
                    return [3 /*break*/, 5];
                case 11:
                    if (checks.length === 0) {
                        checks.push({
                            name: 'cheat:scan',
                            passed: true,
                            message: 'No suspicious script patterns found',
                        });
                    }
                    return [2 /*return*/, checks];
            }
        });
    });
}
/**
 * Check if a hidden test file was modified relative to expected content.
 */
function checkHiddenTestIntegrity(workspace, expectedHash) {
    return __awaiter(this, void 0, void 0, function () {
        var entries, _a, hiddenDirs, _i, hiddenDirs_1, dir, dirPath, actualHash;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!expectedHash) {
                        return [2 /*return*/, {
                                name: 'hidden-tests-hash',
                                passed: true,
                                message: 'No expected hash provided — skipped',
                            }];
                    }
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, promises_1.readdir)(workspace)];
                case 2:
                    entries = _b.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a = _b.sent();
                    return [2 /*return*/, {
                            name: 'hidden-tests-hash',
                            passed: false,
                            message: "Cannot read workspace: ".concat(workspace),
                        }];
                case 4:
                    hiddenDirs = entries.filter(function (e) {
                        return e === 'hidden-tests' ||
                            e === '__hidden__' ||
                            e === '.hidden-tests' ||
                            e === 'hidden';
                    });
                    if (hiddenDirs.length === 0) {
                        return [2 /*return*/, {
                                name: 'hidden-tests-hash',
                                passed: true,
                                message: 'No hidden test directory found in workspace',
                            }];
                    }
                    _i = 0, hiddenDirs_1 = hiddenDirs;
                    _b.label = 5;
                case 5:
                    if (!(_i < hiddenDirs_1.length)) return [3 /*break*/, 8];
                    dir = hiddenDirs_1[_i];
                    dirPath = (0, node_path_1.resolve)(workspace, dir);
                    return [4 /*yield*/, sha256Dir(dirPath)];
                case 6:
                    actualHash = _b.sent();
                    if (actualHash !== expectedHash) {
                        return [2 /*return*/, {
                                name: 'hidden-tests-hash',
                                passed: false,
                                message: "Hidden tests in ".concat(dir, " have been modified (expected ").concat(expectedHash, ", got ").concat(actualHash, ")"),
                            }];
                    }
                    _b.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 5];
                case 8: return [2 /*return*/, {
                        name: 'hidden-tests-hash',
                        passed: true,
                        message: 'Hidden tests match expected hash',
                    }];
            }
        });
    });
}
/**
 * Check if the verifier script itself has been modified.
 */
function checkVerifierIntegrity(workspace, expectedHash) {
    return __awaiter(this, void 0, void 0, function () {
        var entries, _a, verifierFiles, _i, verifierFiles_1, file, filePath, actualHash;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!expectedHash) {
                        return [2 /*return*/, {
                                name: 'verifier-hash',
                                passed: true,
                                message: 'No expected verifier hash provided — skipped',
                            }];
                    }
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, promises_1.readdir)(workspace)];
                case 2:
                    entries = _b.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a = _b.sent();
                    return [2 /*return*/, {
                            name: 'verifier-hash',
                            passed: false,
                            message: "Cannot read workspace: ".concat(workspace),
                        }];
                case 4:
                    verifierFiles = entries.filter(function (e) {
                        return e === 'verifier.js' ||
                            e === 'verifier.ts' ||
                            e === 'verify.sh' ||
                            e === 'verify.js' ||
                            (0, node_path_1.basename)(e).startsWith('verifier');
                    });
                    if (verifierFiles.length === 0) {
                        return [2 /*return*/, {
                                name: 'verifier-hash',
                                passed: true,
                                message: 'No verifier script found in workspace',
                            }];
                    }
                    _i = 0, verifierFiles_1 = verifierFiles;
                    _b.label = 5;
                case 5:
                    if (!(_i < verifierFiles_1.length)) return [3 /*break*/, 8];
                    file = verifierFiles_1[_i];
                    filePath = (0, node_path_1.resolve)(workspace, file);
                    return [4 /*yield*/, sha256File(filePath)];
                case 6:
                    actualHash = _b.sent();
                    if (actualHash !== expectedHash) {
                        return [2 /*return*/, {
                                name: 'verifier-hash',
                                passed: false,
                                message: "Verifier ".concat(file, " has been modified (expected ").concat(expectedHash, ", got ").concat(actualHash, ")"),
                            }];
                    }
                    _b.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 5];
                case 8: return [2 /*return*/, {
                        name: 'verifier-hash',
                        passed: true,
                        message: 'Verifier matches expected hash',
                    }];
            }
        });
    });
}
/**
 * Check if the scenario definition was tampered with.
 */
function checkScenarioIntegrity(workspace, expectedHash) {
    return __awaiter(this, void 0, void 0, function () {
        var entries, _a, scenarioFiles, _i, scenarioFiles_1, file, filePath, actualHash;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!expectedHash) {
                        return [2 /*return*/, {
                                name: 'scenario-hash',
                                passed: true,
                                message: 'No expected scenario hash provided — skipped',
                            }];
                    }
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, promises_1.readdir)(workspace)];
                case 2:
                    entries = _b.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a = _b.sent();
                    return [2 /*return*/, {
                            name: 'scenario-hash',
                            passed: false,
                            message: "Cannot read workspace: ".concat(workspace),
                        }];
                case 4:
                    scenarioFiles = entries.filter(function (e) {
                        return e.endsWith('.json') &&
                            (e.includes('scenario') || e.includes('benchmark'));
                    });
                    if (scenarioFiles.length === 0) {
                        return [2 /*return*/, {
                                name: 'scenario-hash',
                                passed: true,
                                message: 'No scenario file found in workspace',
                            }];
                    }
                    _i = 0, scenarioFiles_1 = scenarioFiles;
                    _b.label = 5;
                case 5:
                    if (!(_i < scenarioFiles_1.length)) return [3 /*break*/, 8];
                    file = scenarioFiles_1[_i];
                    filePath = (0, node_path_1.resolve)(workspace, file);
                    return [4 /*yield*/, sha256File(filePath)];
                case 6:
                    actualHash = _b.sent();
                    if (actualHash !== expectedHash) {
                        return [2 /*return*/, {
                                name: 'scenario-hash',
                                passed: false,
                                message: "Scenario ".concat(file, " has been modified (expected ").concat(expectedHash, ", got ").concat(actualHash, ")"),
                            }];
                    }
                    _b.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 5];
                case 8: return [2 /*return*/, {
                        name: 'scenario-hash',
                        passed: true,
                        message: 'Scenario matches expected hash',
                    }];
            }
        });
    });
}
/**
 * Run full integrity verification on a benchmark scenario.
 *
 * @param options  Hash expectations and workspace path.
 * @returns        IntegrityResult with per-check details and violations.
 */
function checkBenchmarkIntegrity(options) {
    return __awaiter(this, void 0, void 0, function () {
        var checks, cheatChecks, hiddenCheck, verifierCheck, scenarioCheck, violations;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    checks = [];
                    return [4 /*yield*/, scanScriptsForCheats(options.workspace)];
                case 1:
                    cheatChecks = _a.sent();
                    checks.push.apply(checks, cheatChecks);
                    return [4 /*yield*/, checkHiddenTestIntegrity(options.workspace, options.hiddenTestsHash)];
                case 2:
                    hiddenCheck = _a.sent();
                    checks.push(hiddenCheck);
                    return [4 /*yield*/, checkVerifierIntegrity(options.workspace, options.verifierHash)];
                case 3:
                    verifierCheck = _a.sent();
                    checks.push(verifierCheck);
                    return [4 /*yield*/, checkScenarioIntegrity(options.workspace, options.scenarioHash)];
                case 4:
                    scenarioCheck = _a.sent();
                    checks.push(scenarioCheck);
                    // Official mode: fail-closed for missing hashes
                    if (options.official) {
                        if (!options.scenarioHash) {
                            checks.push({
                                name: 'scenario-hash:required',
                                passed: false,
                                message: 'Official benchmark requires scenario hash',
                            });
                        }
                        if (!options.hiddenTestsHash) {
                            checks.push({
                                name: 'hidden-tests-hash:required',
                                passed: false,
                                message: 'Official benchmark requires hidden tests hash',
                            });
                        }
                        if (!options.verifierHash) {
                            checks.push({
                                name: 'verifier-hash:required',
                                passed: false,
                                message: 'Official benchmark requires verifier hash',
                            });
                        }
                    }
                    violations = checks
                        .filter(function (c) { return !c.passed; })
                        .map(function (c) { return "".concat(c.name, ": ").concat(c.message); });
                    return [2 /*return*/, {
                            valid: violations.length === 0,
                            violations: violations,
                            checks: checks,
                        }];
            }
        });
    });
}
