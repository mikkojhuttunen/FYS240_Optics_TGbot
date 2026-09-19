#!/usr/bin/env node
/**
 * build_homework.js — extracts \ExerciseNu / \SolutionNu content from
 * HW1_Optics.tex ... HW6_Optics.tex into:
 *   - homework_problems.json   {"<hw>": {"<problem>": "<verbatim question text>"}}
 *     (replaces the old file, which was 100% FYS.501 Laser Physics content)
 *   - homework_solutions.json  {"<hw>": {"<problem>": "<verbatim solution text>"}}
 *     (NEW — instructor-reference only, see README note written alongside it;
 *     NOT loaded by bot_fys240.js and must never be wired to a student-facing
 *     command per the course's no-solutions rule)
 *
 * Usage: node build_homework.js [sourceDir] [outDir]
 */

const fs = require('fs');
const path = require('path');
const { extractTwoBraceMacro, cleanHomeworkText } = require('./clean_homework.js');

const sourceDir = process.argv[2] || '.';
const outDir = process.argv[3] || '.';

const problems = {};
const solutions = {};
const report = [];

for (let hw = 1; hw <= 6; hw++) {
  const filePath = path.join(sourceDir, `HW${hw}_Optics.tex`);
  if (!fs.existsSync(filePath)) {
    report.push(`HW${hw}: source file not found (${filePath}) — skipped`);
    continue;
  }
  const raw = fs.readFileSync(filePath, 'utf8');

  // Strip comments once up front so \ExerciseNu/\SolutionNu occurrences
  // inside commented-out (retired/old-year) blocks are never matched.
  const { stripComments } = require('./clean.js');
  const active = stripComments(raw);

  const exercises = extractTwoBraceMacro(active, 'ExerciseNu');
  const sols = extractTwoBraceMacro(active, 'SolutionNu');

  problems[String(hw)] = problems[String(hw)] || {};
  solutions[String(hw)] = solutions[String(hw)] || {};

  exercises.forEach(({ id, content }) => {
    const [major, minor] = id.split('.');
    if (major !== String(hw)) {
      report.push(`HW${hw}: \\ExerciseNu{${id}} has a major number that doesn't match its file — kept under HW${hw}, problem ${minor || id}, but flagging for review`);
    }
    const problemNum = minor || id;
    problems[String(hw)][problemNum] = cleanHomeworkText(content);
    report.push(`HW${hw}.${problemNum}: extracted exercise (${content.length} raw chars -> ${problems[String(hw)][problemNum].length} clean chars)`);
  });

  sols.forEach(({ id, content }) => {
    const bareId = id.replace(/^S/i, ''); // "S1.3" -> "1.3"
    const [major, minor] = bareId.split('.');
    const problemNum = minor || bareId;
    solutions[String(hw)][problemNum] = cleanHomeworkText(content);
    report.push(`HW${hw}.${problemNum}: extracted solution (${content.length} raw chars -> ${solutions[String(hw)][problemNum].length} clean chars)`);
  });

  if (exercises.length === 0) {
    report.push(`HW${hw}: WARNING — no \\ExerciseNu found`);
  }
}

// Drop any HW sets that ended up with zero problems (keeps the JSON tidy)
for (const hw of Object.keys(problems)) {
  if (Object.keys(problems[hw]).length === 0) delete problems[hw];
}
for (const hw of Object.keys(solutions)) {
  if (Object.keys(solutions[hw]).length === 0) delete solutions[hw];
}

fs.writeFileSync(path.join(outDir, 'homework_problems.json'), JSON.stringify(problems, null, 2), 'utf8');
fs.writeFileSync(path.join(outDir, 'homework_solutions.json'), JSON.stringify(solutions, null, 2), 'utf8');

const totalProblems = Object.values(problems).reduce((n, hw) => n + Object.keys(hw).length, 0);
const totalSolutions = Object.values(solutions).reduce((n, hw) => n + Object.keys(hw).length, 0);

console.log(report.join('\n'));
console.log();
console.log(`✓ homework_problems.json: ${totalProblems} problems across ${Object.keys(problems).length} homeworks`);
console.log(`✓ homework_solutions.json: ${totalSolutions} solutions across ${Object.keys(solutions).length} homeworks`);
