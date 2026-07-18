// Access environment variables directly in server context
import { config } from "dotenv";
// override:true makes .env authoritative over any pre-existing shell/system env var. Without it,
// dotenv silently keeps a shadowing variable — e.g. a stale free-tier GEMINI_API_KEY set as a
// Windows user env var was overriding the paid key in .env, forcing every AI-triage call onto the
// 20 RPM free quota (429s). .env is this project's single source of truth (prod Mongo creds live
// there too), so it must win.
config({ override: true });
export const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/gastos_gub'
export const mongoDatabase = process.env.MONGODB_DB || process.env.MONGO_DATABASE || 'gastos_gub'