#!/usr/bin/env node
/**
 * One-off bulk import: parses FYS_240_video_contents_FI.docx (which is
 * actually plain text — a LaTeX-flavoured export, not a real .docx zip —
 * pandoc/word tools can't open it, so this reads it as UTF-8 text) and
 * writes segments for every "FYS. 240 Optiikka X.Y <title>" block into
 * video_segments.json, using the same format add_video_segments.js
 * produces so both tools stay interchangeable going forward.
 */

const fs = require("fs");
const path = require("path");

const SRC = process.argv[2] || "/mnt/project/FYS_240_video_contents_FI.docx";
const SEGMENTS_PATH = path.join(__dirname, "video_segments.json");

const CHAPTER_HEADER = /^\s*FYS\.\s*240\s*Optiikka\s+([\d.]+)\s+(.+?)\s*$/;
// Finds a timestamp TOKEN anywhere in text (not just at line-start), so it
// works whether entries are one-per-line or all crammed onto a single line
// separated by spaces (both occur in these source docs). Requires the token
// to be followed by whitespace so we don't misfire inside e.g. "eps0:12".
const TIMESTAMP_TOKEN = /(?:^|(?<=[\s(]))(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?=\s)/g;
const SKIP_LINE = /^\\(begin|end)\{itemize\}$|^Description\s*\?$/;

// Parses a whole chapter block (its raw lines) by joining them into one
// string and splitting on every timestamp token found anywhere in it, so
// "0:00 A 1:08 B 2:26 C" on a single line yields three separate segments
// just like three separate "M:SS text" lines would.
function parseSegmentBlock(rawLines, chapterLabel) {
  const cleaned = rawLines
    .map((l) => l.trim())
    .filter((l) => l && !SKIP_LINE.test(l))
    .map((l) => l.replace(/^\\item\[\]\s*/, ""));
  const joined = cleaned.join(" ");

  const matches = [...joined.matchAll(TIMESTAMP_TOKEN)];
  const segments = [];
  let prevT = -1;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const [, hh, mm, ss] = m;
    const t = (hh ? parseInt(hh, 10) * 3600 : 0) + parseInt(mm, 10) * 60 + parseInt(ss, 10);
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : joined.length;
    const label = joined.slice(start, end).trim();
    if (label) {
      // A timestamp earlier than the one right before it, in document
      // order, almost always means a typo in the SOURCE doc (not
      // something this script can safely auto-correct) rather than a
      // parsing failure — flag it so a human can check the actual video.
      if (t < prevT) {
        const mm2 = String(Math.floor(t / 60)).padStart(2, "0"), ss2 = String(t % 60).padStart(2, "0");
        const pmm = String(Math.floor(prevT / 60)).padStart(2, "0"), pss = String(prevT % 60).padStart(2, "0");
        console.log(`  ⚠ ${chapterLabel}: "${label.slice(0, 60)}" is timestamped ${mm2}:${ss2}, earlier than the previous entry (${pmm}:${pss}) — likely a typo in the source doc, please verify against the actual video.`);
      }
      prevT = t;
      segments.push({ t, label });
    }
  }
  segments.sort((a, b) => a.t - b.t);
  return segments;
}

function main() {
  // Fix timestamps glued directly onto the preceding word with no space at
  // all (found one real case: "...g(x)h(y)3:50 y-suunnan..." in ch. 9.3).
  // Only triggers when a LETTER or ")" sits directly against the timestamp
  // shape — deliberately NOT when a digit precedes it, since that's
  // ambiguous with a legitimate 2-digit minute value (e.g. "0 4:06" is a
  // real, separate timestamp, not something to touch; an earlier version
  // of this fix didn't exclude digits and corrupted ~300 good timestamps
  // like "16:31" into "1 6:31" — lookbehind-only insertion (no consumed
  // characters) plus the digit exclusion avoids that.
  const rawText = fs.readFileSync(SRC, "utf8");
  const text = rawText.replace(/(?<=[\p{L})])(?=\d{1,2}:\d{2}(?::\d{2})?\s)/gu, " ");
  const lines = text.split(/\r?\n/);

  // Split into per-chapter blocks at each "FYS. 240 Optiikka X.Y title" header.
  const blocks = []; // [{chapter, title, lines}]
  let current = null;
  for (const line of lines) {
    const m = line.match(CHAPTER_HEADER);
    if (m) {
      current = { chapter: m[1], title: m[2].trim(), lines: [] };
      blocks.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }

  let db = null;
  try {
    db = require("./fys240_videos");
  } catch (e) {
    console.error(`Couldn't load fys240_videos.js for chapter->videoId lookup: ${e.message}`);
    process.exit(1);
  }

  // Warn (but don't blindly drop) if the source doesn't end with a newline —
  // last time that indicated a genuinely truncated mid-word line; this time
  // it may just be a normal file with no trailing newline. Print the last
  // parsed line of the last block so it can be eyeballed either way.
  if (blocks.length && !text.endsWith("\n")) {
    const lastBlock = blocks[blocks.length - 1];
    const lastLine = (lastBlock.lines[lastBlock.lines.length - 1] || "").trim();
    console.log(`Note: source file has no trailing newline. Last line of chapter ${lastBlock.chapter}: "${lastLine}" — verify this isn't cut off mid-word before trusting it.`);
  }

  let store = {};
  if (fs.existsSync(SEGMENTS_PATH)) {
    try {
      store = JSON.parse(fs.readFileSync(SEGMENTS_PATH, "utf8"));
    } catch (e) {
      console.error(`WARNING: ${SEGMENTS_PATH} unreadable, starting fresh (${e.message})`);
    }
  }

  const seenChapters = new Set();
  let imported = 0, skippedDupe = 0, skippedNoVideo = 0, skippedEmpty = 0;

  blocks.forEach((block) => {
    if (seenChapters.has(block.chapter)) {
      skippedDupe++;
      console.log(`= ${block.chapter}: duplicate block in source, skipped (already imported)`);
      return;
    }

    const videos = db.getChapter(block.chapter);
    if (!videos.length || !videos[0].id_fi) {
      skippedNoVideo++;
      console.log(`⚠ ${block.chapter}: no Finnish video in fys240_videos.js, skipped`);
      return;
    }
    const videoId = videos[0].id_fi;

    const segments = parseSegmentBlock(block.lines, `${block.chapter} (${block.title})`);
    if (segments.length === 0) {
      skippedEmpty++;
      console.log(`⚠ ${block.chapter}: no parseable timestamps, skipped`);
      return;
    }

    store[videoId] = segments;
    seenChapters.add(block.chapter);
    imported++;
    console.log(`✓ ${block.chapter} (${block.title}) -> ${videoId}: ${segments.length} segments`);
  });

  fs.writeFileSync(SEGMENTS_PATH, JSON.stringify(store, null, 2) + "\n");

  console.log(`\nImported ${imported} chapters, ${skippedDupe} duplicate block(s) skipped, ` +
    `${skippedNoVideo} with no matching video, ${skippedEmpty} with no timestamps.`);
  console.log(`-> ${SEGMENTS_PATH}`);
}

main();
