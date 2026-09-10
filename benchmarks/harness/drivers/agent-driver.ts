import type { Scenario, RunOptions, DriverResult } from "../types";

export abstract class AgentDriver {
  get name(): string {
    throw new Error("not implemented");
  }

  async isAvailable(): Promise<boolean> {
    throw new Error("not implemented");
  }

  async execute(_scenario: Scenario, _options: RunOptions): Promise<DriverResult> {
    throw new Error("not implemented");
  }
}
