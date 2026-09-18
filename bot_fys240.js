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
const { parseLatexBlocks, sendLatexImage } = require("./latex-renderer");
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
- ALWAYS use this exact [Video X.Y (Topic)](URL) format — never write the raw URL on its own, after a colon, or after a dash
- LANGUAGE OF VIDEO LINKS: <video_lectures> below lists each lecture as an EN pair (topic + url) and, where one exists, an FI pair after "|". ALWAYS match the pair's language to the language you are answering in RIGHT NOW, with or without a timestamp — do not default to the English pair out of habit, even if an example below happens to be in English. If a lecture has no FI pair, use the EN pair even in a Finnish answer.
  EN example (answering in English): "That's covered in [Video 5.2 (Refraction)](https://youtube.com/watch?v=pzzjQhhXdkE)."
  FI example (answering in Finnish — same rule, Finnish pair): "Asiasta kerrotaan [Video 5.2 (Taittuminen)](https://youtube.com/watch?v=<fi-id>):ssa."
- IN-VIDEO TIMESTAMPS: some lectures also list chapter markers indented beneath the EN and/or FI pair, tagged EN: or FI:, e.g. "  FI: 16:48 (1008s) Poyntingin vektori S = c^2 eps0 ExB". When the student's question matches one of these markers specifically (not just the video's general topic), link straight to that moment instead of the start of the video: append &t=<seconds>s to the SAME-LANGUAGE pair's url, using the seconds shown in parentheses after the marker — never recompute it yourself. Only use a marker that's tagged for the language (EN:/FI:) you're actually linking; never mix a FI: marker's seconds onto the EN url or vice versa.
  FI example (answering in Finnish, using a FI: marker): "Asiasta kerrotaan tarkemmin kohdassa 16:48 videolla [Video 4.3 (Poyntingin vektori)](https://youtube.com/watch?v=KCRFMlnFNbQ&t=1008s)."
  EN example (answering in English, using an EN: marker for the same lecture): "That's explained around 16:48 in [Video 4.3 (Poynting vector formula)](https://youtube.com/watch?v=qPxBAoaT_Dc&t=1008s)." — only if an EN: marker is actually listed for that video.
  Not every video has markers yet — only use &t= when one is actually listed for the pair (language) you're linking.

HOW TO HELP
**LENGTH**: ONE OR TWO SHORT SENTENCES/PARAGRAPH ONLY. Never use section headers, bullets, tables, or sub-points. No "Step 1, Step 2". No "Key insight:". Just talk to them like a person.
**HOMEWORK**: Give hints, not answers. Name the relevant equation or concept, point to the section, suggest a video if available, ask ONE guiding question. (Students can also use /HW1 ... /HW6 and /HW3.2-style commands to ask about a specific homework set or problem directly.)
**CONCEPTUAL**: Answer directly and briefly. If they ask about something that has a video, mention it: "That's in [Video X.Y (Topic)](URL). In short, ..."
**VIDEO REFERENCES**: When appropriate, include video links as [Video X.Y (Topic)](URL) so students can find them easily, choosing the EN or FI title/url pair to match the language you're answering in (see LANGUAGE OF VIDEO LINKS above).
**STUDENT ATTEMPTS**: If they show work, check it quickly, point at one specific error. Don't rewrite the whole thing.
**REDIRECT**: If it's outside course scope, say "That's beyond FYS.240, ask your instructor during office hours".

FORMAT
- Plain text for Telegram.
${LATEX_ENABLED 
  ? `- Write EQUATIONS in LaTeX between double dollar signs: $$E = mc^2$$
- These will be automatically rendered as readable images`
  : `- Use UNICODE SYMBOLS ONLY: α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω`
}
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

// Splits text into <4096-char chunks and sends each as a message. Pass
// parseMode "HTML" (the normal case now, so video links render as clickable
// text) or leave it undefined for a literal-text fallback. Used for the
// non-LaTeX path, and as a fallback if LaTeX parsing/sending fails, so a
// rendering hiccup degrades to plain text instead of the student getting
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
// $$ LaTeX blocks are pulled out first (via parseLatexBlocks) and sent as
// separate equation images; the surrounding text segments go through the
// same link-conversion + HTML send as the non-LaTeX path.
async function sendMessage(chatId, text, replyTo) {
  text = markdownEmphasisToUnicode(text);

  if (LATEX_ENABLED) {
    let segments;
    try {
      segments = parseLatexBlocks(text);
    } catch (e) {
      console.error("parseLatexBlocks failed, falling back to plain text:", e.message);
      await sendPlainChunks(chatId, convertLinksAndEscape(text.replace(/\$\$/g, "")), replyTo, "HTML");
      return;
    }
    for (const seg of segments) {
      if (seg.type === "latex") {
        await sendLatexImage(tg, chatId, seg.content, replyTo).catch((e) =>
          console.error("sendLatexImage failed:", e.message)
        );
      } else if (seg.content && seg.content.trim()) {
        await sendPlainChunks(chatId, convertLinksAndEscape(seg.content), replyTo, "HTML");
      }
    }
  } else {
    await sendPlainChunks(chatId, convertLinksAndEscape(text), replyTo, "HTML");
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
  "/HW1 ... /HW6 — list the problems in a specific homework set\n" +
  "/HW3.2 — get a hint on Homework 3, problem 2\n" +
  "/HW_hint3.2 — just a one-line nudge, no explanation\n" +
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
  "/HW1 ... /HW6 — listaa tietyn kotitehtäväsetin tehtävät\n" +
  "/HW3.2 — vinkki kotitehtävä 3:n tehtävään 2\n" +
  "/HW_hint3.2 — vain lyhyt vihje, ei selitystä\n" +
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
app.get("/", (_req, res) => res.send("FYS.240 Optics bot is running"));
app.get("/healthz", (_req, res) => res.json({ 
  ok: true, 
  corpusChars: COURSE_CORPUS.length,
  corpusLooksHealthy: corpusLoader.corpusLooksHealthy(),
  videoLectures: VIDEO_DB ? VIDEO_DB.all().length : 0,
  latexEnabled: LATEX_ENABLED,
  homeworkProblemsLoaded: Object.values(HOMEWORK_PROBLEMS).reduce((n, hw) => n + Object.keys(hw).length, 0),
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
    const reply = await askClaude(chatId, question);
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
  const latexStatus = LATEX_ENABLED ? "ENABLED ✓" : "disabled";
  const videoStatus = VIDEO_DB && VIDEO_DB.all().length > 0 ? "✓" : "⚠";
  console.log(
    `FYS.240 Optics bot listening on port ${PORT} | model=${MODEL} | cache=${CACHE_TTL} | ` +
    `LaTeX=${latexStatus} | Videos=${videoStatus}`
  );
});
