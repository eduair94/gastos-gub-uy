import assert from "node:assert";
import { buildRubroWatchPayload } from "../../app/utils/rubro-watch";

// Valid code → a watch payload the /api/watches contract accepts
// (name required + at least one of categories/keywords/buyers).
const p = buildRubroWatchPayload("28267", "Alcohol rectificado");
assert.ok(p, "expected a payload for a valid code");
assert.deepEqual(p!.categories, ["28267"]);
assert.equal(p!.active, true);
assert.ok(p!.name.includes("Alcohol rectificado"), `name should carry the label: ${p!.name}`);

// No label → falls back to the code, still a usable name.
const noLabel = buildRubroWatchPayload("28267");
assert.ok(noLabel);
assert.ok(noLabel!.name.includes("28267"));

// Name is capped at the server's 120-char limit.
const long = buildRubroWatchPayload("28267", "x".repeat(400));
assert.ok(long!.name.length <= 120);

// Junk / empty / injection-ish input → null (caller skips, never posts garbage).
assert.equal(buildRubroWatchPayload(""), null);
assert.equal(buildRubroWatchPayload("   "), null);
assert.equal(buildRubroWatchPayload("../etc/passwd"), null);
assert.equal(buildRubroWatchPayload("<script>"), null);

console.log("ok: rubro watch payload");
