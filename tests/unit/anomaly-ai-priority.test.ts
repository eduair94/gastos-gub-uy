// Run: npx tsx tests/unit/anomaly-ai-priority.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildTriageSelectionPipeline, parseArgs } from "../../src/jobs/score-anomalies-ai";

const pipeline = buildTriageSelectionPipeline(
  { type: "price_spike", severityRank: { $gte: 1 } },
  "desc",
  60
);

assert.deepEqual(pipeline[0], {
  $match: { type: "price_spike", severityRank: { $gte: 1 } },
});
assert.deepEqual(pipeline[1], {
  $lookup: {
    from: "releases",
    localField: "releaseId",
    foreignField: "id",
    as: "sourceRelease",
  },
});
assert.deepEqual(pipeline[2], {
  $set: {
    sourceDate: {
      $ifNull: [
        { $arrayElemAt: ["$sourceRelease.date", 0] },
        "$firstDetectedAt",
      ],
    },
  },
});
assert.deepEqual(pipeline[4], {
  $sort: {
    sourceDate: -1,
    severityRank: -1,
    firstDetectedAt: -1,
    detectedValue: -1,
    _id: -1,
  },
});
assert.deepEqual(pipeline[5], { $limit: 60 });
assert.equal(parseArgs(["--min-rank=1", "--limit=60", "--rpm=18"]).minRank, 1);

const cronSource = fs.readFileSync(path.resolve(__dirname, "../../src/cronserver.ts"), "utf8");
const scorerSource = fs.readFileSync(path.resolve(__dirname, "../../src/jobs/score-anomalies-ai.ts"), "utf8");
assert.match(cronSource, /const anomalyAiExpression = "50 \* \* \* \*"/);
assert.match(cronSource, /\["--min-rank=1", `--limit=\$\{this\.anomalyAiBatchLimit\(\)\}`/);
assert.match(cronSource, /this\.app\.get\("\/cron\/anomaly-ai\/status"/);
assert.match(cronSource, /this\.isPliegoSummaryRunning \|\| this\.isAnomalyAiRunning/);
assert.match(cronSource, /AI_TRIAGE_SUMMARY candidates=/);
assert.match(scorerSource, /new ProviderRotator/);
assert.match(scorerSource, /totalTimeoutMs: DEFAULT_TOTAL_REQUEST_TIMEOUT_MS/);
assert.match(scorerSource, /stream: true/);

const deployWorkflow = fs.readFileSync(path.resolve(__dirname, "../../.github/workflows/deploy.yml"), "utf8");
assert.ok(
  deployWorkflow.indexOf("npm run build") < deployWorkflow.indexOf("pm2 startOrRestart ecosystem.config.js --only gastos-gub-cronserver"),
  "root TypeScript must compile before PM2 restarts the dist cronserver"
);

console.log("anomaly AI recent priority and bounded retry policy: OK");
