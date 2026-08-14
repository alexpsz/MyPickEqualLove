import fs from "node:fs";
import path from "node:path";

const reportDir = process.argv[2];
if (!reportDir) {
  throw new Error(
    "usage: node scripts/summarize-discography-reports.mjs <report-dir>",
  );
}

const projectIds = ["equal-love", "nearly-equal-joy", "not-equal-me"];
const rows = [];

for (const projectId of projectIds) {
  const reportPath = path.join(reportDir, `${projectId}.json`);
  if (!fs.existsSync(reportPath)) {
    rows.push([projectId, "missing", "missing", "missing", "0", "block"]);
    continue;
  }

  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    rows.push([
      projectId,
      report.outcome ?? "missing",
      report.sources?.credits?.status ?? "missing",
      report.sources?.officialNews?.status ?? "missing",
      String(report.reviewCandidates?.length ?? 0),
      report.publishDecision ?? "block",
    ]);
  } catch (error) {
    rows.push([
      projectId,
      "invalid",
      "invalid",
      "invalid",
      "0",
      `block (${error.message})`,
    ]);
  }
}

console.log("## Discography source receipt");
console.log("");
console.log(
  "| Project | Outcome | Credits source | Official NEWS | Review candidates | Decision |",
);
console.log("| --- | --- | --- | --- | ---: | --- |");
for (const row of rows) {
  console.log(`| ${row.join(" | ")} |`);
}
