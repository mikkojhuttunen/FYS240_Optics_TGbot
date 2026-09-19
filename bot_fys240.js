/**
 * FYS.240 Optics — Telegram teaching-assistant bot
 * ============================================================================
 * VERSION: see BOT_VERSION below. Bump it (semver: MAJOR.MINOR.PATCH) any
 * time you ship a change here, and add a line to the CHANGELOG block —
 * that's the whole versioning process, no build step needed. Convention:
 * MAJOR = breaking change to a command's behavior or removed a feature,
 * MINOR = new command/feature, PATCH = bugfix/content fix with no new
 * command. BOT_VERSION is surfaced in /healthz and the startup log line,
 * so you can always confirm which version is actually live on Railway.
 * ============================================================================
 *
 * CURRENT FUNCTIONALITY (v2.3.0):
 *   - Free-text Q&A grounded in course_corpus.txt, answers in whichever
 *     language (EN/FI) the student's question is written in
 *   - Bilingual (EN/FI) video lecture links from fys240_videos.js, with
 *     in-video timestamp links (&t=Xs) from video_segments.json where added
 *   - Deterministic correction of wrong-language video links
 *     (fixVideoLinkLanguage/isFinnishText)
 *   - Math sent as plain Unicode text (α, β, √, ², ᵢ, ...) — no LaTeX/image
 *     rendering; latexToUnicode() converts/strips any stray LaTeX Claude emits
 *   - /start, /help — bilingual help text
 *   - /topics — video lecture list, grouped by chapter, in the student's
 *     detected client language
 *   - /luennot — same as /topics, but ALWAYS in Finnish regardless of client
 *   - /week1 ... /week7 — videos for a given course week (7 = recap), in the
 *     student's detected client language
 *   - /viikko1 ... /viikko7 — same as /weekN, but ALWAYS in Finnish
 *   - /HW1 ... /HW6 — overview of a homework set's problems, from REAL
 *     FYS.240 content (see CHANGELOG v2.3.0)
 *   - /HW3.2 — AI-generated hint on a specific problem (no solution)
 *   - /HW_hint3.2 — a one-sentence nudge only
 *   - /HWQ3.2 (or /hwq3.2) — exact verbatim question text, no hint, no API
 *     call, straight from homework_problems.json
 *   - "quiz me on chapter N" / "...section N.M" — multiple-choice quiz via
 *     quizGenerator_fys240.js, with an inline-keyboard chapter picker
 *   - /reset — clear conversation history
 *   - /healthz — reports corpus/video/homework/quiz health + BOT_VERSION
 *   - Conversation history (6 turns) & per-user rate limiting
 *   - Course-mismatch guard on homework_problems.json (added v2.2.0, kept
 *     as a permanent safety net): refuses to serve homework text that
 *     looks like it's from the wrong course instead of silently handing
 *     it to students. Does not fire on the real FYS.240 content added in
 *     v2.3.0 (verified: 15 laser-vocabulary hits vs. 11 optics-vocabulary
 *     hits, well under the trip threshold).
 *
 * KNOWN GAPS (not yet implemented — see redeploy-package README):
 *   - /define <term> — glossary lookup exists in corpusLoader.js
 *     (findGlossaryTerms, backed by terminology.json) but isn't wired to a
 *     command in this bot yet
 *   - No pre-built FYS.240 quiz bank (quizBank_fys240.json) — quizzes always
 *     live-generate via the Claude API
 *   - homework_solutions.json (new in v2.3.0) is instructor-reference only —
 *     nothing in this bot loads or serves it; see the file's own header
 *     comment and the redeploy-package README before wiring it to anything
 *
 * CHANGELOG:
 *   v2.3.0 — Replaced homework_problems.json with REAL FYS.240 content,
 *            extracted from newly-added HW1_Optics.tex ... HW6_Optics.tex
 *            (LaTeX source with \ExerciseNu/\SolutionNu markup) via a new
 *            clean_homework.js + build_homework.js pipeline (reusing
 *            course_corpus.txt's clean.js LaTeX-cleaning helpers). 10
 *            problems across 6 homework sets, verbatim question text
 *            including authors' own inline hints. Also produced
 *            homework_solutions.json (10 solutions) — instructor-reference
 *            only, deliberately NOT loaded anywhere in this bot file; the
 *            course's no-solutions-to-students rule means it must stay
 *            that way unless a future change explicitly and carefully
 *            decides otherwise. The v2.2.0 course-mismatch guard remains in
 *            place as a permanent safety net (confirmed it does not fire on
 *            this real content) rather than being removed.
 *   v2.2.0 — Added BOT_VERSION + this changelog. Added a course-mismatch
 *            guard on homework_problems.json: the file in the repo was
 *            discovered to be 100% FYS.501 Laser Physics content (laser
 *            cavities, gain media, population inversion — zero FYS.240
 *            optics content across all 24 stored problems), so /HWQ1.1
 *            and friends were serving the wrong course's homework verbatim.
 *            looksLikeWrongCourseHomework() now detects this pattern at
 *            startup and empties HOMEWORK_PROBLEMS instead of serving it,
 *            falling through to the existing "not stored" messages. Surfaced
 *            via console.error and /healthz's homeworkProblemsCourseMismatch.
 *            The real FYS.240 homework text still needs to be sourced and
 *            uploaded — this only stops the wrong content from reaching
 *            students in the meantime.
 *   v2.1.0 — Removed LaTeX image rendering (CodeCogs via latex-renderer.js)
 *            entirely: it left raw $ / $$ visible to students whenever
 *            rendering failed, or for any single-$ inline math (which
 *            CodeCogs never handled). Replaced with latexToUnicode(),
 *            converting stray LaTeX to Unicode and stripping any leftover
 *            $ / $$ as a backstop — no LATEX_ENABLED flag any more. Added
 *            /HWQ (ported from bot_fys240_HWtext.js's /HWtext, shortened,
 *            case-insensitive). Added /viikkoN and /luennot — Finnish-
 *            forced aliases for /weekN and /topics.
 *   v2.0.0 — First merge: reconciled three branches that had diverged in
 *            the repo — bot_fys240.js (LaTeX rendering + in-video timestamp
 *            segments via findRelevantSegments/&t=Xs), bot_fys240_bilingual_
 *            links.js (fixVideoLinkLanguage/isFinnishText — a deterministic
 *            fix for Claude occasionally picking the wrong-language video
 *            link), and bot_fys240_HWtext.js (verbatim homework question
 *            text). This file became the single source of truth; the three
 *            separate bot_fys240*.js files should be deleted from the repo.
 *   (earlier history predates version tracking)
 */

const BOT_VERSION = "2.3.0";

const fs = require("fs");
const path = require("path");
const express = require("express");
const axios = require("axios");
const quizGenerator = require("./quizGenerator_fys240");
const corpusLoader = require("./corpusLoader");

const app = express();
app.use(express.json());

// ---------------------------------------------------------------- config ----
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";
const CACHE_TTL = process.env.CACHE_TTL || "1h";
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || "900", 10);
const BOT_USERNAME = (process.env.BOT_USERNAME || "").replace(/^@/, "").toLowerCase();

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// ------------------------------------------------------- course material ----
const CORPUS_PATH = path.join(__dirname, "course_corpus.txt");
let COURSE_CORPUS = "";
try {
  COURSE_CORPUS = fs.readFileSync(CORPUS_PATH, "utf8");
  console.log(
    `Loaded course corpus: ${COURSE_CORPUS.length.toLocaleString()} chars ` +
    `(~${Math.round(COURSE_CORPUS.length / 3.7).toLocaleString()} tokens)`
  );
} catch (e) {
  console.error(`WARNING: could not read ${CORPUS_PATH} — ${e.message}`);
}

// Exact per-problem text, keyed "<hw>" -> "<problem>" -> text, e.g. HOMEWORK_PROBLEMS["1"]["2"].
// hwNum runs 1-6 (six homework sets for FYS.240 — see HOMEWORK-HELPER note above).
// Optional: if missing/empty, /HW commands fall back to letting Claude search the full corpus.
const HW_PROBLEMS_PATH = path.join(__dirname, "homework_problems.json");
let HOMEWORK_PROBLEMS = {};
let HOMEWORK_PROBLEMS_COURSE_MISMATCH = false;

// Sanity-check against a recurring failure mode in this repo: this codebase
// is forked between a FYS.240 Optics bot and a FYS.501 Laser Physics bot,
// and homework_problems.json has previously been swapped with the WRONG
// course's file (confirmed in v2.2.0 — the file in place was 100% FYS.501
// laser-cavity/gain-medium content, zero FYS.240 optics content, across
// all 24 stored problems). Rather than risk silently handing a student the
// wrong course's homework questions again, this scans the loaded JSON's
// text for a simple keyword signal and REFUSES to serve it if it looks
// like the wrong course — HOMEWORK_PROBLEMS is reset to {} in that case,
// so /HW, /HW_hint, and /HWQ all fall through to their existing "not
// stored" fallback paths (same behavior as if the file were simply
// missing) instead of returning wrong-course text. Only fires when laser
// terminology heavily dominates over any optics terminology, so a real
// FYS.240 set that happens to mention lasers once or twice (e.g. in a
// light-matter-interaction problem) won't be falsely flagged.
function looksLikeWrongCourseHomework(problems) {
  const allText = JSON.stringify(problems).toLowerCase();
  const laserHits = (allText.match(/laser|cavity|cavities|gain medium|population inversion|nd:yag|ti:sapph|pumping|resonator/g) || []).length;
  const opticsHits = (allText.match(/thin lens|diffraction|interference|refraction|refractive index|wavefront|polarization|interferometer|grating/g) || []).length;
  return laserHits >= 10 && laserHits > opticsHits * 3;
}

try {
  const parsed = JSON.parse(fs.readFileSync(HW_PROBLEMS_PATH, "utf8"));
  if (looksLikeWrongCourseHomework(parsed)) {
    HOMEWORK_PROBLEMS_COURSE_MISMATCH = true;
    HOMEWORK_PROBLEMS = {};
    console.error(
      `WARNING: homework_problems.json looks like the WRONG COURSE's homework ` +
      `(reads like FYS.501 Laser Physics, not FYS.240 Optics) — REFUSING to serve it. ` +
      `/HW, /HW_hint, and /HWQ will report "not stored" for every problem until the ` +
      `correct FYS.240 homework text is uploaded. See /healthz: homeworkProblemsCourseMismatch.`
    );
  } else {
    HOMEWORK_PROBLEMS = parsed;
    const total = Object.values(HOMEWORK_PROBLEMS).reduce((n, hw) => n + Object.keys(hw).length, 0);
    console.log(`Loaded homework_problems.json: ${total} problems across ${Object.keys(HOMEWORK_PROBLEMS).length} homeworks`);
  }
} catch (e) {
  console.log(`No homework_problems.json found (${e.code || e.message}) — /HW commands will fall back to full-corpus search.`);
}

// ------------------------------------------------- video database ----
let VIDEO_DB = null;
try {
  VIDEO_DB = require("./fys240_videos");
  console.log(`Loaded video database: ${VIDEO_DB.all().length} lectures`);
} catch (e) {
  console.error(`WARNING: could not load video database — ${e.message}`);
  console.error("Bot will work without video references.");
}

// Chapter titles from the course table of contents (used to group /topics
// and /weekN output under readable headings instead of bare numbers).
const CHAPTER_NAMES = {
  2: "Descriptions of Light",
  3: "Wave Motion",
  4: "Electromagnetic Waves",
  5: "Light-Matter Interaction",
  6: "Propagation",
  7: "Superposition",
  8: "Interference",
  9: "Diffraction",
  10: "Geometrical Optics",
};

const CHAPTER_NAMES_FI = {
  2: "Valon kuvaustavat",
  3: "Aaltoliike",
  4: "Sähkömagneettiset aallot",
  5: "Valon ja aineen vuorovaikutus",
  6: "Eteneminen",
  7: "Superpositio",
  8: "Interferenssi",
  9: "Diffraktio",
  10: "Geometrinen optiikka",
};

// Picks a per-user language ("en" | "fi") for the deterministic, non-AI
// commands (/help, /topics, /weekN, ...) which have no free-text question
// to detect language from. Telegram sends the client's language_code
// (e.g. "fi", "fi-FI") with every message.from; anything not Finnish falls
// back to English. The AI-answered path instead detects language from the
// student's own question text (see TA_INSTRUCTIONS), independent of this.
function getLang(message) {
  const code = message?.from?.language_code || "";
  return code.toLowerCase().startsWith("fi") ? "fi" : "en";
}

// ------------------------------------------------------ build system ----
const TA_INSTRUCTIONS = `You are the teaching assistant bot for FYS.240 Optics, answering students in a Telegram group.

WHAT YOU KNOW
- Course material: lecture notes and textbook chapters
- Video lectures: organized by chapter (2.1-10.13), covering all course topics
- Course schedule: which chapters are covered which week (see <course_schedule> below)
- Ground answers in course material and cite chapter/section when possible
- You do NOT have homework solutions

WHEN TO SUGGEST VIDEOS
If a student asks about a topic that's covered in video lectures, suggest the relevant video:
- Check if the topic matches any video lecture title
- ALWAYS use this exact [Video X.Y (Topic)](URL) format for the video link itself — never write the raw URL on its own, after a colon, or after a dash. (When a timestamp is also linked, see IN-VIDEO TIMESTAMPS below — that adds a second, separate link, it doesn't replace this one.)
- LANGUAGE OF VIDEO LINKS: <video_lectures> below lists each lecture as an EN pair (topic + url) and, where one exists, an FI pair after "|". ALWAYS match the pair's language to the language you are answering in RIGHT NOW, with or without a timestamp — do not default to the English pair out of habit, even if an example below happens to be in English. If a lecture has no FI pair, use the EN pair even in a Finnish answer.
  EN example (answering in English): "That's covered in [Video 5.2 (Refraction)](https://youtube.com/watch?v=pzzjQhhXdkE)."
  FI example (answering in Finnish — same rule, Finnish pair): "Asiasta kerrotaan [Video 5.2 (Taittuminen)](https://youtube.com/watch?v=<fi-id>):ssa."
- IN-VIDEO TIMESTAMPS: some lectures also list chapter markers indented beneath the EN and/or FI pair, tagged EN: or FI:, e.g. "  FI: 16:48 (1008s) Poyntingin vektori S = c^2 eps0 ExB". When the student's question matches one of these markers specifically (not just the video's general topic), give TWO separate links in the same sentence: (1) the timestamp itself as clickable text, e.g. "[16:48](URL&t=1008s)" — using the seconds shown in parentheses after the marker, never recomputed — and (2) the normal [Video X.Y (Topic)](URL) link with NO &t=, pointing at the start of the video as usual. Both links use the SAME-LANGUAGE pair's url; only use a marker tagged for the language (EN:/FI:) you're actually linking, and never mix a FI: marker's seconds onto the EN url or vice versa. If the student's message includes a <possible_video_moments> block, that's already been matched to this specific question in code — use it instead of searching <video_lectures> yourself whenever one of its candidates fits.
  FI example (answering in Finnish, using a FI: marker): "Tarkemmin asiasta kerrotaan kohdassa [16:48](https://youtube.com/watch?v=KCRFMlnFNbQ&t=1008s) videolla [Video 4.3 (Sähkömagneettisen kentän energia)](https://youtube.com/watch?v=KCRFMlnFNbQ)."
  EN example (answering in English, using an EN: marker for the same lecture): "That's explained in more detail around [16:48](https://youtube.com/watch?v=qPxBAoaT_Dc&t=1008s) in [Video 4.3 (Energy of the electromagnetic field)](https://youtube.com/watch?v=qPxBAoaT_Dc)." — only if an EN: marker is actually listed for that video.
  Not every video has markers yet — when none is listed for the pair (language) you're linking, just give the single normal [Video X.Y (Topic)](URL) link as before, with no timestamp link.

HOW TO HELP
**LENGTH**: ONE OR TWO SHORT SENTENCES/PARAGRAPH ONLY. Never use section headers, bullets, tables, or sub-points. No "Step 1, Step 2". No "Key insight:". Just talk to them like a person.
**HOMEWORK**: Give hints, not answers. Name the relevant equation or concept, point to the section, suggest a video if available, ask ONE guiding question. (Students can also use /HW1 ... /HW6 and /HW3.2-style commands to ask about a specific homework set or problem directly.)
**CONCEPTUAL**: Answer directly and briefly. If they ask about something that has a video, mention it: "That's in [Video X.Y (Topic)](URL). In short, ..."
**VIDEO REFERENCES**: When appropriate, include video links as [Video X.Y (Topic)](URL) so students can find them easily, choosing the EN or FI title/url pair to match the language you're answering in (see LANGUAGE OF VIDEO LINKS above).
**STUDENT ATTEMPTS**: If they show work, check it quickly, point at one specific error. Don't rewrite the whole thing.
**REDIRECT**: If it's outside course scope, say "That's beyond FYS.240, ask your instructor during office hours".

FORMAT
- Plain text for Telegram.
- Never use $ or $$ delimiters, and never write raw LaTeX commands (\frac, \sqrt, \alpha, ^{}, _{}, etc.) — write all math directly in Unicode: Greek letters (α β γ δ θ λ μ π φ ω...), superscripts (x², n³), subscripts (n₁, sᵢ, sₒ), √ for roots, × · ÷ ± ∞ ∫ ∑ ∂ ∇ ≈ ≠ ≤ ≥ → for operators, and plain "/" for fractions (e.g. "1/f = 1/sₒ + 1/sᵢ")
- Write video links as [Video X.Y (Topic)](URL) Markdown links, never as bare URLs, using the Finnish topic/url when answering in Finnish and the English topic/url when answering in English (see LANGUAGE OF VIDEO LINKS above)
- 2-3 short paragraphs maximum
- Answer in the language the student writes in (English or Finnish)
- VECTOR QUANTITIES: wrap every vector symbol in **...** (e.g. **E**, **B**, **D**, **H**, **j**, **k**, **r**, **p**, **S**, **F**, **v**), EVERY time it appears — not just on first use, and inside equations as well as prose (e.g. \u2207\u00d7**B** = \u03bc\u2080**j** + \u03bc\u2080\u03b5\u2080\u2202**E**/\u2202t). Do this consistently across microscopic and macroscopic Maxwell's equations alike.
- Do NOT bold scalars: \u03b5\u2080, \u03bc\u2080, \u03c1, \u03c9, n, \u03bb, and the \u2207 operator itself stay unbolded even next to a bolded vector (\u2207\u00d7**E**, not **\u2207**\u00d7**E**)

LIMITS
- Some maths symbols in extracted chapter text are garbled; read them from context
- Video lectures are organized by chapter number (2.1-10.13)`;

// Real FYS.240 course schedule: which chapter(s) each course week covers.
// Declared here (before buildSystemBlocks/SYSTEM_BLOCKS below) since
// formatCourseSchedule() needs it at module-load time; also used by the
// /weekN command's generateWeekMessages() further down.
const WEEK_TO_CHAPTERS = {
  1: [2, 3],   // wk 35: 24.8.-30.8.
  2: [4, 5],   // wk 36: 31.8.-6.9.
  3: [6, 7],   // wk 37: 7.9.-13.9.
  4: [8],      // wk 38: 14.9.-20.9.
  5: [9],      // wk 39: 21.9.-27.9.
  6: [10],     // wk 40: 28.9.-4.10.
  // week 7 (wk 41: 5.10.-11.10.) is recap - no new chapters, handled separately
};
const RECAP_WEEK = 7;

function buildSystemBlocks() {
  const blocks = [{ type: "text", text: TA_INSTRUCTIONS }];

  blocks.push({ type: "text", text: formatCourseSchedule() });

  // Add video database context (cached: this grows as more per-video
  // timestamps are added over the course, so keep it off the uncached path)
  if (VIDEO_DB && VIDEO_DB.all().length > 0) {
    const videoContext = formatVideoDatabase(VIDEO_DB);
    blocks.push({
      type: "text",
      text: videoContext,
      cache_control:
        CACHE_TTL === "1h"
          ? { type: "ephemeral", ttl: "1h" }
          : { type: "ephemeral" },
    });
  }
  
  if (COURSE_CORPUS) {
    blocks.push({
      type: "text",
      text: `<course_material>\n${COURSE_CORPUS}\n</course_material>`,
      cache_control:
        CACHE_TTL === "1h"
          ? { type: "ephemeral", ttl: "1h" }
          : { type: "ephemeral" },
    });
  }
  return blocks;
}

/**
 * Format the real FYS.240 course schedule (calendar weeks 35-41) for the
 * system prompt, so the AI can answer "what week covers chapter X" or
 * "what should I study this week" style questions. Kept in sync with
 * WEEK_TO_CHAPTERS / RECAP_WEEK below, which drive the /weekN command.
 */
function formatCourseSchedule() {
  let text = "\n<course_schedule>\n";
  text += "## FYS.240 Optics - Weekly Schedule\n\n";
  const dateRanges = {
    1: "wk 35, 24.8.-30.8.",
    2: "wk 36, 31.8.-6.9.",
    3: "wk 37, 7.9.-13.9.",
    4: "wk 38, 14.9.-20.9.",
    5: "wk 39, 21.9.-27.9.",
    6: "wk 40, 28.9.-4.10.",
    7: "wk 41, 5.10.-11.10.",
  };
  for (const [week, chapters] of Object.entries(WEEK_TO_CHAPTERS)) {
    text += `Week ${week} (${dateRanges[week]}): Chapter${chapters.length > 1 ? "s" : ""} ${chapters.join(" and ")}\n`;
  }
  text += `Week ${RECAP_WEEK} (${dateRanges[RECAP_WEEK]}): Recap - no new chapters\n`;
  text += "</course_schedule>\n";
  return text;
}

/**
 * Format video database for inclusion in system prompt
 */
function formatVideoDatabase(db) {
  let context = "\n<video_lectures>\n";
  context += `## FYS.240 Optics - Video Lectures\n\n`;
  context += `Each line: chapter: English topic (EN url) | Finnish topic (FI url)\n`;
  context += `Use the EN pair when answering in English, the FI pair when answering in Finnish. If a video has no FI pair listed, fall back to the EN pair even in a Finnish answer.\n`;
  context += `Some lectures also list in-video timestamps indented below them, tagged EN: or FI: for which pair's url they belong to. The seconds value in parentheses is exactly what goes after &t= in that pair's url.\n\n`;

  const segLine = (tag, seg) => {
    const mm = String(Math.floor(seg.t / 60)).padStart(2, "0");
    const ss = String(seg.t % 60).padStart(2, "0");
    return `  ${tag}: ${mm}:${ss} (${seg.t}s) ${seg.label}\n`;
  };

  const chapters = db.getChapters();
  chapters.forEach(chapter => {
    const videos = db.getChapter(chapter);
    videos.forEach(video => {
      context += `${video.chapter}: ${video.topic} (https://youtube.com/watch?v=${video.id})`;
      if (video.topic_fi && video.id_fi) {
        context += ` | ${video.topic_fi} (https://youtube.com/watch?v=${video.id_fi})`;
      }
      context += "\n";
      (video.segments || []).forEach(seg => { context += segLine("EN", seg); });
      (video.segments_fi || []).forEach(seg => { context += segLine("FI", seg); });
    });
  });
  
  context += "\n</video_lectures>\n";
  return context;
}

const SYSTEM_BLOCKS = buildSystemBlocks();

const ANTHROPIC_HEADERS = {
  "x-api-key": ANTHROPIC_API_KEY,
  "anthropic-version": "2023-06-01",
  "content-type": "application/json",
  ...(CACHE_TTL === "1h" ? { "anthropic-beta": "extended-cache-ttl-2025-04-11" } : {}),
};

// ------------------------------------------------------- tiny state store ----
const seenUpdates = new Set();
const history = new Map();
const lastCall = new Map();
const HISTORY_TURNS = 6;
const MIN_INTERVAL_MS = 4000;

function remember(chatId, role, content) {
  const h = history.get(chatId) || [];
  h.push({ role, content });
  history.set(chatId, h.slice(-HISTORY_TURNS));
}

// ------------------------------------------------------------- telegram -----
async function tg(method, payload) {
  return axios.post(`${TELEGRAM_API}/${method}`, payload, { timeout: 15000 });
}

// ---------------------------------------------------- quiz bot adapter -----
// quizGenerator_fys240.js expects a small node-telegram-bot-api-shaped `bot`
// object (sendMessage/editMessageText/answerCallbackQuery). This bot talks
// to Telegram directly via axios (tg()), so this adapter bridges the two
// without adding a new dependency — same pattern as the FYS.501 bot.js.
const quizBot = {
  async sendMessage(chatId, text, opts = {}) {
    return tg("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: opts.parse_mode,
      reply_markup: opts.reply_markup,
    }).catch((e) =>
      console.error("Telegram sendMessage (quiz) failed:", e.response?.status, JSON.stringify(e.response?.data))
    );
  },
  async editMessageText(text, opts = {}) {
    return tg("editMessageText", {
      chat_id: opts.chat_id,
      message_id: opts.message_id,
      text,
      parse_mode: opts.parse_mode,
      reply_markup: opts.reply_markup,
    }).catch((e) =>
      console.error("Telegram editMessageText (quiz) failed:", e.response?.status, JSON.stringify(e.response?.data))
    );
  },
  async answerCallbackQuery(callbackQueryId, opts = {}) {
    return tg("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text: opts.text,
    }).catch((e) =>
      console.error("Telegram answerCallbackQuery failed:", e.response?.status, JSON.stringify(e.response?.data))
    );
  },
};

// Called by quizGenerator.startQuiz() when the student didn't name a
// chapter/section (e.g. just typed "quiz me"). Presents an inline-keyboard
// chapter picker covering FYS.240's chapters 2-10, built from
// corpusLoader.listChapters()/getChapterTitle()/getChapterTitleFi() —
// `lang` (passed through by startQuiz's resolveQuizLang()) picks which.
// Tapping a chapter sends a "quizchapter:N:lang" callback, handled in
// handleCallbackQuery() below, which starts the actual quiz in that same
// language. Returning null tells startQuiz() to stop — there's nothing
// more for it to do until the student taps a button.
async function askWhichChapter(bot, chatId, lang = "en") {
  const text = lang === "fi" ? "Mistä luvusta haluaisit visan?" : "Which chapter would you like to be quizzed on?";
  await bot.sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: corpusLoader.listChapters().map((ch) => {
        const title = lang === "fi" ? corpusLoader.getChapterTitleFi(ch) : corpusLoader.getChapterTitle(ch);
        const label = lang === "fi" ? `Luku ${ch} — ${title}` : `Chapter ${ch} — ${title}`;
        // Language rides along in callback_data ("quizchapter:<N>:<lang>")
        // since there's no quiz session yet at this point for
        // handleQuizAnswer's session.lang trick to apply to.
        return [{ text: label, callback_data: `quizchapter:${ch}:${lang}` }];
      }),
    },
  });
  return null;
}

// Converts Claude's "[label](url)" Markdown links (video suggestions) into
// Telegram HTML <a> tags, and HTML-escapes everything else in the chunk so
// it's safe to send with parse_mode: "HTML". Links are pulled out into
// placeholders BEFORE escaping so neither the label nor the URL get their
// &/</> characters mangled, then the <a> tags are spliced back in after.
function convertLinksAndEscape(text) {
  const links = [];
  const withPlaceholders = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, label, url) => {
      links.push({ label, url });
      return `\u0000${links.length - 1}\u0000`;
    }
  );
  let escaped = escapeHtml(withPlaceholders);
  links.forEach((link, i) => {
    const anchor = `<a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a>`;
    escaped = escaped.replace(`\u0000${i}\u0000`, anchor);
  });
  return escaped;
}

// Converts one run of Unicode Mathematical Alphanumeric characters for a
// given style. Digits have no dedicated "italic" codepoints in Unicode, so
// italic digits are left as plain ASCII; lowercase italic "h" has no
// codepoint of its own either (Unicode reserves that slot), so it maps to
// the pre-existing PLANCK CONSTANT compatibility character (ℎ, U+210E)
// instead, which is the standard workaround.
function toMathUnicode(inner, style) {
  let out = "";
  for (const ch of inner) {
    const code = ch.codePointAt(0);
    if (style === "bold") {
      if (code >= 0x41 && code <= 0x5a) out += String.fromCodePoint(0x1d400 + (code - 0x41));      // A-Z
      else if (code >= 0x61 && code <= 0x7a) out += String.fromCodePoint(0x1d41a + (code - 0x61)); // a-z
      else if (code >= 0x30 && code <= 0x39) out += String.fromCodePoint(0x1d7ce + (code - 0x30)); // 0-9
      else out += ch;
    } else if (style === "italic") {
      if (ch === "h") out += "\u210e";                                                             // italic h exception
      else if (code >= 0x41 && code <= 0x5a) out += String.fromCodePoint(0x1d434 + (code - 0x41));  // A-Z
      else if (code >= 0x61 && code <= 0x7a) out += String.fromCodePoint(0x1d44e + (code - 0x61));  // a-z
      else out += ch;                                                                               // no italic digits exist
    } else { // "bolditalic"
      if (code >= 0x41 && code <= 0x5a) out += String.fromCodePoint(0x1d468 + (code - 0x41));      // A-Z
      else if (code >= 0x61 && code <= 0x7a) out += String.fromCodePoint(0x1d482 + (code - 0x61)); // a-z
      else if (code >= 0x30 && code <= 0x39) out += String.fromCodePoint(0x1d7ce + (code - 0x30)); // 0-9 (reuses bold digits)
      else out += ch;
    }
  }
  return out;
}

// Converts Claude's Markdown emphasis into real Unicode styled characters
// (Claude's natural way of marking vector quantities, e.g. **E**, **B**, and
// occasionally single-asterisk emphasis like *i*). Messages are sent with
// parse_mode "HTML" now (for video links), so this still runs first to keep
// any asterisks from ever needing HTML tags of their own. Both "*single*"
// and "**double**" are handled (plus "***triple***" for completeness);
// longest marker matches first so the single-* pass never gets confused by
// leftover ** runs, since those are already replaced with plain Unicode
// characters by the time it runs. Leaves Greek letters, subscripts, LaTeX $$
// blocks, and everything else as-is.
function markdownEmphasisToUnicode(text) {
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, (_, inner) => toMathUnicode(inner, "bolditalic"));
  text = text.replace(/\*\*(.+?)\*\*/g, (_, inner) => toMathUnicode(inner, "bold"));
  text = text.replace(/\*(.+?)\*/g, (_, inner) => toMathUnicode(inner, "italic"));
  return text;
}

// Heuristic Finnish/English detector for the ASSISTANT'S OWN reply text
// (not the student's question). Finnish prose is dense with ä/ö; English
// essentially never uses them, so a density threshold is a cheap, reliable
// signal — far more reliable than asking the model to remember which
// language it's replying in by the time it picks a video link.
// (Ported from bot_fys240_bilingual_links.js — see fixVideoLinkLanguage.)
function isFinnishText(text) {
  const letters = text.match(/[a-zA-ZäöÄÖ]/g) || [];
  if (letters.length < 20) return false; // too short to judge
  const finnishMarkers = (text.match(/[äöÄÖ]/g) || []).length;
  return finnishMarkers / letters.length > 0.02;
}

// Deterministic guard against wrong-language video links. TA_INSTRUCTIONS
// tells Claude to pick the FI or EN (topic, url) pair depending on which
// language it's answering in — but that's a soft instruction and Claude
// sometimes answers in Finnish while still using the EN pair. Rather than
// keep tuning the prompt, this rewrites every "[Video X.Y (Topic)](url)"
// link AFTER generation to match the language the reply is actually
// written in, using VIDEO_DB as the source of truth. A chapter with no FI
// recording still falls back to the EN pair, same as TA_INSTRUCTIONS says.
// Only touches the plain "[Video X.Y (Topic)](url)" pattern — the separate
// "[16:48](url&t=1008s)" timestamp link (see IN-VIDEO TIMESTAMPS above) is
// left untouched, since the model already ties its language to whichever
// EN:/FI: marker it picked.
function fixVideoLinkLanguage(text) {
  if (!VIDEO_DB) return text;
  const targetLang = isFinnishText(text) ? "fi" : "en";
  return text.replace(
    /\[Video (\d+\.\d+) \(([^)]+)\)\]\((https?:\/\/[^\s)]+)\)/g,
    (full, chapter, _label, _url) => {
      const video = (VIDEO_DB.getChapter(chapter) || [])[0];
      if (!video) return full; // unknown chapter — leave untouched

      if (targetLang === "fi" && video.topic_fi && video.id_fi) {
        return `[Video ${chapter} (${video.topic_fi})](https://youtube.com/watch?v=${video.id_fi})`;
      }
      return `[Video ${chapter} (${video.topic})](https://youtube.com/watch?v=${video.id})`;
    }
  );
}

// Converts common LaTeX that Claude might still slip in (despite
// TA_INSTRUCTIONS telling it to use Unicode only) into Unicode, then
// strips any leftover $ / $$ delimiters and backslash commands so
// nothing raw ever reaches students. No LATEX_ENABLED flag — this
// always runs; there is no image-rendering path any more.
// (Ported from bot_fys240_bilingual_links.js.)
const GREEK = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ",
  eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ",
  nu: "ν", xi: "ξ", omicron: "ο", pi: "π", rho: "ρ", sigma: "σ",
  tau: "τ", upsilon: "υ", phi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π",
  Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
};
const SUP = { "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹",
  "+":"⁺","-":"⁻","=":"⁼","(":"⁽",")":"⁾","n":"ⁿ","i":"ⁱ",
  a:"ᵃ",b:"ᵇ",c:"ᶜ",d:"ᵈ",e:"ᵉ",f:"ᶠ",g:"ᵍ",h:"ʰ",j:"ʲ",k:"ᵏ",l:"ˡ",m:"ᵐ",
  o:"ᵒ",p:"ᵖ",r:"ʳ",s:"ˢ",t:"ᵗ",u:"ᵘ",v:"ᵛ",w:"ʷ",x:"ˣ",y:"ʸ",z:"ᶻ" };
const SUB = { "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉",
  "+":"₊","-":"₋","=":"₌","(":"₍",")":"₎",
  a:"ₐ",e:"ₑ",h:"ₕ",i:"ᵢ",j:"ⱼ",k:"ₖ",l:"ₗ",m:"ₘ",n:"ₙ",o:"ₒ",p:"ₚ",r:"ᵣ",s:"ₛ",t:"ₜ",u:"ᵤ",v:"ᵥ",x:"ₓ" };
const toSup = (s) => [...s].map((c) => SUP[c] ?? c).join("");
const toSub = (s) => [...s].map((c) => SUB[c] ?? c).join("");

// Matches one level of {...} — good enough for the simple exponents/
// fractions Claude actually generates; anything with nested braces
// just falls through to the final cleanup pass below.
const BRACED = "\\{([^{}]*)\\}";

function latexToUnicode(text) {
  // \frac{a}{b} -> a/b (parens added only if a or b contains a space/operator)
  text = text.replace(new RegExp(`\\\\frac${BRACED}${BRACED}`, "g"), (_, a, b) => {
    const wrap = (s) => (/[\s+\-]/.test(s) ? `(${s})` : s);
    return `${wrap(a)}/${wrap(b)}`;
  });
  text = text.replace(/\\sqrt\{([^{}]*)\}/g, (_, x) => `√(${x})`);
  text = text.replace(/\\sqrt(\w)/g, (_, x) => `√${x}`);

  // superscripts / subscripts: braced or single-char
  text = text.replace(new RegExp(`\\^${BRACED}`, "g"), (_, x) => toSup(x));
  text = text.replace(/\^(\w)/g, (_, x) => toSup(x));
  text = text.replace(new RegExp(`_${BRACED}`, "g"), (_, x) => toSub(x));
  text = text.replace(/_(\w)/g, (_, x) => toSub(x));

  // Greek letters
  text = text.replace(/\\([A-Za-z]+)/g, (m, name) => GREEK[name] ?? m);

  // common operators/symbols
  const OPS = {
    "\\pm": "±", "\\mp": "∓", "\\times": "×", "\\cdot": "·", "\\div": "÷",
    "\\approx": "≈", "\\neq": "≠", "\\leq": "≤", "\\geq": "≥",
    "\\rightarrow": "→", "\\to": "→", "\\infty": "∞", "\\partial": "∂",
    "\\nabla": "∇", "\\int": "∫", "\\sum": "∑", "\\prod": "∏",
    "\\left": "", "\\right": "", "\\,": " ", "\\;": " ", "\\!": "",
    "\\text": "",
  };
  for (const [k, v] of Object.entries(OPS)) {
    text = text.split(k).join(v);
  }

  // Fallback: strip any remaining backslash commands and stray braces
  // (covers matrices, unrecognized macros — degrades to plain text
  // instead of showing raw LaTeX)
  text = text.replace(/\\[a-zA-Z]+/g, "");
  text = text.replace(/[{}]/g, "");

  // Finally, strip any leftover $ / $$ delimiters entirely
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, "$1");
  text = text.replace(/\$([^$\n]+?)\$/g, "$1");
  text = text.replace(/\$/g, "");

  return text;
}

// Splits text into <4096-char chunks and sends each as a message. Pass
// parseMode "HTML" (the normal case now, so video links render as clickable
// text) or leave it undefined for a literal-text fallback. A rendering
// hiccup elsewhere degrades to plain text instead of the student getting
// nothing at all.
async function sendPlainChunks(chatId, text, replyTo, parseMode) {
  const chunks = [];
  let rest = text.trim();
  while (rest.length > 4000) {
    let cut = rest.lastIndexOf("\n\n", 4000);
    if (cut < 2000) cut = rest.lastIndexOf(" ", 4000);
    if (cut < 2000) cut = 4000;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trim();
  }
  chunks.push(rest);

  for (const chunk of chunks) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: chunk,
      parse_mode: parseMode,
      reply_to_message_id: replyTo,
      allow_sending_without_reply: true,
      disable_web_page_preview: true,
    }).catch((e) =>
      console.error("Telegram sendMessage failed:", e.response?.status, JSON.stringify(e.response?.data))
    );
  }
}

// Sends Claude's reply to Telegram. Video links come back from Claude as
// Markdown "[label](url)" (per TA_INSTRUCTIONS) and are converted to real
// <a> tags via convertLinksAndEscape() + parse_mode "HTML", so students see
// "Video 3.3 (Harmonic waves)" as clickable text instead of a raw URL.
// Math is sent as plain Unicode text — no image rendering: latexToUnicode()
// converts any stray LaTeX Claude still emits, and strips $ / $$ delimiters,
// so no raw dollar signs ever reach the student.
async function sendMessage(chatId, text, replyTo) {
  text = fixVideoLinkLanguage(text);
  text = markdownEmphasisToUnicode(text);
  text = latexToUnicode(text);
  await sendPlainChunks(chatId, convertLinksAndEscape(text), replyTo, "HTML");
}

// --------------------------------------------------------------- claude -----
/**
 * @param {Array} [videoHints] - VIDEO_DB.findRelevantSegments(question)
 *   results, pre-matched in code (see call site) so the model doesn't have
 *   to fuzzy-search the whole <video_lectures> dump itself — much more
 *   reliable for a small model, especially against Finnish case-inflected
 *   questions ("yhtälöstä" not literally matching a label of "yhtälö").
 */
async function askClaude(chatId, question, videoHints) {
  const content = [{ type: "text", text: question }];
  if (videoHints && videoHints.length > 0) {
    let hint = "<possible_video_moments>\n";
    hint += "Pre-matched candidates for THIS question, ranked best first. If one actually answers it, prefer it over searching <video_lectures> yourself — use its exact url/seconds as-is, in the EN or FI form matching the language you're answering in (if only one language is listed for a candidate, only use it in that language's answer). If none of these fit, ignore this block.\n";
    videoHints.forEach(h => {
      hint += `${h.chapter} | ${h.lang.toUpperCase()} | ${h.topic} | ${h.t}s | ${h.label} | ${h.url}\n`;
    });
    hint += "</possible_video_moments>";
    content.push({ type: "text", text: hint });
  }

  const messages = [...(history.get(chatId) || []), { role: "user", content }];

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await axios.post(
        "https://api.anthropic.com/v1/messages",
        { model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM_BLOCKS, messages },
        { headers: ANTHROPIC_HEADERS, timeout: 120000 }
      );

      const u = res.data.usage || {};
      console.log(
        `Claude ok | in=${u.input_tokens} cache_write=${u.cache_creation_input_tokens || 0} ` +
        `cache_read=${u.cache_read_input_tokens || 0} out=${u.output_tokens}`
      );

      return res.data.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
    } catch (err) {
      const status = err.response?.status;
      console.error(
        `Claude attempt ${attempt + 1} failed | status=${status} |`,
        JSON.stringify(err.response?.data || err.message)
      );
      if (status === 429 || status === 500 || status === 529 || err.code === "ECONNABORTED") {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Claude unavailable after 3 attempts");
}

// -------------------------------------------------------------- routing -----
function shouldAnswer(message) {
  const type = message.chat.type;
  const text = message.text || "";
  if (type === "private") return true;
  if (/^\//.test(text)) return true;
  if (BOT_USERNAME && text.toLowerCase().includes("@" + BOT_USERNAME)) return true;
  if (message.reply_to_message?.from?.is_bot) return true;
  return false;
}

function stripMention(text) {
  return text
    .replace(new RegExp(`@${BOT_USERNAME}`, "ig"), "")
    .replace(/^\/(ask|help|start|reset|video|topics|week\d+|luennot|viikko\d+)(@\S+)?\s*/i, "")
    .trim();
}

// --------------------------------------------------------- HW commands ------
// Matches:  /HW3          (overview of Homework 3)
//           /HW3.2        (hint on Homework 3, problem 2)
//           /HW_hint3.2   (minimal one-line nudge on Homework 3, problem 2)
//           /HWQ3.2       (exact verbatim question text, no hint — see below)
// hwNum is expected to be 1-6 (six homework sets); the regex itself doesn't
// enforce that range, it just matches whatever digits follow /HW.
const HW_COMMAND_RE = /^\/HW(_hint)?(\d+)(?:\.(\d+))?(@\S+)?\b/i;

// Matches /HWQ3.2 (case-insensitive, so /hwq3.2 works too) — exact verbatim
// problem text, no hint, no API call. Ported from bot_fys240_HWtext.js's
// /HWtext command, shortened per request ("HWQ" = HW Question). Requires
// the sub-problem number — a whole homework set's text is several problems
// long and isn't meant to be dumped in one message; /HW3 already gives the
// one-line overview to navigate from.
const HW_TEXT_COMMAND_RE = /^\/HWQ(\d+)\.(\d+)(@\S+)?\b/i;

function buildHwOverviewDirective(hwNum) {
  return (
    `[HOMEWORK OVERVIEW REQUEST]\n` +
    `The student wants an overview of Homework ${hwNum}. Find "HOMEWORK ${hwNum}" in the course ` +
    `material and list each top-level numbered problem with a one-line topic description only ` +
    `(no sub-parts, no hints, no solutions, no point values needed). Keep the whole reply short — ` +
    `one line per problem. End with: "Ask /HW${hwNum}.<problem number> for a hint on a specific one."`
  );
}

// Free, deterministic version — used when homework_problems.json has this homework,
// so it costs no API call and can't hallucinate a problem list.
//
// NOTE: the naive "split on \n, take line 0" approach (used in the original
// FYS.501 bot.js this was ported from) only works if the stored text's own
// first line already IS a one-line summary. It isn't: the text starts with
// the "<hw>.<n>." header on its own line, so line 0 is just the header, and
// after stripping the header from a line that WAS only the header, nothing
// is left — every entry renders as "1.3 — " with an empty summary. Instead,
// strip the header from the WHOLE text, collapse all whitespace/newlines
// (so a multi-line paragraph or an itemized problem statement doesn't get
// cut off at its first internal line break), then take a short excerpt.
function buildHwOverviewFromStructuredData(hwNum) {
  const problems = HOMEWORK_PROBLEMS[hwNum];
  const nums = Object.keys(problems).sort((a, b) => Number(a) - Number(b));
  const EXCERPT_LEN = 110;
  const lines = nums.map((n) => {
    const body = problems[n]
      .replace(new RegExp(`^${hwNum}\\.${n}\\.?\\s*`), "") // strip the leading "hw.n." header line
      .replace(/\s+/g, " ") // collapse newlines/multiple spaces into one flowing line
      .replace(/\s*\(\d+\s*points?\)\s*/i, " ") // drop a "(N points)" mention anywhere in the excerpt window
      .trim();
    const excerpt =
      body.length > EXCERPT_LEN
        ? body.slice(0, EXCERPT_LEN).replace(/\s+\S*$/, "") + "…" // cut at the last full word
        : body;
    return `${hwNum}.${n} — ${excerpt}`;
  });
  return (
    `Homework ${hwNum}:\n` +
    lines.join("\n") +
    `\n\nAsk /HW${hwNum}.<problem number> for a hint on a specific one.`
  );
}

// Free, deterministic version of the full question text — no Claude call,
// so it can't paraphrase, hint, or accidentally leak toward a solution.
// Sends exactly what's stored in homework_problems.json, verbatim.
// (Ported from bot_fys240_HWtext.js's buildHwFullText.) Not bilingual by
// design — this returns the stored assignment text as-is, in whatever
// language it was authored in, rather than translating it.
function buildHwFullText(hwNum, problemNum, lang) {
  const exactText = HOMEWORK_PROBLEMS[hwNum]?.[problemNum];
  if (!exactText) {
    if (HOMEWORK_PROBLEMS_COURSE_MISMATCH) {
      return lang === "fi"
        ? `Kotitehtävien tarkkoja tekstejä ei ole juuri nyt saatavilla (tekninen ongelma kurssimateriaalin kanssa) — opettaja on tietoinen asiasta.\n` +
          `Kokeile /HW${hwNum} yleiskatsausta tai kysy minulta suoraan tehtävästä ${hwNum}.${problemNum}.`
        : `Exact homework text isn't available right now (a technical issue with the course material — the instructor's aware) — ` +
          `try /HW${hwNum} for an overview or just ask me directly about problem ${hwNum}.${problemNum}.`;
    }
    return lang === "fi"
      ? `Minulla ei ole tallennettuna Kotitehtävä ${hwNum}, tehtävä ${problemNum} tarkkaa tekstiä.\n` +
        `Kokeile /HW${hwNum} yleiskatsausta varten, tai /HW${hwNum}.${problemNum} vihjettä varten.`
      : `I don't have the exact text of Homework ${hwNum}, problem ${problemNum} stored.\n` +
        `Try /HW${hwNum} for an overview, or /HW${hwNum}.${problemNum} for a hint instead.`;
  }
  return exactText;
}

function buildHwHintDirective(hwNum, problemNum) {
  const exactText = HOMEWORK_PROBLEMS[hwNum]?.[problemNum];
  const problemBlock = exactText
    ? `Here is the exact text of problem ${hwNum}.${problemNum}, verbatim from the assignment sheet:\n"""\n${exactText}\n"""\n`
    : `Find problem ${hwNum}.${problemNum} in Homework ${hwNum} in the course material below. ` +
      `If you can't find it, say so plainly instead of guessing.\n`;
  return (
    `[HOMEWORK HINT REQUEST]\n` +
    `The student is asking for help with Homework ${hwNum}, problem ${problemNum}. ${problemBlock}` +
    `Give ONE hint per your standing homework rules: name the relevant equation or concept, point ` +
    `to where it's covered, suggest a video if one is available, and ask one guiding question. Do not ` +
    `solve the problem or give the final answer.`
  );
}

function buildHwMinimalHintDirective(hwNum, problemNum) {
  const exactText = HOMEWORK_PROBLEMS[hwNum]?.[problemNum];
  const problemBlock = exactText
    ? `Here is the exact text of problem ${hwNum}.${problemNum}, verbatim from the assignment sheet:\n"""\n${exactText}\n"""\n`
    : `Find problem ${hwNum}.${problemNum} in Homework ${hwNum} in the course material below. ` +
      `If you can't find it, say so plainly instead of guessing.\n`;
  return (
    `[HOMEWORK MINIMAL HINT REQUEST]\n` +
    `The student wants just a nudge for Homework ${hwNum}, problem ${problemNum} — no explanation. ${problemBlock}` +
    `Reply with ONE short guiding question only (a single sentence), optionally naming one equation ` +
    `or concept. No further explanation, no solution.`
  );
}

const HELP_TEXT_EN =
  `Hi! I'm the FYS.240 Optics assistant. I know the lecture notes, textbook, and have ${VIDEO_DB ? VIDEO_DB.all().length : 0} video lectures on all course topics.\n\n` +
  "Ask me things like:\n" +
  "- How do thin lenses work?\n" +
  "- What's the difference between real and virtual images?\n" +
  "- I'm stuck on problem 5.2, where should I start?\n" +
  "- Explain how a microscope works\n" +
  "- Quiz me on chapter 2 (or a specific section, e.g. \"quiz me on section 2.3\") for a multiple-choice quiz\n\n" +
  "I'll explain concepts, point you to relevant videos or sections, and give hints on homework (but not solutions).\n\n" +
  "Commands:\n" +
  "/topics — see all video lecture topics\n" +
  "/week1 ... /week7 — see videos for a specific course week (week 7 = recap)\n" +
  "/luennot, /viikko1 ... /viikko7 — same as /topics and /week, but always in Finnish\n" +
  "/HW1 ... /HW6 — list the problems in a specific homework set\n" +
  "/HW3.2 — get a hint on Homework 3, problem 2\n" +
  "/HW_hint3.2 — just a one-line nudge, no explanation\n" +
  "/HWQ3.2 — see the exact question text for a problem, verbatim\n" +
  "/reset — clear our conversation history";

const HELP_TEXT_FI =
  `Hei! Olen FYS.240 Optiikka -kurssin avustaja. Tunnen luentomuistiinpanot, oppikirjan ja ${VIDEO_DB ? VIDEO_DB.all().length : 0} luentovideota kaikista kurssin aiheista.\n\n` +
  "Voit kysyä esimerkiksi:\n" +
  "- Miten ohut linssi toimii?\n" +
  "- Mikä ero on reaalikuvalla ja virtuaalikuvalla?\n" +
  "- Jumitin tehtävässä 5.2, mistä kannattaisi aloittaa?\n" +
  "- Selitä, miten mikroskooppi toimii\n" +
  "- \"Kysele minulta luvusta 2\" (tai tietystä osiosta, esim. \"kysele minulta osiosta 2.3\") monivalintavisaa varten\n\n" +
  "Selitän käsitteitä, ohjaan sinut oikeiden videoiden tai lukujen pariin ja annan vinkkejä kotitehtäviin (mutten valmiita ratkaisuja).\n\n" +
  "Komennot:\n" +
  "/topics — kaikki luentovideoiden aiheet\n" +
  "/week1 ... /week7 — kyseisen kurssiviikon videot (viikko 7 = kertaus)\n" +
  "/luennot, /viikko1 ... /viikko7 — samat kuin /topics ja /week, mutta aina suomeksi\n" +
  "/HW1 ... /HW6 — listaa tietyn kotitehtäväsetin tehtävät\n" +
  "/HW3.2 — vinkki kotitehtävä 3:n tehtävään 2\n" +
  "/HW_hint3.2 — vain lyhyt vihje, ei selitystä\n" +
  "/HWQ3.2 — näytä tehtävän tarkka kysymysteksti\n" +
  "/reset — tyhjennä keskusteluhistoriamme";

function helpText(lang) {
  return lang === "fi" ? HELP_TEXT_FI : HELP_TEXT_EN;
}


// Video topics command
// Returns an array of HTML-formatted message chunks (Telegram parse_mode:
// "HTML"), each safely under Telegram's 4096-char limit. Each line's chapter
// and topic text IS the hyperlink, rather than a separate URL underneath.
// Videos are grouped under a bold chapter-name heading, with a blank line
// separating one chapter's group from the next.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// lang: "en" | "fi" — picks Finnish chapter names and, per video, the
// Finnish topic/url pair (falling back to the English one for any video
// that has no Finnish recording, same fallback rule as TA_INSTRUCTIONS).
function buildVideoListChunks(chapterKeys, headerText, lang) {
  const MAX_CHUNK = 3800; // headroom under Telegram's 4096 hard limit
  const messages = [];
  let msg = headerText;
  let lastMajor = null;
  const names = lang === "fi" ? CHAPTER_NAMES_FI : CHAPTER_NAMES;
  const chapterWord = lang === "fi" ? "Luku" : "Chapter";

  chapterKeys.forEach(chapter => {
    const major = parseInt(chapter.split(".")[0], 10);
    const videos = VIDEO_DB.getChapter(chapter);
    if (videos.length === 0) return;

    // Build the chapter heading only once, right before its first video -
    // a blank line separates it from the previous chapter's last line.
    let prefix = "";
    if (major !== lastMajor) {
      if (lastMajor !== null) prefix += "\n";
      const title = names[major]
        ? `${chapterWord} ${major}: ${names[major]}`
        : `${chapterWord} ${major}`;
      prefix += `<b>${escapeHtml(title)}</b>\n`;
      lastMajor = major;
    }

    videos.forEach(v => {
      const topic = lang === "fi" && v.topic_fi ? v.topic_fi : v.topic;
      const url = lang === "fi" && v.url_fi ? v.url_fi : v.url;
      const label = escapeHtml(`${v.chapter}: ${topic}`);
      const line = `<a href="${escapeHtml(url)}">${label}</a>\n`;
      const block = prefix + line;
      if (msg.length + block.length > MAX_CHUNK) {
        messages.push(msg.trim());
        msg = "";
      }
      msg += block;
      prefix = ""; // only the first video of this chapter gets the heading
    });
  });

  if (msg.trim()) messages.push(msg.trim());
  return messages;
}

function generateTopicsMessages(lang) {
  if (!VIDEO_DB || VIDEO_DB.all().length === 0) {
    return [lang === "fi" ? "Videotietokantaa ei ole ladattu." : "Video database not loaded."];
  }
  const header =
    lang === "fi"
      ? "📺 <b>FYS.240 Optiikka - Luentovideot</b>\n\n"
      : "📺 <b>FYS.240 Optics - Video Lectures</b>\n\n";
  return buildVideoListChunks(VIDEO_DB.getChapters(), header, lang);
}

// /weekN command — real FYS.240 course schedule, mapping each course week
// to its chapter(s). Deterministic, no AI call. (WEEK_TO_CHAPTERS and
// RECAP_WEEK are declared earlier, near TA_INSTRUCTIONS, since
// formatCourseSchedule() needs them at module-load time.)

function getAvailableWeeks() {
  return [...Object.keys(WEEK_TO_CHAPTERS).map(Number), RECAP_WEEK].sort((a, b) => a - b);
}

function generateWeekMessages(weekNum, lang) {
  if (!VIDEO_DB || VIDEO_DB.all().length === 0) {
    return [lang === "fi" ? "Videotietokantaa ei ole ladattu." : "Video database not loaded."];
  }

  if (weekNum === RECAP_WEEK) {
    return [
      lang === "fi"
        ? "📚 Viikko 7 (5.10.-11.10.) on kertausviikko - ei uusia lukuja. " +
          "Selaa kaikkia videoita uudelleen komennolla /topics, tai kysy minulta mitä tahansa luvuista 2-10."
        : "📚 Week 7 (5.10.-11.10.) is the recap week - no new chapters. " +
          "Use /topics to browse all videos again, or ask me about anything from chapters 2-10.",
    ];
  }

  const chapterMajors = WEEK_TO_CHAPTERS[weekNum];
  if (!chapterMajors) {
    return [
      lang === "fi"
        ? `Viikolle ${weekNum} ei löytynyt videoita. Saatavilla olevat viikot: ${getAvailableWeeks().join(", ")} (7 on kertausviikko).`
        : `No videos found for week ${weekNum}. Available weeks: ${getAvailableWeeks().join(", ")} (7 is the recap week).`,
    ];
  }

  const chapters = VIDEO_DB.getChapters().filter(c =>
    chapterMajors.includes(parseInt(c.split(".")[0], 10))
  );

  const header =
    lang === "fi"
      ? `📺 <b>FYS.240 Optiikka - Viikon ${weekNum} videot</b>\n\n`
      : `📺 <b>FYS.240 Optics - Week ${weekNum} Videos</b>\n\n`;
  return buildVideoListChunks(chapters, header, lang);
}

// ------------------------------------------------------------- webhook ------
app.get("/", (_req, res) => res.send(`FYS.240 Optics bot v${BOT_VERSION} is running`));
app.get("/healthz", (_req, res) => res.json({ 
  ok: true, 
  version: BOT_VERSION,
  corpusChars: COURSE_CORPUS.length,
  corpusLooksHealthy: corpusLoader.corpusLooksHealthy(),
  videoLectures: VIDEO_DB ? VIDEO_DB.all().length : 0,
  homeworkProblemsLoaded: Object.values(HOMEWORK_PROBLEMS).reduce((n, hw) => n + Object.keys(hw).length, 0),
  homeworkProblemsCourseMismatch: HOMEWORK_PROBLEMS_COURSE_MISMATCH,
  quizBankLooksHealthy: quizGenerator.quizBankLooksHealthy(),
}));

app.post("/webhook", (req, res) => {
  if (WEBHOOK_SECRET && req.get("x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) {
    return res.sendStatus(403);
  }
  res.sendStatus(200);

  handleUpdate(req.body).catch((e) => console.error("handleUpdate crashed:", e.message));
});

async function handleUpdate(update) {
  if (!update || update.update_id === undefined) return;

  if (seenUpdates.has(update.update_id)) return;
  seenUpdates.add(update.update_id);
  if (seenUpdates.size > 1000) seenUpdates.clear();

  // Quiz answer taps and chapter-picker taps arrive as callback_query
  // updates, not message updates — handle those separately.
  if (update.callback_query) {
    return handleCallbackQuery(update.callback_query);
  }

  const message = update.message;
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const userId = message.from?.id;
  const text = message.text.trim();

  if (!shouldAnswer(message)) return;

  const lang = getLang(message);

  if (/^\/(start|help)/i.test(text)) return sendMessage(chatId, helpText(lang));
  if (/^\/reset/i.test(text)) {
    history.delete(chatId);
    return sendMessage(
      chatId,
      lang === "fi" ? "Keskusteluhistoria tyhjennetty. Kysy mitä vain." : "Conversation history cleared. Ask me anything."
    );
  }
  if (/^\/topics?/i.test(text)) {
    for (const chunk of generateTopicsMessages(lang)) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: chunk,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }).catch((e) =>
        console.error("Telegram sendMessage (/topics) failed:", e.response?.status, JSON.stringify(e.response?.data))
      );
    }
    return;
  }
  // /luennot — Finnish alias for /topics, always Finnish regardless of the
  // student's Telegram client language (unlike /topics, which follows
  // getLang(message)).
  if (/^\/luennot/i.test(text)) {
    for (const chunk of generateTopicsMessages("fi")) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: chunk,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }).catch((e) =>
        console.error("Telegram sendMessage (/luennot) failed:", e.response?.status, JSON.stringify(e.response?.data))
      );
    }
    return;
  }
  const weekMatch = text.match(/^\/week(\d+)/i);
  if (weekMatch) {
    const weekNum = parseInt(weekMatch[1], 10);
    for (const chunk of generateWeekMessages(weekNum, lang)) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: chunk,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }).catch((e) =>
        console.error("Telegram sendMessage (/week) failed:", e.response?.status, JSON.stringify(e.response?.data))
      );
    }
    return;
  }
  // /viikkoN — Finnish alias for /weekN, always Finnish regardless of the
  // student's Telegram client language.
  const viikkoMatch = text.match(/^\/viikko(\d+)/i);
  if (viikkoMatch) {
    const weekNum = parseInt(viikkoMatch[1], 10);
    for (const chunk of generateWeekMessages(weekNum, "fi")) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: chunk,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }).catch((e) =>
        console.error("Telegram sendMessage (/viikko) failed:", e.response?.status, JSON.stringify(e.response?.data))
      );
    }
    return;
  }

  // ---- /HWQ3.2 (exact verbatim question text, no hint, no API call)
  const hwTextMatch = text.match(HW_TEXT_COMMAND_RE);
  if (hwTextMatch) {
    const hwNum = hwTextMatch[1];
    const problemNum = hwTextMatch[2];

    const nowText = Date.now();
    if (nowText - (lastCall.get(userId) || 0) < MIN_INTERVAL_MS) return;
    lastCall.set(userId, nowText);

    console.log(`[${message.chat.type}:${chatId}] HWQ command: ${text.slice(0, 60)}`);

    await sendMessage(chatId, buildHwFullText(hwNum, problemNum, lang), message.message_id);
    return;
  }

  // ---- /HW1 ... /HW6, /HW3.2, /HW_hint3.2
  const hwMatch = text.match(HW_COMMAND_RE);
  if (hwMatch) {
    const isMinimalHint = !!hwMatch[1];
    const hwNum = hwMatch[2];
    const problemNum = hwMatch[3];

    const now1 = Date.now();
    if (now1 - (lastCall.get(userId) || 0) < MIN_INTERVAL_MS) return;
    lastCall.set(userId, now1);

    console.log(`[${message.chat.type}:${chatId}] HW command: ${text.slice(0, 60)}`);

    // Overview with no problem number: answer for free/instantly if we have
    // structured data for this homework, no need to call Claude at all.
    if (!problemNum && HOMEWORK_PROBLEMS[hwNum] && Object.keys(HOMEWORK_PROBLEMS[hwNum]).length) {
      await sendMessage(chatId, buildHwOverviewFromStructuredData(hwNum), message.message_id);
      return;
    }

    const directive = !problemNum
      ? buildHwOverviewDirective(hwNum)
      : isMinimalHint
      ? buildHwMinimalHintDirective(hwNum, problemNum)
      : buildHwHintDirective(hwNum, problemNum);

    await tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});

    try {
      const reply = await askClaude(chatId, directive);
      remember(chatId, "user", text);
      remember(chatId, "assistant", reply);
      await sendMessage(chatId, reply, message.message_id);
    } catch (e) {
      await sendMessage(
        chatId,
        lang === "fi"
          ? "Pahoittelut, en juuri nyt saanut yhteyttä aivoihini. Yritä hetken kuluttua uudelleen."
          : "Sorry, I couldn't reach my brain just now. Please try again in a moment.",
        message.message_id
      );
    }
    return;
  }

  const question = stripMention(text);
  if (question.length < 3) return;

  const now = Date.now();
  if (now - (lastCall.get(userId) || 0) < MIN_INTERVAL_MS) return;
  lastCall.set(userId, now);

  console.log(`[${message.chat.type}:${chatId}] ${question.slice(0, 120)}`);

  // ---- "quiz me" / "quiz me on chapter 2" / "quiz me on section 2.3" ----
  if (quizGenerator.isQuizRequest(question)) {
    return quizGenerator
      .startQuiz(quizBot, chatId, question, askWhichChapter, lang)
      .catch((e) => console.error("quizGenerator.startQuiz crashed:", e.message));
  }

  await tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});

  try {
    const videoHints = VIDEO_DB ? VIDEO_DB.findRelevantSegments(question) : [];
    const reply = await askClaude(chatId, question, videoHints);
    remember(chatId, "user", question);
    remember(chatId, "assistant", reply);
    await sendMessage(chatId, reply, message.message_id);
  } catch (e) {
    await sendMessage(
      chatId,
      lang === "fi"
        ? "Pahoittelut, en juuri nyt saanut yhteyttä aivoihini. Yritä hetken kuluttua uudelleen."
        : "Sorry, I couldn't reach my brain just now. Please try again in a moment.",
      message.message_id
    );
  }
}

// callback_query updates: answer-option taps ("quiz:...") from
// quizGenerator's inline keyboards, and chapter-picker taps
// ("quizchapter:N:lang") from askWhichChapter() above.
async function handleCallbackQuery(cq) {
  const data = cq.data || "";

  if (data.startsWith("quiz:")) {
    return quizGenerator
      .handleQuizAnswer(quizBot, cq)
      .catch((e) => console.error("quizGenerator.handleQuizAnswer crashed:", e.message));
  }

  if (data.startsWith("quizchapter:")) {
    const [, chapterStr, langStr] = data.split(":");
    const chapter = chapterStr;
    const lang = langStr === "fi" ? "fi" : "en";
    const chatId = cq.message?.chat?.id;
    await quizBot.answerCallbackQuery(cq.id);
    if (!chatId) return;
    return quizGenerator
      .startQuiz(quizBot, chatId, `quiz me on chapter ${chapter}`, askWhichChapter, lang)
      .catch((e) => console.error("quizGenerator.startQuiz (chapter pick) crashed:", e.message));
  }

  // Unknown callback data — acknowledge anyway so Telegram stops showing a
  // loading spinner on the button.
  await quizBot.answerCallbackQuery(cq.id).catch(() => {});
}

// ---------------------------------------------------------------- start -----
if (!TELEGRAM_TOKEN) console.error("WARNING: TELEGRAM_TOKEN is not set");
if (!ANTHROPIC_API_KEY) console.error("WARNING: ANTHROPIC_API_KEY is not set");

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const videoStatus = VIDEO_DB && VIDEO_DB.all().length > 0 ? "✓" : "⚠";
  const hwStatus = HOMEWORK_PROBLEMS_COURSE_MISMATCH ? "⚠ COURSE MISMATCH" : "✓";
  console.log(
    `FYS.240 Optics bot v${BOT_VERSION} listening on port ${PORT} | model=${MODEL} | cache=${CACHE_TTL} | ` +
    `Math=Unicode | Videos=${videoStatus} | Homework=${hwStatus}`
  );
});
