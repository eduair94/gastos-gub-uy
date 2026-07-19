function esc(s: string): string {
  return (s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]!));
}
export interface CampaignInput {
  supplierName: string; rubroLabel: string; rubroCode: string; openCount: number;
  unsubscribeUrl: string; ctaUrl: string; senderIdentity: string;
}
export function campaignHeaders(unsubscribeUrl: string, unsubscribeMailto: string): Record<string,string> {
  return {
    "List-Unsubscribe": `<${unsubscribeMailto}>, <${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
export function renderCampaignEmail(i: CampaignInput): { subject: string; html: string; text: string } {
  const n = i.openCount;
  const rubro = i.rubroLabel || "tu rubro";
  const subject = n > 0
    ? `${n} ${n === 1 ? "licitación abierta" : "licitaciones abiertas"} en ${rubro} — te avisamos gratis`
    : `Licitaciones del Estado en ${rubro} — te avisamos gratis`;
  const lead = n > 0
    ? `Hoy hay <strong>${n}</strong> ${n === 1 ? "llamado abierto" : "llamados abiertos"} del Estado en <strong>${esc(rubro)}</strong>.`
    : `El Estado publica llamados en <strong>${esc(rubro)}</strong> durante todo el año.`;
  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;color:#0f2233;max-width:560px;margin:0 auto">
  <p>Hola ${esc(i.supplierName)},</p>
  <p>${lead} Somos <strong>gastos-gub</strong>, un servicio <strong>gratuito</strong> de transparencia del gasto público.</p>
  <p>Te avisamos por email cada vez que se abre una licitación en tu rubro, para que no pierdas ninguna.</p>
  <p style="margin:28px 0">
    <a href="${esc(i.ctaUrl)}" style="background:#0f2233;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">
      Activar alertas gratis en ${esc(rubro)}
    </a>
  </p>
  <p style="color:#64757f;font-size:13px">Es gratis y te podés dar de baja cuando quieras.</p>
  <hr style="border:none;border-top:1px solid #dfe4e7;margin:24px 0">
  <p style="color:#64757f;font-size:12px">
    ${esc(i.senderIdentity)}.<br>
    Recibís esto porque tu empresa figura como proveedora del Estado en registros públicos.
    <a href="${esc(i.unsubscribeUrl)}" style="color:#64757f">Darse de baja</a>.
  </p>
</div>`.trim();
  const text = [
    `Hola ${i.supplierName},`, "",
    n > 0 ? `Hoy hay ${n} ${n === 1 ? "llamado abierto" : "llamados abiertos"} del Estado en ${rubro}.`
          : `El Estado publica llamados en ${rubro} durante todo el año.`,
    `Somos gastos-gub, un servicio gratuito de transparencia del gasto público. Te avisamos por email cuando se abre una licitación en tu rubro.`,
    "", `Activar alertas gratis: ${i.ctaUrl}`, "",
    i.senderIdentity + ".",
    `Recibís esto porque tu empresa figura como proveedora del Estado en registros públicos.`,
    `Darse de baja: ${i.unsubscribeUrl}`,
  ].join("\n");
  return { subject, html, text };
}
