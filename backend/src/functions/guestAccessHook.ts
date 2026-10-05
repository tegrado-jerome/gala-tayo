import { app } from "@azure/functions";
import { getGuestAccessDenial } from "../utils/guestAccess";

// One central guard: guest (anonymous) tokens only reach the functions listed in GUEST_ALLOWED_FUNCTIONS.
app.hook.preInvocation((hookContext) => {
  const request = hookContext.inputs?.[0] as { headers?: { get?: (name: string) => string | null } } | undefined;
  const authorization = request?.headers?.get?.("authorization");
  if (!authorization) return;

  const denial = getGuestAccessDenial(hookContext.invocationContext.functionName, authorization);
  if (denial) {
    hookContext.functionHandler = async () => denial;
  }
});
