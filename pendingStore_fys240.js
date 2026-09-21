/**
 * pendingStore_fys240.js
 * ----------------------
 * Storage for live-generated (unreviewed) quiz questions, shared by
 * quizGenerator_fys240.js (single-select) and multivalueQuizGenerator_fys240.js
 * (multi-select). Each generator makes one store, with its own file.
 *
 * Live-generated fallback questions are captured here for HUMAN REVIEW and a later
 * `node mergePending_fys240.js` run (see PENDING_QUESTIONS_fys240.md). They are never
 * served from the pending file and never written into a quiz bank automatically.
 *
 * Where the file lives:
 *   QUIZ_PENDING_DIR (env) set   -> that directory. Point it at a mounted Railway Volume
 *                                   (e.g. /data) and the pending questions survive redeploys.
 *   not set                      -> the repo directory, which is ephemeral on Railway (wiped on
 *                                   every redeploy).
 * Either way every captured question is ALSO printed as a structured log line
 * (<logTag> {...}), and the admin-only /pending command can export the files from the running
 * container, so nothing depends on the volume alone.
 *
 * Environment:
 *   QUIZ_PENDING_DIR   directory for the pending files (created on demand)
 *   QUIZ_PENDING_MAX   max entries kept per file (default 500). Beyond that the file stops
 *                      growing, but the log lines are still emitted.
 *
 * Entry shape: { chapter, section, lang: "en"|"fi", question: {...}, generatedAt }
 */

const fs = require('fs');
const path = require('path');

const PENDING_DIR = process.env.QUIZ_PENDING_DIR || __dirname;
const PENDING_MAX = Math.max(1, parseInt(process.env.QUIZ_PENDING_MAX || '500', 10) || 500);

function writeJsonAtomic(p, data) {
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

/**
 * @param {object} opts
 * @param {string} opts.fileName  e.g. 'quizBankPending_fys240.json'
 * @param {string} opts.logTag    e.g. 'QUIZ_PENDING_QUESTION' (what mergePending's `extract` looks for)
 * @param {string} opts.label     module name used in console warnings
 */
function createPendingStore({ fileName, logTag, label }) {
  const filePath = path.join(PENDING_DIR, fileName);

  /** Reads the pending file. A missing file is normal (empty); an unreadable one is flagged. */
  function read() {
    let raw;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      return { entries: [], corrupt: false };
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return { entries: parsed, corrupt: false };
    } catch (e) { /* fall through */ }
    return { entries: [], corrupt: true };
  }

  /** Moves an unreadable pending file aside (never silently overwrite captured questions). */
  function quarantineCorrupt() {
    const backup = `${filePath}.corrupt-${Date.now()}`;
    fs.renameSync(filePath, backup);
    console.warn(`${label}: pending file was unreadable — moved aside to ${backup}`);
  }

  /** Captures live-generated questions. Never throws: a storage problem must not break a quiz. */
  function append(chapter, section, questions, lang = 'en') {
    const generatedAt = new Date().toISOString();
    const entries = questions.map((q) => ({ chapter: String(chapter), section: section || null, lang, question: q, generatedAt }));

    try {
      fs.mkdirSync(PENDING_DIR, { recursive: true });
      const { entries: existing, corrupt } = read();
      if (corrupt) quarantineCorrupt();
      if (existing.length + entries.length > PENDING_MAX) {
        console.warn(`${label}: pending file is full (${existing.length}/${PENDING_MAX}) — not persisting ${entries.length} new question(s) to the file; the log lines below still capture them`);
      } else {
        writeJsonAtomic(filePath, existing.concat(entries));
      }
    } catch (e) {
      console.warn(`${label}: could not persist ${filePath} (${e.message}) — relying on stdout log capture instead`);
    }

    // Structured log line, independent of the file write above, so a log-based capture
    // pipeline (Railway log export -> `node mergePending_fys240.js extract`) works even
    // if the filesystem doesn't persist.
    for (const entry of entries) {
      console.log(`${logTag} ${JSON.stringify(entry)}`);
    }
  }

  /** Counts of captured-but-unreviewed questions, for /healthz and the admin /pending command. */
  function summary() {
    const { entries, corrupt } = read();
    const bySection = {};
    const byLang = {};
    for (const e of entries) {
      const k = e && e.section ? e.section : `ch${e && e.chapter}`;
      bySection[k] = (bySection[k] || 0) + 1;
      const l = (e && e.lang) || 'en';
      byLang[l] = (byLang[l] || 0) + 1;
    }
    return {
      total: entries.length,
      bySection,
      byLang,
      corrupt,
      path: filePath,
      persistentDir: !!process.env.QUIZ_PENDING_DIR,
      max: PENDING_MAX,
    };
  }

  /** Empties the pending file (admin /pending clear). Returns how many entries were removed. */
  function clear() {
    fs.mkdirSync(PENDING_DIR, { recursive: true });
    const { entries, corrupt } = read();
    if (corrupt) quarantineCorrupt();
    writeJsonAtomic(filePath, []);
    return entries.length;
  }

  return { path: filePath, read, append, summary, clear };
}

module.exports = { createPendingStore };
