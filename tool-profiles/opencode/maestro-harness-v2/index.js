import { Plugin } from "@opencode/plugin";
import contract from "../../../runtime/integrations/harness/contract.js";

export default Plugin.define({
  id: "maestro.harness-coexistence",
  async setup(ctx) {
    const hooks = contract.createOpenCodeHooks({ routeNative: process.env.MAESTRO_HARNESS_ROUTING !== "off" });
    await ctx.session.hook("prompt", hooks.prompt);
    await ctx.session.hook("context", async (event) => {
      // Plugin location is not necessarily the current session's workspace.
      // A local session lookup is not a provider call. Fall back to static
      // rules if the host cannot resolve the session location.
      let cwd;
      try {
        const session = await ctx.session.get({ sessionID: event.sessionID });
        cwd = session?.location?.directory ?? session?.directory;
      } catch { /* fail open */ }
      hooks.context(event, cwd);
    });
    await ctx.session.hook("experimental.idle", hooks.idle);
    return () => hooks.dispose();
  }
});
