# FYS.240 Optics bot — merged redeploy package

**Current version: 2.6.1** — see `bot_fys240.js`'s top-of-file comment for
the full functionality list and changelog going forward. From now on, bump
`BOT_VERSION` in `bot_fys240.js` (and `package.json`'s `version`) any time
you ship a change, and add a line to the changelog block — that's the whole
versioning process. `/healthz` and the startup log both report the live
version, so you can always confirm what's actually deployed on Railway.

This replaces `bot_fys240.js` AND `bot_fys240_bilingual_links.js` with a
single canonical bot. The repo had diverged into two branches:

| Feature | `bot_fys240.js` (old) | `bot_fys240_bilingual_links.js` (old) | `bot_fys240_HWtext.js` (old) | This merged file |
|---|---|---|---|---|
| LaTeX `$$` equation **images** (CodeCogs) | ✅ | ❌ | ✅ | ❌ — **removed** (see below) |
| In-video timestamp links (`&t=Xs`, `findRelevantSegments`) | ✅ | ❌ | ❌ | ✅ |
| Deterministic wrong-language video-link fix (`fixVideoLinkLanguage`) | ❌ | ✅ | ❌ | ✅ |
| Bilingual (EN/FI) help text, chapter names | ✅ | ✅ | ❌ (EN-only) | ✅ |
| Verbatim question-text command | ❌ | ❌ | ✅ (`/HWtext3.2`) | ✅ (renamed `/HWQ3.2`, case-insensitive) |
| Finnish-forced link commands (`/viikkoN`, `/luennot`) | ❌ | ❌ | ❌ | ✅ (new) |
| HW commands, quiz, /topics, /week, /reset, /healthz | ✅ | ✅ | ✅ | ✅ (unchanged) |

**Delete all three old bot files from the repo and use only `bot_fys240.js`
from this package.** `package.json`'s `main`/`start` now point at it.
**`latex-renderer.js` is no longer needed by any bot file — delete it from
the repo too**, and drop `LATEX_ENABLED` / `LATEX_VERIFY_BEFORE_SEND` from
Railway's Variables tab if they're set (harmless if left, just unused now).

### LaTeX image rendering — removed

Students were seeing raw `$$...$$` / `$...$` in messages. Root cause: the
CodeCogs image-rendering path only ever handled `$$...$$` blocks
(`parseLatexBlocks` in `latex-renderer.js` literally splits on the string
`"$$"`); any single-`$` inline math, or a `$$` block where the CodeCogs
request failed/timed out, fell straight through as literal text with the
delimiters still attached — there was no cleanup pass for that failure
case. Rather than patch that path, LaTeX image rendering has been removed
entirely: math is now always sent as plain Unicode text (same approach
`bot_fys240_bilingual_links.js` used). `latexToUnicode()` converts any
stray `\frac`, `\sqrt`, `^{}`, `_{}`, Greek commands, and common operators
Claude still emits into real Unicode (verified: `\frac{1}{\mu_0}` → `1/μ₀`,
`n_1\sin\theta_1` → `n₁ θ₁`), then strips any leftover `$`/`$$`/backslash
commands as a backstop — so no raw dollar signs can reach a student even
if Claude ignores the "Unicode only" instruction. There's no
`LATEX_ENABLED` flag any more; this always runs.

### `/HWQ` — new in this merge

Ported from `bot_fys240_HWtext.js`'s `/HWtext<hw>.<problem>`, renamed
shorter per request: **`/HWQ3.2`** (case-insensitive — `/hwq3.2` works too).
Returns the exact, verbatim stored homework question text with **no Claude
API call**, so it can't paraphrase, hint, or drift toward a solution. Falls
back to a plain "not stored" message (bilingual) if that problem isn't in
`homework_problems.json`. Regex is `/^\/HWQ(\d+)\.(\d+)(@\S+)?\b/i` — it
requires the sub-problem number and never overlaps with `/HW3.2` or
`/HW_hint3.2`'s patterns (verified with unit tests).

### `/viikkoN` and `/luennot` — new in this merge

Finnish-named aliases for `/weekN` and `/topics`. The difference from just
typing `/week3` from a Finnish Telegram client: `/week3`/`/topics` pick
language via `getLang(message)` (the client's `language_code`), so an
English-language-client student typing `/week3` gets English chapter
names/labels even if they'd prefer Finnish. `/viikko3` and `/luennot`
always call the same underlying `generateWeekMessages()`/
`generateTopicsMessages()` with `"fi"` hard-coded, regardless of the
student's client language — for students who want the Finnish list
specifically. Video links themselves already fell back sensibly either
way (any video with no Finnish recording uses its English link even in a
Finnish-language listing) — this only changes which language's chapter
names/labels and video titles are shown.

## Files in this package

Runtime (required):
- `bot_fys240.js` — the merged bot (entry point)
- `corpusLoader.js`, `course_corpus.txt` — course material + glossary loader
- `fys240_videos.js` — bilingual (EN/FI) video DB, merges in timestamp
  segments from `video_segments.json` at load time
- `video_segments.json` — per-video timestamp/chapter-marker data
- `quizGenerator_fys240.js` — quiz flow (chapter/section picker, grading)
- `homework_problems.json` — verbatim HW problem text for `/HW` commands
  (real FYS.240 content as of v2.3.0 — see below)
- `homework_solutions.json` — instructor-reference solutions (new in
  v2.3.0). **NOT loaded by `bot_fys240.js` — do not wire it to any
  student-facing command.**
- `terminology.json` — glossary data for `/define`, loaded by
  `corpusLoader.js` (312 terms from the official course booklet index as of
  v2.6.0 — see below). `corpusLoader.js` also carries the glossary
  course-mismatch guard that `bot_fys240.js` calls at startup and in
  `/healthz` (restored in v2.6.1 — see below).
- `package.json`, `.gitignore`

Reference data (not loaded at runtime):
- `booklet_index.json` — the raw parsed course-booklet index (term → page)
  that `terminology.json` was built from (v2.6.0).
- `terminology_harvested_v2.5_archive.json` — the previous 759-term
  auto-harvested glossary, kept in case the unmatched slide terms are ever
  wanted for a broader fuzzy `/define`.
- `TERMINOLOGY_BOOKLET_UPDATE.md` — how the v2.6.0 glossary was built.

Maintenance scripts (not required at runtime, kept in `scripts/`):
- `scripts/harvest_terminology.js` — regenerates `terminology.json` from
  the 61 canonical lecture `.tex` files' `\CDAlert`/`\Alert` highlighting
  (see "Resolved in v2.5.0" below).
- `scripts/chapter_file_map.json` — chapter key (e.g. `"3.4"`) → canonical
  lecture `.tex` filename, used by `scripts/harvest_terminology.js`.
- `scripts/clean.js`, `scripts/clean_homework.js`, `scripts/build_homework.js`
  — the homework `.tex` → JSON extraction pipeline (see "Resolved in
  v2.3.0" below for what each does and when to re-run it).
- `scripts/build_optics_videos_bilingual.js` — regenerates `fys240_videos.js`
  from the two YouTube analytics CSVs (EN "Optics ..." + FI "FYS.240
  Optiikka ..."). **Never re-run the old `build_optics_videos.js`** — it's
  English-only and has no `topic_fi`/`id_fi`/segment support; that's what
  caused the original bug where the Finnish links got lost.
- `scripts/add_video_segments.js` — paste a YouTube description's timestamp
  list for one video and it's stored in `video_segments.json`, independent
  of `fys240_videos.js` so regenerating the video DB never wipes timestamps.
- `scripts/import_docx_segments.js` — bulk-import segments from a doc.

## Environment variables (Railway → Variables tab)

Required:
- `TELEGRAM_TOKEN`
- `ANTHROPIC_API_KEY`

Optional (all have working defaults):
- `WEBHOOK_SECRET` — Telegram webhook secret token
- `CLAUDE_MODEL` (default `claude-haiku-4-5-20251001`)
- `CACHE_TTL` (default `1h`)
- `MAX_TOKENS` (default `900`)
- `BOT_USERNAME` — needed for @mention detection in group chats
- `ADMIN_USER_IDS` — comma-separated Telegram user IDs: exempt from the usage limits and allowed to use `/pending`
- `QUIZ_PENDING_DIR` — directory for the pending (live-generated, unreviewed) quiz questions. Set it to the mount path of a
  Railway Volume (e.g. `/data`) so they survive redeploys; unset = repo directory, wiped on every redeploy. See
  `PENDING_QUESTIONS_fys240.md`.
- `QUIZ_PENDING_MAX` (default `500`) — max entries kept per pending file

(No `LATEX_ENABLED`/`LATEX_VERIFY_BEFORE_SEND` any more — LaTeX image
rendering has been removed; see above.)

## Redeploy steps

1. In your local clone of `FYS240_Optics_TGbot`, delete `bot_fys240.js`,
   `bot_fys240_bilingual_links.js`, `bot_fys240_HWtext.js`, and
   `latex-renderer.js`, then copy in every file from this package (keeping
   the `scripts/` subfolder).
2. `git add -A && git commit -m "Merge all bot branches, remove broken LaTeX image rendering, add /HWQ + Finnish-forced /viikko,/luennot" && git push`
3. Confirm Railway's start command / `package.json main` now resolves to
   `bot_fys240.js` (this package's `package.json` already sets that). If
   `LATEX_ENABLED` or `LATEX_VERIFY_BEFORE_SEND` are set in Railway's
   Variables tab, they can be removed (harmless if left, just unused now).
4. Redeploy, then check `/healthz` — expect `videoLectures: 61`,
   `corpusLooksHealthy: true`.
5. Sanity-check in Telegram:
   - Ask a question whose answer involves an equation (e.g. "what's the
     thin lens equation?") and confirm no `$` or `$$` appear anywhere in
     the reply — only Unicode math.
   - Ask a Finnish question that has a video with timestamps (e.g.
     anything from chapter 2 or 4) and confirm you get both a plain video
     link and, where relevant, a `[mm:ss](...&t=...)` moment link, in
     Finnish.
   - Try `/viikko3` and `/luennot` and confirm both return Finnish content
     regardless of your Telegram client's language.
   - Try `/HWQ1.3` (a real problem now — see v2.3.0) and confirm it returns
     the actual FYS.240 exercise text, in clean Unicode math, not raw
     LaTeX and not laser-physics content. Check `/healthz` too:
     `homeworkProblemsCourseMismatch` should read `false`.
   - Try `/define diffraction` and `/define thin lens` and confirm you get
     real FYS.240 definitions with a working video link, NOT laser-physics
     content and NOT "glossary not available". Check `/healthz`:
     `glossaryCourseMismatch` should read `false`.
   - Ask something whose answer cites a video with an underscore in its ID
     (e.g. any chapter-9 question — several of those IDs contain one) and
     open the link: it should go to the actual video, not a broken/wrong
     one (see v2.5.0 — this was silently broken before).

## Resolved in v2.6.1: /source_* data-source commands (+ deploy fixes)

Three dev-only commands to verify what data the *running* bot actually
loaded, without Railway logs: `/source_materials` (course corpus, video DB,
glossary incl. the guard status and per-entry `source` breakdown),
`/source_HW` (homework problem counts + guard status; solutions are reported
as **counts only**, read fresh from disk, never any text), and
`/source_quizzes` (quiz-bank coverage per chapter/section, pending
live-generated questions). Plain text, no Claude call. Not listed in `/help`
or `/start`, and **not access-restricted** — anyone who knows the command
can run it (they expose file names, counts and status, no solution text).
Reports go through `sendDiagnosticReport()` so filenames like
`course_corpus.txt` aren't mangled by the LaTeX→Unicode step.

**Deploy note — files that must change together for v2.6.x.** GitHub was
still entirely at v2.3.0 when this was merged. `bot_fys240.js` v2.6.x calls
`corpusLoader.glossaryCourseMismatch()` at startup, which the committed
`corpusLoader.js` did not export — without the updated `corpusLoader.js` the
bot crashes on boot with `corpusLoader.glossaryCourseMismatch is not a
function`. Replace/add these together:
- `bot_fys240.js`, `corpusLoader.js`, `terminology.json`, `package.json`
  (version → 2.6.1), this README
- new: `booklet_index.json`, `terminology_harvested_v2.5_archive.json`,
  `TERMINOLOGY_BOOKLET_UPDATE.md`, `scripts/harvest_terminology.js`,
  `scripts/chapter_file_map.json`
- **Do not** replace `course_corpus.txt`: the GitHub copy is the real
  FYS.240 corpus; the differently-sized copy in the Claude project files is
  a stale FYS.501 one. (`/source_materials` flags this if it ever happens.)

Also fixed: `/define` on the 61 page-only glossary entries printed "introduced
in section null / null"; it now answers with the booklet page number and a
"no lecture excerpt" note. After redeploying, check `/healthz`
(`glossaryCourseMismatch: false`, `version: "2.6.1"`), then in Telegram:
`/source_materials`, `/source_HW`, `/source_quizzes`, `/define diffraction`
(real definition + working video link) and `/define acoustic wave` (page-only
answer, no "null").

## Resolved in v2.6.0: glossary rebuilt from the course booklet index

`terminology.json` now holds **312 terms keyed to the official FYS.240
booklet index**, each with its booklet page(s) (`bookletPage`) and a
`source` field (`harvested-glossary` 212, `corpus-search` 25,
`corpus-search-loose` 14, `booklet-only` 61). 251 have real lecture context
and a video link; the 61 `booklet-only` entries are prerequisite math/EM
vocabulary not named in the English slides and carry page-only data. Full
write-up: `TERMINOLOGY_BOOKLET_UPDATE.md`.

## Resolved in v2.5.0: real FYS.240 glossary + a real video-link bug

`terminology.json` now has **759 real FYS.240 terms**, harvested from the
lecture slides' own `\CDAlert`/`\Alert` term-highlighting — a mechanism
`clean.js` already had built-in support for (`cleanTexMarked()`,
`stripTermMarkers()`, `TERM_OPEN`/`TERM_CLOSE`) but that nothing in the
project had ever actually used. `/define` now returns real definitions
with working bilingual video links. The v2.4.0 course-mismatch guard
correctly reads `false` on this content.

Building the harvester (`scripts/harvest_terminology.js`) surfaced two
more real bugs, both now fixed:
- `\CDAlert`/`\Alert` sometimes carry a **second** brace argument — a
  hyperlink URL (`\CDAlert[color]{term}{https://...}`) — that clean.js's
  highlight-macro handling never expected, so the URL leaked directly onto
  the term with no separator.
- **A real, previously-invisible video-link bug**: `sendMessage()`'s
  `latexToUnicode()` step ran on the *entire* outgoing message, including
  inside a markdown link's `(url)` — so a video ID containing an
  underscore followed by a letter (common in real YouTube IDs, e.g.
  `_mM8QYplWtE`) got silently mangled into garbage, breaking the link.
  This wasn't specific to `/define` — **16 of the 61×2 (EN+FI) video IDs**
  in `fys240_videos.js` contain this pattern, so it silently affected
  video links in ordinary Q&A replies, `/topics`, `/week`, etc. too.
  `sendMessage()` now placeholder-protects markdown-link URLs before
  `latexToUnicode()` runs.

**Maintenance**: to regenerate `terminology.json` (e.g. after lecture
slides are revised), run:
```
node scripts/harvest_terminology.js <lecturesDir> scripts/chapter_file_map.json terminology.json
```
`<lecturesDir>` is a directory containing the 61 canonical lecture `.tex`
files (not included in this package — pull them from the course repo);
`scripts/chapter_file_map.json` maps each chapter key (e.g. `"3.4"`) to
its canonical filename and is already included — regenerate it too if a
lecture file is renamed or a new chapter is added (see the mapping logic
used to build it: match `^[IVX]+_(\d+)_(\d+)_` in the filename, skip
`_old`/`_copy`/`conflicted_copy` variants and the superseded combined
`VII_7_4_..._ja_koherenssi.tex`, which was replaced by two split files).
Quality is good but not perfect — it's an
auto-harvested glossary from slide highlighting, not hand-curated, so a
small residual fraction of entries are an over-captured short clause
rather than a clean term. Worth a manual spot-check pass if this becomes
a visible issue; the majority of entries are solid.

## Resolved in v2.4.0: /define wired up (glossary data still pending)

`/define <term>` is now a real command — deterministic, no Claude API
call, ported from the FYS.501 `bot.js` this repo forked from and made
bilingual. Where a matched term's `introducedIn` chapter has a known video
in `fys240_videos.js`, its link is upgraded to the canonical
`[Video X.Y (Topic)]` form so the existing `fixVideoLinkLanguage`
correction applies to it too, same as any other video link in a reply.

**terminology.json turned out to have the exact same problem as
`homework_problems.json` (v2.2.0) and `quiz_content.js`** (at the time —
now resolved, see v2.5.0 above): all 438 entries were tagged "Laser
Physics"/"FYS.510 Laser Physics" in `introducedInLecture` — zero real
FYS.240 content. Rather than wire `/define` to serve that silently, the
same course-mismatch guard pattern was added — fixed directly in
`corpusLoader.js`'s `loadGlossary()` (`looksLikeWrongCourseGlossary()`),
so it protects every future caller automatically, not just this one
command.

## Resolved in v2.3.0: real FYS.240 homework content

`homework_problems.json` now contains the actual FYS.240 exercises (10
problems across all 6 homework sets), extracted from `HW1_Optics.tex`
... `HW6_Optics.tex` — LaTeX source the course uses to typeset the real
assignments, with `\ExerciseNu{<id>}{...}` / `\SolutionNu{S<id>}{...}`
markup. A new `homework_solutions.json` (10 solutions) was extracted
alongside it — **instructor-reference only**; nothing in `bot_fys240.js`
loads or serves it, and it must stay that way per the course's
no-solutions-to-students rule. Do not wire it to any command without
deliberately re-deciding that policy first.

**Maintenance scripts** (in `scripts/`), for when the `.tex` sources get
revised or extended (a 7th homework set, corrected/added problems, etc.):
- `scripts/clean.js` — the general LaTeX → clean-Unicode-text pipeline
  originally built for `course_corpus.txt` (Greek letters, sub/superscripts,
  `\frac`, matrices, lists, etc.) — the shared engine both this and the
  corpus builder rely on.
- `scripts/clean_homework.js` — extends `clean.js` with everything specific
  to the homework `.tex` files: `\ExerciseNu`/`\SolutionNu` extraction, the
  physics-package macros (`\vb`, `\vu`, `\pdv`, `\grad`, `\cross`, `\rmi`,
  `\dd`, ...), `\newcommand`/`\renewcommand` stripping, and the `\abc` /
  `\item[<label>]` sub-part labeling conventions. Several real bugs in the
  underlying `clean.js` pipeline were found and fixed while building this
  (documented in the code comments) — e.g. `\frac`/`\sqrt` silently losing
  their division/root grouping whenever the argument contained its own
  nested braces (extremely common with any superscript inside a fraction),
  and derivative accents (`\dot`, `\ddot`) being dropped entirely. Worth
  reviewing if `course_corpus.txt` is ever rebuilt from `.tex` sources too,
  since `clean.js` itself has the same underlying bugs.
- `scripts/build_homework.js` — runs the extraction: `node
  scripts/build_homework.js <sourceDir> <outDir>` regenerates both JSON
  files from `HW1_Optics.tex` ... `HW6_Optics.tex`. **Always spot-check the
  output by hand after regenerating** — the source LaTeX uses several
  macro conventions that needed dedicated handling; a future homework file
  using an as-yet-unseen macro could silently degrade rather than error.

## Known gaps found while auditing

- **The FYS.240 quiz bank is only partly filled.** `quizBank_fys240.json`
  exists in the repo and covers chapters 2, 4 and 5 (39 questions);
  chapters 3 and 6–10 always live-generate via the Claude API. `/source_quizzes`
  shows the current coverage and how many live-generated questions have been
  captured in `quizBankPending_fys240.json` for curation. (An earlier version
  of this note said the bank didn't exist at all.) `quiz_content.js`, where
  present, is not read by `quizGenerator_fys240.js` and was FYS.501 content.
- **`/help` shows `/HWₕint3.2` instead of `/HW_hint3.2`.** Present since at
  least v2.3.0: `sendMessage()`'s LaTeX→Unicode step turns the `_h` in the
  help text into a subscript. Not fixed here.
