import { Schema } from "mongoose";
import type { Model } from "mongoose";
import { mongoose } from "../connection/database";
import { IUser } from "../types/monitor";

// Application user, keyed by Firebase `uid`. Firebase owns authentication;
// this doc is the system of record for everything else (prefs, watches count).
// Created/updated on session mint (upsert) in app/server/api/auth/session.
const UserSchema = new Schema<IUser>(
  {
    uid: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    emailVerified: { type: Boolean, default: false },
    displayName: { type: String },
    photoURL: { type: String },
    // Firebase provider ids: 'password' | 'google.com' | 'emailLink'.
    providers: { type: [String], default: [] },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    locale: { type: String, enum: ["es", "en"], default: "es" },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    notificationPrefs: {
      enabled: { type: Boolean, default: true },
      frequency: { type: String, enum: ["instant", "daily"], default: "instant" },
    },
    // Opaque token for one-click List-Unsubscribe links. Unique so the
    // unsubscribe endpoint can resolve a user without exposing the uid.
    unsubscribeToken: { type: String, required: true, unique: true },
    // Denormalized count, enforced against the free-tier cap on watch create.
    watchCount: { type: Number, default: 0 },
    lastLoginAt: { type: Date },
  },
  { timestamps: true, collection: "users" }
);

// Indexes are BUILT by scripts/ensure-indexes.ts (autoIndex is off globally).
// Declared here for documentation + so ensureIndexes can mirror them.
UserSchema.index({ uid: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ unsubscribeToken: 1 }, { unique: true });

export const UserModel: Model<IUser> =
  (mongoose.models.User as Model<IUser>) || mongoose.model<IUser>("User", UserSchema);
