#!/usr/bin/env node
import type { BenchmarkCondition } from "./harness/types";
interface CliOptions {
    model?: string;
    driver?: string;
    runs?: number;
    conditions?: BenchmarkCondition[];
    outputDir?: string;
    timeoutMs?: number;
    verbose?: boolean;
    help?: boolean;
    scenarios?: string[];
    useContainer?: boolean;
    dryRun?: boolean;
    json?: boolean;
    benchmarkClass?: "ci" | "official";
    profile?: "official" | "ci";
    filter?: string;
    parallel?: number;
    resume?: string;
    format?: "markdown" | "json" | "csv";
}
declare function parseArgs(args: string[]): CliOptions;
declare function printHelp(): void;
declare function cmdList(options: CliOptions): void;
declare function cmdValidate(scenarioId: string | undefined, options?: CliOptions): void;
declare function cmdRun(options: CliOptions): Promise<void>;
declare function cmdCompare(file1: string | undefined, file2: string | undefined, options: CliOptions): void;
declare function cmdSuite(options: CliOptions): Promise<void>;
declare function cmdReport(runSet: string | undefined, options: CliOptions): void;
declare function cmdVerify(runId: string | undefined, options: CliOptions): void;
declare function cmdInspect(runId: string | undefined, options: CliOptions): void;
declare function cmdPreflight(options: CliOptions): void;
export { parseArgs, printHelp, cmdList, cmdValidate, cmdRun, cmdCompare, cmdSuite, cmdReport, cmdVerify, cmdInspect, cmdPreflight };
