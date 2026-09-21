"use strict";
const { parseProviderUsage } = require("./provider-usage");
const numeric = (value) => Number.isFinite(value) && value >= 0 ? Number(value) : null;
class MissionUsageMeter {
  constructor({ parseUsage = parseProviderUsage } = {}) { this.parseUsage = parseUsage; this.records = []; this.wrappedAdapters = new WeakMap(); }
  instrumentRegistry(registry) {
    if (!registry || !(registry.adapters instanceof Map)) throw new TypeError("provider registry with adapters Map is required");
    for (const [id, adapter] of registry.adapters.entries()) registry.adapters.set(id, this.wrapAdapter(adapter));
    return registry;
  }
  wrapAdapter(adapter) {
    if (!adapter || typeof adapter.execute !== "function") throw new TypeError("provider adapter with execute() is required");
    if (this.wrappedAdapters.has(adapter)) return this.wrappedAdapters.get(adapter);
    const meter = this;
    const wrapped = Object.create(adapter);
    wrapped.id = adapter.id;
    wrapped.detect = (...args) => adapter.detect(...args);
    wrapped.capabilities = (...args) => adapter.capabilities(...args);
    wrapped.supportsReadOnlyReview = (...args) => typeof adapter.supportsReadOnlyReview === "function" ? adapter.supportsReadOnlyReview(...args) : false;
    wrapped.execute = async (request = {}) => {
      let handle;
      try {
        handle = await adapter.execute(request);
      } catch (error) {
        meter.records.push(Object.freeze({
          providerId: adapter.id || "unknown",
          complete: false,
          reason: "provider-execute-rejected",
          modelCalls: 0
        }));
        throw error;
      }
      if (!handle?.result || typeof handle.result.then !== "function") {
        meter.records.push(Object.freeze({
          providerId: adapter.id || "unknown",
          complete: false,
          reason: "provider-result-unobservable",
          modelCalls: 0
        }));
        return handle;
      }
      const result = Promise.resolve(handle.result).then((completed) => {
        meter.record({ adapter, request, completed });
        return completed;
      }, (error) => {
        meter.records.push(Object.freeze({
          providerId: adapter.id || "unknown",
          complete: false,
          reason: "provider-result-rejected",
          modelCalls: 0
        }));
        throw error;
      });
      return Object.freeze({ ...handle, result, cancel: typeof handle.cancel === "function" ? () => handle.cancel() : undefined });
    };
    this.wrappedAdapters.set(adapter, wrapped);
    this.wrappedAdapters.set(wrapped, wrapped);
    return wrapped;
  }
  record({ adapter, request, completed }) {
    const usage = this.parseUsage({ providerId: adapter?.id, stdout: completed?.stdout, stderr: completed?.stderr, model: request?.model });
    const tokenInput = numeric(usage?.tokenInput), tokenOutput = numeric(usage?.tokenOutput);
    const freshInvocation = request?.freshSession === true || (!request?.sessionId && request?.continue !== true);
    const complete = usage?.usageComplete === true && freshInvocation && tokenInput !== null && tokenOutput !== null;
    this.records.push(Object.freeze({
      providerId: adapter?.id || "unknown", complete, freshInvocation,
      tokenInput, tokenOutput, reasoningTokens: numeric(usage?.reasoningTokens),
      cachedInputTokens: numeric(usage?.cachedInputTokens), cachedOutputTokens: numeric(usage?.cachedOutputTokens),
      modelCalls: Number.isInteger(usage?.modelCalls) ? usage.modelCalls : 0,
      reason: complete ? null : usage?.usageComplete !== true ? "usage-incomplete" : !freshInvocation ? "session-resume-unsafe" : "tokens-missing"
    }));
  }
  snapshot() {
    const completeRecords = this.records.filter((r) => r.complete), incomplete = this.records.filter((r) => !r.complete);
    const sum = (key) => completeRecords.reduce((total, r) => total + (numeric(r[key]) ?? 0), 0);
    const complete = incomplete.length === 0;
    const input = sum("tokenInput"), output = sum("tokenOutput"), reasoning = sum("reasoningTokens");
    return Object.freeze({
      schemaVersion: 1, complete, invocationCount: this.records.length,
      completeInvocationCount: completeRecords.length, incompleteInvocationCount: incomplete.length,
      inputTokens: complete ? input : null, outputTokens: complete ? output : null,
      reasoningTokens: complete ? reasoning : null, cacheReadTokens: complete ? sum("cachedInputTokens") : null,
      cacheWriteTokens: complete ? sum("cachedOutputTokens") : null,
      totalTokens: complete ? input + output + reasoning : null,
      modelCalls: complete ? sum("modelCalls") : null,
      observed: Object.freeze({
        inputTokens: complete ? input : completeRecords.length ? input : null,
        outputTokens: complete ? output : completeRecords.length ? output : null,
        reasoningTokens: complete ? reasoning : completeRecords.length ? reasoning : null
      }),
      incompleteReasons: Object.freeze([...new Set(incomplete.map((r) => r.reason).filter(Boolean))]),
      limitation: "Mission totals are available only when every observed provider invocation exposed complete fresh-session usage; zero observed invocations is an exact zero."
    });
  }
}
module.exports = { MissionUsageMeter };
