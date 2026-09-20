# Multivalue Quiz Add-On — Integration Checklist

This add-on is **isolated by design**: it does not modify `quizGenerator_fys240.js`
or `quizBank_fys240.json` at all. It ships as two new files:

| File | Role |
|---|---|
| `multivalueQuizGenerator_fys240.js` | Generator + session + grading logic for "select all that apply" quizzes |
| `multivalueQuizBank_fys240.json` | Curated multi-answer question bank, chapters 2–10 (104 English + 104 Finnish counterparts, see below) |

At runtime it will also create (self-expanding, same pattern as the existing
quiz module):

| File | Role |
|---|---|
| `multivalueQuizBankPending_fys240.json` | Live-generated multi-answer questions awaiting curated merge |

## Required changes in `bot_fys240.js`

**1. Require the module**, near the other requires:
```js
const mvQuizGenerator = require('./multivalueQuizGenerator_fys240');
```

**2. Add a trigger check**, alongside the existing `quizGenerator.isQuizRequest(question)`
check in the message handler:
```js
if (mvQuizGenerator.isMultivalueQuizRequest(question)) {
  return mvQuizGenerator.startMultivalueQuiz(quizBot, chatId, question, askWhichChapter, lang);
}
```
Order relative to the existing single-select check doesn't matter — the two
trigger regexes don't overlap. `isMultivalueQuizRequest()` matches
`multiquiz` / `multi-select quiz` / `select all` / `monivalintavisa` /
`valitse kaikki`, and deliberately does **not** match bare `quiz` / `kysele`,
so a plain `"quiz me on chapter 2"` still goes to the existing single-select
flow untouched.

**3. Add a callback-data branch**, alongside the existing
`if (data.startsWith("quiz:"))` branch:
```js
if (data.startsWith("mv:")) return mvQuizGenerator.handleMultivalueQuizAnswer(quizBot, cq);
```

**4. No new `quizBot` adapter method needed.** `quizBot.editMessageText`
already forwards `opts.reply_markup` straight through to Telegram's
`editMessageText` call — that's all this module uses for both toggle
re-renders and locking the keyboard after grading.

**5. Optional — `/healthz`:**
```js
multivalueQuizBankLooksHealthy: mvQuizGenerator.quizBankLooksHealthy()
```
Expect this to report `true` immediately (unlike `quizBankLooksHealthy`,
which starts `false` until `quizBank_fys240.json` is curated) — the
multivalue bank ships pre-populated.

**6. Optional — explicit slash command.** If you'd rather have a dedicated
command instead of relying purely on the natural-language trigger, wire
`/mvquiz` (or `/MVQ`, matching the `/HWQ` convention) to
`mvQuizGenerator.startMultivalueQuiz(quizBot, chatId, "multiquiz " + rest, askWhichChapter, lang)`
the same way `/quiz` presumably already maps to `quizGenerator.startQuiz`.

## Known pre-existing issue surfaced during testing

Live-generation fallback (`generateQuiz()`) calls
`corpusLoader.getCorpusSection(chapter, section, ...)`. Testing this add-on
against the `corpusLoader.js` currently in the project files threw:

```
corpusLoader: unknown chapter "6" (expected 1-4)
```

That error message is from the **FYS.501 (laser physics) corpusLoader**,
not the ported FYS.240 one — chapters 1-4 only, no chapters 5-10. This is
the same content-source-discipline issue already flagged for
`homework_problems.json`, `terminology.json`, and `course_corpus.txt`
elsewhere in this project. If the deployed bot has the same stale
`corpusLoader.js`, **live-generation fallback for chapters 5-10 is broken
for the existing single-select `/quiz` flow too**, not just this add-on —
worth checking what's actually on Railway before relying on fallback
generation for those chapters. The bank-first path (both modules) is
unaffected since it never calls `getCorpusSection`.

## Design decisions baked into this add-on (flag if you want them changed)

- **Grading gives partial credit, floored at 0 per question.** For k
  correct options and (n-k) wrong options, selecting c correct and w wrong
  scores `max(0, c/k - w/(n-k))`: full credit (1) only for the exact
  correct set, partial credit for an incomplete-but-clean selection (no
  wrong picks), and exactly 0 if every option — right and wrong — is
  ticked, so "just select everything" is never a winning strategy. A bad
  guess is floored so it can never cost more than that question was worth.
  `gradeSelection()` in `multivalueQuizGenerator_fys240.js` is the only
  place to touch if this formula ever needs to change. The running total
  is displayed to 2 decimals with a percentage, e.g. `3.25/5.00 (65%)`.
- **Buttons show only the letter** (`A`/`B`/`C`/...), toggled with a ✅
  prefix; the full option text is written into the question message body
  as a lettered list (`A) ...`, `B) ...`), never onto a button. This is
  what avoids Telegram truncating/concatenating long option text.
- **Two letters per keyboard row**, plus a final dedicated "Submit answer"
  row — kept compact for the observed 4-6 option range.
- **Own session Map, own recently-served tracking, own callback namespace
  (`mv:`)** — fully independent of the single-select module's state, so
  the two can't interfere with each other even if both were active in the
  same chat.
- **Own bilingual (EN/FI) UI strings**, following the same structure as
  `quizGenerator_fys240.js`'s `UI` object.

## Finnish bank and `/moquiz` / `/mvquizFI` (v2.7.2)

- Every English question has a Finnish counterpart **in the same file**, in the
  same chapter/section array: `id` = `<enId>_fi`, `lang: "fi"`,
  `source: "claude-translated"`, `translationOf: "<enId>"`. `correctIndices`
  and option order are identical to the English original. The generator
  already filters bank draws by `lang`, so no generator logic changed.
- `/moquiz` ("monta oikein") and `/mvquizFI` are exact aliases and always start
  the Finnish quiz, regardless of the Telegram client language. Arguments are
  the same as for `/mvquiz`: `/moquiz luku 2`, `/moquiz 2.3`, `/moquiz 2.3 8`.
  `/mvquiz` is unchanged and still follows the client language.
- Fix shipped with it: `multivalueQuizGenerator_fys240.js` now HTML-escapes
  question, option and explanation text before sending with
  `parse_mode: "HTML"`. Bank text such as `<P>_T = I/c`, `<cosωt>=0` or
  `λ < 10 nm` would otherwise make Telegram reject the message.
- Translations are AI-produced (`claude-translated`) and follow the Finnish
  terminology already used in `course_corpus.txt` / `quizBank_fys240.json`;
  worth a skim by the course instructor before term starts.

## Numeric scope argument (v2.7.2, replaces the bare-number handling of v2.7.0 for these commands)

`/mvquiz`, `/moquiz` and `/mvquizFI` take one scope argument:

| Argument | Meaning | Questions |
|---|---|---|
| `2` | chapter 2 | 5 |
| `3.3` | section 3.3 only | 3 |
| `3-4` | chapters 3 to 4, drawn round-robin so both are represented | 5 |
| *(none)* | chapter picker | 5 |

- The count is fixed; anything after the scope (e.g. the `8` in `/mvquiz 2.3 8`)
  is ignored. Old forms (`/mvquiz chapter 2`, `/moquiz luku 2`) still work.
- A single section holds only 1-4 curated questions (61 sections; 11 have 3 or
  more per language, 49 have 1-2, 10.12 has none). Section quizzes are
  therefore bank-first and any shortfall up to 3 is topped up by the existing
  live-generation fallback (saved to `multivalueQuizBankPending_fys240.json`).
  That top-up goes through the v2.7 usage hooks: members-only when
  `COURSE_CHANNEL_ID` is set, 1 credit, refunded if generation fails; a
  non-member or a student over the limit still gets the banked questions plus a
  note.
  To serve only banked questions instead, cap the section count in
  `startMultivalueQuizByScope()` at what `sampleFromBank()` returns.
- Ranges never live-generate; they draw from the bank only.

