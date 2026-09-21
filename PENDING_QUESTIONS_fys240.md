# Pending (live-generated) quiz questions — workflow

## What they are
When a student asks for **more unseen questions than the bank can supply** (e.g. `/quiz 2.3 12`, or a second round on a section after most of its questions were served recently), the bot tops up with a live LLM call (1 credit, members only) scoped to that section's course text. Those live questions are served to that student and **also captured as *pending* questions** so you can review them and, if good, add them to the banks. Pending questions are never served from the pending files and never enter the banks automatically.

Files (created on first capture):
- `quizBankPending_fys240.json` — single-select (`/quiz`)
- `multivalueQuizBankPending_fys240.json` — multi-select (`/mvquiz`, `/moquiz`)

Each entry: `{ chapter, section, lang: "en" | "fi", question: {id: "gen_<lang>_…" | "mvgen_<lang>_…", stem, options, correctIndex | correctIndices, explanation}, generatedAt }`.
Live output is validated first (single: exactly 4 distinct options + valid `correctIndex`; multi: 4–8 distinct options, ≥2 correct and ≥1 wrong); invalid questions are dropped — neither served nor stored.

## Getting them out of Railway
Railway's container filesystem is wiped on every redeploy. Pick one (B is the safest, A works with no setup):

**A. Export from Telegram (admin only).** Set `ADMIN_USER_IDS` (already used for the usage limits). In a **private chat** with the bot send:
- `/pending` — summary by language and section + the two pending files as Telegram documents
- `/pending clear` — empty both files on the server (do this *after* saving the export)

In a group chat `/pending` only answers with a reminder to use a private chat; nothing is posted to the group. Non-admins get no reply at all.

**B. Persistent volume.** In Railway add a Volume to the bot's service, mounted at `/data`, and set the variable `QUIZ_PENDING_DIR=/data`. Pending files then survive redeploys (`/pending`, `/source_quizzes` and `/healthz` report it: `pendingQuestions.persistentDir: true`). Optional: `QUIZ_PENDING_MAX` (default 500 entries per file; beyond that the file stops growing but log lines are still emitted). With a volume you can still use `/pending` to fetch the files, and `/pending clear` to empty them after a merge.

**C. Log capture.** Every captured question is also printed as a log line (`QUIZ_PENDING_QUESTION {…}` / `MVQUIZ_PENDING_QUESTION {…}`). If the files were lost, export the Railway logs to a file and run `node mergePending_fys240.js extract railway-logs.txt` to rebuild the pending files (plain or JSON-wrapped log lines are both understood; duplicates are skipped).

`/healthz` shows `pendingQuestions: { single, multi, persistentDir }` so you can see at a glance whether anything is waiting; `/source_quizzes` shows the same plus where the files are stored.

## Reviewing and merging (on your computer, in the repo folder)
```bash
# 1. save the exported files into the repo folder (they are git-ignored), then:
node mergePending_fys240.js review          # writes pending_review.md (git-ignored)
```
`pending_review.md` lists every question with a short key (`S-1a2b3c` single, `M-4d5e6f` multi), its language (EN/FI), ✅ on the correct options and a status:
`OK` · `SIMILAR` (≥60 % word overlap with a bank question in the same section **and language**) · `DUPLICATE` (identical stem in the bank or earlier in the file, same language) · `INVALID` (structure / section / language problem). A warning flags a single-select correct option that is much longer than the distractors (answer-length cue).

```bash
# 2. merge what you accept (everything else is discarded with --drop-rest)
node mergePending_fys240.js merge --accept S-1a2b3c,M-4d5e6f --reviewed --drop-rest
#    or: --all-valid (every OK question)      --dry-run (preview only)
#    --allow-similar to accept a SIMILAR one   --assign S-abc123=2.4 to give a section to a question that has none
```

Merged questions follow the conventions the banks already use:

| | id | other fields |
|---|---|---|
| single-select, EN | `q2.4_016` | no `lang` field |
| single-select, FI | `q2.4_017_fi` | `lang: "fi"` |
| multi-select, EN | `q3.1_012` | `questionType: "multi_select"`, `lang: "en"` |
| multi-select, FI | `q3.1_013_fi` | `questionType: "multi_select"`, `lang: "fi"` |

Numbers continue from the highest number in the section used by **either** language, so a merged question never collides with an existing one or gets mistaken for the translation of one (merged FI questions have no `translationOf`). Multi-select stems get the `(Select all that apply)` / `(Valitse kaikki oikeat)` suffix if it is missing. All merged questions get `source: "claude-live-generated"`, today's `addedAt`, and `reviewed: true` only if you pass `--reviewed`. Backups `quizBank_fys240.json.bak` / `multivalueQuizBank_fys240.json.bak` are written first. Then:
```bash
node e2e_pending_test_fys240.js             # optional regression run
git add quizBank_fys240.json multivalueQuizBank_fys240.json
git commit -m "Add reviewed live-generated quiz questions" && git push origin main
# and in Telegram (private chat with the bot): /pending clear
```
A live-generated question in only one language has no counterpart in the other; if you want the pair, translate it into a `_fi` / EN sibling by hand (or in a Claude session) and add `translationOf`.

## Tests
`node e2e_pending_test_fys240.js` — capture (single + multi, EN + FI), validation of live output, `QUIZ_PENDING_DIR`, size cap, corrupt-file quarantine, the admin module (incl. the private-chat rule), and the extract / review / merge CLI including the EN/FI id, `lang` and stem-suffix rules. Temp folders only; repo files are not touched.
