# homework_solutions.json — READ BEFORE USING

This file is **instructor-reference only**. It contains full solutions to
every problem in `homework_problems.json`, extracted verbatim from
`HW1_Optics.tex` ... `HW6_Optics.tex`.

**`bot_fys240.js` does not load this file, and nothing in the bot should
be wired to it.** The course's rule — no full solutions to students,
hints only — is enforced everywhere else in the bot (`/HW3.2` asks Claude
for a hint grounded in the corpus, never the answer key; `/HWQ` only ever
returns the *question* text). Loading this file into the bot at all would
make it trivial for a student to fetch a full solution through some future
command, intentionally or by a prompt-injection-style trick. If a future
feature genuinely needs solution content (e.g. an instructor-only grading
aid), keep it on a separate, authenticated path — never merge it into the
student-facing conversation flow.

Regenerate both this file and `homework_problems.json` together with
`scripts/build_homework.js` — see `README_DEPLOY.md`.
