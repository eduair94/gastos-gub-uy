/**
 * Matching driver: evaluate newly-opened calls against active watches and enqueue
 * one idempotent `alert` notification per (user, call). No email is sent here.
 */
import { OpenCallModel } from "../../../shared/models/open_call";
import { WatchModel } from "../../../shared/models/watch";
import { UserModel } from "../../../shared/models/user";
import { NotificationModel } from "../../../shared/models/notification";
import type { OpenCallStatus } from "../../../shared/types/monitor";
import { watchMatchesCall } from "./match";
import type { WatchInput } from "./match";

const ALERTABLE: OpenCallStatus[] = ["open", "clarification", "amended"];

export interface MatchRunResult {
  calls: number;
  watches: number;
  matchedPairs: number;
  enqueued: number;
}

interface PairAccumulator {
  userId: string;
  compraId: string;
  watchIds: Set<string>;
  categories: Set<string>;
  keywords: Set<string>;
}

export async function runMatching(compraIds: string[], log: (m: string) => void = () => {}): Promise<MatchRunResult> {
  const unique = Array.from(new Set(compraIds));
  if (!unique.length) return { calls: 0, watches: 0, matchedPairs: 0, enqueued: 0 };

  const calls = await OpenCallModel.find({ compraId: { $in: unique } }).lean();
  const watches = await WatchModel.find({ active: true }).lean();
  if (!watches.length) return { calls: calls.length, watches: 0, matchedPairs: 0, enqueued: 0 };

  const pairs = new Map<string, PairAccumulator>();

  for (const call of calls) {
    if (!ALERTABLE.includes(call.status as OpenCallStatus)) continue;
    const view = {
      classificationSet: call.classificationSet ?? [],
      searchText: call.searchText ?? "",
      buyerId: call.buyer?.id,
      estimatedValue: call.estimatedValue,
      procurementMethodDetails: call.procurementMethodDetails,
    };

    for (const w of watches) {
      const reason = watchMatchesCall(w as unknown as WatchInput, view);
      if (!reason) continue;
      const key = `${w.userId}:${call.compraId}`;
      let acc = pairs.get(key);
      if (!acc) {
        acc = { userId: w.userId, compraId: call.compraId, watchIds: new Set(), categories: new Set(), keywords: new Set() };
        pairs.set(key, acc);
      }
      acc.watchIds.add(String(w._id));
      reason.categories.forEach(c => acc!.categories.add(c));
      reason.keywords.forEach(k => acc!.keywords.add(k));
    }
  }

  if (!pairs.size) return { calls: calls.length, watches: watches.length, matchedPairs: 0, enqueued: 0 };

  // Only deliverable users get a pending notification: active, opted-in, verified.
  const userIds = Array.from(new Set([...pairs.values()].map(p => p.userId)));
  const users = await UserModel.find({ uid: { $in: userIds } }).lean();
  const userMap = new Map(users.map(u => [u.uid, u]));

  const ops: Parameters<typeof NotificationModel.bulkWrite>[0] = [];
  const matchedWatchIds = new Set<string>();

  for (const p of pairs.values()) {
    const u = userMap.get(p.userId);
    if (!u || u.status !== "active" || !u.notificationPrefs?.enabled || !u.emailVerified) continue;

    const dedupeKey = `alert:${p.userId}:${p.compraId}`;
    ops.push({
      updateOne: {
        filter: { dedupeKey },
        update: {
          $setOnInsert: {
            type: "alert",
            userId: p.userId,
            compraId: p.compraId,
            watchIds: [...p.watchIds],
            matchedOn: { categories: [...p.categories], keywords: [...p.keywords] },
            dedupeKey,
            channel: "email",
            status: "pending",
            attempts: 0,
          },
        },
        upsert: true,
      },
    });
    p.watchIds.forEach(id => matchedWatchIds.add(id));
  }

  let enqueued = 0;
  if (ops.length) {
    const res = await NotificationModel.bulkWrite(ops, { ordered: false });
    enqueued = res.upsertedCount ?? 0;
  }
  if (matchedWatchIds.size) {
    await WatchModel.updateMany({ _id: { $in: [...matchedWatchIds] } }, { $set: { lastMatchedAt: new Date() } });
  }

  log(`matching: ${calls.length} calls × ${watches.length} watches → ${pairs.size} pairs, ${enqueued} enqueued`);
  return { calls: calls.length, watches: watches.length, matchedPairs: pairs.size, enqueued };
}
