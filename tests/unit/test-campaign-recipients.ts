import assert from "node:assert";
import { pickRecipientRubro } from "../../src/jobs/campaign/recipients";
assert.equal(pickRecipientRubro([]), null);
const r = pickRecipientRubro([{classificationId:"1",label:"A",share:0.2},{classificationId:"2",label:"B",share:0.6}]);
assert.deepEqual(r, { code: "2", label: "B" }); // highest share wins
console.log("ok: campaign recipients");
