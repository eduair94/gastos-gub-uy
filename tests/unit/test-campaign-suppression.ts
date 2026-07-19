import assert from "node:assert";
import { normalizeSuppressEmail } from "../../src/jobs/campaign/suppression";
assert.equal(normalizeSuppressEmail("  A@B.UY "), "a@b.uy");
assert.equal(normalizeSuppressEmail("bad"), null);
console.log("ok: campaign suppression");
