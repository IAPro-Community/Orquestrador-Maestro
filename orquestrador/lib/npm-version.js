"use strict";

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

function getNpmChannel(version) {
  const prerelease = /^\d+\.\d+\.\d+-([0-9A-Za-z-]+)(?:\.[0-9A-Za-z-]+)*$/u.exec(version)?.[1];
  return prerelease === "alpha" || prerelease === "beta" ? prerelease : prerelease ? "next" : "latest";
}

function queryVersion(runNpm, spec) {
  const result = runNpm(["view", spec, "version", "--json", "--prefer-online"], {
    encoding: "utf8", timeout: 30000
  });
  if (result.error) throw new Error("Não foi possível consultar o registry npm (processo indisponível ou timeout).");
  if (result.status !== 0) {
    const diagnostic = String(result.stderr || "") + "\n" + String(result.stdout || "");
    if (/\b(?:E404|ETARGET)\b|No match found for version/i.test(diagnostic)) return null;
    throw new Error("Falha na consulta ao registry npm (rede, autenticação ou configuração).");
  }
  const raw = String(result.stdout || "").trim();
  if (!raw) return null;
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error("Resposta inválida do registry npm."); }
  if (Array.isArray(value) && value.length === 1) value = value[0];
  if (typeof value !== "string" || !VERSION.test(value)) throw new Error("Versão inválida retornada pelo registry npm.");
  return value;
}

function getPublishedNpmVersion({ name, version, runNpm }) {
  const channel = getNpmChannel(version);
  const published = queryVersion(runNpm, name + "@" + channel);
  if (published) return { channel, version: published };
  if (channel !== "latest") {
    const exact = queryVersion(runNpm, name + "@" + version);
    if (exact) return { channel, version: exact, unavailableChannel: channel, exact: true };
    const latest = queryVersion(runNpm, name + "@latest");
    if (latest) return { channel: "latest", version: latest, unavailableChannel: channel };
  }
  throw new Error("Versão publicada não encontrada no npm.");
}

module.exports = { getNpmChannel, getPublishedNpmVersion };
