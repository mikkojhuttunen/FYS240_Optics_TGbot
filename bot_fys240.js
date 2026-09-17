/**
 * FYS.240 Optics — Telegram teaching-assistant bot
 * With video lectures integration
 *
 * Key features:
 *   1. Course material from course_corpus.txt (cached)
 *   2. Video lecture links from fys240_videos.js
 *   3. LaTeX equation rendering (optional)
 *   4. Conversation history & rate limiting
 *
 * HOMEWORK-HELPER COMMANDS (ported from the FYS.501 bot):
 *   /HW3          — overview: lists the problems in Homework 3
 *   /HW3.2        — hint on Homework 3, problem 2 (equation/section pointer + guiding question)
 *   /HW_hint3.2   — minimal nudge: one guiding question, nothing else
 *   Course has 6 homework sets, so hwNum is expected to be 1-6 (HW1 ... HW6) —
 *   same flat numbering as FYS.501, NOT the chapter numbers (2-10) used elsewhere in this bot.
 *   None of these reveal solutions — same no-solutions rule as the rest of the bot.
 */

const fs = require("fs");
const path = require("path");
const express = require("express");
const axios = require("axios");
const { extractAndSendLatex } = require("./latex-renderer");

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
const LATEX_ENABLED = process.env.LATEX_ENABLED !== "false";

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
try {
  HOMEWORK_PROBLEMS = JSON.parse(fs.readFileSync(HW_PROBLEMS_PATH, "utf8"));
  const total = Object.values(HOMEWORK_PROBLEMS).reduce((n, hw) => n + Object.keys(hw).length, 0);
  console.log(`Loaded homework_problems.json: ${total} problems across ${Object.keys(HOMEWORK_PROBLEMS).length} homeworks`);
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
- Example: "That's covered in Video 5.2 (Refraction). Watch it here: [link]"
- Always provide the YouTube link when suggesting a video
- Format: Chapter X.Y: [topic] - https://youtube.com/watch?v=[ID]

HOW TO HELP
**LENGTH**: ONE OR TWO SHORT SENTENCES/PARAGRAPH ONLY. Never use section headers, bullets, tables, or sub-points. No "Step 1, Step 2". No "Key insight:". Just talk to them like a person.
**HOMEWORK**: Give hints, not answers. Name the relevant equation or concept, point to the section, suggest a video if available, ask ONE guiding question. (Students can also use /HW1 ... /HW6 and /HW3.2-style commands to ask about a specific homework set or problem directly.)
**CONCEPTUAL**: Answer directly and briefly. If they ask about something that has a video, mention it: "That's in Video X.Y: [link]. In short, ..."
**VIDEO REFERENCES**: When appropriate, include direct YouTube links with chapter numbers so students can find them easily.
**STUDENT ATTEMPTS**: If they show work, check it quickly, point at one specific error. Don't rewrite the whole thing.
**REDIRECT**: If it's outside course scope, say "That's beyond FYS.240, ask your instructor during office hours".

FORMAT
- Plain text for Telegram.
${LATEX_ENABLED 
  ? `- Write EQUATIONS in LaTeX between double dollar signs: $$E = mc^2$$
- These will be automatically rendered as readable images`
  : `- Use UNICODE SYMBOLS ONLY: α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω`
}
- Include YouTube links when suggesting videos
- 2-3 short paragraphs maximum
- Answer in the language the student writes in (English or Finnish)

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

  // Add video database context
  if (VIDEO_DB && VIDEO_DB.all().length > 0) {
    const videoContext = formatVideoDatabase(VIDEO_DB);
    blocks.push({ type: "text", text: videoContext });
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
  
  const chapters = db.getChapters();
  chapters.forEach(chapter => {
    const videos = db.getChapter(chapter);
    videos.forEach(video => {
      context += `${video.chapter}: ${video.topic} - https://youtube.com/watch?v=${video.id}\n`;
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

async function sendMessage(chatId, text, replyTo) {
  if (LATEX_ENABLED) {
    await extractAndSendLatex(tg, chatId, text, replyTo).catch((e) => {
      console.error("extractAndSendLatex failed:", e.message);
    });
  } else {
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
        reply_to_message_id: replyTo,
        allow_sending_without_reply: true,
        disable_web_page_preview: true,
      }).catch((e) =>
        console.error("Telegram sendMessage failed:", e.response?.status, JSON.stringify(e.response?.data))
      );
    }
  }
}

// --------------------------------------------------------------- claude -----
async function askClaude(chatId, question) {
  const messages = [...(history.get(chatId) || []), { role: "user", content: question }];

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
    .replace(/^\/(ask|help|start|reset|video|topics|week\d+)(@\S+)?\s*/i, "")
    .trim();
}

// --------------------------------------------------------- HW commands ------
// Matches:  /HW3          (overview of Homework 3)
//           /HW3.2        (hint on Homework 3, problem 2)
//           /HW_hint3.2   (minimal one-line nudge on Homework 3, problem 2)
// hwNum is expected to be 1-6 (six homework sets); the regex itself doesn't
// enforce that range, it just matches whatever digits follow /HW.
const HW_COMMAND_RE = /^\/HW(_hint)?(\d+)(?:\.(\d+))?(@\S+)?\b/i;

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

const HELP_TEXT =
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
  "/HW1 ... /HW6 — list the problems in a specific homework set\n" +
  "/HW3.2 — get a hint on Homework 3, problem 2\n" +
  "/HW_hint3.2 — just a one-line nudge, no explanation\n" +
  "/reset — clear our conversation history";


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

function buildVideoListChunks(chapterKeys, headerText) {
  const MAX_CHUNK = 3800; // headroom under Telegram's 4096 hard limit
  const messages = [];
  let msg = headerText;
  let lastMajor = null;

  chapterKeys.forEach(chapter => {
    const major = parseInt(chapter.split(".")[0], 10);
    const videos = VIDEO_DB.getChapter(chapter);
    if (videos.length === 0) return;

    // Build the chapter heading only once, right before its first video -
    // a blank line separates it from the previous chapter's last line.
    let prefix = "";
    if (major !== lastMajor) {
      if (lastMajor !== null) prefix += "\n";
      const title = CHAPTER_NAMES[major]
        ? `Chapter ${major}: ${CHAPTER_NAMES[major]}`
        : `Chapter ${major}`;
      prefix += `<b>${escapeHtml(title)}</b>\n`;
      lastMajor = major;
    }

    videos.forEach(v => {
      const label = escapeHtml(`${v.chapter}: ${v.topic}`);
      const line = `<a href="${escapeHtml(v.url)}">${label}</a>\n`;
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

function generateTopicsMessages() {
  if (!VIDEO_DB || VIDEO_DB.all().length === 0) {
    return ["Video database not loaded."];
  }
  return buildVideoListChunks(
    VIDEO_DB.getChapters(),
    "📺 <b>FYS.240 Optics - Video Lectures</b>\n\n"
  );
}

// /weekN command — real FYS.240 course schedule, mapping each course week
// to its chapter(s). Deterministic, no AI call. (WEEK_TO_CHAPTERS and
// RECAP_WEEK are declared earlier, near TA_INSTRUCTIONS, since
// formatCourseSchedule() needs them at module-load time.)

function getAvailableWeeks() {
  return [...Object.keys(WEEK_TO_CHAPTERS).map(Number), RECAP_WEEK].sort((a, b) => a - b);
}

function generateWeekMessages(weekNum) {
  if (!VIDEO_DB || VIDEO_DB.all().length === 0) {
    return ["Video database not loaded."];
  }

  if (weekNum === RECAP_WEEK) {
    return [
      "📚 Week 7 (5.10.-11.10.) is the recap week - no new chapters. " +
      "Use /topics to browse all videos again, or ask me about anything from chapters 2-10.",
    ];
  }

  const chapterMajors = WEEK_TO_CHAPTERS[weekNum];
  if (!chapterMajors) {
    return [
      `No videos found for week ${weekNum}. Available weeks: ${getAvailableWeeks().join(", ")} (7 is the recap week).`,
    ];
  }

  const chapters = VIDEO_DB.getChapters().filter(c =>
    chapterMajors.includes(parseInt(c.split(".")[0], 10))
  );

  const header = `📺 <b>FYS.240 Optics - Week ${weekNum} Videos</b>\n\n`;
  return buildVideoListChunks(chapters, header);
}

// ------------------------------------------------------------- webhook ------
app.get("/", (_req, res) => res.send("FYS.240 Optics bot is running"));
app.get("/healthz", (_req, res) => res.json({ 
  ok: true, 
  corpusChars: COURSE_CORPUS.length,
  videoLectures: VIDEO_DB ? VIDEO_DB.all().length : 0,
  latexEnabled: LATEX_ENABLED,
  homeworkProblemsLoaded: Object.values(HOMEWORK_PROBLEMS).reduce((n, hw) => n + Object.keys(hw).length, 0),
}));

app.post("/webhook", (req, res) => {
  if (WEBHOOK_SECRET && req.get("x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) {
    return res.sendStatus(403);
  }
  res.sendStatus(200);

  handleUpdate(req.body).catch((e) => console.error("handleUpdate crashed:", e.message));
});

async function handleUpdate(update) {
  const message = update?.message;
  if (!message || !message.text) return;

  if (seenUpdates.has(update.update_id)) return;
  seenUpdates.add(update.update_id);
  if (seenUpdates.size > 1000) seenUpdates.clear();

  const chatId = message.chat.id;
  const userId = message.from?.id;
  const text = message.text.trim();

  if (!shouldAnswer(message)) return;

  if (/^\/(start|help)/i.test(text)) return sendMessage(chatId, HELP_TEXT);
  if (/^\/reset/i.test(text)) {
    history.delete(chatId);
    return sendMessage(chatId, "Conversation history cleared. Ask me anything.");
  }
  if (/^\/topics?/i.test(text)) {
    for (const chunk of generateTopicsMessages()) {
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
  const weekMatch = text.match(/^\/week(\d+)/i);
  if (weekMatch) {
    const weekNum = parseInt(weekMatch[1], 10);
    for (const chunk of generateWeekMessages(weekNum)) {
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
        "Sorry, I couldn't reach my brain just now. Please try again in a moment.",
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

  await tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});

  try {
    const reply = await askClaude(chatId, question);
    remember(chatId, "user", question);
    remember(chatId, "assistant", reply);
    await sendMessage(chatId, reply, message.message_id);
  } catch (e) {
    await sendMessage(
      chatId,
      "Sorry, I couldn't reach my brain just now. Please try again in a moment.",
      message.message_id
    );
  }
}

// ---------------------------------------------------------------- start -----
if (!TELEGRAM_TOKEN) console.error("WARNING: TELEGRAM_TOKEN is not set");
if (!ANTHROPIC_API_KEY) console.error("WARNING: ANTHROPIC_API_KEY is not set");

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const latexStatus = LATEX_ENABLED ? "ENABLED ✓" : "disabled";
  const videoStatus = VIDEO_DB && VIDEO_DB.all().length > 0 ? "✓" : "⚠";
  console.log(
    `FYS.240 Optics bot listening on port ${PORT} | model=${MODEL} | cache=${CACHE_TTL} | ` +
    `LaTeX=${latexStatus} | Videos=${videoStatus}`
  );
});
