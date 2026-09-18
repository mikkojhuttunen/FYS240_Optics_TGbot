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

const CHAPTER_HEADER = /^FYS\.\s*240\s*Optiikka\s+([\d.]+)\s+(.+)$/;
const TIMESTAMP_LINE = /^\s*(?:\\item\[\]\s*)?(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+(.+?)\s*$/;
const SKIP_LINE = /^\\(begin|end)\{itemize\}$|^Description\s*\?$/;

function parseSegmentLines(lines) {
  const segments = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || SKIP_LINE.test(line)) continue;
    const m = line.match(TIMESTAMP_LINE);
    if (!m) continue;
    const [, hh, mm, ss, label] = m;
    if (!label) continue;
    const t = (hh ? parseInt(hh, 10) * 3600 : 0) + parseInt(mm, 10) * 60 + parseInt(ss, 10);
    segments.push({ t, label: label.trim() });
  }
  segments.sort((a, b) => a.t - b.t);
  return segments;
}

function main() {
  const text = fs.readFileSync(SRC, "utf8");
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

  // The source document itself is cut off mid-sentence at the very end
  // (no trailing newline, last line ends mid-word) — drop that dangling
  // last line from the last block so we don't store a truncated label.
  if (blocks.length && !text.endsWith("\n")) {
    const lastBlock = blocks[blocks.length - 1];
    const dropped = lastBlock.lines.pop();
    console.log(`Note: source file is truncated mid-sentence; dropped incomplete trailing line for chapter ${lastBlock.chapter}: "${(dropped || "").trim()}"`);
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

    const segments = parseSegmentLines(block.lines);
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
