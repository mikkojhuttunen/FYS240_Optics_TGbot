# FYS.240 Optics bot — merged redeploy package

This replaces `bot_fys240.js` AND `bot_fys240_bilingual_links.js` with a
single canonical bot. The repo had diverged into two branches:

| Feature | `bot_fys240.js` (old) | `bot_fys240_bilingual_links.js` (old) | `bot_fys240_HWtext.js` (old) | This merged file |
|---|---|---|---|---|
| LaTeX `$$` equation images (CodeCogs) | ✅ | ❌ (Unicode-only) | ✅ | ✅ |
| In-video timestamp links (`&t=Xs`, `findRelevantSegments`) | ✅ | ❌ | ❌ | ✅ |
| Deterministic wrong-language video-link fix (`fixVideoLinkLanguage`) | ❌ | ✅ | ❌ | ✅ |
| Bilingual (EN/FI) help text, chapter names | ✅ | ✅ | ❌ (EN-only) | ✅ |
| Verbatim question-text command | ❌ | ❌ | ✅ (`/HWtext3.2`) | ✅ (renamed `/HWQ3.2`, case-insensitive) |
| HW commands, quiz, /topics, /week, /reset, /healthz | ✅ | ✅ | ✅ | ✅ (unchanged) |

**Delete all three old bot files from the repo and use only `bot_fys240.js`
from this package.** `package.json`'s `main`/`start` now point at it.

### `/HWQ` — new in this merge

Ported from `bot_fys240_HWtext.js`'s `/HWtext<hw>.<problem>`, renamed
shorter per request: **`/HWQ3.2`** (case-insensitive — `/hwq3.2` works too).
Returns the exact, verbatim stored homework question text with **no Claude
API call**, so it can't paraphrase, hint, or drift toward a solution. Falls
back to a plain "not stored" message (bilingual) if that problem isn't in
`homework_problems.json`. Regex is `/^\/HWQ(\d+)\.(\d+)(@\S+)?\b/i` — it
requires the sub-problem number and never overlaps with `/HW3.2` or
`/HW_hint3.2`'s patterns (verified with unit tests).

## Files in this package

Runtime (required):
- `bot_fys240.js` — the merged bot (entry point)
- `corpusLoader.js`, `course_corpus.txt` — course material + glossary loader
- `fys240_videos.js` — bilingual (EN/FI) video DB, merges in timestamp
  segments from `video_segments.json` at load time
- `video_segments.json` — per-video timestamp/chapter-marker data
- `latex-renderer.js` — turns `$$...$$` into rendered equation images
- `quizGenerator_fys240.js` — quiz flow (chapter/section picker, grading)
- `homework_problems.json` — verbatim HW problem text for `/HW` commands
- `terminology.json` — glossary data (loaded by `corpusLoader.js`; see
  "Known gaps" below — not yet wired to a `/define` command)
- `package.json`, `.gitignore`

Maintenance scripts (not required at runtime, kept in `scripts/`):
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
- `LATEX_ENABLED` — default `true`; set to `false` to fall back to the
  Unicode-only math the `_bilingual_links` branch used
- `LATEX_VERIFY_BEFORE_SEND` — default `true`

## Redeploy steps

1. In your local clone of `FYS240_Optics_TGbot`, delete `bot_fys240.js` and
   `bot_fys240_bilingual_links.js`, then copy in every file from this
   package (keeping the `scripts/` subfolder).
2. `git add -A && git commit -m "Merge LaTeX/timestamp branch with bilingual-link-fix branch into one bot" && git push`
3. Confirm Railway's start command / `package.json main` now resolves to
   `bot_fys240.js` (this package's `package.json` already sets that).
4. Redeploy, then check `/healthz` — expect `videoLectures: 61`,
   `latexEnabled: true`, `corpusLooksHealthy: true`.
5. Sanity-check in Telegram: ask a question in Finnish that has a video
   with timestamps (e.g. anything from chapter 2 or 4) and confirm you get
   both a plain video link and, where relevant, a `[mm:ss](...&t=...)`
   moment link, in Finnish.

## Known gaps found while auditing (not fixed in this pass — flagging only)

- **🚨 `homework_problems.json` contains the wrong course's homework.** All
  24 stored problems (HW1–HW6, 4 problems each) are FYS.501 Laser Physics
  content — laser cavities, ABCD matrices, gain media, population
  inversion, Fabry–Pérot resonator design, Nd:YAG/Ti:Sapph gain media, etc.
  There is **no FYS.240 Optics content in this file at all**. This means
  `/HW1`–`/HW6`, `/HW_hint`, and the new `/HWQ` command are all currently
  serving laser-physics homework text to optics students — confirmed by
  actually running `/HWQ1.1` against this file (see chat). This is a
  correctness issue, not just a missing feature — I'd treat it as higher
  priority than the two gaps below. The real FYS.240 homework text doesn't
  appear to be anywhere in this project's files; it likely needs to be
  re-extracted from the original FYS.240 assignment PDFs/docs.
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
