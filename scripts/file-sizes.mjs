#!/usr/bin/env node
/**
 * Lists source files over the size heuristic (CLAUDE.md, "File size"). It never fails:
 * it is a prompt to split, not a gate. In GitHub Actions each file is also a warning
 * annotation on the run. Test files over it are listed too, for information: a new test
 * belongs in a file of its own (e.g. `ChatPane.turn.test.tsx`) rather than at the end of one.
 *
 *   node scripts/file-sizes.mjs          files over 400 lines
 *   node scripts/file-sizes.mjs 300      a different threshold
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const limit = Number(process.argv[2] ?? 400);
const all = execFileSync("git", ["ls-files", "packages", "library"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => /^(packages\/[^/]+|library)\/src\/.*\.tsx?$/.test(f) && !f.includes("/integration/"));
const isTest = (f) => /\.test\.tsx?$/.test(f);
const over = (files) =>
  files
    .map((file) => ({ file, lines: readFileSync(file, "utf8").split("\n").length }))
    .filter((f) => f.lines > limit)
    .sort((a, b) => b.lines - a.lines);

const big = over(all.filter((f) => !isTest(f)));
const bigTests = over(all.filter(isTest));

if (big.length === 0) {
  console.log(`No source file is over ${limit} lines.`);
} else {
  console.log(`${big.length} source files are over ${limit} lines (split before adding to them):`);
  for (const { file, lines } of big) {
    console.log(`  ${String(lines).padStart(5)}  ${file}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::warning file=${file}::${lines} lines, over the ${limit}-line heuristic: split it before adding to it (see CLAUDE.md)`);
  }
}
if (bigTests.length) {
  console.log(`${bigTests.length} test files are over ${limit} lines (put new tests in a file of their own):`);
  for (const { file, lines } of bigTests) console.log(`  ${String(lines).padStart(5)}  ${file}`);
}
