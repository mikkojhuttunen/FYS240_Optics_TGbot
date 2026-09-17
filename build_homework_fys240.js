/**
 * Build homework_problems.json for the FYS.240 Optics bot, directly from the
 * course's own HW*.tex sources (HW1_Optics.tex ... HW6_Optics.tex) — same
 * approach as build_corpus.js for the lecture slides: reuse clean_fys240.js
 * to turn raw .tex into clean Unicode text, rather than extracting from PDF.
 *
 * SOURCE FORMAT (confirmed against the actual HW1-HW6 .tex files):
 *   - Each problem is written as   \ExerciseNu{<hw>.<n>}{ ...text... }
 *     e.g. \ExerciseNu{3.2}{Consider ...}  is Homework 3, problem 2.
 *   - Its solution immediately follows, wrapped as
 *       \solution{ \SolutionNu{S<hw>.<n>}{ ...text... } }
 *   - Finnish variants (\Harjoitus / \Solution) and older/inactive problem
 *     variants are present but commented out with %.
 *   - Only SOME problem numbers are active per file (typically 1-2 out of a
 *     presumable 1-4 range) — the rest exist only as commented-out text
 *     from previous years. This is expected, not a bug: /HW<n> commands
 *     will just fall back to full-corpus search for any problem number this
 *     script doesn't find, exactly as if homework_problems.json were absent
 *     for that one problem.
 *
 * SAFETY — SOLUTIONS ARE NEVER KEPT:
 *   Every \solution{...} block (and everything nested inside it, including
 *   \SolutionNu{...}) is deleted from each file's text BEFORE problems are
 *   extracted. Solution text never reaches homework_problems.json, the
 *   course corpus, or Claude's context — matching the bot's standing
 *   "you do NOT have homework solutions" rule. A post-write scan re-checks
 *   the final JSON for solution markers as a defense-in-depth safety net.
 *
 * USAGE:
 *   node build_homework_fys240.js <tex_dir>
 *
 * <tex_dir> should contain the HW*.tex files (e.g. HW1_Optics.tex through
 * HW6_Optics.tex). The homework number is read from each file's own
 * \ExerciseNu{<hw>.<n>} labels, not guessed from the filename — but if a
 * filename contains "HW<n>" and that digit disagrees with what the file's
 * own exercises say, a warning is printed (the exercise labels win).
 */

const fs = require('fs');
const path = require('path');
const clean = require('./clean_fys240.js');

// Matches an HW number in a filename, if present — used only for the
// filename-vs-label cross-check warning, never to decide where a problem
// gets filed.
const FILENAME_HW_RE = /(?:hw|homework)[\s_-]*(\d+)/i;

// Removes every \solution{...} block (balanced-brace, handles nesting)
// from the text, so solution content — including the \SolutionNu{...}
// inside it — is discarded before problems are ever extracted.
function stripSolutionBlocks(text) {
  const re = /\\solution(?![A-Za-z])\{/;
  let out = text;
  let guard = 0;
  while (guard++ < 1000) {
    const m = out.match(re);
    if (!m) break;
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = clean.matchBrace(out, openIdx);
    if (closeIdx === -1) {
      console.warn(`  WARNING: found "\\solution{" with no matching closing brace — ` +
        `stripping just the macro token so it doesn't loop forever. Check this file by hand.`);
      out = out.slice(0, m.index) + out.slice(m.index + m[0].length);
      continue;
    }
    out = out.slice(0, m.index) + out.slice(closeIdx + 1);
  }
  return out;
}

// Extracts every \ExerciseNu{<hw>.<n>}{...text...} from (solution-stripped)
// text. Returns [{ hwNum, problemNum, rawContent }, ...] in source order.
function extractExercises(text) {
  const re = /\\ExerciseNu\{(\d+)\.(\d+)\}\{/g;
  const found = [];
  let m;
  while ((m = re.exec(text))) {
    const [hwNum, problemNum] = [m[1], m[2]];
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = clean.matchBrace(text, openIdx);
    if (closeIdx === -1) {
      console.warn(`  WARNING: \\ExerciseNu{${hwNum}.${problemNum}} has no matching closing brace — skipped.`);
      continue;
    }
    found.push({ hwNum, problemNum, rawContent: text.slice(openIdx + 1, closeIdx) });
    re.lastIndex = closeIdx + 1; // resume scanning after this exercise's closing brace
  }
  return found;
}

function main() {
  const texDir = process.argv[2];
  if (!texDir) {
    console.error('Usage: node build_homework_fys240.js <tex_dir>');
    process.exit(1);
  }

  const files = fs.readdirSync(texDir).filter((f) => f.toLowerCase().endsWith('.tex'));
  if (files.length === 0) {
    console.error(`No .tex files found in ${texDir}`);
    process.exit(1);
  }

  const result = {};
  const stats = [];

  for (const file of files.sort()) {
    console.log(`Processing ${file}...`);
    const raw = fs.readFileSync(path.join(texDir, file), 'utf8');

    const stripped = clean.stripComments(raw);
    const solutionsGone = stripSolutionBlocks(stripped);
    const exercises = extractExercises(solutionsGone);

    if (exercises.length === 0) {
      console.warn(`  WARNING: no \\ExerciseNu{...} found (active, uncommented) in ${file}.`);
      continue;
    }

    const filenameHw = (file.match(FILENAME_HW_RE) || [])[1];

    for (const { hwNum, problemNum, rawContent } of exercises) {
      if (filenameHw && filenameHw !== hwNum) {
        console.warn(
          `  WARNING: ${file} looks like HW${filenameHw} by filename, but contains ` +
          `\\ExerciseNu{${hwNum}.${problemNum}} — filing it under HW${hwNum} (trusting the label, not the filename).`
        );
      }
      if (result[hwNum]?.[problemNum]) {
        console.warn(`  WARNING: HW${hwNum} problem ${problemNum} already set — ${file} is overwriting it.`);
      }

      const cleanedText = clean.cleanTex(rawContent);
      result[hwNum] = result[hwNum] || {};
      result[hwNum][problemNum] = `${hwNum}.${problemNum}.\n${cleanedText}`;
      stats.push({ file, hwNum, problemNum, chars: cleanedText.length });
    }
  }

  const json = JSON.stringify(result, null, 2);

  // Defense-in-depth: confirm no solution content slipped through before
  // writing anything to disk.
  if (/SolutionNu|\\solution\{/.test(json)) {
    console.error(
      '\nABORTING — the word "SolutionNu" or a "\\solution{" marker was found in the ' +
      'extracted output. Refusing to write homework_problems.json until this is fixed by hand, ' +
      'since it likely means solution text leaked through.'
    );
    process.exit(1);
  }

  fs.writeFileSync('homework_problems.json', json, 'utf8');

  console.log('\nFile'.padEnd(22) + 'HW'.padEnd(5) + 'Prob'.padEnd(6) + 'Chars');
  for (const s of stats) {
    console.log(s.file.padEnd(22) + String(s.hwNum).padEnd(5) + String(s.problemNum).padEnd(6) + s.chars);
  }
  console.log(`\nWrote homework_problems.json — ${stats.length} problems across ${Object.keys(result).length} homework set(s).`);

  const missing = [1, 2, 3, 4, 5, 6].filter((n) => !result[String(n)]);
  if (missing.length) {
    console.log(
      `Note: HW${missing.join(', HW')} has no active problems in the source .tex — expected if ` +
      `those sets have no currently-assigned problems yet (older variants are commented out). ` +
      `Their /HW commands will fall back to full-corpus search.`
    );
  }
}

main();
