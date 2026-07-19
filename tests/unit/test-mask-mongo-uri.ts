/**
 * The connection-string redaction used before logging. A leaked password here
 * ends up in pm2's on-disk logs on every job spawn.
 *   npx tsx tests/unit/test-mask-mongo-uri.ts
 */
import assert from "node:assert";
import { maskMongoUri } from "../../shared/connection/database";

let n = 0;
function ok(name: string, cond: boolean) { assert.ok(cond, name); n++; console.log(`  ✓ ${name}`); }

const withCreds = "mongodb://admin:s3cr3t@167.148.41.10:27017/gastos_gub?authSource=admin";
const masked = maskMongoUri(withCreds);
ok("password removed", !masked.includes("s3cr3t"));
ok("masked marker present", masked.includes(":***@"));
ok("user kept", masked.includes("admin:***@"));
ok("host kept", masked.includes("167.148.41.10:27017"));
ok("db + query kept", masked.includes("/gastos_gub?authSource=admin"));

ok("no-credential uri unchanged", maskMongoUri("mongodb://localhost:27017/gastos_gub") === "mongodb://localhost:27017/gastos_gub");
ok("mongodb+srv masked", maskMongoUri("mongodb+srv://u:p@cluster.x.net/db").includes("u:***@") && !maskMongoUri("mongodb+srv://u:p@cluster.x.net/db").includes(":p@"));
ok("user without password masked", maskMongoUri("mongodb://useronly@host:27017/db") === "mongodb://useronly:***@host:27017/db");
ok("password with special chars removed", !maskMongoUri("mongodb://u:p%40ss:w0rd!@host/db").includes("p%40ss"));
ok("empty string safe", maskMongoUri("") === "");

console.log(`\n✅ ${n} assertions passed`);
