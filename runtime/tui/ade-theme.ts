export const theme = {
  canvas: "#05070b",
  surface: "#0a0f16",
  raised: "#101722",
  border: "#243244",
  borderMuted: "#162131",
  text: "#e6edf5",
  muted: "#8391a5",
  faint: "#526074",
  cyan: "#31d7ff",
  green: "#31e6a1",
  lime: "#b6f36b",
  orange: "#ffb454",
  violet: "#b99aff",
  red: "#ff6b7a",
  selection: "#14293a"
} as const

export function providerColor(provider?: string) {
  return ({ codex: theme.cyan, claude: theme.orange, opencode: theme.lime, agy: theme.violet } as Record<string, string>)[provider || ""] || theme.green
}

export function statusColor(status?: string) {
  if (["active", "running", "completed"].includes(status || "")) return theme.green
  if (["starting", "created", "verifying"].includes(status || "")) return theme.orange
  if (["failed", "closed", "exited", "disconnected"].includes(status || "")) return theme.red
  return theme.muted
}
