# FYS.240 Optics bot — merged redeploy package

**Current version: 2.3.0** — see `bot_fys240.js`'s top-of-file comment for
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
- `terminology.json` — glossary data (loaded by `corpusLoader.js`; see
  "Known gaps" below — not yet wired to a `/define` command)
- `package.json`, `.gitignore`

Maintenance scripts (not required at runtime, kept in `scripts/`):
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

- **`/define` is not wired into any bot branch.** `corpusLoader.js`
  already has a working glossary lookup (`findGlossaryTerms`, backed by
  `terminology.json`'s ~900 entries) and a `/define <term>` command exists
  in the FYS.501 `bot.js` this was forked from — it was just never ported
  over to FYS.240's bot file(s).
- **The FYS.240 quiz bank isn't actually wired up.** `quizGenerator_fys240.js`
  expects a `quizBank_fys240.json` file, which doesn't exist anywhere in the
  project — so quizzes always live-generate via the Claude API, never draw
  from a pre-built bank. The `quiz_content.js` file in the project is *not*
  read by `quizGenerator_fys240.js` at all (dead file), and on inspection
  it's actually FYS.501 Laser Physics content (chapters 1–4, laser topics),
  not the FYS.240 Optics chapters 2–6 quiz bank described in project notes.
  That FYS.240-specific quiz content doesn't appear to be in this project's
  files — it may need to be re-generated, or located from an earlier backup.
