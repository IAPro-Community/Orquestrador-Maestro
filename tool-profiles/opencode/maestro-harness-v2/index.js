import { Plugin } from "@opencode/plugin";
import contract from "../../../runtime/integrations/harness/contract.js";

export default Plugin.define({
  id: "maestro.harness-coexistence",
  async setup(ctx) {
    const hooks = contract.createOpenCodeHooks();
    await ctx.session.hook("prompt", hooks.prompt);
    await ctx.session.hook("context", hooks.context);
    await ctx.session.hook("experimental.idle", hooks.idle);
    return () => hooks.dispose();
  }
});
