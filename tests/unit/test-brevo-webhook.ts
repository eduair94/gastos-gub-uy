import assert from "node:assert";
import { mapBrevoEvent } from "../../src/jobs/campaign/brevo-events";

// delivered -> status only
assert.deepEqual(mapBrevoEvent({ event: "delivered" }), { status: "delivered" });

// opened / unique_opened -> status "opened"
assert.deepEqual(mapBrevoEvent({ event: "opened" }), { status: "opened" });
assert.deepEqual(mapBrevoEvent({ event: "unique_opened" }), { status: "opened" });

// click -> status "clicked"
assert.deepEqual(mapBrevoEvent({ event: "click" }), { status: "clicked" });

// soft_bounce -> status "bounced", no suppress
assert.deepEqual(mapBrevoEvent({ event: "soft_bounce" }), { status: "bounced" });

// hard_bounce -> status "bounced" AND suppress "bounce"
assert.deepEqual(mapBrevoEvent({ event: "hard_bounce" }), { status: "bounced", suppress: "bounce" });

// spam / complaint -> status "complained" AND suppress "complaint"
assert.deepEqual(mapBrevoEvent({ event: "spam" }), { status: "complained", suppress: "complaint" });
assert.deepEqual(mapBrevoEvent({ event: "complaint" }), { status: "complained", suppress: "complaint" });

// unsubscribed -> status "unsubscribed" AND suppress "unsubscribe"
assert.deepEqual(mapBrevoEvent({ event: "unsubscribed" }), { status: "unsubscribed", suppress: "unsubscribe" });

// unknown event -> no-op
assert.deepEqual(mapBrevoEvent({ event: "some_unknown_thing" }), {});

console.log("ok: brevo webhook");
