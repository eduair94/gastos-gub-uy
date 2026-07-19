import assert from "node:assert";
import { ColdMailer } from "../../src/services/cold-mailer";

(async () => {
  const sent: any[] = [];
  const fakeTransport = { sendMail: async (m: any) => { sent.push(m); return { messageId: "<abc@brevo>" }; } };
  const m = new ColdMailer(fakeTransport as any, "novedades@info.gastos-gub.uy");
  const res = await m.send({ to: "x@y.uy", subject: "hi", html: "<p>h</p>", text: "h", headers: { "List-Unsubscribe": "<https://u>" } });
  assert.equal(res.ok, true);
  assert.equal(res.id, "<abc@brevo>");
  assert.equal(sent[0].from, "novedades@info.gastos-gub.uy");
  assert.equal(sent[0].headers["List-Unsubscribe"], "<https://u>");

  // Error path: a throwing transport yields ok:false with the message.
  const boom = { sendMail: async () => { throw new Error("smtp down"); } };
  const res2 = await new ColdMailer(boom as any, "f@g.uy").send({ to: "a@b.uy", subject: "s", html: "h", text: "t" });
  assert.equal(res2.ok, false);
  assert.equal(res2.error, "smtp down");
  console.log("ok: cold mailer");
})();
