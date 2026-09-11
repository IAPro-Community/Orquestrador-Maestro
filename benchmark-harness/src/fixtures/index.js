"use strict";
/**
 * Golden fixture management.
 *
 * Handles hashing, copying, and integrity validation of benchmark fixtures.
 * @module fixtures
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
exports.hashFixture = hashFixture;
exports.copyFixtureToTemp = copyFixtureToTemp;
exports.validateFixtureIntegrity = validateFixtureIntegrity;
var node_crypto_1 = require("node:crypto");
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var node_os_1 = require("node:os");
/**
 * Recursively list all files under a directory.
 */
function listFiles(dir) {
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
                    return [4 /*yield*/, listFiles(fullPath)];
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
 * Compute SHA-256 hash of all files in a fixture directory.
 *
 * Files are sorted by relative path for deterministic hashing.
 * The hash covers both file paths and their contents.
 *
 * @param fixturePath  Path to the fixture directory.
 * @returns            Hex-encoded SHA-256 hash string.
 */
function hashFixture(fixturePath) {
    return __awaiter(this, void 0, void 0, function () {
        var hash, files, _i, files_1, filePath, relativePath, content;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    hash = (0, node_crypto_1.createHash)('sha256');
                    return [4 /*yield*/, listFiles(fixturePath)];
                case 1:
                    files = _a.sent();
                    // Sort by relative path for determinism.
                    files.sort();
                    _i = 0, files_1 = files;
                    _a.label = 2;
                case 2:
                    if (!(_i < files_1.length)) return [3 /*break*/, 5];
                    filePath = files_1[_i];
                    relativePath = filePath.slice(fixturePath.length);
                    return [4 /*yield*/, (0, promises_1.readFile)(filePath)];
                case 3:
                    content = _a.sent();
                    hash.update(relativePath);
                    hash.update('\0');
                    hash.update(content);
                    hash.update('\n');
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
 * Copy a fixture directory to a temporary location.
 *
 * Creates a unique temp directory and copies all fixture files into it.
 *
 * @param fixturePath  Path to the source fixture directory.
 * @returns            Path to the temporary copy.
 */
function copyFixtureToTemp(fixturePath, runId) {
    return __awaiter(this, void 0, void 0, function () {
        var suffix, tempDir, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    suffix = runId ? "-".concat(runId) : '';
                    tempDir = (0, node_path_1.join)((0, node_os_1.tmpdir)(), "fixture-".concat(Date.now(), "-").concat(Math.random().toString(36).slice(2, 8)).concat(suffix));
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, promises_1.rm)(tempDir, { recursive: true, force: true })];
                case 2:
                    _b.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a = _b.sent();
                    return [3 /*break*/, 4];
                case 4: return [4 /*yield*/, (0, promises_1.mkdir)(tempDir, { recursive: true })];
                case 5:
                    _b.sent();
                    return [4 /*yield*/, copyDir(fixturePath, tempDir)];
                case 6:
                    _b.sent();
                    return [2 /*return*/, tempDir];
            }
        });
    });
}
/**
 * Recursively copy a directory.
 */
function copyDir(src, dest) {
    return __awaiter(this, void 0, void 0, function () {
        var entries, _i, entries_2, entry, srcPath, destPath;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, promises_1.readdir)(src, { withFileTypes: true })];
                case 1:
                    entries = _a.sent();
                    _i = 0, entries_2 = entries;
                    _a.label = 2;
                case 2:
                    if (!(_i < entries_2.length)) return [3 /*break*/, 8];
                    entry = entries_2[_i];
                    srcPath = (0, node_path_1.join)(src, entry.name);
                    destPath = (0, node_path_1.join)(dest, entry.name);
                    if (!entry.isDirectory()) return [3 /*break*/, 5];
                    return [4 /*yield*/, (0, promises_1.mkdir)(destPath, { recursive: true })];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, copyDir(srcPath, destPath)];
                case 4:
                    _a.sent();
                    return [3 /*break*/, 7];
                case 5:
                    if (!entry.isFile()) return [3 /*break*/, 7];
                    return [4 /*yield*/, (0, promises_1.copyFile)(srcPath, destPath)];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 2];
                case 8: return [2 /*return*/];
            }
        });
    });
}
/**
 * Validate fixture integrity by comparing the current hash against expected.
 *
 * @param fixturePath   Path to the fixture directory.
 * @param expectedHash  Expected SHA-256 hash.
 * @returns             true if hashes match, false otherwise.
 */
function validateFixtureIntegrity(fixturePath, expectedHash) {
    return __awaiter(this, void 0, void 0, function () {
        var actualHash, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, hashFixture(fixturePath)];
                case 1:
                    actualHash = _b.sent();
                    return [2 /*return*/, actualHash === expectedHash];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
