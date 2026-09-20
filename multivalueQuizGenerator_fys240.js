/**
 * multivalueQuizGenerator_fys240.js
 * DATA_VERSION: 1.0.0
 * -----------------
 * Add-on "select all that apply" (multi-answer) quiz module for the
 * FYS.240 Optics bot. Deliberately kept as a SEPARATE module from
 * quizGenerator_fys240.js (the single-correct-answer quiz flow) rather than
 * modifying it in place:
 *   - The grading contract is different (a SET of correct indices instead
 *     of one correctIndex), so the bank schema, generation prompt, session
 *     state, and callback_data namespace all differ.
 *   - Keeping it separate means the existing single-select /quiz flow is
 *     completely unaffected — this file can be wired in, tested, or ripped
 *     back out without touching quizGenerator_fys240.js or
 *     quizBank_fys240.json at all.
 *
 * Naming convention used throughout this add-on (mirrors the
 * quizGenerator_fys240.js / quizBank_fys240.json pairing):
 *   - This file:                  multivalueQuizGenerator_fys240.js
 *   - Curated question bank:      multivalueQuizBank_fys240.json
 *   - Self-expansion capture:     multivalueQuizBankPending_fys240.json
 *   - callback_data namespace:    "mv:..."  (never "quiz:...")
 *   - Trigger words:              "multiquiz"/"multi-select quiz"/
 *                                 "select all"/"monivalintavisa"/
 *                                 "valitse kaikki oikeat" (never bare
 *                                 "quiz"/"kysele", which stay reserved for
 *                                 the single-select flow)
 *
 * UI DESIGN NOTE (per Mikko's spec):
 *   - Inline-keyboard buttons show ONLY the option letter (A, B, C, D, E,
 *     ...), toggled on/off with a checkmark prefix. Telegram truncates/
 *     concatenates long button labels, so the actual option TEXT is never
 *     put on a button — it's written into the question message body as a
 *     lettered list (see formatQuestionMessage), and the buttons just let
 *     the student pick which letters they mean.
 *   - A dedicated "Submit answer" button (its own callback_data suffix)
 *     finalizes the selection for that question; tapping a letter only
 *     toggles it and re-renders the keyboard (via editMessageText, reusing
 *     the same message text — bot_fys240.js's quizBot.editMessageText
 *     adapter already forwards reply_markup, so no new adapter method is
 *     needed for this add-on).
 *
 * Architecture mirrors quizGenerator_fys240.js's bank-first / generate-as-
 * fallback / self-expanding design (see that file's header comment for the
 * rationale) — only the grading contract and UI are different:
 *   - Bank-first: sampleFromBank() draws from multivalueQuizBank_fys240.json.
 *   - Generate-as-fallback: generateQuiz() live-generates the shortfall via
 *     Claude Haiku, scoped to the requested section's corpus excerpt.
 *   - Self-expanding: live-generated questions are appended to
 *     multivalueQuizBankPending_fys240.json (and logged to stdout as
 *     MVQUIZ_PENDING_QUESTION lines) for later curated merge into the real
 *     bank — never written there directly.
 *
 * Grading rule (partial credit, floored at 0 per question):
 *   Let k = number of correct options, (n-k) = number of wrong options,
 *   c = how many correct options the student selected, w = how many wrong
 *   options they selected. Each question is scored out of 1 point as
 *     score = max(0, c/k - w/(n-k))
 *   This gives full credit (1) only for the exact correct set, partial
 *   credit for a correct-but-incomplete selection with no wrong picks, and
 *   drives the score to exactly 0 if every option (right and wrong) is
 *   selected — so "just tick everything" is never a winning strategy, but
 *   a single bad guess can never cost more than that question was worth.
 *   See gradeSelection() below if this formula ever needs to change.
 */

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const corpusLoader = require('./corpusLoader');
const limiter = require('./usageLimiter');
const { getCorpusSection } = corpusLoader;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const QUIZ_BANK_PATH = path.join(__dirname, 'multivalueQuizBank_fys240.json');
const QUIZ_BANK_PENDING_PATH = path.join(__dirname, 'multivalueQuizBankPending_fys240.json');

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// Question text goes out with parse_mode: 'HTML', and bank/generated text
// legitimately contains <, > and & (e.g. "λ < 10 nm", "<P>_T = I/c",
// "<cosωt>=0", "f<0"). Unescaped, Telegram rejects the whole message
// ("Unsupported start tag") and the quiz stalls. Escape every piece of
// question/option/explanation text before it is embedded in an HTML message.
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------- Stage 1: local trigger gate (no API call) ----------
// Deliberately NOT matching bare "quiz"/"kysele" — those stay reserved for
// quizGenerator_fys240.js's single-select flow. A student who wants this
// flow has to ask for it a bit more specifically (or use /mvquiz, if
// bot_fys240.js is wired to alias that command to startMultivalueQuiz()).
const STAGE1_TRIGGER = /\b(multi\s?-?quiz|multi\s?-?select\s?quiz|select all|monivalintavisa|valitse\s+kaikki)\b/i;
const CHAPTER_HINT = /chapter\s?(\d{1,2})|ch\.?\s?(\d{1,2})|luvu\w*\s?(\d{1,2})|luku\s?(\d{1,2})/i;
const SECTION_HINT = /\b(?:section\s+|osio\w*\s+)?(\d{1,2})\.(\d{1,2})\b/i;
const COUNT_HINT = /\b(\d{1,2})\s*(?:questions?|kysymys(?:tä|iä)?)?\s*$/i;

const DEFAULT_COUNT = 5;
// A single section only has 1-4 curated questions, so a section-scoped quiz
// is kept short (bank-first, any shortfall topped up by live generation).
const SECTION_DEFAULT_COUNT = 3;
const MAX_COUNT = 15;

function isMultivalueQuizRequest(text) {
  return STAGE1_TRIGGER.test(text);
}

const FI_HINT_RE = /\b(monivalintavisa|valitse\s+kaikki|luvu\w*|luku\s?\d|osio\w*|kysymys(?:tä|iä)?)\b/i;
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

function extractRawCountHint(text) {
  const remainder = text.replace(SECTION_HINT, ' ').replace(CHAPTER_HINT, ' ');
  const m = remainder.match(COUNT_HINT);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

// ---------- bilingual UI strings (EN/FI) ----------
const UI = {
  en: {
    askChapter: 'Which chapter would you like the multi-select quiz on? Try "multiquiz chapter 2" or "multiquiz section 2.3".',
    noSection: (section, chapter) =>
      `I don't have section ${section} for chapter ${chapter} — try "/mvquiz ${chapter}" instead.`,
    countCapped: (max) => `Let's start with ${max}, you can always ask for another round.`,
    startFailed: "Sorry, I couldn't put together a multi-select quiz for that right now — try again in a bit.",
    noQuestions: "I couldn't find or generate any multi-select questions for that section — try a different chapter/section.",
    question: (n, total) => `Question ${n}/${total}`,
    selectAllNote: "Select ALL letters that apply, then tap Submit.",
    submitLabel: "\u2705 Submit answer",
    sessionExpired: "Quiz session expired — start a new one with a multiquiz request.",
    feedback: (score, lettersStr, explanation) => {
      if (score >= 1) return `\u2705 Correct! (${lettersStr})\n${explanation}`;
      if (score <= 0) return `\u274c 0.00/1.00 for this question. Correct answer(s): ${lettersStr}\n${explanation}`;
      return `\u2797 Partial credit: ${score.toFixed(2)}/1.00. Correct answer(s): ${lettersStr}\n${explanation}`;
    },
    complete: (score, total) => `Multi-select quiz complete! Score: ${score.toFixed(2)}/${total.toFixed(2)} (${total > 0 ? Math.round((score / total) * 100) : 0}%)`,
    nothingSelected: "Pick at least one letter before submitting.",
    limitedPartial: (n, wanted) =>
      `AI-generated extra questions aren't available right now (daily AI limit reached), so this round has ${n} of the ${wanted} you asked for.`,
    limitedPartialMember: (n, wanted) =>
      `AI-generated extra questions are for FYS.240 course members (join the course channel to get them), so this round has ${n} of the ${wanted} you asked for.`,
    noChapter: (cmd, valid) =>
      `The course has chapters ${valid[0]}–${valid[valid.length - 1]}. Try e.g. "${cmd} 2" (chapter), "${cmd} 3.3" (section) or "${cmd} 3-4" (chapter range).`,
  },
  fi: {
    askChapter: 'Mistä luvusta haluaisit monivalintavisan (valitse kaikki oikeat)? Kokeile esim. "monivalintavisa luvusta 2" tai "monivalintavisa osiosta 2.3".',
    noSection: (section, chapter) =>
      `Minulla ei ole osiota ${section} luvulle ${chapter} — kokeile "/moquiz ${chapter}".`,
    countCapped: (max) => `Aloitetaan ${max} kysymyksellä — voit aina pyytää lisää toisella kierroksella.`,
    startFailed: "Pahoittelut, en juuri nyt saanut koottua monivalintavisaa — yritä hetken kuluttua uudelleen.",
    noQuestions: "En löytänyt tai osannut luoda monivalintakysymyksiä tälle osiolle — kokeile toista lukua tai osiota.",
    question: (n, total) => `Kysymys ${n}/${total}`,
    selectAllNote: "Valitse KAIKKI oikeat kirjaimet, ja paina sitten Vastaa.",
    submitLabel: "\u2705 Vastaa",
    sessionExpired: "Visa vanhentui — aloita uusi monivalintavisa-pyynnöllä.",
    feedback: (score, lettersStr, explanation) => {
      if (score >= 1) return `\u2705 Oikein! (${lettersStr})\n${explanation}`;
      if (score <= 0) return `\u274c 0,00/1,00 tästä kysymyksestä. Oikea(t) vastaus(vaihtoehdot): ${lettersStr}\n${explanation}`;
      return `\u2797 Osittaiset pisteet: ${score.toFixed(2)}/1,00. Oikea(t) vastaus(vaihtoehdot): ${lettersStr}\n${explanation}`;
    },
    complete: (score, total) => `Monivalintavisa suoritettu! Tulos: ${score.toFixed(2)}/${total.toFixed(2)} (${total > 0 ? Math.round((score / total) * 100) : 0} %)`,
    nothingSelected: "Valitse ainakin yksi kirjain ennen vastaamista.",
    limitedPartial: (n, wanted) =>
      `Tekoälyn luomia lisäkysymyksiä ei ole nyt saatavilla (päivittäinen tekoälyraja täynnä), joten tällä kierroksella on ${n}/${wanted} pyytämääsi kysymystä.`,
    limitedPartialMember: (n, wanted) =>
      `Tekoälyn luomat lisäkysymykset ovat FYS.240-kurssin jäsenille (liity kurssin kanavalle saadaksesi ne), joten tällä kierroksella on ${n}/${wanted} pyytämääsi kysymystä.`,
    noChapter: (cmd, valid) =>
      `Kurssilla on luvut ${valid[0]}–${valid[valid.length - 1]}. Kokeile esim. "${cmd} 2" (luku), "${cmd} 3.3" (osio) tai "${cmd} 3-4" (lukuväli).`,
  },
};

function ui(lang) {
  return UI[lang] || UI.en;
}

// ---------- Session state ----------
// Separate Map from quizGenerator_fys240.js's quizSessions — a student
// could in principle have one single-select and one multi-select quiz
// "in flight" without them clobbering each other (though in practice
// bot_fys240.js probably only lets one be active per chat at a time).
const SESSION_TTL_MS = 20 * 60 * 1000;
const mvQuizSessions = new Map(); // chatId -> { questions, index, score, lang, selected: Set, messageId, expiresAt }

function getSession(chatId) {
  const s = mvQuizSessions.get(chatId);
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    mvQuizSessions.delete(chatId);
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
    selected: new Set(), // selection for the CURRENT question only; cleared on advance
    messageId: null,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  mvQuizSessions.set(chatId, session);
  return session;
}

const RECENTLY_SERVED_MAX = 60;
const recentlyServedIds = new Map();
function markServed(chatId, ids) {
  let set = recentlyServedIds.get(chatId);
  if (!set) {
    set = new Set();
    recentlyServedIds.set(chatId, set);
  }
  for (const id of ids) set.add(id);
  if (set.size > RECENTLY_SERVED_MAX) {
    const excess = set.size - RECENTLY_SERVED_MAX;
    const it = set.values();
    for (let i = 0; i < excess; i++) set.delete(it.next().value);
  }
}
function getRecentlyServed(chatId) {
  return recentlyServedIds.get(chatId) || new Set();
}

// ---------- bank access ----------
let _bankCache = null;

function loadQuizBank({ forceReload = false } = {}) {
  if (_bankCache !== null && !forceReload) return _bankCache;
  try {
    const raw = fs.readFileSync(QUIZ_BANK_PATH, 'utf8');
    _bankCache = JSON.parse(raw);
  } catch (e) {
    console.warn(`multivalueQuizGenerator_fys240: could not load multivalueQuizBank_fys240.json (${e.message}) — bank is empty, all quizzes will be live-generated`);
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

// Draws `count` questions spread across several chapters (used for a chapter
// range such as "3-4"): pools are shuffled per chapter and taken round-robin
// so every chapter in the range is represented, then the pick is shuffled.
function sampleFromBankChapters(chapters, count, excludeIds = [], lang = "en") {
  const bank = loadQuizBank();
  const exclude = new Set(excludeIds);
  const pools = shuffle(chapters.map(String)).map((ch) =>
    shuffle(
      Object.values(bank[ch] || {})
        .flat()
        .filter((q) => !exclude.has(q.id) && (q.lang || "en") === lang)
    )
  );
  const picked = [];
  let progressed = true;
  while (picked.length < count && progressed) {
    progressed = false;
    for (const pool of pools) {
      if (picked.length >= count) break;
      if (pool.length) {
        picked.push(pool.pop());
        progressed = true;
      }
    }
  }
  return { questions: shuffle(picked), shortfall: Math.max(0, count - picked.length) };
}

// ---------- self-expansion capture ----------
function appendPendingQuestions(chapter, section, questions, lang = "en") {
  const generatedAt = new Date().toISOString();
  const entries = questions.map((q) => ({ chapter: String(chapter), section: section || null, lang, question: q, generatedAt }));

  try {
    let existing = [];
    try {
      existing = JSON.parse(fs.readFileSync(QUIZ_BANK_PENDING_PATH, 'utf8'));
      if (!Array.isArray(existing)) existing = [];
    } catch (e) {
      existing = [];
    }
    fs.writeFileSync(QUIZ_BANK_PENDING_PATH, JSON.stringify(existing.concat(entries), null, 2), 'utf8');
  } catch (e) {
    console.warn(`multivalueQuizGenerator_fys240: could not persist multivalueQuizBankPending_fys240.json (${e.message}) — relying on stdout log capture instead`);
  }

  for (const entry of entries) {
    console.log(`MVQUIZ_PENDING_QUESTION ${JSON.stringify(entry)}`);
  }
}

// ---------- Stage 2: generation (one LLM call, structured JSON out) ----------
const QUIZ_SYSTEM_PROMPT_EN = `You generate "select all that apply" multiple-choice quiz questions for an
undergraduate optics course (FYS.240 Optics), grounded STRICTLY in the provided corpus excerpt. Rules:
- Do NOT invent facts outside the excerpt.
- Do NOT use any homework problems or numeric answer keys as source material.
- The excerpt may include both English and Finnish text for the same section — write the
  question and options in English regardless.
- Each question must have MORE THAN ONE correct option, but NOT all options correct — mix
  true statements with plausible-but-wrong distractors (sign errors, swapped formulas,
  "always/never" overreach), 4-6 options total.
- End the stem with "(Select all that apply)".
- Return ONLY valid JSON, no markdown fences, no preamble. Format:
  { "questions": [ { "stem": "... (Select all that apply)", "options": ["...","...","...","...","..."],
    "correctIndices": [0,2,3], "explanation": "..." } ] }`;

const QUIZ_SYSTEM_PROMPT_FI = `Generoit "valitse kaikki oikeat" -monivalintakysymyksiä yliopiston optiikan
kurssille (FYS.240 Optiikka), tiukasti annettuun kurssimateriaaliotteeseen pohjautuen. Säännöt:
- Älä keksi faktoja otteen ulkopuolelta.
- Älä käytä kotitehtäviä tai niiden numeerisia vastauksia lähdemateriaalina.
- Ote voi sisältää sekä englannin- että suomenkielistä tekstiä samasta osiosta — kirjoita
  kysymys ja vastausvaihtoehdot joka tapauksessa suomeksi.
- Kussakin kysymyksessä on oltava USEAMPI kuin yksi oikea vaihtoehto, mutta EI kaikki
  vaihtoehdot oikein — sekoita tosia väitteitä uskottavien mutta väärien vaihtoehtojen
  kanssa, yhteensä 4-6 vaihtoehtoa.
- Päätä kysymysrunko sanoihin "(Valitse kaikki oikeat)".
- Palauta VAIN validi JSON, ei markdown-koodilohkoja, ei alkupuhetta. Muoto:
  { "questions": [ { "stem": "... (Valitse kaikki oikeat)", "options": ["...","...","...","...","..."],
    "correctIndices": [0,2,3], "explanation": "..." } ] }`;

async function generateQuiz(chapter, section, count = 5, lang = "en") {
  const corpusLang = lang === "fi" ? "both" : "en";
  const corpusExcerpt = getCorpusSection(chapter, section || undefined, { lang: corpusLang });

  const scopeLabel = section ? `Section ${section}` : `Chapter ${chapter}`;
  const systemPrompt = lang === "fi" ? QUIZ_SYSTEM_PROMPT_FI : QUIZ_SYSTEM_PROMPT_EN;
  const userContent =
    lang === "fi"
      ? `Generoi ${count} "valitse kaikki oikeat" -kysymystä tästä otteesta (${scopeLabel}):\n\n${corpusExcerpt}`
      : `Generate ${count} "select all that apply" questions from this excerpt (${scopeLabel}):\n\n${corpusExcerpt}`;

  // trackedCreate() = anthropic.messages.create() + adds the call's cost to the shared daily spend
  // estimate used by the usageLimiter backstop.
  const response = await limiter.trackedCreate(anthropic, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1800,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const raw = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch (err) {
    throw new Error(`Multivalue quiz generation returned unparseable JSON: ${err.message}`);
  }

  if (!parsed.questions || !parsed.questions.length) {
    throw new Error('Multivalue quiz generation returned no questions');
  }

  // Defensive sanity check: reject (drop) any generated question that isn't
  // genuinely multi-valued (0, 1, or ALL options marked correct), since a
  // live LLM call could still slip up despite the system prompt's rules.
  const sane = parsed.questions.filter(
    (q) => Array.isArray(q.correctIndices) && q.correctIndices.length >= 2 && q.correctIndices.length < (q.options || []).length
  );
  if (!sane.length) {
    throw new Error('Multivalue quiz generation returned no valid multi-answer questions');
  }

  return sane;
}

// `hooks` (optional) meters live generation per student — same contract as
// quizGenerator_fys240.js's getQuizQuestionsDetailed(): hooks.reserve() is called only when the bank
// can't satisfy the request (right before a paid API call), hooks.refund(reservation) if that call
// fails. Returns { questions, reservation, limited }.
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

  let generated = [];
  try {
    generated = await generateQuiz(chapter, section, shortfall, lang);
  } catch (err) {
    console.warn(`multivalueQuizGenerator_fys240: live fallback generation failed (${err.message}) — serving ${bankQuestions.length}/${count} from the bank only`);
    if (reservation && typeof hooks.refund === 'function') hooks.refund(reservation);
    return { questions: bankQuestions, reservation: null, limited: null };
  }

  const stamped = generated.map((q, i) => ({
    ...q,
    id: `mvgen_${lang}_${chapter}${section ? '.' + section.split('.')[1] : ''}_${Date.now()}_${i}`,
    lang,
  }));

  appendPendingQuestions(chapter, section, stamped, lang);

  return { questions: bankQuestions.concat(stamped), reservation, limited: null };
}

// Original, un-metered signature — returns just the questions. Kept for tests / bank-build scripts.
async function getQuizQuestions(chatId, chapter, section, count, lang = "en") {
  return (await getQuizQuestionsDetailed(chatId, chapter, section, count, lang)).questions;
}

// ---------- Telegram-facing helpers ----------

// Buttons show ONLY the letter (A, B, C, ...), never the option text, so
// Telegram never truncates/concatenates long option wording onto a button.
// A checkmark prefix reflects the current toggle state. Final row is the
// dedicated Submit button.
function buildQuestionKeyboard(sessionIndex, question, selected, lang) {
  const letterRow = question.options.map((_, i) => ({
    text: selected.has(i) ? `\u2705 ${LETTERS[i]}` : LETTERS[i],
    callback_data: `mv:${sessionIndex}:t:${i}`,
  }));
  // Two letters per row keeps the keyboard compact for 4-6 options.
  const rows = [];
  for (let i = 0; i < letterRow.length; i += 2) {
    rows.push(letterRow.slice(i, i + 2));
  }
  rows.push([{ text: ui(lang).submitLabel, callback_data: `mv:${sessionIndex}:s` }]);
  return { inline_keyboard: rows };
}

// The option TEXT lives here, in the message body, lettered A)/B)/C)/... —
// never on a button. This is what avoids Telegram's button-label
// truncation/concatenation problem for long option wording.
function formatQuestionMessage(question, qNumber, total, lang) {
  const optionLines = question.options
    .map((opt, i) => `${LETTERS[i]}) ${escapeHtml(opt)}`)
    .join('\n');
  return `<b>${ui(lang).question(qNumber, total)}</b>\n\n${escapeHtml(question.stem)}\n\n${optionLines}\n\n<i>${ui(lang).selectAllNote}</i>`;
}

async function defaultAskWhichChapter(bot, chatId, lang = "en") {
  await bot.sendMessage(chatId, ui(lang).askChapter);
  return null;
}

async function sendQuestion(bot, chatId, session) {
  const lang = session.lang;
  session.selected = new Set(); // fresh selection for this question
  const question = session.questions[session.index];
  const text = formatQuestionMessage(question, session.index + 1, session.questions.length, lang);
  const sent = await bot.sendMessage(chatId, text, {
    parse_mode: 'HTML',
    reply_markup: buildQuestionKeyboard(session.index, question, session.selected, lang),
  });
  // Stash the message_id and the exact text we sent, so toggle taps can
  // re-render the keyboard via editMessageText without changing the text
  // (bot_fys240.js's quizBot.editMessageText adapter forwards reply_markup
  // as-is, so this needs no new adapter method).
  session.messageId = sent?.data?.result?.message_id ?? session.messageId;
  session.currentText = text;
}

// `hooks` (optional): reserve/refund (see getQuizQuestionsDetailed above), onDenied(limited) when live
// generation was refused and the bank had nothing to serve, onCharged(reservation) after the first
// question is sent when a credit was charged.
async function startMultivalueQuiz(bot, chatId, text, askWhichChapter = defaultAskWhichChapter, fallbackLang = "en", hooks = {}) {
  const lang = resolveQuizLang(text, fallbackLang);
  const t = ui(lang);

  const chapter = extractChapterHint(text) || (await askWhichChapter(bot, chatId, lang));
  if (!chapter) return;

  const section = extractSectionHint(text);
  if (section && !corpusLoader.isValidSection(chapter, section)) {
    await bot.sendMessage(chatId, t.noSection(section, chapter));
    return;
  }

  const rawCount = extractRawCountHint(text);
  const requestedCount = rawCount === null ? (section ? SECTION_DEFAULT_COUNT : DEFAULT_COUNT) : Math.min(rawCount, MAX_COUNT);
  if (rawCount !== null && rawCount > MAX_COUNT) {
    await bot.sendMessage(chatId, t.countCapped(MAX_COUNT));
  }

  let questions, reservation, limited;
  try {
    ({ questions, reservation, limited } = await getQuizQuestionsDetailed(chatId, chapter, section, requestedCount, lang, hooks));
  } catch (err) {
    console.error(`multivalueQuizGenerator_fys240: startMultivalueQuiz failed for chapter ${chapter}${section ? '.' + section : ''}: ${err.message}`);
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
    await bot.sendMessage(chatId, (limited.reason === 'not_member' ? t.limitedPartialMember : t.limitedPartial)(questions.length, requestedCount));
  }

  const session = createSession(chatId, questions, lang);
  await sendQuestion(bot, chatId, session);

  if (reservation && typeof hooks.onCharged === 'function') {
    await hooks.onCharged(reservation);
  }
}

// ---------- numeric scope argument for the slash commands ----------
// "2" = chapter 2, "3.3" = section 3.3, "3-4" = chapters 3 to 4. A leading
// word is tolerated (chapter/luku/luvusta/osio/...) so older habits such as
// "/mvquiz chapter 2" keep working; anything after the scope is ignored (the
// question count is fixed: 5, or 3 for a single section).
const SCOPE_PREFIX_RE = /^(?:chapters?|ch\.?|sections?|luvut|luvusta|luvuista|luvun|luku|osio\w*)\s*/i;
function parseScope(arg) {
  const s = String(arg || '').trim().replace(SCOPE_PREFIX_RE, '');
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\b/);
  if (m) return { kind: 'section', chapter: m[1], section: `${m[1]}.${m[2]}` };
  m = s.match(/^(\d{1,2})\s*[-\u2013\u2014]\s*(\d{1,2})\b(?!\.)/);
  if (m) {
    let a = parseInt(m[1], 10);
    let b = parseInt(m[2], 10);
    if (a > b) [a, b] = [b, a];
    const chapters = [];
    for (let c = a; c <= b; c++) chapters.push(String(c));
    return { kind: 'chapters', chapters };
  }
  m = s.match(/^(\d{1,2})\b(?!\.)/);
  if (m) return { kind: 'chapters', chapters: [String(parseInt(m[1], 10))] };
  return null;
}

// Entry point for /mvquiz, /moquiz and /mvquizFI. `arg` is everything after
// the command. No argument -> chapter picker; unparseable argument -> falls
// back to the older free-text hint parsing (which ends in the picker if it
// finds no chapter either). `hooks` is the same optional reserve / refund /
// onDenied / onCharged contract as startMultivalueQuiz() — live generation
// (only ever a section top-up here) is members-only and costs a credit.
async function startMultivalueQuizByScope(bot, chatId, arg, askWhichChapter = defaultAskWhichChapter, lang = "en", cmdLabel = "/mvquiz", hooks = {}) {
  const t = ui(lang);
  const legacyText = `${lang === "fi" ? "monivalintavisa" : "multiquiz"} ${arg || ""}`.trim();
  const scope = parseScope(arg);
  if (!scope) {
    return startMultivalueQuiz(bot, chatId, legacyText, askWhichChapter, lang, hooks);
  }

  const validChapters = corpusLoader.listChapters().map(String);
  let questions, reservation = null, limited = null;
  try {
    if (scope.kind === 'section') {
      if (!validChapters.includes(scope.chapter)) {
        await bot.sendMessage(chatId, t.noChapter(cmdLabel, validChapters));
        return;
      }
      if (!corpusLoader.isValidSection(scope.chapter, scope.section)) {
        await bot.sendMessage(chatId, t.noSection(scope.section, scope.chapter));
        return;
      }
      ({ questions, reservation, limited } = await getQuizQuestionsDetailed(chatId, scope.chapter, scope.section, SECTION_DEFAULT_COUNT, lang, hooks));
    } else {
      const chapters = scope.chapters.filter((c) => validChapters.includes(c));
      if (!chapters.length) {
        await bot.sendMessage(chatId, t.noChapter(cmdLabel, validChapters));
        return;
      }
      if (chapters.length === 1) {
        ({ questions, reservation, limited } = await getQuizQuestionsDetailed(chatId, chapters[0], null, DEFAULT_COUNT, lang, hooks));
      } else {
        const { questions: picked } = sampleFromBankChapters(chapters, DEFAULT_COUNT, getRecentlyServed(chatId), lang);
        markServed(chatId, picked.map((q) => q.id));
        questions = picked;
      }
    }
  } catch (err) {
    console.error(`multivalueQuizGenerator_fys240: startMultivalueQuizByScope failed for "${arg}": ${err.message}`);
    await bot.sendMessage(chatId, t.startFailed);
    return;
  }

  const requestedCount = scope.kind === 'section' ? SECTION_DEFAULT_COUNT : DEFAULT_COUNT;
  if (!questions.length) {
    if (limited && typeof hooks.onDenied === 'function') {
      await hooks.onDenied(limited);
    } else {
      await bot.sendMessage(chatId, t.noQuestions);
    }
    return;
  }
  if (limited) {
    await bot.sendMessage(chatId, (limited.reason === 'not_member' ? t.limitedPartialMember : t.limitedPartial)(questions.length, requestedCount));
  }
  const session = createSession(chatId, questions, lang);
  await sendQuestion(bot, chatId, session);
  if (reservation && typeof hooks.onCharged === 'function') {
    await hooks.onCharged(reservation);
  }
}

// Partial-credit grading, floored at 0 per question. k = number of correct
// options, (n-k) = number of wrong options; c/w = how many the student
// selected of each. score = max(0, c/k - w/(n-k)):
//   - exact correct set              -> 1
//   - correct-but-incomplete, no wrong picks -> partial (e.g. 3 of 4 -> 0.75)
//   - every option ticked (right+wrong) -> exactly 0
//   - a bad guess never drags the question below 0
function gradeSelection(selected, correctIndices, totalOptions) {
  const correctSet = new Set(correctIndices);
  const k = correctIndices.length;
  const wrongPoolSize = totalOptions - k;

  let c = 0;
  let w = 0;
  for (const idx of selected) {
    if (correctSet.has(idx)) c += 1;
    else w += 1;
  }

  const positiveTerm = k > 0 ? c / k : 0;
  const negativeTerm = wrongPoolSize > 0 ? w / wrongPoolSize : 0;
  return Math.max(0, positiveTerm - negativeTerm);
}

function lettersFromIndices(indices) {
  return indices
    .slice()
    .sort((a, b) => a - b)
    .map((i) => LETTERS[i])
    .join(', ');
}

// Called from bot_fys240.js's callback_query dispatch when data starts
// with "mv:". data shape: "mv:<sessionIndex>:t:<optIdx>" (toggle) or
// "mv:<sessionIndex>:s" (submit).
async function handleMultivalueQuizAnswer(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const parts = callbackQuery.data.split(':'); // ["mv", qIndexStr, action, optIdxStr?]
  const qIndex = parseInt(parts[1], 10);
  const action = parts[2];

  const session = getSession(chatId);
  if (!session || qIndex !== session.index) {
    await bot.answerCallbackQuery(callbackQuery.id, { text: ui(session?.lang).sessionExpired });
    return;
  }

  const lang = session.lang;
  const t = ui(lang);
  const question = session.questions[qIndex];

  if (action === 't') {
    const optIdx = parseInt(parts[3], 10);
    if (session.selected.has(optIdx)) session.selected.delete(optIdx);
    else session.selected.add(optIdx);

    await bot.editMessageText(session.currentText, {
      chat_id: chatId,
      message_id: session.messageId,
      parse_mode: 'HTML',
      reply_markup: buildQuestionKeyboard(qIndex, question, session.selected, lang),
    });
    await bot.answerCallbackQuery(callbackQuery.id);
    return;
  }

  if (action === 's') {
    if (session.selected.size === 0) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: t.nothingSelected });
      return;
    }

    const score = gradeSelection(session.selected, question.correctIndices, question.options.length);
    session.score += score;

    const correctLetters = lettersFromIndices(question.correctIndices);
    const feedback = t.feedback(score, correctLetters, escapeHtml(question.explanation));

    await bot.editMessageText(`${session.currentText}\n\n${feedback}`, {
      chat_id: chatId,
      message_id: session.messageId,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] }, // lock the keyboard once graded
    });
    await bot.answerCallbackQuery(callbackQuery.id);

    session.index += 1;
    if (session.index < session.questions.length) {
      await sendQuestion(bot, chatId, session);
    } else {
      await bot.sendMessage(chatId, t.complete(session.score, session.questions.length));
      mvQuizSessions.delete(chatId);
    }
    return;
  }

  // Unknown action — ack silently so Telegram doesn't show a spinner forever.
  await bot.answerCallbackQuery(callbackQuery.id);
}

module.exports = {
  isMultivalueQuizRequest,
  startMultivalueQuiz,
  startMultivalueQuizByScope,
  parseScope,
  sampleFromBankChapters,
  handleMultivalueQuizAnswer,
  // exported for a future buildMultivalueQuizBank.js and tests
  generateQuiz,
  sampleFromBank,
  getQuizQuestions,
  getQuizQuestionsDetailed,
  loadQuizBank,
  quizBankLooksHealthy,
  extractChapterHint,
  extractSectionHint,
  extractRawCountHint,
  resolveQuizLang,
};

/* INTEGRATION NOTES — see MULTIVALUE_QUIZ_INTEGRATION.md for the full
 * checklist of bot_fys240.js changes. Summary:
 *
 *   const mvQuizGenerator = require('./multivalueQuizGenerator_fys240');
 *
 *   // in the message handler, alongside the existing quizGenerator check:
 *   if (mvQuizGenerator.isMultivalueQuizRequest(question)) {
 *     return mvQuizGenerator.startMultivalueQuiz(quizBot, chatId, question, askWhichChapter, lang);
 *   }
 *
 *   // in the callback_query dispatch, alongside the existing "quiz:" branch:
 *   if (data.startsWith("mv:")) return mvQuizGenerator.handleMultivalueQuizAnswer(quizBot, cq);
 *
 * No new quizBot adapter method is needed: quizBot.editMessageText already
 * forwards opts.reply_markup straight through to Telegram's editMessageText
 * call, which is all toggle-rendering and answer-locking need.
 *
 * /healthz can optionally add:
 *   multivalueQuizBankLooksHealthy: mvQuizGenerator.quizBankLooksHealthy()
 * Expect this to report true immediately, since multivalueQuizBank_fys240.json
 * ships with curated chapter 2-10 questions (unlike quizBank_fys240.json,
 * which starts empty) — see multivalueQuizBank_fys240.json's own notes.
 */
