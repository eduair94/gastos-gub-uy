import assert from "node:assert";
import { resolveUnsubscribe } from "../../src/jobs/campaign/unsubscribe-core";

(async () => {
  // Unknown token -> null, no side effects (nothing marked, nothing suppressed).
  {
    let marked = false;
    let suppressed = false;
    const result = await resolveUnsubscribe("unknown-token", {
      findSend: async () => null,
      markUnsub: async () => { marked = true; },
      suppress: async () => { suppressed = true; },
    });
    assert.equal(result, null);
    assert.equal(marked, false);
    assert.equal(suppressed, false);
  }

  // Known token -> returns { email }, marks the send unsubscribed, and
  // suppresses with reason "unsubscribe" scoped to the campaign source.
  {
    let markedToken: string | null = null;
    let suppressArgs: [string, string, string] | null = null;
    const result = await resolveUnsubscribe("tok-123", {
      findSend: async (token) => (token === "tok-123" ? { email: "a@b.uy", campaignId: "camp-1" } : null),
      markUnsub: async (token) => { markedToken = token; },
      suppress: async (email, reason, source) => { suppressArgs = [email, reason, source]; },
    });
    assert.deepEqual(result, { email: "a@b.uy" });
    assert.equal(markedToken, "tok-123");
    assert.deepEqual(suppressArgs, ["a@b.uy", "unsubscribe", "campaign:camp-1"]);
  }

  // Idempotent: calling twice with the same token behaves the same way both times.
  {
    const deps = {
      findSend: async (token: string) => (token === "tok-456" ? { email: "c@d.uy", campaignId: "camp-2" } : null),
      markUnsub: async () => {},
      suppress: async () => {},
    };
    const first = await resolveUnsubscribe("tok-456", deps);
    const second = await resolveUnsubscribe("tok-456", deps);
    assert.deepEqual(first, { email: "c@d.uy" });
    assert.deepEqual(second, { email: "c@d.uy" });
  }

  console.log("ok: campaign unsubscribe");
})();
