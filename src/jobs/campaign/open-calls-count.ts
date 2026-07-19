import { OpenCallModel } from "../../../shared/models/open_call";
export function buildOpenCallCountQuery(rubroCode: string, now: Date): object {
  return { status: "open", classificationSet: rubroCode, "tenderPeriod.endDate": { $gt: now } };
}
export async function countOpenCallsByRubro(codes: string[], now: Date): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const code of [...new Set(codes)]) {
    out.set(code, await OpenCallModel.countDocuments(buildOpenCallCountQuery(code, now)));
  }
  return out;
}
