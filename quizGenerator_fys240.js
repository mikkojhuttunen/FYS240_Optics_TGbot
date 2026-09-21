/**
 * quizGenerator_fys240.js
 * DATA_VERSION: 1.0.0 (bump if the quiz flow, bank-loading behavior, or
 * prompt wording change — see bot_fys240.js's BOT_VERSION for the overall
 * bot versioning convention this follows)
 * -----------------
 * Chapter/section quiz generation + grading for the FYS.240 Optics bot.
 *
 * Forked from quizGenerator.js (the FYS.501 Laser Physics version) — the
 * logic is identical, only the numbers and prompt wording changed:
 *   - FYS.240 covers chapters 2-10 (not 1-4), with sections running up to
 *     two digits (2.1 ... 10.13, not just X.1-X.9), so CHAPTER_HINT and
 *     SECTION_HINT below use \d{1,2} instead of a hardcoded [1-4]/[1-9].
 *   - QUIZ_SYSTEM_PROMPT describes an optics course, not laser physics.
 *   - The quiz bank lives at quizBank_fys240.json, which does NOT exist
 *     yet (no FYS.240-specific quiz bank has been built the way
 *     quizBank.json was for FYS.501). That's fine by design: loadQuizBank()
 *     already degrades gracefully to an empty bank on a read failure, so
 *     sampleFromBank() always reports a full shortfall and every quiz is
 *     live-generated via generateQuiz() until a real bank is built (see
 *     quizBankPending_fys240.json below, which self-expands from those live
 *     generations — the normal path to eventually building one, same as
 *     the FYS.501 setup guide describes).
 *
 * Follows existing patterns from lectureLinks.js / checkhw:
 *  - Local regex gate before any API call (STAGE1_TRIGGER)
 *  - LLM only used for content generation (structured JSON), never for grading
 *  - Grading is deterministic, done in code
 *  - Session state via in-memory Map with expiry (mirrors checkhw sessions)
 *  - Corpus-grounded generation (no invented content outside course_corpus.txt)
 *
 * Architecture (see QUIZ_FEATURE_SETUP_GUIDE.md section 2):
 *  - Bank-first: sampleFromBank() draws from the pre-built quiz bank,
 *    no API call.
 *  - Generate-as-fallback: if the bank doesn't have enough unused questions
 *    for the request, generateQuiz() is called live, scoped to just the
 *    requested section's corpus excerpt, to make up the shortfall.
 *  - Self-expanding: live-generated fallback questions are appended to
 *    quizBankPending_fys240.json (and also logged as a structured JSON line
 *    to stdout, so a log-based capture pipeline works too if the
 *    deployment's filesystem doesn't persist across restarts — see section
 *    5a of the guide). They are never written into the real quiz bank
 *    directly; that only happens via a reviewed, curated merge.
 *
 * Wiring into bot_fys240.js mirrors how bot.js wires the original: this
 * file stays self-contained, bot_fys240.js just calls a few exported
 * functions (see INTEGRATION notes at bottom).
 */

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const corpusLoader = require('./corpusLoader');
const limiter = require('./usageLimiter');
const { getCorpusSection } = corpusLoader;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const QUIZ_BANK_PATH = path.join(__dirname, 'quizBank_fys240.json');
const QUIZ_BANK_PENDING_PATH = path.join(__dirname, 'quizBankPending_fys240.json');

// ---------- Stage 1: local trigger gate (no API call) ----------

const STAGE1_TRIGGER = /\b(quiz|test me|quiz me|kysele|testaa minua|koe minua)\b/i;
// FYS.240 runs chapters 2-10, so \d{1,2} (not a hardcoded [1-4]) — this
// also correctly matches two-digit chapter 10. Finnish alternatives cover
// the inflected forms students actually type: "luvusta 2" (elative,
// "from chapter 2") and the bare nominative "luku 2".
const CHAPTER_HINT = /chapter\s?(\d{1,2})|ch\.?\s?(\d{1,2})|luvu\w*\s?(\d{1,2})|luku\s?(\d{1,2})/i;
// e.g. "2.3", "section 10.13", "osiosta 10.13" — matched separately from
// the bare chapter hint above so "chapter 2" / "luku 2" alone doesn't get
// misread as section "2". The section part is \d{1,2} (not [1-9]) since
// sections run up to X.13.
const SECTION_HINT = /\b(?:section\s+|osio\w*\s+)?(\d{1,2})\.(\d{1,2})\b/i;
// Trailing question count, e.g. "/quiz 2.3 10" or "quiz me on chapter 2, 8 questions"
// or "kysele minulta luvusta 2, 8 kysymystä"
const COUNT_HINT = /\b(\d{1,2})\s*(?:questions?|kysymys(?:tä|iä)?)?\s*$/i;

const DEFAULT_COUNT = 5;
const MAX_COUNT = 15; // reasonable cap per section 6 of the setup guide

function isQuizRequest(text) {
  return STAGE1_TRIGGER.test(text);
}

// Picks the quiz's language ("en" | "fi"). `fallbackLang` is the caller's
// best guess absent any text signal (bot_fys240.js passes the Telegram
// client's language_code, same as the deterministic /topics, /week, etc.
// commands use). Explicit Finnish quiz vocabulary in the student's own
// message (trigger words, "luvusta"/"luku", "osiosta", "kysymystä") always
// wins over that fallback, so a Finnish-phrased request is honored even if
// the student's client happens to be set to English, and vice versa.
const FI_HINT_RE = /\b(kysele|testaa minua|koe minua|luvu\w*|luku\s?\d|osio\w*|kysymys(?:tä|iä)?)\b/i;
function resolveQuizLang(text, fallbackLang) {
  if (FI_HINT_RE.test(text)) return "fi";
  return fallbackLang === "fi" ? "fi" : "en";
}

function extractChapterHint(text) {
  const sectionMatch = text.match(SECTION_HINT);
  if (sectionMatch) return sectionMatch[1];
  const m = text.match(CHAPTER_HINT);
  return m ? (m[1] || m[2] || m[3] || m[4]) : null;
}

function extractSectionHint(text) {
  const m = text.match(SECTION_HINT);
  return m ? `${m[1]}.${m[2]}` : null;
}

// Returns the raw requested count (unclamped), or null if none was given.
// Mask out anything already consumed as a chapter/section reference first,
// so e.g. "quiz me chapter 1" doesn't misread the "1" in "chapter 1" as a
// requested question count.
function extractRawCountHint(text) {
  const remainder = text.replace(SECTION_HINT, ' ').replace(CHAPTER_HINT, ' ');
  const m = remainder.match(COUNT_HINT);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

function extractCountHint(text) {
  const n = extractRawCountHint(text);
  return n === null ? DEFAULT_COUNT : Math.min(n, MAX_COUNT);
}

// ---------- bilingual UI strings (EN/FI) ----------
// The quiz QUESTIONS themselves come from the bank (tagged by lang, see
// sampleFromBank) or live generation (QUIZ_SYSTEM_PROMPT_EN/FI below); this
// covers the surrounding chrome — prompts, errors, scoring — which bot.js
// never sees the wording of directly, so it's kept here with the rest of
// the quiz flow.
const UI = {
  en: {
    askChapter: 'Which chapter would you like to be quizzed on? Try "quiz me on chapter 2" or "quiz me on section 2.3".',
    noSection: (section, chapter) =>
      `I don't have section ${section} for chapter ${chapter} — try a chapter-wide quiz instead, e.g. "quiz me on chapter ${chapter}".`,
    countCapped: (max) => `Let's start with ${max}, you can always ask for another round.`,
    startFailed: "Sorry, I couldn't put together a quiz for that right now — try again in a bit.",
    noQuestions: "I couldn't find or generate any questions for that section — try a different chapter/section.",
    question: (n, total) => `Question ${n}/${total}`,
    sessionExpired: "Quiz session expired — start a new one with /quiz.",
    correct: (explanation) => `✅ Correct!\n${explanation}`,
    incorrect: (answer, explanation) => `❌ Not quite. Correct answer: ${answer}\n${explanation}`,
    complete: (score, total) => `Quiz complete! Score: ${score}/${total}`,
    limitedPartial: (n, wanted) =>
      `AI-generated extra questions aren't available right now (daily AI limit reached), so this round has ${n} of the ${wanted} you asked for.`,
    limitedPartialMember: (n, wanted) =>
      `AI-generated extra questions are for FYS.240 course members (join the course channel to get them), so this round has ${n} of the ${wanted} you asked for.`,
  },
  fi: {
    askChapter: 'Mistä luvusta haluaisit visan? Kokeile esim. "kysele minulta luvusta 2" tai "kysele minulta osiosta 2.3".',
    noSection: (section, chapter) =>
      `Minulla ei ole osiota ${section} luvulle ${chapter} — kokeile koko luvun visaa, esim. "kysele minulta luvusta ${chapter}".`,
    countCapped: (max) => `Aloitetaan ${max} kysymyksellä — voit aina pyytää lisää toisella kierroksella.`,
    startFailed: "Pahoittelut, en juuri nyt saanut koottua visaa tästä — yritä hetken kuluttua uudelleen.",
    noQuestions: "En löytänyt tai osannut luoda kysymyksiä tälle osiolle — kokeile toista lukua tai osiota.",
    question: (n, total) => `Kysymys ${n}/${total}`,
    sessionExpired: "Visa vanhentui — aloita uusi komennolla /quiz.",
    correct: (explanation) => `✅ Oikein!\n${explanation}`,
    incorrect: (answer, explanation) => `❌ Ei ihan. Oikea vastaus: ${answer}\n${explanation}`,
    complete: (score, total) => `Visa suoritettu! Tulos: ${score}/${total}`,
    limitedPartial: (n, wanted) =>
      `Tekoälyn luomia lisäkysymyksiä ei ole nyt saatavilla (päivittäinen tekoälyraja täynnä), joten tällä kierroksella on ${n}/${wanted} pyytämääsi kysymystä.`,
    limitedPartialMember: (n, wanted) =>
      `Tekoälyn luomat lisäkysymykset ovat FYS.240-kurssin jäsenille (liity kurssin kanavalle saadaksesi ne), joten tällä kierroksella on ${n}/${wanted} pyytämääsi kysymystä.`,
  },
};

function ui(lang) {
  return UI[lang] || UI.en;
}

// ---------- Session state (mirrors checkhw session Map) ----------

const SESSION_TTL_MS = 20 * 60 * 1000; // 20 min, same order as checkhw expiry
const quizSessions = new Map(); // key: chatId, value: { questions, index, score, lang, expiresAt }

function getSession(chatId) {
  const s = quizSessions.get(chatId);
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    quizSessions.delete(chatId);
    return null;
  }
  return s;
}

function createSession(chatId, questions, lang = "en") {
  const session = {
    questions,
    index: 0,
    score: 0,
    lang,
    expiresAt: Date.now() + SESSION_TTL_MS
  };
  quizSessions.set(chatId, session);
  return session;
}

// Tracks bank question ids recently served to each chat, so re-quizzing the
// same section doesn't immediately repeat the same questions. This is
// intentionally separate from quizSessions (which expires quickly) — this
// one persists a bit longer and just caps its size, it doesn't need a TTL.
const RECENTLY_SERVED_MAX = 60;
const recentlyServedIds = new Map(); // chatId -> Set<questionId>

function markServed(chatId, ids) {
  let set = recentlyServedIds.get(chatId);
  if (!set) {
    set = new Set();
    recentlyServedIds.set(chatId, set);
  }
  for (const id of ids) set.add(id);
  if (set.size > RECENTLY_SERVED_MAX) {
    // drop oldest entries (Sets preserve insertion order)
    const excess = set.size - RECENTLY_SERVED_MAX;
    const it = set.values();
    for (let i = 0; i < excess; i++) set.delete(it.next().value);
  }
}

function getRecentlyServed(chatId) {
  return recentlyServedIds.get(chatId) || new Set();
}

// ---------- quiz bank access (cached, bank-first sourcing) ----------

let _bankCache = null;

function loadQuizBank({ forceReload = false } = {}) {
  if (_bankCache !== null && !forceReload) return _bankCache;
  try {
    const raw = fs.readFileSync(QUIZ_BANK_PATH, 'utf8');
    _bankCache = JSON.parse(raw);
  } catch (e) {
    console.warn(`quizGenerator_fys240: could not load quizBank_fys240.json (${e.message}) — bank is empty (expected, none has been built yet), all quizzes will be live-generated`);
    _bankCache = {};
  }
  return _bankCache;
}

function quizBankLooksHealthy() {
  const bank = loadQuizBank();
  return Object.keys(bank).length > 0 &&
    Object.values(bank).some((secs) => Object.values(secs).some((qs) => Array.isArray(qs) && qs.length > 0));
}

function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Draws up to `count` unused questions from the quiz bank (quizBank_fys240.json) for a given
 * chapter (+ optional section), in the requested language. No API call.
 *
 * - If `section` is given, samples only from that section's pool.
 * - If `section` is omitted, samples across the whole chapter (pooling all
 *   of that chapter's sections together before shuffling, so the result is
 *   naturally proportional to how many questions each section has).
 * - Each bank question is tagged `lang: 'en'|'fi'`; untagged questions
 *   (the whole bank as it stands today) are treated as 'en' for backward
 *   compatibility. A Finnish request only draws from 'fi'-tagged
 *   questions, so until a Finnish bank exists Finnish quizzes fall
 *   through to live generation every time — expected, not a bug (see
 *   module doc comment).
 *
 * @returns {{ questions: object[], shortfall: number }} shortfall is how
 *   many more questions the caller still needs to reach `count` (0 if the
 *   bank fully satisfied the request).
 */
function sampleFromBank(chapter, section, count, excludeIds = [], lang = "en") {
  const bank = loadQuizBank();
  const chapterBank = bank[String(chapter)] || {};
  const exclude = new Set(excludeIds);

  let pool;
  if (section) {
    pool = (chapterBank[section] || []).slice();
  } else {
    pool = Object.values(chapterBank).flat();
  }

  const available = pool.filter((q) => !exclude.has(q.id) && (q.lang || "en") === lang);
  const picked = shuffle(available).slice(0, count);

  return {
    questions: picked,
    shortfall: Math.max(0, count - picked.length),
  };
}

// ---------- quizBankPending_fys240.json — self-expansion capture ----------

function appendPendingQuestions(chapter, section, questions, lang = "en") {
  const generatedAt = new Date().toISOString();
  const entries = questions.map((q) => ({ chapter: String(chapter), section: section || null, lang, question: q, generatedAt }));

  // Best-effort file append. On deploy environments with an ephemeral
  // filesystem (e.g. Railway without an attached volume), this file may not
  // survive a restart — that's fine, the stdout log line below is the
  // durable fallback capture path (see setup guide section 5a).
  try {
    let existing = [];
    try {
      existing = JSON.parse(fs.readFileSync(QUIZ_BANK_PENDING_PATH, 'utf8'));
      if (!Array.isArray(existing)) existing = [];
    } catch (e) {
      existing = []; // file doesn't exist yet or is corrupt — start fresh
    }
    fs.writeFileSync(QUIZ_BANK_PENDING_PATH, JSON.stringify(existing.concat(entries), null, 2), 'utf8');
  } catch (e) {
    console.warn(`quizGenerator_fys240: could not persist quizBankPending_fys240.json (${e.message}) — relying on stdout log capture instead`);
  }

  // Structured log line, independent of the file write above, so a
  // log-based capture pipeline (Railway log export → offline merge) works
  // even if the filesystem doesn't persist.
  for (const entry of entries) {
    console.log(`QUIZ_PENDING_QUESTION ${JSON.stringify(entry)}`);
  }
}

// ---------- Stage 2: generation (one LLM call, structured JSON out) ----------

const QUIZ_SYSTEM_PROMPT_EN = `You generate multiple-choice quiz questions for an undergraduate optics
course (FYS.240 Optics), grounded STRICTLY in the provided corpus excerpt. Rules:
- Do NOT invent facts outside the excerpt.
- Do NOT use any homework problems or numeric answer keys as source material.
- The excerpt may include both English and Finnish text for the same section — write the
  question and options in English regardless.
- Each question: 1 stem, 4 options, exactly 1 correct index (0-3), and a short
  (<40 word) explanation for the correct answer.
- Return ONLY valid JSON, no markdown fences, no preamble. Format:
  { "questions": [ { "stem": "...", "options": ["...","...","...","..."],
    "correctIndex": 0, "explanation": "..." } ] }`;

const QUIZ_SYSTEM_PROMPT_FI = `Generoit monivalintakysymyksiä yliopiston optiikan kurssille (FYS.240
Optiikka), tiukasti annettuun kurssimateriaaliotteeseen pohjautuen. Säännöt:
- Älä keksi faktoja otteen ulkopuolelta.
- Älä käytä kotitehtäviä tai niiden numeerisia vastauksia lähdemateriaalina.
- Ote voi sisältää sekä englannin- että suomenkielistä tekstiä samasta osiosta — kirjoita
  kysymys ja vastausvaihtoehdot joka tapauksessa suomeksi.
- Jokainen kysymys: 1 runko, 4 vaihtoehtoa, tasan 1 oikea indeksi (0-3), ja lyhyt
  (alle 40 sanan) selitys oikealle vastaukselle, suomeksi.
- Palauta VAIN validi JSON, ei markdown-koodilohkoja, ei alkupuhetta. Muoto:
  { "questions": [ { "stem": "...", "options": ["...","...","...","..."],
    "correctIndex": 0, "explanation": "..." } ] }`;

/**
 * Live-generates `count` questions, scoped to a chapter (and, if given, a
 * specific section) via getCorpusSection(chapter, section). Throws if the
 * corpus excerpt can't be found or the model's output can't be parsed —
 * callers should catch and degrade gracefully (see startQuiz).
 *
 * lang: "en" | "fi" — picks the system prompt/instructions AND which
 * corpus language(s) to pull grounding text from. Finnish requests fetch
 * 'both' (Finnish text plus the English original as backup grounding,
 * since a handful of sections have no standalone Finnish recording — see
 * corpusLoader's module doc comment) while still instructing the model to
 * write the question itself in Finnish.
 */
async function generateQuiz(chapter, section, count = 5, lang = "en") {
  const corpusLang = lang === "fi" ? "both" : "en";
  const corpusExcerpt = getCorpusSection(chapter, section || undefined, { lang: corpusLang });

  const scopeLabel = section ? `Section ${section}` : `Chapter ${chapter}`;
  const systemPrompt = lang === "fi" ? QUIZ_SYSTEM_PROMPT_FI : QUIZ_SYSTEM_PROMPT_EN;
  const userContent =
    lang === "fi"
      ? `Generoi ${count} monivalintakysymystä tästä otteesta (${scopeLabel}):\n\n${corpusExcerpt}`
      : `Generate ${count} MCQ questions from this excerpt (${scopeLabel}):\n\n${corpusExcerpt}`;

  // trackedCreate() = anthropic.messages.create() + adds the call's cost to the shared daily spend
  // estimate used by the usageLimiter backstop.
  const response = await limiter.trackedCreate(anthropic, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userContent
      }
    ]
  });

  const raw = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch (err) {
    throw new Error(`Quiz generation returned unparseable JSON: ${err.message}`);
  }

  if (!parsed.questions || !parsed.questions.length) {
    throw new Error('Quiz generation returned no questions');
  }

  return parsed.questions;
}

/**
 * The main "give me N questions for chapter/section X" entry point used by
 * startQuiz(). Bank-first, live-generation fallback for the shortfall only,
 * with self-expansion of any freshly generated questions.
 *
 * `hooks` (optional, all members optional) lets bot_fys240.js meter live generation per student
 * (see usageLimiter.js / accessGuard.js) without this module knowing about users:
 *   hooks.reserve()             -> { ok, ... } | Promise — called ONLY when the bank can't fully
 *                                  satisfy the request, i.e. right before a paid API call. ok:false
 *                                  means "don't call the API": the bank questions are served as-is.
 *   hooks.refund(reservation)   -> called if the live call fails, so the student isn't charged.
 * Bank-only quizzes never touch the hooks and are therefore free.
 *
 * Returns { questions, reservation, limited }:
 *   reservation - the successful reservation (a credit was charged) or null
 *   limited     - the failed reservation if live generation was refused, else null
 */
async function getQuizQuestionsDetailed(chatId, chapter, section, count, lang = "en", hooks = {}) {
  const excludeIds = getRecentlyServed(chatId);
  const { questions: bankQuestions, shortfall } = sampleFromBank(chapter, section, count, excludeIds, lang);

  markServed(chatId, bankQuestions.map((q) => q.id));

  if (shortfall === 0) {
    return { questions: bankQuestions, reservation: null, limited: null };
  }

  let reservation = null;
  if (typeof hooks.reserve === 'function') {
    reservation = await hooks.reserve();
    if (reservation && !reservation.ok) {
      return { questions: bankQuestions, reservation: null, limited: reservation };
    }
  }

  // Top up the shortfall with a live call, scoped to just this
  // chapter/section — not the whole chapter's worth of sections — to keep
  // the excerpt (and cost) small.
  let generated = [];
  try {
    generated = await generateQuiz(chapter, section, shortfall, lang);
  } catch (err) {
    console.warn(`quizGenerator_fys240: live fallback generation failed (${err.message}) — serving ${bankQuestions.length}/${count} from the bank only`);
    if (reservation && typeof hooks.refund === 'function') hooks.refund(reservation);
    return { questions: bankQuestions, reservation: null, limited: null };
  }

  // Tag with a synthetic id (bank questions already have one) so downstream
  // code can treat all questions uniformly.
  const stamped = generated.map((q, i) => ({
    ...q,
    id: `gen_${lang}_${chapter}${section ? '.' + section.split('.')[1] : ''}_${Date.now()}_${i}`,
    lang,
  }));

  appendPendingQuestions(chapter, section, stamped, lang);

  return { questions: bankQuestions.concat(stamped), reservation, limited: null };
}

// Original, un-metered signature — returns just the questions. Kept for buildQuizBank.js / tests.
async function getQuizQuestions(chatId, chapter, section, count, lang = "en") {
  return (await getQuizQuestionsDetailed(chatId, chapter, section, count, lang)).questions;
}

// ---------- Telegram-facing helpers ----------

function buildQuestionKeyboard(sessionIndex, question) {
  return {
    inline_keyboard: question.options.map((opt, i) => ([
      { text: opt, callback_data: `quiz:${sessionIndex}:${i}` }
    ]))
  };
}

// Messages are sent with parse_mode: 'HTML', and quiz text legitimately
// contains <, > and & (e.g. "n < 1", "λ < 10 nm"). Unescaped, Telegram can
// reject the whole message and the quiz stalls, so every piece of bank or
// generated question text is escaped before it is embedded in an HTML message.
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatQuestionMessage(question, qNumber, total, lang) {
  return `<b>${ui(lang).question(qNumber, total)}</b>\n\n${escapeHtml(question.stem)}`;
}

// Fallback used when the caller doesn't supply its own askWhichChapter
// (see the `askWhichChapter` param on startQuiz below). Just a plain text
// prompt — bot.js can inject a richer version (e.g. an inline-keyboard
// chapter picker) instead.
async function defaultAskWhichChapter(bot, chatId, lang = "en") {
  await bot.sendMessage(chatId, ui(lang).askChapter);
  return null;
}

// Called from bot.js message handler when isQuizRequest(text) is true.
// `askWhichChapter(bot, chatId, lang)` is called when the request doesn't
// name a chapter/section; it should prompt the student and return null
// (startQuiz then stops, since there's nothing more to do until they
// respond) or, if it can resolve one itself, return a chapter number/string
// directly.
//
// `fallbackLang` ("en" | "fi") is the caller's best guess at the student's
// language absent any text signal (bot_fys240.js passes the Telegram
// client's language_code) — resolveQuizLang() upgrades it to "fi" if the
// request text itself carries Finnish quiz vocabulary, so a Finnish-
// phrased request is honored even from an English-set client.
//
// `hooks` (optional) meters live AI generation per student — see
// getQuizQuestionsDetailed() above for reserve/refund, plus two more used here:
//   hooks.onDenied(limited)      - called when live generation was refused AND the bank had
//                                  nothing to serve (bot tells the student why); without this
//                                  hook the generic "no questions" message is sent instead
//   hooks.onCharged(reservation) - called after the first question is sent when a credit was
//                                  charged (bot uses it for the "N answers left" heads-up)
async function startQuiz(bot, chatId, text, askWhichChapter = defaultAskWhichChapter, fallbackLang = "en", hooks = {}) {
  const lang = resolveQuizLang(text, fallbackLang);
  const t = ui(lang);

  const chapter = extractChapterHint(text) || (await askWhichChapter(bot, chatId, lang));
  if (!chapter) return; // askWhichChapter already sent a prompt (or startQuiz has nothing to do)

  const section = extractSectionHint(text); // null => chapter-wide request
  if (section && !corpusLoader.isValidSection(chapter, section)) {
    await bot.sendMessage(chatId, t.noSection(section, chapter));
    return;
  }

  const rawCount = extractRawCountHint(text);
  const requestedCount = rawCount === null ? DEFAULT_COUNT : Math.min(rawCount, MAX_COUNT);
  if (rawCount !== null && rawCount > MAX_COUNT) {
    await bot.sendMessage(chatId, t.countCapped(MAX_COUNT));
  }

  let questions, reservation, limited;
  try {
    ({ questions, reservation, limited } = await getQuizQuestionsDetailed(chatId, chapter, section, requestedCount, lang, hooks));
  } catch (err) {
    console.error(`quizGenerator_fys240: startQuiz failed for chapter ${chapter}${section ? '.' + section : ''}: ${err.message}`);
    await bot.sendMessage(chatId, t.startFailed);
    return;
  }

  if (!questions.length) {
    if (limited && typeof hooks.onDenied === 'function') {
      await hooks.onDenied(limited);
    } else {
      await bot.sendMessage(chatId, t.noQuestions);
    }
    return;
  }

  if (limited) {
    // Live generation was refused but the bank had some questions: serve those and say why it's short.
    await bot.sendMessage(chatId, (limited.reason === 'not_member' ? t.limitedPartialMember : t.limitedPartial)(questions.length, requestedCount));
  }

  const session = createSession(chatId, questions, lang);

  await bot.sendMessage(
    chatId,
    formatQuestionMessage(session.questions[0], 1, session.questions.length, lang),
    { parse_mode: 'HTML', reply_markup: buildQuestionKeyboard(0, session.questions[0]) }
  );

  if (reservation && typeof hooks.onCharged === 'function') {
    await hooks.onCharged(reservation);
  }
}

// Called from bot.js's callback_query handler when data starts with "quiz:"
async function handleQuizAnswer(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const [, qIndexStr, answerIndexStr] = callbackQuery.data.split(':');
  const qIndex = parseInt(qIndexStr, 10);
  const answerIndex = parseInt(answerIndexStr, 10);

  const session = getSession(chatId);
  if (!session || qIndex !== session.index) {
    await bot.answerCallbackQuery(callbackQuery.id, { text: ui(session?.lang).sessionExpired });
    return;
  }

  const lang = session.lang;
  const t = ui(lang);
  const question = session.questions[qIndex];
  const correct = answerIndex === question.correctIndex;
  if (correct) session.score += 1;

  const feedback = correct
    ? t.correct(escapeHtml(question.explanation))
    : t.incorrect(escapeHtml(question.options[question.correctIndex]), escapeHtml(question.explanation));

  await bot.editMessageText(
    `${formatQuestionMessage(question, qIndex + 1, session.questions.length, lang)}\n\n${feedback}`,
    { chat_id: chatId, message_id: callbackQuery.message.message_id, parse_mode: 'HTML' }
  );
  await bot.answerCallbackQuery(callbackQuery.id);

  session.index += 1;
  if (session.index < session.questions.length) {
    const next = session.questions[session.index];
    await bot.sendMessage(
      chatId,
      formatQuestionMessage(next, session.index + 1, session.questions.length, lang),
      { parse_mode: 'HTML', reply_markup: buildQuestionKeyboard(session.index, next) }
    );
  } else {
    await bot.sendMessage(chatId, t.complete(session.score, session.questions.length));
    quizSessions.delete(chatId);
  }
}

module.exports = {
  isQuizRequest,
  startQuiz,
  handleQuizAnswer,
  // exported for buildQuizBank.js and tests
  generateQuiz,
  sampleFromBank,
  getQuizQuestions,
  getQuizQuestionsDetailed,
  loadQuizBank,
  quizBankLooksHealthy,
  extractChapterHint,
  extractSectionHint,
  extractCountHint,
  extractRawCountHint,
  resolveQuizLang,
};

/* INTEGRATION NOTES — wired up in bot_fys240.js. Summary of how (mirrors
 * how bot.js wires the original quizGenerator.js for FYS.501):
 *
 * bot_fys240.js talks to Telegram directly via axios, not
 * node-telegram-bot-api, so it passes a small adapter object (`quizBot`) in
 * place of `bot` that implements sendMessage/editMessageText/
 * answerCallbackQuery on top of its existing tg() helper.
 *
 * In the message handler, alongside the other STAGE1_TRIGGER checks:
 *   if (quizGenerator.isQuizRequest(question)) {
 *     return quizGenerator.startQuiz(quizBot, chatId, question, askWhichChapter, lang);
 *   }
 * where `lang` is bot_fys240.js's getLang(message) (Telegram client
 * language_code) — startQuiz()/resolveQuizLang() use it only as a
 * fallback; Finnish quiz vocabulary in `question` itself takes priority.
 *
 * bot_fys240.js has no EventEmitter-style `.on('callback_query', ...)`
 * (it's a plain webhook handler), so callback_query updates are dispatched
 * directly inside handleUpdate()/handleCallbackQuery() instead:
 *   if (data.startsWith('quiz:')) return quizGenerator.handleQuizAnswer(quizBot, cq);
 * handleQuizAnswer needs no lang argument — it reads session.lang, set by
 * startQuiz() when the session was created, so every reply in a quiz stays
 * in the language it started in even though the tap carries no text.
 *
 * bot_fys240.js defines its own askWhichChapter(bot, chatId, lang) — an
 * inline-keyboard chapter picker built from corpusLoader.listChapters()/
 * getChapterTitle()/getChapterTitleFi(), covering chapters 2-10 — and
 * passes it into startQuiz() explicitly, overriding the plain-text
 * defaultAskWhichChapter() above. Because there's no session yet at this
 * point (the student hasn't named a chapter), the chapter-picker's
 * callback_data carries the language forward explicitly as
 * "quizchapter:<N>:<lang>" rather than relying on Telegram's language_code
 * a second time; tapping a button sends that callback, which
 * bot_fys240.js turns into a second startQuiz() call with synthetic text
 * ("quiz me on chapter N") and that same lang as fallbackLang.
 *
 * /healthz includes `quizBankLooksHealthy: quizGenerator.quizBankLooksHealthy()`
 * and `corpusLooksHealthy: corpusLoader.corpusLooksHealthy()`. Expect
 * quizBankLooksHealthy to report false until quizBank_fys240.json is
 * actually built (see the module doc comment above) — that's expected, not
 * a fault; quizzes still work via live generation in the meantime. The
 * bank as it exists today is English-only (untagged questions default to
 * lang "en" in sampleFromBank), so Finnish quizzes are 100% live-generated
 * until a Finnish bank is curated from quizBankPending_fys240.json's
 * lang:"fi" entries.
 */
