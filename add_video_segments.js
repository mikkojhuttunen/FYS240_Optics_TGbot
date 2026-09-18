#!/usr/bin/env node
/**
 * Parse a pasted YouTube timestamp/chapter list (the kind shown under a
 * video's description, e.g. "16:48 Poyntingin vektori S = c^2 eps0 ExB")
 * and store it as searchable, linkable segments for that video.
 *
 * Segments live in video_segments.json, SEPARATE from fys240_videos.js,
 * so re-running build_optics_videos.js from a fresh analytics CSV never
 * wipes out timestamps you've already added.
 *
 * USAGE
 *   node add_video_segments.js <videoId> < timestamps.txt
 *   node add_video_segments.js <videoId> path/to/timestamps.txt
 *   pbpaste | node add_video_segments.js <videoId>        (macOS clipboard)
 *
 * <videoId> is the YouTube ID (the id or id_fi field from fys240_videos.js,
 * e.g. from https://www.youtube.com/watch?v=KCRFMlnFNbQ it's KCRFMlnFNbQ).
 *
 * Input format: one "chapter" per line, timestamp first, e.g.:
 *   0:00 Johdanto (mm. Poyntingin teoreema)
 *   3:30 Sähkömagneettinen kenttä siirtää energiaa paikasta A paikkaan B
 *   16:48 Poyntingin vektori S = c^2 eps0 ExB
 * Non-matching lines (view counts, dates, blank lines) are skipped
 * automatically — you can paste the whole description block as-is.
 *
 * Re-running for a videoId REPLACES its segment list (so you can paste an
 * updated/corrected list and just rerun).
 */

const fs = require("fs");
const path = require("path");

const SEGMENTS_PATH = path.join(__dirname, "video_segments.json");

// Matches "0:00 label", "12:42 label", "1:02:15 label" at the start of a line.
const TIMESTAMP_LINE = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+(.+?)\s*$/;

function parseTimestamps(text) {
  const segments = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(TIMESTAMP_LINE);
    if (!m) continue; // skip "271 views  Aug 6, 2022" and blank lines etc.
    const [, hh, mm, ss, label] = m;
    if (!label) continue;
    const t = (hh ? parseInt(hh, 10) * 3600 : 0) + parseInt(mm, 10) * 60 + parseInt(ss, 10);
    segments.push({ t, label: label.trim() });
  }
  // Sort and de-dupe identical timestamps just in case of a pasted duplicate.
  segments.sort((a, b) => a.t - b.t);
  return segments;
}

function main() {
  const videoId = process.argv[2];
  const filePath = process.argv[3];

  if (!videoId) {
    console.error("Usage: node add_video_segments.js <videoId> [file] < timestamps.txt");
    process.exit(1);
  }

  const readInput = () =>
    new Promise((resolve, reject) => {
      if (filePath) {
        fs.readFile(filePath, "utf8", (err, data) => (err ? reject(err) : resolve(data)));
        return;
      }
      let data = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => (data += chunk));
      process.stdin.on("end", () => resolve(data));
      process.stdin.on("error", reject);
    });

  readInput()
    .then((raw) => {
      const segments = parseTimestamps(raw);
      if (segments.length === 0) {
        console.error("No timestamp lines found. Expected lines like '16:48 Some label'.");
        process.exit(1);
      }

      let store = {};
      if (fs.existsSync(SEGMENTS_PATH)) {
        try {
          store = JSON.parse(fs.readFileSync(SEGMENTS_PATH, "utf8"));
        } catch (e) {
          console.error(`WARNING: ${SEGMENTS_PATH} was unreadable/corrupt, starting fresh (${e.message})`);
        }
      }

      store[videoId] = segments;

      fs.writeFileSync(SEGMENTS_PATH, JSON.stringify(store, null, 2) + "\n");

      // Best-effort sanity check against the live video DB (non-fatal if missing).
      let note = "";
      try {
        const db = require("./fys240_videos");
        const video = db.getVideo(videoId);
        if (!video) {
          note = "  (note: this videoId isn't in fys240_videos.js yet — segments are stored but won't be looked up until it is)";
        } else {
          const lang = video.id === videoId ? "en" : video.id_fi === videoId ? "fi" : "?";
          note = `  (matched chapter ${video.chapter} "${video.topic}", lang=${lang})`;
        }
      } catch (e) {
        // fys240_videos.js not present in this directory — fine, skip the check.
      }

      console.log(`✓ Saved ${segments.length} segments for ${videoId} -> ${SEGMENTS_PATH}${note}`);
      segments.forEach((s) => {
        const mm = String(Math.floor(s.t / 60)).padStart(2, "0");
        const ssec = String(s.t % 60).padStart(2, "0");
        console.log(`   ${mm}:${ssec}  ${s.label}`);
      });
    })
    .catch((e) => {
      console.error("Error:", e.message);
      process.exit(1);
    });
}

main();
