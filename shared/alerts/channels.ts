import type { INotificationChannels, IUser } from "../types/monitor";

// Legacy users (created before per-channel prefs) and users who never touched the
// toggles get email + the in-app inbox on, push/telegram off. Everything is still
// gated by the master `notificationPrefs.enabled` switch.
export const DEFAULT_CHANNELS: INotificationChannels = {
  email: true,
  push: false,
  telegram: false,
  inapp: true,
};

export const ALL_CHANNELS_OFF: INotificationChannels = {
  email: false,
  push: false,
  telegram: false,
  inapp: false,
};

/**
 * The effective channel opt-in for a user, resolving the master switch and the
 * backward-compat default. This is PREFERENCE only — the matching driver still
 * gates `push`/`telegram` on an actual connection (a push subscription / a linked
 * chat) and `email` on `emailVerified`.
 */
export function resolveChannels(user: Pick<IUser, "notificationPrefs">): INotificationChannels {
  const prefs = user.notificationPrefs;
  if (!prefs?.enabled) return { ...ALL_CHANNELS_OFF };
  const c = prefs.channels;
  if (!c) return { ...DEFAULT_CHANNELS };
  return {
    email: c.email ?? DEFAULT_CHANNELS.email,
    push: c.push ?? DEFAULT_CHANNELS.push,
    telegram: c.telegram ?? DEFAULT_CHANNELS.telegram,
    inapp: c.inapp ?? DEFAULT_CHANNELS.inapp,
  };
}
