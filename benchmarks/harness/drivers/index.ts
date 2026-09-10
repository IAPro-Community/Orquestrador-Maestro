import { OpenCodeDriver } from "./opencode-driver";
import type { AgentDriver } from "./agent-driver";

const drivers = new Map<string, AgentDriver>();

function registerDriver(driver: AgentDriver): void {
  drivers.set(driver.name, driver);
}

function getDriver(name: string): AgentDriver | null {
  return drivers.get(name) || null;
}

function listDrivers(): string[] {
  return [...drivers.keys()];
}

registerDriver(new OpenCodeDriver());

export { registerDriver, getDriver, listDrivers };
