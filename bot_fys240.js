/**
 * FYS.240 Optics — Telegram teaching-assistant bot
 * ============================================================================
 * VERSION: see BOT_VERSION below. Bump it (semver: MAJOR.MINOR.PATCH) any
 * time you ship a change here, and add a line to the CHANGELOG block —
 * that's the whole versioning process, no build step needed. Convention:
 * MAJOR = breaking change to a command's behavior or removed a feature,
 * MINOR = new command/feature, PATCH = bugfix/content fix with no new
 * command. BOT_VERSION is surfaced in /healthz and the startup log line,
 * so you can always confirm which version is actually live on Railway.
 * ============================================================================
 *
 * CURRENT FUNCTIONALITY (v2.7.1):
 *   - Free-text Q&A grounded in course_corpus.txt, answers in whichever
 *     language (EN/FI) the student's question is written in
 *   - Bilingual (EN/FI) video lecture links from fys240_videos.js, with
 *     in-video timestamp links (&t=Xs) from video_segments.json where added
 *   - Deterministic correction of wrong-language video links
 *     (fixVideoLinkLanguage/isFinnishText)
 *   - Math sent as plain Unicode text (α, β, √, ², ᵢ, ...) — no LaTeX/image
 *     rendering; latexToUnicode() converts/strips any stray LaTeX Claude emits.
 *     Runs with markdown-link URLs placeholder-protected (see CHANGELOG
 *     v2.5.0) so a video ID containing an underscore is never corrupted.
 *   - /start, /help — bilingual help text
 *   - /topics — video lecture list, grouped by chapter, in the student's
 *     detected client language
 *   - /luennot — same as /topics, but ALWAYS in Finnish regardless of client
 *   - /week1 ... /week7 — videos for a given course week (7 = recap), in the
 *     student's detected client language
 *   - /viikko1 ... /viikko7 — same as /weekN, but ALWAYS in Finnish
 *   - /HW1 ... /HW6 — overview of a homework set's problems, from REAL
 *     FYS.240 content (see CHANGELOG v2.3.0)
 *   - /HW3.2 — AI-generated hint on a specific problem (no solution)
 *   - /HW_hint3.2 — a one-sentence nudge only
 *   - /HWQ3.2 (or /hwq3.2) — exact verbatim question text, no hint, no API
 *     call, straight from homework_problems.json
 *   - /define <term> — deterministic glossary lookup, no API call, now
 *     backed by the official FYS.240 course booklet index (312 terms,
 *     curated — see CHANGELOG v2.6.0), with a bilingual video link
 *     (upgraded to the canonical "[Video X.Y (Topic)]" form where a
 *     match exists)
 *   - "quiz me on chapter N" / "...section N.M" — multiple-choice quiz via
 *     quizGenerator_fys240.js, with an inline-keyboard chapter picker
 *   - /mvquiz (or "multiquiz chapter N" / "select all ...") — a SEPARATE
 *     "select all that apply" multi-answer quiz via the isolated add-on
 *     multivalueQuizGenerator_fys240.js (see CHANGELOG v2.6.2). Its own
 *     data file (multivalueQuizBank_fys240.json), its own session state,
 *     and its own callback_data namespace ("mv:...") — completely
 *     independent of the single-select quiz flow above, by design.
 *     Inline-keyboard buttons show only the option letter (A/B/C/...),
 *     toggled with a ✅ prefix, plus a dedicated Submit button; the actual
 *     option text is written into the question message body as a
 *     lettered list so Telegram never truncates/concatenates it onto a
 *     button.
 *   - /quiz [chapter | section] [count] — explicit command for the single-select
 *     multiple-choice quiz (same engine as "quiz me on chapter N", see
 *     CHANGELOG v2.7.0). "/quiz" alone shows the chapter picker; "/quiz 2",
 *     "/quiz chapter 2", "/quiz 2.3", "/quiz 2.3 8", "/quiz luku 2" all work.
 *   - /usage — how many of today's AI credits the student has used (free)
 *   - Open bot with a members-only AI layer (v2.7.0/v2.7.1): everything that
 *     doesn't call Claude — /help, /topics, /weekN, /define, /HWQ, /usage and
 *     quizzes served from the question bank — is open to everyone. The
 *     AI-backed actions (free-text Q&A, /HW hints, quizzes that need live
 *     generation) require membership of the course channel (COURSE_CHANNEL_ID,
 *     membership.js; unset = everyone is a member) and then cost a per-student
 *     daily credit (usageLimiter.js) under a shared daily spend backstop.
 *     Student-facing texts live in accessGuard.js.
 *   - /mvquiz N | N.M | N-M — multi-answer ("select all that apply") quiz on
 *     chapter N, section N.M or chapters N to M (5 questions; 3 for a section)
 *   - /moquiz (= /mvquizFI) — the same multi-answer quiz, but ALWAYS in
 *     Finnish regardless of the student's client language (Finnish
 *     counterpart of the English question bank; see CHANGELOG v2.7.2)
 *   - /reset — clear conversation history
 *   - /source_materials, /source_HW, /source_quizzes — dev-only data-source
 *     introspection commands (see CHANGELOG v2.6.1). NOT listed in /help or
 *     /start, but not access-restricted either — same as every other
 *     command here.
 *   - /pending [clear] — ADMIN ONLY (ADMIN_USER_IDS, private chat only; not in /help): exports
 *     the live-generated, not-yet-reviewed quiz questions (single + multi-select, EN + FI) as
 *     JSON documents, or empties the pending files. With QUIZ_PENDING_DIR pointing at a Railway
 *     Volume those questions also survive redeploys. See CHANGELOG v2.8.0 and
 *     PENDING_QUESTIONS_fys240.md.
 *   - /healthz — reports corpus/video/homework/glossary/quiz health + BOT_VERSION
 *     (+ pending-question counts and whether a persistent directory is configured)
 *   - Conversation history (6 turns) & per-user rate limiting
 *   - Course-mismatch guards, kept as permanent safety nets, on both
 *     homework_problems.json (v2.2.0) and terminology.json (v2.4.0):
 *     refuse to serve content that looks like it's from the wrong course
 *     instead of silently handing it to students. Neither currently fires
 *     — both homework_problems.json (v2.3.0) and terminology.json (v2.6.0)
 *     are now real FYS.240 content.
 *
 * KNOWN GAPS (not yet implemented — see redeploy-package README):
 *   - Quiz bank coverage (as of v2.7.7): quizBank_fys240.json has questions for
 *     every chapter 2-10 in both EN and FI (316 each; chapter pools: 2: 20,
 *     3: 60, 4: 30, 5: 25, 6: 30, 7: 25, 8: 35, 9: 26, 10: 65) and EVERY one of
 *     the 61 sections holds at least 5, so /quiz is normally served free from
 *     the bank — including the default 5-question section quiz ("/quiz 4.4");
 *     live generation (1 credit) only happens when a request asks for more than
 *     the bank has left. multivalueQuizBank_fys240.json
 *     holds 247 questions in EN and 247 in FI (v2.7.5): every one of the 61
 *     sections has at least 3 and every chapter has a pool of at least 22
 *     (chapter 2: 22; chapters 4-9: 25; chapter 3: 36; chapter 10: 39), so
 *     /mvquiz and /moquiz are normally served free from the bank too — section
 *     quizzes (3 questions) and 4-5 consecutive chapter quizzes (5 questions)
 *     without repeats; live generation (1 credit) is only needed when a request
 *     asks for more than the bank has left.
 *     /source_quizzes shows the live picture.
 *   - homework_solutions.json (new in v2.3.0) is instructor-reference only —
 *     nothing in this bot loads or serves it; see the file's own header
 *     comment and the redeploy-package README before wiring it to anything
 *   - terminology.json (v2.6.0) covers the 312 terms in the official course
 *     booklet index; 61 of those have no matching context in the English
 *     lecture slides (they're prerequisite math/EM vocabulary the course
 *     assumes rather than re-teaches) and fall back to a page-only
 *     reference with no video link — see CHANGELOG v2.6.0. /define still
 *     answers for these, just without a lecture excerpt attached.

 *
 * CHANGELOG:
 *   v2.8.0 — Live-generated quiz questions are now kept for review on a Railway Volume, with
 *            an admin export. Ported from the FYS.501 Laser bot's pending-question pipeline.
 *            Until now the pending files (quizBankPending_fys240.json /
 *            multivalueQuizBankPending_fys240.json) were written next to the code, which
 *            Railway wipes on every redeploy, so only the QUIZ_PENDING_QUESTION log lines
 *            survived. Now:
 *              - QUIZ_PENDING_DIR (env) puts both pending files on a mounted Railway Volume
 *                (e.g. /data); unset = old behavior (repo dir, ephemeral). QUIZ_PENDING_MAX
 *                (default 500) caps entries per file. Writes are atomic, an unreadable file is
 *                moved aside (.corrupt-<ts>) instead of overwritten, and the stdout log lines
 *                are still emitted as a second capture path. Shared code:
 *                pendingStore_fys240.js.
 *              - /pending (ADMIN_USER_IDS only, private chat only): summary by section and
 *                language + both pending files as Telegram documents; /pending clear empties
 *                them after you saved the export (pendingAdmin_fys240.js).
 *              - Live-generated output is now validated before it is served or captured
 *                (single: exactly 4 distinct options + valid correctIndex; multi: 4-8 distinct
 *                options, at least 2 correct and at least 1 wrong). Malformed questions are
 *                dropped, so they never reach a student or the pending files.
 *              - mergePending_fys240.js (run locally): extract (rebuild the pending files from a
 *                Railway log export), review (validity, duplicate and near-duplicate check per
 *                language, writes pending_review.md) and merge (adds the questions you accept to
 *                the banks with the right EN/FI id, lang and stem-suffix conventions, keeps .bak
 *                backups). e2e_pending_test_fys240.js covers all of it.
 *              - /healthz gained pendingQuestions { single, multi, persistentDir };
 *                /source_quizzes now reads the pending files from the configured location and
 *                shows where they are stored.
 *            Quiz behavior for students is unchanged apart from the validation above.
 *   v2.7.7 — Content-only update (no code changes): quizBank_fys240.json (the
 *            single-answer /quiz bank) grew from 256 to 316 questions per language
 *            (EN + FI, 632 entries). Resolves the open point noted in v2.7.6: a
 *            default "/quiz N.M" section quiz asks for 5 questions, but 43 of the
 *            61 sections held only 3-4, so they topped up via live generation
 *            (1 credit, members only). 60 new questions (+1/+2 per section) now give
 *            every section at least 5 in both languages: 3.1-3.12 (+17), 4.1/4.2/4.4/
 *            4.5/4.6 (+5), 6.1/6.4 (+2), 7.1/7.2/7.3/7.5 (+5), 8.1/8.2/8.3/8.5/8.6/8.7
 *            (+9), 9.1/9.2/9.4 (+4), 10.1-10.5/10.7-10.11/10.13 (+18). Chapter pools
 *            are now 2: 20, 3: 60, 4: 30, 5: 25, 6: 30, 7: 25, 8: 35, 9: 26, 10: 65.
 *            Tested by starting the default section quiz for all 61 sections in EN
 *            and FI: 122/122 gave 5 questions with zero live-generation requests.
 *            Same conventions as before (EN ids continue each section's numbering,
 *            FI copies "_fi" + translationOf, addedAt 2026-09-20, correct-answer
 *            positions balanced A-D 80/79/79/78); no existing question changed.
 *   v2.7.6 — Content-only update (no code changes): quizBank_fys240.json (the
 *            single-answer /quiz bank) grew from 221 to 256 questions per language
 *            (EN + FI, 512 entries). 35 new questions were added where the pools
 *            were thinnest: chapter 2 +10 (10 -> 20), chapter 4 +8 (17 -> 25,
 *            incl. 4.4: 2 -> 4), chapter 5 +13 (12 -> 25,
 *            incl. 5.1: 2 -> 5) and chapter 6 +4 (24 -> 28). Every section of
 *            chapters 2, 4, 5 and 6 now has at least 4 questions, and a student
 *            can take 4-5 consecutive five-question chapter quizzes in each of
 *            these chapters without a repeat (previously 2-4). Same conventions as
 *            the existing entries: EN ids continue each section's numbering (no
 *            lang field), FI copies "_fi" with lang "fi", translationOf and
 *            source "claude-translated"; correct-answer positions are balanced
 *            (A-D: 65/64/64/63 over the EN bank); no existing question changed.
 *            One small code fix ships with it: quizGenerator_fys240.js sent stems,
 *            correct answers and explanations with parse_mode HTML unescaped
 *            (the bank has always contained text such as "n > 1" and "n < 1"; the
 *            multi-answer generator got the same fix in v2.7.2). They are now
 *            HTML-escaped, which also covers live-generated questions. Note: a
 *            default "/quiz N.M" section quiz still asks for 5 questions, and 43 of
 *            the 61 sections hold only 3-4 single-answer questions, so those top up
 *            via live generation (1 credit) — unchanged behaviour.
 *   v2.7.5 — Content-only update (no code changes): multivalueQuizBank_fys240.json
 *            grew from 190 to 247 questions per language (EN + FI, 494 entries).
 *            57 new "select all that apply" questions enlarge the chapter pools
 *            for /mvquiz N, /moquiz N: chapter 2 +10 (12 -> 22), chapter 4 +7
 *            (18 -> 25), chapter 5 +12 (13 -> 25), chapter 6 +7 (18 -> 25),
 *            chapter 7 +8 (17 -> 25), chapter 8 +4 (21 -> 25), chapter 9 +9
 *            (16 -> 25); chapters 3 and 10 (36 / 39) needed no additions. A
 *            student can now take 4-7 consecutive five-question chapter quizzes
 *            without a repeat (previously 2-4 for chapters 2, 4, 5, 6, 7, 9).
 *            The new questions favour derivation details, sign/factor traps and
 *            short numerical applications (e.g. photon energy, critical angles,
 *            Fraunhofer distance, Fabry-Perot FSR) on top of the concept
 *            questions. Same conventions as v2.7.3/4 (ids continue each section's
 *            numbering, Finnish "_fi" copies with translationOf, addedAt
 *            2026-09-20); no existing question changed.
 *   v2.7.4 — Content-only update (no code changes): multivalueQuizBank_fys240.json
 *            grew from 155 to 190 questions per language (EN + FI, 380 entries).
 *            35 new "select all that apply" questions fill every remaining thin
 *            section in chapters 4-9 (4.1-4.6, 5.3, 5.4, 6.1, 6.2, 6.4-6.6, 7.1,
 *            7.3, 7.5, 8.1-8.7, 9.2, 9.5) up to at least 3, so all 61 sections
 *            of the course now have 3 or more banked multi-answer questions and
 *            no section quiz ("/mvquiz 8.4", "/moquiz 6.6", ...) needs live
 *            generation any more. Same conventions as v2.7.3: ids continue each
 *            section's numbering, Finnish copies carry "_fi" + translationOf,
 *            source "claude-authored" / "claude-translated", addedAt 2026-09-20,
 *            no existing question changed.
 *   v2.7.3 — Content-only update (no code changes): multivalueQuizBank_fys240.json
 *            grew from 104 to 155 questions per language (EN + FI, 310 entries).
 *            51 new "select all that apply" questions were added, 2 per section
 *            for sections 3.1-3.12 and 10.1-10.11, 10.13 (24 + 24) and 3 for 10.12
 *            (which had none), so every section of chapters 3 and 10 now has 3
 *            banked questions and "/mvquiz 3.3" / "/moquiz 10.9" etc. are served
 *            entirely from the bank (no live generation, no credit). New ids
 *            continue each section's numbering (q3.1_002, q3.1_003, ...), Finnish
 *            copies carry the "_fi" suffix and translationOf like the earlier
 *            ones; source "claude-authored" (EN) / "claude-translated" (FI),
 *            addedAt 2026-09-20. No existing question was changed.
 *   v2.7.2 — Finnish multi-answer quiz + numeric scope for the multi-answer
 *            commands. Three things, all in the multivalue quiz add-on:
 *            (1) Finnish bank. All 104 English questions in
 *            multivalueQuizBank_fys240.json now have a Finnish counterpart in
 *            the SAME file and the same chapter/section arrays (id
 *            "<enId>_fi", lang "fi", source "claude-translated",
 *            translationOf "<enId>", same correctIndices/option order as the
 *            original), so the bank is now 208 entries and Finnish quizzes are
 *            served from the bank like English ones (free, no credit) instead
 *            of being live-generated. The generator already filtered draws by
 *            lang; no logic change was needed for that.
 *            (2) New commands /moquiz ("monta oikein") and /mvquizFI — exact
 *            aliases of each other that ALWAYS start the Finnish multi-answer
 *            quiz, whatever the student's Telegram client language. /mvquiz
 *            itself is unchanged in that respect (follows the client language).
 *            (3) Numeric scope argument for /mvquiz, /moquiz and /mvquizFI:
 *            "2" = chapter 2, "3.3" = section 3.3, "3-4" = chapters 3 to 4
 *            (drawn round-robin so every chapter in the range is represented;
 *            a range never live-generates). The count is fixed: 5, or 3 for a
 *            single section (sections hold only 1-4 curated questions; a
 *            section shortfall is topped up by live generation, metered through
 *            the same reserve/refund hooks as every other quiz). This replaces
 *            v2.7.0's normalizeQuizArgs() for the multi-answer commands only:
 *            anything after the scope, including a count ("/mvquiz 2 8"), is
 *            ignored; "/mvquiz chapter 2" / "/moquiz luku 2" still work;
 *            unparseable input falls back to the free-text parser / chapter
 *            picker. Free-text requests ("multiquiz section 2.3") also default
 *            to 3 questions for a section unless a count is given. /quiz and
 *            normalizeQuizArgs() are untouched.
 *            Also fixed: multivalueQuizGenerator_fys240.js sent question,
 *            option and explanation text with parse_mode HTML unescaped, so bank
 *            text such as "<P>_T = I/c", "<cosωt>=0" or "λ < 10 nm" made
 *            Telegram reject the message; it is now HTML-escaped.
 *   v2.7.1 — Membership gate narrowed to the AI features only. In v2.7.0 the
 *            course-channel check sat at the top of every handler, so a
 *            non-member couldn't even use /help or /topics. Now the bot is open
 *            by default: only the two places that actually call Claude check
 *            membership — answerWithClaude() (Q&A + /HW hints) and the quiz
 *            "reserve" hook (live generation only). Bank-served quizzes, quiz
 *            button taps and every deterministic command need no membership and
 *            make no getChatMember call. A non-member asking for more questions
 *            than the bank holds gets the bank's questions plus a note that
 *            extra AI questions are for members (reservation reason
 *            "not_member", accessGuard.denialText). Membership is checked before
 *            credits are reserved, so non-members are never charged. The
 *            not-a-member texts (EN/FI) now say what IS open to everyone.
 *   v2.7.0 — Two features.
 *            (1) /quiz — a dedicated command for the single-select quiz,
 *            mirroring /mvquiz: "/quiz" (chapter picker), "/quiz 2",
 *            "/quiz chapter 2", "/quiz 2.3", "/quiz 2.3 8" (section + question
 *            count), "/quiz luku 2". The free-text triggers ("quiz me on
 *            chapter 2", "kysele minulta ...") still work unchanged. Bare
 *            numbers ("/quiz 2") are normalised to "chapter 2" for /quiz AND
 *            /mvquiz — the quiz modules' own hint regexes only recognise
 *            "chapter N" / "luku N" / "N.M", so previously "/mvquiz 2" fell
 *            through to the chapter picker.
 *            (2) Student usage caps, ported from the FYS.501 bot's
 *            usageLimiter.js / accessGuard.js / membership.js (new files, all
 *            configured by optional Railway variables — see each file's header):
 *              - per-student daily AI credits (STUDENT_LLM_DAILY_USAGE, default
 *                10; day boundary Europe/Helsinki) + a shared daily spend
 *                backstop (DAILY_BACKSTOP_EUR, default 5) estimated from real
 *                token usage. State is in memory, so a restart resets it: a soft
 *                guard — the monthly limit in the Anthropic Console is the hard stop.
 *              - metered: free-text Q&A and /HW3.2-style hints (1 credit each,
 *                refunded if the Claude call fails). Quizzes are metered only when
 *                the question bank can't fill the request and a live generation is
 *                needed (1 credit, refunded on failure); bank-served quizzes are
 *                free. If the limit blocks live generation the student still gets
 *                whatever the bank had, plus a note. Every Claude call (chat AND
 *                quiz generation, via usageLimiter.trackedCreate) feeds the shared
 *                spend estimate, including admins' calls.
 *              - /usage shows the student's remaining credits; texts are bilingual
 *                (EN/FI, accessGuard.js); a "N answers left" heads-up appears at <=2.
 *              - optional membership gate: if COURSE_CHANNEL_ID is set, only
 *                members of that Telegram channel (bot must be its admin) get the
 *                AI features (narrowed from "the whole bot" in v2.7.1); unset = gate
 *                off. ADMIN_USER_IDS bypass both gates.
 *              - /healthz now includes limiter status (day, active users,
 *                estimated spend, backstop state).
 *            Fixes made while porting: membership.js now reads Telegram's real
 *            error text from axios-style errors (this bot uses axios, so the
 *            original check would never have recognised "user not found" and, with
 *            MEMBERSHIP_FAIL_OPEN=true, would have let non-members in); usageLimiter
 *            prices 1h prompt-cache writes at 2x (this bot's default CACHE_TTL)
 *            instead of 1.25x.
 *   v2.6.5 — Content-only update to the multivalue quiz add-on (no code
 *            changes anywhere): multivalueQuizBank_fys240.json grew from
 *            74 to 104 questions, by adding 10 new "select all that
 *            apply" questions each for chapters 8 (8.1 x2, 8.2 x2, 8.3
 *            x2, 8.5 x1, 8.6 x2, 8.7 x1), 9 (9.1 x3, 9.3 x4, 9.4 x3), and
 *            10 (one question each for 10.1, 10.2, 10.4, 10.5, 10.6, 10.7,
 *            10.8, 10.9, 10.10, 10.11), authored fresh from the chapters'
 *            .tex lecture sources. This completes the first full pass:
 *            every chapter 2-10 now has at least one curated multi-answer
 *            question in most of its sections (10.3/10.12/10.13 remain
 *            the only chapter-10 sections without one). Same schema and
 *            validation as v2.6.3/v2.6.4's additions (no id collisions,
 *            2 ≤ correct count < total options for every question).
 *   v2.6.4 — Content-only update to the multivalue quiz add-on (no code
 *            changes anywhere): multivalueQuizBank_fys240.json grew from
 *            44 to 74 questions, by adding 10 new "select all that apply"
 *            questions each for chapters 5 (5.1 x3, 5.2 x4, 5.3 +1, 5.4
 *            x2), 6 (6.1 x1, 6.2 x2, 6.3 x3, 6.4 x2, 6.5 x2), and 7 (7.1
 *            x2, 7.2 x4, 7.4 x4), authored fresh from the chapters' .tex
 *            lecture sources. Chapters 8-10 unchanged (still 1-2 questions
 *            each). Same schema and validation as v2.6.3's additions (no
 *            id collisions, 2 \u2264 correct count < total options for every
 *            question).
 *   v2.6.3 — Content-only update to the multivalue quiz add-on (no code
 *            changes to bot_fys240.js's logic, multivalueQuizGenerator_fys240.js,
 *            or any other module): multivalueQuizBank_fys240.json grew from
 *            14 curated questions (2-per-chapter across chapters 2-10) to
 *            44, by adding 10 new "select all that apply" questions each
 *            for chapters 2 (2.1/2.2/2.3), 3 (3.1, 3.3-3.6, 3.8-3.12 — one
 *            per section, skipping 3.2/3.7 which already had a question),
 *            and 4 (4.2-4.6, two per section), authored fresh from the
 *            chapters' .tex lecture sources. Chapters 5-10 unchanged (still
 *            2 questions each, as shipped in v2.6.2). Every new question
 *            follows the same schema as before (id, questionType, stem,
 *            options, correctIndices, explanation, addedAt, source, lang)
 *            and was checked for id collisions and correctIndices validity
 *            (2 \u2264 correct count < total options) before merging.
 *   v2.6.2 — Added a "select all that apply" multi-answer quiz mode as a
 *            fully separate add-on: multivalueQuizGenerator_fys240.js +
 *            multivalueQuizBank_fys240.json (14 curated multi-answer
 *            questions, chapters 2-10). Deliberately built alongside
 *            quizGenerator_fys240.js rather than inside it — the grading
 *            contract differs (a SET of correct indices vs. one
 *            correctIndex), so the bank schema, generation prompt, session
 *            Map, and callback_data namespace ("mv:..." /
 *            "mvquizchapter:...") are all separate. New: /mvquiz command
 *            (plus natural-language triggers "multiquiz"/"select all"/
 *            "monivalintavisa"/"valitse kaikki"), routed through a new
 *            askWhichChapterMv() chapter picker (mirrors askWhichChapter()
 *            but with its own callback prefix so the two pickers can't be
 *            confused). Inline-keyboard buttons show ONLY the option
 *            letter (A/B/C/D/E, toggled with a ✅ prefix) plus a dedicated
 *            Submit button — the actual option text is written into the
 *            question message body as a lettered list instead, since
 *            Telegram truncates/concatenates long button labels. Grading
 *            gives partial credit, floored at 0 per question: for k
 *            correct options and (n-k) wrong ones, selecting c correct and
 *            w wrong gives max(0, c/k - w/(n-k)) — full credit only for
 *            the exact set, partial credit for an incomplete-but-clean
 *            selection, and exactly 0 if every option (right and wrong) is
 *            ticked, so "select everything" is never a winning strategy.
 *            The running total is displayed as e.g. "3.25/5.00 (65%)".
 *            Uses no new quizBot
 *            adapter method: editMessageText already forwards
 *            reply_markup, which is all toggle re-rendering and keyboard-
 *            locking need. /healthz gained multivalueQuizBankLooksHealthy;
 *            /source_quizzes now also reports the multivalue bank's
 *            per-chapter coverage. No changes to quizGenerator_fys240.js,
 *            quizBank_fys240.json, or the existing single-select /quiz
 *            flow — fully additive.
 *   v2.6.1 — Merged the /source_* introspection commands (developed on the
 *            v2.3.x line) into v2.6.0. Three dev-only commands so an
 *            instructor can verify exactly which data the running bot has
 *            loaded without reading Railway logs or SSH-ing in:
 *              /source_materials — course_corpus.txt (size, first line,
 *                corpusLooksHealthy, and an informational-only laser-vs-
 *                optics keyword scan that flags a stale/wrong-course
 *                corpus), fys240_videos.js (lecture count, EN/FI bilingual
 *                coverage), and terminology.json (term count, health,
 *                course-mismatch guard status, and the v2.6.0 per-entry
 *                `source` breakdown incl. how many page-only entries have
 *                no lecture context).
 *              /source_HW — homework_problems.json (per-set problem counts,
 *                course-mismatch guard status) and homework_solutions.json
 *                (existence + counts ONLY, read fresh from disk each call —
 *                never cached in memory, never prints any solution text,
 *                consistent with the no-solutions-to-students rule; see
 *                HOMEWORK_SOLUTIONS_README.md).
 *              /source_quizzes — quizBank_fys240.json (per-chapter/section
 *                question counts, which chapters still live-generate) and
 *                quizBankPending_fys240.json (saved live-generated question
 *                count, for later curation).
 *            All three are plain-text, deterministic, no Claude API call —
 *            same design as /healthz, just with more human-readable detail.
 *            Sent via sendDiagnosticReport(), which bypasses sendMessage()'s
 *            video-link/LaTeX pipeline (latexToUnicode's "_x -> subscript"
 *            rule would otherwise turn "course_corpus.txt" into
 *            "coursecorpus.txt"). Deliberately left out of HELP_TEXT_EN/FI
 *            and /start: bot-development tools, not a student feature.
 *            Also fixed (found while testing the merge): /define on the 61
 *            page-only glossary entries (source "booklet-only", null
 *            context/introducedIn/url) printed "introduced in section
 *            null\nnull" — formatGlossaryReply now answers with the
 *            booklet page number (bookletPage) and a plain "no lecture
 *            excerpt" note instead. Corrected the stale KNOWN GAPS quiz-bank
 *            entry (the bank exists; it covers chapters 2, 4, 5).
 *            Deploy note: also restores the glossary course-mismatch guard
 *            (looksLikeWrongCourseGlossary/glossaryCourseMismatch) to the
 *            committed corpusLoader.js — v2.4.0 added it, but the copy on
 *            GitHub never had it, so v2.6.0's startup/healthz calls to
 *            corpusLoader.glossaryCourseMismatch() would have thrown.
 *   v2.6.0 — Rebuilt terminology.json from the official FYS.240 course
 *            booklet index (FYS_240_Optics_glossary_list — supplied as
 *            scanned index pages, OCR'd and cross-checked by hand into
 *            booklet_index.json), replacing the previous 759-term
 *            auto-harvested glossary (v2.5.0, kept as
 *            terminology_harvested_v2.5_archive.json for reference) with
 *            312 entries that match a term the booklet itself lists, each
 *            carrying the booklet's own page number(s) in a new
 *            `bookletPage` field. 212 of the 312 matched an existing
 *            harvested entry directly (real lecture context + video link
 *            kept as-is); 39 more were recovered by searching the actual
 *            cleaned lecture text (via clean.js's real cleanTex(), not the
 *            still-stale course_corpus.txt) for genuine occurrences the
 *            harvester's highlight-only capture had missed — 25 by
 *            near-exact phrase match, 14 by a looser same-passage
 *            word-matching pass. Two false-positive matches caught during
 *            review ("Focus" and "Surface Wave" had each grabbed an
 *            unrelated sentence) were reset rather than shipped. The
 *            remaining 61 terms are prerequisite vector-calculus/EM
 *            vocabulary (Jacobian matrix, Poisson's equation, right-hand
 *            rule, ...) that genuinely isn't named anywhere in the English
 *            lecture slides — these get an honest page-only fallback entry
 *            (context/url/introducedIn all null, tagged
 *            source: "booklet-only") rather than an invented definition.
 *            Every entry also carries a new `source` field
 *            (harvested-glossary / corpus-search / corpus-search-loose /
 *            booklet-only) recording how it was obtained. Schema is
 *            additive — corpusLoader.js's loadGlossary() /
 *            findGlossaryTerms() / looksLikeWrongCourseGlossary() only
 *            read `term` and `introducedInLecture`, both unchanged in
 *            shape, so no code changes were needed for /define to keep
 *            working against the new file.
 *   v2.5.0 — Replaced terminology.json with a REAL FYS.240 glossary (759
 *            terms), harvested from the 61 canonical lecture .tex files'
 *            existing \CDAlert/\Alert term-highlighting via a new
 *            harvest_terminology.js (scripts/) reusing clean.js's
 *            cleanTexMarked()/stripTermMarkers()/TERM_OPEN/TERM_CLOSE —
 *            present in clean.js since it was built for this exact
 *            purpose, but never actually wired to a script before. The
 *            v2.4.0 course-mismatch guard now correctly reads
 *            glossaryCourseMismatch() = false on this real content.
 *            Building the harvester surfaced and fixed two more bugs:
 *            (1) \CDAlert/\Alert's optional second {url} argument (a
 *            hyperlink target used throughout these slides) was leaking
 *            directly onto the term with no separator, since clean.js's
 *            highlight-macro handling only expected one argument; (2) a
 *            "\\}" sequence (a line-break token immediately followed by
 *            an unescaped closing brace) was misread by clean.js's own
 *            unescapeChars, which doesn't check backslash parity for
 *            brace-escaping the way it does for "%" comments, producing
 *            a stray leaked placeholder glyph. Also fixed, found via
 *            testing /define directly: latexToUnicode() was running on
 *            the ENTIRE outgoing message — including inside "(url)" of a
 *            markdown link — before link-extraction happened, so a video
 *            ID containing an underscore followed by a letter (e.g. real
 *            YouTube ID "_mM8QYplWtE", or losing a literal leading
 *            underscore entirely before an uppercase letter) got silently
 *            corrupted, breaking the link. This wasn't /define-specific:
 *            16 of the 61×2 (EN+FI) video IDs in fys240_videos.js contain
 *            this pattern, so it silently affected video links in every
 *            kind of reply. sendMessage() now placeholder-protects
 *            markdown-link URLs before latexToUnicode() runs.
 *   v2.4.0 — Wired up /define <term>, previously on the bot's TODO list:
 *            corpusLoader.js already had a working glossary lookup
 *            (findGlossaryTerms, backed by terminology.json) but it wasn't
 *            connected to any command. Ported bot.js's (FYS.501) reply
 *            formatting, made bilingual, and — where an entry's
 *            introducedIn chapter matches a known video — upgraded its
 *            link to the canonical "[Video X.Y (Topic)]" form so
 *            fixVideoLinkLanguage's language correction applies to it too.
 *            While building this, found terminology.json is ALSO the
 *            wrong course's data (all 438 entries tagged "Laser
 *            Physics"/"FYS.510 Laser Physics" in introducedInLecture, zero
 *            real FYS.240 tags) — the same failure pattern as
 *            homework_problems.json (v2.2.0) and quiz_content.js. Added
 *            the same course-mismatch guard pattern to corpusLoader.js's
 *            loadGlossary() (looksLikeWrongCourseGlossary()), fixed at the
 *            source this time so every future caller benefits
 *            automatically, not just this one command. /define currently
 *            reports "glossary not available" for every term as a result
 *            — confirmed via /healthz's new glossaryCourseMismatch field —
 *            until real FYS.240 glossary data is sourced and swapped in.
 *   v2.3.0 — Replaced homework_problems.json with REAL FYS.240 content,
 *            extracted from newly-added HW1_Optics.tex ... HW6_Optics.tex
 *            (LaTeX source with \ExerciseNu/\SolutionNu markup) via a new
 *            clean_homework.js + build_homework.js pipeline (reusing
 *            course_corpus.txt's clean.js LaTeX-cleaning helpers). 10
 *            problems across 6 homework sets, verbatim question text
 *            including authors' own inline hints. Also produced
 *            homework_solutions.json (10 solutions) — instructor-reference
 *            only, deliberately NOT loaded anywhere in this bot file; the
 *            course's no-solutions-to-students rule means it must stay
 *            that way unless a future change explicitly and carefully
 *            decides otherwise. The v2.2.0 course-mismatch guard remains in
 *            place as a permanent safety net (confirmed it does not fire on
 *            this real content) rather than being removed.
 *   v2.2.0 — Added BOT_VERSION + this changelog. Added a course-mismatch
 *            guard on homework_problems.json: the file in the repo was
 *            discovered to be 100% FYS.501 Laser Physics content (laser
 *            cavities, gain media, population inversion — zero FYS.240
 *            optics content across all 24 stored problems), so /HWQ1.1
 *            and friends were serving the wrong course's homework verbatim.
 *            looksLikeWrongCourseHomework() now detects this pattern at
 *            startup and empties HOMEWORK_PROBLEMS instead of serving it,
 *            falling through to the existing "not stored" messages. Surfaced
 *            via console.error and /healthz's homeworkProblemsCourseMismatch.
 *            The real FYS.240 homework text still needs to be sourced and
 *            uploaded — this only stops the wrong content from reaching
 *            students in the meantime.
 *   v2.1.0 — Removed LaTeX image rendering (CodeCogs via latex-renderer.js)
 *            entirely: it left raw $ / $$ visible to students whenever
 *            rendering failed, or for any single-$ inline math (which
 *            CodeCogs never handled). Replaced with latexToUnicode(),
 *            converting stray LaTeX to Unicode and stripping any leftover
 *            $ / $$ as a backstop — no LATEX_ENABLED flag any more. Added
 *            /HWQ (a shortened, case-insensitive verbatim-question-text
 *            command; "HWQ" = HW Question). Added /viikkoN and /luennot —
 *            Finnish-forced aliases for /weekN and /topics.
 *   v2.0.0 — First merge: reconciled three previously-diverged branches —
 *            LaTeX rendering + in-video timestamp segments
 *            (findRelevantSegments/&t=Xs), deterministic wrong-language
 *            video-link correction (fixVideoLinkLanguage/isFinnishText),
 *            and verbatim homework question text — into this one file,
 *            which became the single source of truth.
 *   (earlier history predates version tracking)
 */

const BOT_VERSION = "2.8.0";

const fs = require("fs");
const path = require("path");
const express = require("express");
const axios = require("axios");
const quizGenerator = require("./quizGenerator_fys240");
const mvQuizGenerator = require("./multivalueQuizGenerator_fys240");
const corpusLoader = require("./corpusLoader");
const limiter = require("./usageLimiter");
const accessGuard = require("./accessGuard");
const pendingAdmin = require("./pendingAdmin_fys240");

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
let HOMEWORK_PROBLEMS_COURSE_MISMATCH = false;

// Paths for files this bot does NOT load into memory at startup, but which
// /source_HW and /source_quizzes (v2.6.1) report metadata on by reading
// fresh from disk on each call. Kept next to HW_PROBLEMS_PATH/CORPUS_PATH
// above rather than buried near those commands, so every on-disk data path
// this bot knows about lives in one place.
const HW_SOLUTIONS_PATH = path.join(__dirname, "homework_solutions.json");
const TERMINOLOGY_PATH = path.join(__dirname, "terminology.json");
const VIDEOS_MODULE_PATH = path.join(__dirname, "fys240_videos.js");
const QUIZ_BANK_PATH = path.join(__dirname, "quizBank_fys240.json");
// The pending (live-generated, unreviewed) files are NOT at a fixed path in __dirname: with
// QUIZ_PENDING_DIR set they live on a Railway Volume. Use quizGenerator.pendingSummary().path /
// mvQuizGenerator.pendingSummary().path (see /source_quizzes and /pending) rather than a constant.
// Multivalue ("select all that apply") quiz add-on — separate data files,
// only read here for the /source_quizzes diagnostic report below.
const MV_QUIZ_BANK_PATH = path.join(__dirname, "multivalueQuizBank_fys240.json");

// Sanity-check against a recurring failure mode in this repo: this codebase
// is forked between a FYS.240 Optics bot and a FYS.501 Laser Physics bot,
// and homework_problems.json has previously been swapped with the WRONG
// course's file (confirmed in v2.2.0 — the file in place was 100% FYS.501
// laser-cavity/gain-medium content, zero FYS.240 optics content, across
// all 24 stored problems). Rather than risk silently handing a student the
// wrong course's homework questions again, this scans the loaded JSON's
// text for a simple keyword signal and REFUSES to serve it if it looks
// like the wrong course — HOMEWORK_PROBLEMS is reset to {} in that case,
// so /HW, /HW_hint, and /HWQ all fall through to their existing "not
// stored" fallback paths (same behavior as if the file were simply
// missing) instead of returning wrong-course text. Only fires when laser
// terminology heavily dominates over any optics terminology, so a real
// FYS.240 set that happens to mention lasers once or twice (e.g. in a
// light-matter-interaction problem) won't be falsely flagged.
function looksLikeWrongCourseHomework(problems) {
  const allText = JSON.stringify(problems).toLowerCase();
  const laserHits = (allText.match(/laser|cavity|cavities|gain medium|population inversion|nd:yag|ti:sapph|pumping|resonator/g) || []).length;
  const opticsHits = (allText.match(/thin lens|diffraction|interference|refraction|refractive index|wavefront|polarization|interferometer|grating/g) || []).length;
  return laserHits >= 10 && laserHits > opticsHits * 3;
}

try {
  const parsed = JSON.parse(fs.readFileSync(HW_PROBLEMS_PATH, "utf8"));
  if (looksLikeWrongCourseHomework(parsed)) {
    HOMEWORK_PROBLEMS_COURSE_MISMATCH = true;
    HOMEWORK_PROBLEMS = {};
    console.error(
      `WARNING: homework_problems.json looks like the WRONG COURSE's homework ` +
      `(reads like FYS.501 Laser Physics, not FYS.240 Optics) — REFUSING to serve it. ` +
      `/HW, /HW_hint, and /HWQ will report "not stored" for every problem until the ` +
      `correct FYS.240 homework text is uploaded. See /healthz: homeworkProblemsCourseMismatch.`
    );
  } else {
    HOMEWORK_PROBLEMS = parsed;
    const total = Object.values(HOMEWORK_PROBLEMS).reduce((n, hw) => n + Object.keys(hw).length, 0);
    console.log(`Loaded homework_problems.json: ${total} problems across ${Object.keys(HOMEWORK_PROBLEMS).length} homeworks`);
  }
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
- ALWAYS use this exact [Video X.Y (Topic)](URL) format for the video link itself — never write the raw URL on its own, after a colon, or after a dash. (When a timestamp is also linked, see IN-VIDEO TIMESTAMPS below — that adds a second, separate link, it doesn't replace this one.)
- LANGUAGE OF VIDEO LINKS: <video_lectures> below lists each lecture as an EN pair (topic + url) and, where one exists, an FI pair after "|". ALWAYS match the pair's language to the language you are answering in RIGHT NOW, with or without a timestamp — do not default to the English pair out of habit, even if an example below happens to be in English. If a lecture has no FI pair, use the EN pair even in a Finnish answer.
  EN example (answering in English): "That's covered in [Video 5.2 (Refraction)](https://youtube.com/watch?v=pzzjQhhXdkE)."
  FI example (answering in Finnish — same rule, Finnish pair): "Asiasta kerrotaan [Video 5.2 (Taittuminen)](https://youtube.com/watch?v=<fi-id>):ssa."
- IN-VIDEO TIMESTAMPS: some lectures also list chapter markers indented beneath the EN and/or FI pair, tagged EN: or FI:, e.g. "  FI: 16:48 (1008s) Poyntingin vektori S = c^2 eps0 ExB". When the student's question matches one of these markers specifically (not just the video's general topic), give TWO separate links in the same sentence: (1) the timestamp itself as clickable text, e.g. "[16:48](URL&t=1008s)" — using the seconds shown in parentheses after the marker, never recomputed — and (2) the normal [Video X.Y (Topic)](URL) link with NO &t=, pointing at the start of the video as usual. Both links use the SAME-LANGUAGE pair's url; only use a marker tagged for the language (EN:/FI:) you're actually linking, and never mix a FI: marker's seconds onto the EN url or vice versa. If the student's message includes a <possible_video_moments> block, that's already been matched to this specific question in code — use it instead of searching <video_lectures> yourself whenever one of its candidates fits.
  FI example (answering in Finnish, using a FI: marker): "Tarkemmin asiasta kerrotaan kohdassa [16:48](https://youtube.com/watch?v=KCRFMlnFNbQ&t=1008s) videolla [Video 4.3 (Sähkömagneettisen kentän energia)](https://youtube.com/watch?v=KCRFMlnFNbQ)."
  EN example (answering in English, using an EN: marker for the same lecture): "That's explained in more detail around [16:48](https://youtube.com/watch?v=qPxBAoaT_Dc&t=1008s) in [Video 4.3 (Energy of the electromagnetic field)](https://youtube.com/watch?v=qPxBAoaT_Dc)." — only if an EN: marker is actually listed for that video.
  Not every video has markers yet — when none is listed for the pair (language) you're linking, just give the single normal [Video X.Y (Topic)](URL) link as before, with no timestamp link.

HOW TO HELP
**LENGTH**: ONE OR TWO SHORT SENTENCES/PARAGRAPH ONLY. Never use section headers, bullets, tables, or sub-points. No "Step 1, Step 2". No "Key insight:". Just talk to them like a person.
**HOMEWORK**: Give hints, not answers. Name the relevant equation or concept, point to the section, suggest a video if available, ask ONE guiding question. (Students can also use /HW1 ... /HW6 and /HW3.2-style commands to ask about a specific homework set or problem directly.)
**CONCEPTUAL**: Answer directly and briefly. If they ask about something that has a video, mention it: "That's in [Video X.Y (Topic)](URL). In short, ..."
**VIDEO REFERENCES**: When appropriate, include video links as [Video X.Y (Topic)](URL) so students can find them easily, choosing the EN or FI title/url pair to match the language you're answering in (see LANGUAGE OF VIDEO LINKS above).
**STUDENT ATTEMPTS**: If they show work, check it quickly, point at one specific error. Don't rewrite the whole thing.
**REDIRECT**: If it's outside course scope, say "That's beyond FYS.240, ask your instructor during office hours".

FORMAT
- Plain text for Telegram.
- Never use $ or $$ delimiters, and never write raw LaTeX commands (\frac, \sqrt, \alpha, ^{}, _{}, etc.) — write all math directly in Unicode: Greek letters (α β γ δ θ λ μ π φ ω...), superscripts (x², n³), subscripts (n₁, sᵢ, sₒ), √ for roots, × · ÷ ± ∞ ∫ ∑ ∂ ∇ ≈ ≠ ≤ ≥ → for operators, and plain "/" for fractions (e.g. "1/f = 1/sₒ + 1/sᵢ")
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

// Sends a local file as a Telegram document (multipart upload; Node >= 18 provides
// fetch / FormData / Blob globally). Used by the admin-only /pending export.
async function tgSendDocument(chatId, filePath, filename, caption) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) form.append("caption", caption);
  form.append("document", new Blob([fs.readFileSync(filePath)], { type: "application/json" }), filename);
  const res = await fetch(`${TELEGRAM_API}/sendDocument`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Telegram sendDocument failed: HTTP ${res.status}`);
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
  // Used by membership.js (accessGuard.requireMember). Deliberately NOT wrapped in a catch: the
  // membership check decides what to do with each kind of Telegram error itself.
  async getChatMember(chatId, userId) {
    const res = await tg("getChatMember", { chat_id: chatId, user_id: userId });
    return res.data.result;
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

// Same idea as askWhichChapter() above, but for the multivalue ("select
// all that apply") quiz add-on. Kept as a SEPARATE function with its own
// callback_data prefix ("mvquizchapter:N:lang") rather than reusing
// askWhichChapter()/"quizchapter:" — a tap on this picker must route to
// mvQuizGenerator.startMultivalueQuiz(), not quizGenerator.startQuiz(),
// and handleCallbackQuery() below tells the two apart by prefix alone.
async function askWhichChapterMv(bot, chatId, lang = "en") {
  const text =
    lang === "fi"
      ? "Mistä luvusta haluaisit monivalintavisan (valitse kaikki oikeat)? Voit myös kirjoittaa esim. /moquiz 3.3 (osio) tai /moquiz 3-4 (lukuväli)."
      : "Which chapter would you like the multi-select quiz on? You can also type e.g. /mvquiz 3.3 (section) or /mvquiz 3-4 (chapter range).";
  await bot.sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: corpusLoader.listChapters().map((ch) => {
        const title = lang === "fi" ? corpusLoader.getChapterTitleFi(ch) : corpusLoader.getChapterTitle(ch);
        const label = lang === "fi" ? `Luku ${ch} — ${title}` : `Chapter ${ch} — ${title}`;
        return [{ text: label, callback_data: `mvquizchapter:${ch}:${lang}` }];
      }),
    },
  });
  return null;
}

// ------------------------------------------ usage caps / access (v2.7.0) ----
// Hooks handed to the quiz modules (see getQuizQuestionsDetailed() in quizGenerator_fys240.js).
// reserve() runs only when a live Claude call is about to happen — never for quizzes served from
// the question bank, which are open to everyone. Live generation is members-only (COURSE_CHANNEL_ID)
// and then costs a credit.
function makeQuizHooks(chatId, userId, lang) {
  return {
    reserve: async () => {
      if (!(await accessGuard.isMember(quizBot, userId))) return { ok: false, reason: "not_member" };
      return limiter.reserve(userId, "quiz");
    },
    refund: (reservation) => accessGuard.refundLLM(userId, reservation),
    onDenied: (reservation) => accessGuard.notifyDenied(quizBot, chatId, reservation, lang),
    onCharged: (reservation) => accessGuard.maybeWarnLow(quizBot, chatId, reservation, lang),
  };
}

// Members-only check, then reserve one credit, ask Claude, deliver the reply, refund if the Claude
// call itself failed. Used by the free-text Q&A path and by the AI-backed /HW commands.
async function answerWithClaude({ chatId, userId, lang, replyTo, prompt, rememberAs, videoHints }) {
  if (!(await accessGuard.requireMember(quizBot, chatId, userId, lang))) return; // told how to join
  const budget = await accessGuard.requireLLMBudget(quizBot, chatId, userId, "chat", lang);
  if (!budget.ok) return; // the student has already been told why

  await tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});

  let reply;
  try {
    reply = await askClaude(chatId, prompt, videoHints);
  } catch (e) {
    accessGuard.refundLLM(userId, budget);
    await sendMessage(
      chatId,
      lang === "fi"
        ? "Pahoittelut, en juuri nyt saanut yhteyttä aivoihini. Yritä hetken kuluttua uudelleen."
        : "Sorry, I couldn't reach my brain just now. Please try again in a moment.",
      replyTo
    );
    return;
  }

  remember(chatId, "user", rememberAs);
  remember(chatId, "assistant", reply);
  await sendMessage(chatId, reply, replyTo);
  await accessGuard.maybeWarnLow(quizBot, chatId, budget, lang);
}

// The quiz modules' hint regexes only understand "chapter N" / "luku N" / "N.M" — a bare
// "/quiz 2" (or "/quiz 2 8" = chapter 2, 8 questions) is rewritten to "chapter 2" (+ count).
// Anything else ("2.3", "2.3 8", "luku 2", "chapter 2, 8 questions", ...) passes through as typed.
function normalizeQuizArgs(rest) {
  const r = (rest || "").trim();
  const m = r.match(/^(\d{1,2})(?:\s+(\d{1,2}))?$/);
  return m ? `chapter ${m[1]}${m[2] ? " " + m[2] : ""}` : r;
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

// Heuristic Finnish/English detector for the ASSISTANT'S OWN reply text
// (not the student's question). Finnish prose is dense with ä/ö; English
// essentially never uses them, so a density threshold is a cheap, reliable
// signal — far more reliable than asking the model to remember which
// language it's replying in by the time it picks a video link.
// (See fixVideoLinkLanguage, below, for how this gets used.)
function isFinnishText(text) {
  const letters = text.match(/[a-zA-ZäöÄÖ]/g) || [];
  if (letters.length < 20) return false; // too short to judge
  const finnishMarkers = (text.match(/[äöÄÖ]/g) || []).length;
  return finnishMarkers / letters.length > 0.02;
}

// Deterministic guard against wrong-language video links. TA_INSTRUCTIONS
// tells Claude to pick the FI or EN (topic, url) pair depending on which
// language it's answering in — but that's a soft instruction and Claude
// sometimes answers in Finnish while still using the EN pair. Rather than
// keep tuning the prompt, this rewrites every "[Video X.Y (Topic)](url)"
// link AFTER generation to match the language the reply is actually
// written in, using VIDEO_DB as the source of truth. A chapter with no FI
// recording still falls back to the EN pair, same as TA_INSTRUCTIONS says.
// Only touches the plain "[Video X.Y (Topic)](url)" pattern — the separate
// "[16:48](url&t=1008s)" timestamp link (see IN-VIDEO TIMESTAMPS above) is
// left untouched, since the model already ties its language to whichever
// EN:/FI: marker it picked.
function fixVideoLinkLanguage(text) {
  if (!VIDEO_DB) return text;
  const targetLang = isFinnishText(text) ? "fi" : "en";
  return text.replace(
    /\[Video (\d+\.\d+) \(([^)]+)\)\]\((https?:\/\/[^\s)]+)\)/g,
    (full, chapter, _label, _url) => {
      const video = (VIDEO_DB.getChapter(chapter) || [])[0];
      if (!video) return full; // unknown chapter — leave untouched

      if (targetLang === "fi" && video.topic_fi && video.id_fi) {
        return `[Video ${chapter} (${video.topic_fi})](https://youtube.com/watch?v=${video.id_fi})`;
      }
      return `[Video ${chapter} (${video.topic})](https://youtube.com/watch?v=${video.id})`;
    }
  );
}

// Converts common LaTeX that Claude might still slip in (despite
// TA_INSTRUCTIONS telling it to use Unicode only) into Unicode, then
// strips any leftover $ / $$ delimiters and backslash commands so
// nothing raw ever reaches students. No LATEX_ENABLED flag — this
// always runs; there is no image-rendering path any more.
const GREEK = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ",
  eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ",
  nu: "ν", xi: "ξ", omicron: "ο", pi: "π", rho: "ρ", sigma: "σ",
  tau: "τ", upsilon: "υ", phi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π",
  Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
};
const SUP = { "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹",
  "+":"⁺","-":"⁻","=":"⁼","(":"⁽",")":"⁾","n":"ⁿ","i":"ⁱ",
  a:"ᵃ",b:"ᵇ",c:"ᶜ",d:"ᵈ",e:"ᵉ",f:"ᶠ",g:"ᵍ",h:"ʰ",j:"ʲ",k:"ᵏ",l:"ˡ",m:"ᵐ",
  o:"ᵒ",p:"ᵖ",r:"ʳ",s:"ˢ",t:"ᵗ",u:"ᵘ",v:"ᵛ",w:"ʷ",x:"ˣ",y:"ʸ",z:"ᶻ" };
const SUB = { "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉",
  "+":"₊","-":"₋","=":"₌","(":"₍",")":"₎",
  a:"ₐ",e:"ₑ",h:"ₕ",i:"ᵢ",j:"ⱼ",k:"ₖ",l:"ₗ",m:"ₘ",n:"ₙ",o:"ₒ",p:"ₚ",r:"ᵣ",s:"ₛ",t:"ₜ",u:"ᵤ",v:"ᵥ",x:"ₓ" };
const toSup = (s) => [...s].map((c) => SUP[c] ?? c).join("");
const toSub = (s) => [...s].map((c) => SUB[c] ?? c).join("");

// Matches one level of {...} — good enough for the simple exponents/
// fractions Claude actually generates; anything with nested braces
// just falls through to the final cleanup pass below.
const BRACED = "\\{([^{}]*)\\}";

function latexToUnicode(text) {
  // \frac{a}{b} -> a/b (parens added only if a or b contains a space/operator)
  text = text.replace(new RegExp(`\\\\frac${BRACED}${BRACED}`, "g"), (_, a, b) => {
    const wrap = (s) => (/[\s+\-]/.test(s) ? `(${s})` : s);
    return `${wrap(a)}/${wrap(b)}`;
  });
  text = text.replace(/\\sqrt\{([^{}]*)\}/g, (_, x) => `√(${x})`);
  text = text.replace(/\\sqrt(\w)/g, (_, x) => `√${x}`);

  // superscripts / subscripts: braced or single-char
  text = text.replace(new RegExp(`\\^${BRACED}`, "g"), (_, x) => toSup(x));
  text = text.replace(/\^(\w)/g, (_, x) => toSup(x));
  text = text.replace(new RegExp(`_${BRACED}`, "g"), (_, x) => toSub(x));
  text = text.replace(/_(\w)/g, (_, x) => toSub(x));

  // Greek letters
  text = text.replace(/\\([A-Za-z]+)/g, (m, name) => GREEK[name] ?? m);

  // common operators/symbols
  const OPS = {
    "\\pm": "±", "\\mp": "∓", "\\times": "×", "\\cdot": "·", "\\div": "÷",
    "\\approx": "≈", "\\neq": "≠", "\\leq": "≤", "\\geq": "≥",
    "\\rightarrow": "→", "\\to": "→", "\\infty": "∞", "\\partial": "∂",
    "\\nabla": "∇", "\\int": "∫", "\\sum": "∑", "\\prod": "∏",
    "\\left": "", "\\right": "", "\\,": " ", "\\;": " ", "\\!": "",
    "\\text": "",
  };
  for (const [k, v] of Object.entries(OPS)) {
    text = text.split(k).join(v);
  }

  // Fallback: strip any remaining backslash commands and stray braces
  // (covers matrices, unrecognized macros — degrades to plain text
  // instead of showing raw LaTeX)
  text = text.replace(/\\[a-zA-Z]+/g, "");
  text = text.replace(/[{}]/g, "");

  // Finally, strip any leftover $ / $$ delimiters entirely
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, "$1");
  text = text.replace(/\$([^$\n]+?)\$/g, "$1");
  text = text.replace(/\$/g, "");

  return text;
}

// Splits text into <4096-char chunks and sends each as a message. Pass
// parseMode "HTML" (the normal case now, so video links render as clickable
// text) or leave it undefined for a literal-text fallback. A rendering
// hiccup elsewhere degrades to plain text instead of the student getting
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
// Math is sent as plain Unicode text — no image rendering: latexToUnicode()
// converts any stray LaTeX Claude still emits, and strips $ / $$ delimiters,
// so no raw dollar signs ever reach the student.
async function sendMessage(chatId, text, replyTo) {
  text = fixVideoLinkLanguage(text);
  text = markdownEmphasisToUnicode(text);

  // Protect markdown-link URLs from latexToUnicode's math-notation
  // transforms before running it. Found via testing /define: a video ID
  // containing an underscore followed by a letter (e.g. real YouTube ID
  // "_mM8QYplWtE") was silently corrupted into "ₘM8QYplWtE" by
  // latexToUnicode's "_x -> subscript x" rule, since it runs on the whole
  // message — including inside "(url)" — before convertLinksAndEscape
  // gets a chance to extract links out. 16 of the 61×2 (EN+FI) video IDs
  // in fys240_videos.js contain this pattern, so this silently broke a
  // meaningful fraction of video links across every reply, not just
  // /define. Only the URL itself is protected here; the surrounding
  // label/prose still gets converted normally.
  const urlPlaceholders = [];
  text = text.replace(/\(https?:\/\/[^\s)]+\)/g, (m) => {
    urlPlaceholders.push(m);
    return `\u0001${urlPlaceholders.length - 1}\u0001`;
  });

  text = latexToUnicode(text);

  urlPlaceholders.forEach((url, i) => {
    text = text.replace(`\u0001${i}\u0001`, url);
  });

  await sendPlainChunks(chatId, convertLinksAndEscape(text), replyTo, "HTML");
}

// --------------------------------------------------------------- claude -----
/**
 * @param {Array} [videoHints] - VIDEO_DB.findRelevantSegments(question)
 *   results, pre-matched in code (see call site) so the model doesn't have
 *   to fuzzy-search the whole <video_lectures> dump itself — much more
 *   reliable for a small model, especially against Finnish case-inflected
 *   questions ("yhtälöstä" not literally matching a label of "yhtälö").
 */
async function askClaude(chatId, question, videoHints) {
  const content = [{ type: "text", text: question }];
  if (videoHints && videoHints.length > 0) {
    let hint = "<possible_video_moments>\n";
    hint += "Pre-matched candidates for THIS question, ranked best first. If one actually answers it, prefer it over searching <video_lectures> yourself — use its exact url/seconds as-is, in the EN or FI form matching the language you're answering in (if only one language is listed for a candidate, only use it in that language's answer). If none of these fit, ignore this block.\n";
    videoHints.forEach(h => {
      hint += `${h.chapter} | ${h.lang.toUpperCase()} | ${h.topic} | ${h.t}s | ${h.label} | ${h.url}\n`;
    });
    hint += "</possible_video_moments>";
    content.push({ type: "text", text: hint });
  }

  const messages = [...(history.get(chatId) || []), { role: "user", content }];

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await axios.post(
        "https://api.anthropic.com/v1/messages",
        { model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM_BLOCKS, messages },
        { headers: ANTHROPIC_HEADERS, timeout: 120000 }
      );

      const u = res.data.usage || {};
      limiter.recordUsage(res.data.model || MODEL, u);
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

// Sends a plain-text diagnostic report (the /source_* commands below)
// straight through, with none of sendMessage()'s video-link/Markdown/LaTeX
// processing. That pipeline is built for Claude's chat replies and is
// known to mangle plain underscores followed by a letter — e.g.
// latexToUnicode's "_x -> subscript x" rule turns "course_corpus.txt" into
// "coursecorpus.txt" and "/source_HW" into "/sourceHW" (same underlying
// quirk as the video-ID bug fixed in CHANGELOG v2.5.0, just triggered by
// ordinary filenames instead of YouTube IDs). A diagnostic report is only
// ever literal filenames/counts/status text, so it skips that pipeline
// entirely and just HTML-escapes for safe parse_mode: "HTML" delivery.
async function sendDiagnosticReport(chatId, text, replyTo) {
  await sendPlainChunks(chatId, escapeHtml(text), replyTo, "HTML");
}

// ------------------------------------------- source/introspection (v2.6.1) --
// Backs /source_materials, /source_HW, /source_quizzes — plain-text,
// deterministic, no Claude API call (same design as /healthz, just more
// human-readable). Dev/instructor tools for verifying which data the
// running bot actually loaded; not listed in HELP_TEXT_EN/FI or /start.

function fileInfo(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return {
      exists: true,
      sizeBytes: stat.size,
      modified: stat.mtime.toISOString().replace("T", " ").slice(0, 16) + " UTC",
    };
  } catch (e) {
    return { exists: false, sizeBytes: 0, modified: null };
  }
}

function firstNonEmptyLine(text) {
  const line = (text || "").split("\n").find((l) => l.trim().length > 0);
  return line ? line.trim() : "(empty)";
}

// Informational only — unlike looksLikeWrongCourseHomework() /
// looksLikeWrongCourseGlossary(), this never blocks anything from being
// served. It reuses the same laser-vs-optics keyword heuristic so
// /source_materials can flag a stale/wrong-course course_corpus.txt before
// a student notices — this exact failure mode has already hit
// homework_problems.json (v2.2.0) and terminology.json (v2.4.0).
function corpusCourseSignal(text) {
  const lower = (text || "").toLowerCase();
  const laserHits = (lower.match(/laser|cavity|cavities|gain medium|population inversion|nd:yag|ti:sapph|pumping|resonator/g) || []).length;
  const opticsHits = (lower.match(/thin lens|diffraction|interference|refraction|refractive index|wavefront|polarization|interferometer|grating/g) || []).length;
  let verdict;
  if (laserHits >= 10 && laserHits > opticsHits * 3) verdict = "⚠ LOOKS LIKE FYS.501 LASER PHYSICS, not FYS.240 Optics";
  else if (laserHits === 0 && opticsHits === 0) verdict = "❓ no course-specific keywords matched — can't confirm either way";
  else verdict = "✓ looks like FYS.240 Optics content";
  return { laserHits, opticsHits, verdict };
}

function buildSourceMaterialsReport() {
  const corpusInfo = fileInfo(CORPUS_PATH);
  const signal = corpusCourseSignal(COURSE_CORPUS);

  const lines = [];
  lines.push(`SOURCE: course materials — bot v${BOT_VERSION}`);
  lines.push("");
  lines.push("course_corpus.txt (free-text Q&A, /HW hints, quiz live-generation)");
  lines.push(`- Loaded: ${COURSE_CORPUS ? "yes" : "NO — file missing or empty"}`);
  lines.push(`- Size: ${COURSE_CORPUS.length.toLocaleString()} chars (~${Math.round(COURSE_CORPUS.length / 3.7).toLocaleString()} tokens)`);
  lines.push(`- On disk: ${corpusInfo.exists ? `${corpusInfo.sizeBytes.toLocaleString()} bytes, modified ${corpusInfo.modified}` : "file not found"}`);
  lines.push(`- First line: "${firstNonEmptyLine(COURSE_CORPUS)}"`);
  lines.push(`- Health check (corpusLooksHealthy): ${corpusLoader.corpusLooksHealthy() ? "ok" : "FAILED"}`);
  lines.push(`- Course-content scan: ${signal.laserHits} laser-terms vs ${signal.opticsHits} optics-terms -> ${signal.verdict}`);
  lines.push("");

  const videoInfo = fileInfo(VIDEOS_MODULE_PATH);
  const videos = VIDEO_DB ? VIDEO_DB.all() : [];
  const bilingual = videos.filter((v) => v.topic_fi && v.id_fi);
  const missingFi = videos.filter((v) => !(v.topic_fi && v.id_fi)).map((v) => v.chapter);
  const chapters = VIDEO_DB ? VIDEO_DB.getChapters() : [];
  lines.push("fys240_videos.js (video links suggested in replies, /topics, /weekN)");
  lines.push(`- Loaded: ${VIDEO_DB ? "yes" : "NO"}`);
  lines.push(
    `- Lectures: ${videos.length}` +
    (chapters.length ? ` (chapters ${chapters[0].split(".")[0]}-${chapters[chapters.length - 1].split(".")[0]})` : "")
  );
  lines.push(
    `- Bilingual (EN+FI): ${bilingual.length}/${videos.length}` +
    (missingFi.length ? ` — missing FI for: ${missingFi.join(", ")}` : "")
  );
  lines.push(`- On disk: ${videoInfo.exists ? `modified ${videoInfo.modified}` : "file not found"}`);
  lines.push("");

  const glossary = corpusLoader._loadGlossary();
  const termInfo = fileInfo(TERMINOLOGY_PATH);
  lines.push("terminology.json (glossary — backs /define, no Claude call)");
  lines.push(`- Terms loaded: ${Array.isArray(glossary) ? glossary.length : 0}`);
  lines.push(`- Health check (glossaryLooksHealthy): ${corpusLoader.glossaryLooksHealthy() ? "ok" : "FAILED"}`);
  const glossArr = Array.isArray(glossary) ? glossary : [];
  const bySource = {};
  glossArr.forEach((g) => { const k = g.source || "untagged"; bySource[k] = (bySource[k] || 0) + 1; });
  const pageOnly = glossArr.filter((g) => !g.context).length;
  lines.push(`- Entry sources: ${Object.keys(bySource).sort().map((k) => `${k} ${bySource[k]}`).join(", ") || "n/a"}`);
  lines.push(`- Page-only entries (no lecture context/video, /define answers without an excerpt): ${pageOnly}`);
  lines.push(
    `- Course-mismatch guard: ${
      corpusLoader.glossaryCourseMismatch()
        ? "⚠ FIRED — refusing to serve, /define reports unavailable"
        : "clear"
    }`
  );
  lines.push(`- On disk: ${termInfo.exists ? `modified ${termInfo.modified}` : "file not found"}`);
  lines.push("");
  lines.push("See /source_HW and /source_quizzes for homework and quiz data.");
  return lines.join("\n");
}

function buildSourceHwReport() {
  const probInfo = fileInfo(HW_PROBLEMS_PATH);
  const solInfo = fileInfo(HW_SOLUTIONS_PATH);

  const hwNums = Object.keys(HOMEWORK_PROBLEMS).sort((a, b) => Number(a) - Number(b));
  const perHw = hwNums.map((hw) => `HW${hw}: ${Object.keys(HOMEWORK_PROBLEMS[hw]).length}`).join(", ") || "none";
  const totalProblems = Object.values(HOMEWORK_PROBLEMS).reduce((n, hw) => n + Object.keys(hw).length, 0);

  // Read solutions fresh from disk for METADATA ONLY (counts, per-set
  // breakdown, mtime) — never held in memory across requests, and never
  // prints any solution text. This bot's normal request path never touches
  // this file at all; see HOMEWORK_SOLUTIONS_README.md before ever
  // changing that.
  let solutionsLine = "not found on disk";
  let totalSolutions = 0;
  if (solInfo.exists) {
    try {
      const parsed = JSON.parse(fs.readFileSync(HW_SOLUTIONS_PATH, "utf8"));
      const solNums = Object.keys(parsed).sort((a, b) => Number(a) - Number(b));
      totalSolutions = Object.values(parsed).reduce((n, hw) => n + Object.keys(hw).length, 0);
      solutionsLine = solNums.map((hw) => `HW${hw}: ${Object.keys(parsed[hw]).length}`).join(", ") || "empty";
    } catch (e) {
      solutionsLine = `present but failed to parse (${e.message})`;
    }
  }

  const lines = [];
  lines.push(`SOURCE: homework data — bot v${BOT_VERSION}`);
  lines.push("");
  lines.push("homework_problems.json (served via /HW, /HW_hint, /HWQ)");
  lines.push(
    `- Status: ${
      HOMEWORK_PROBLEMS_COURSE_MISMATCH
        ? "⚠ COURSE MISMATCH — refusing to serve, /HW commands fall back to full-corpus search"
        : totalProblems
        ? "loaded"
        : "not loaded / empty — /HW commands fall back to full-corpus search"
    }`
  );
  lines.push(`- Problems: ${totalProblems} total (${perHw})`);
  lines.push(`- On disk: ${probInfo.exists ? `modified ${probInfo.modified}` : "file not found"}`);
  lines.push(`- Source pipeline: HW1_Optics.tex ... HW6_Optics.tex -> clean_homework.js -> build_homework.js`);
  lines.push("");
  lines.push("homework_solutions.json (INSTRUCTOR-REFERENCE ONLY)");
  lines.push(`- Loaded/served by this bot: NO — nothing in bot_fys240.js reads this file at request time (by design)`);
  lines.push(`- Present on disk: ${solInfo.exists ? "yes" : "no"}`);
  if (solInfo.exists) {
    lines.push(`- Solutions on disk: ${totalSolutions} total (${solutionsLine})`);
    lines.push(`- On disk: modified ${solInfo.modified}`);
  }
  lines.push(`- Reminder: see HOMEWORK_SOLUTIONS_README.md before ever wiring this to a command`);
  return lines.join("\n");
}

function buildSourceQuizzesReport() {
  const bank = quizGenerator.loadQuizBank();
  const bankInfo = fileInfo(QUIZ_BANK_PATH);
  const pendingSum = quizGenerator.pendingSummary();
  const pendingInfo = fileInfo(pendingSum.path);

  const chapters = Object.keys(bank).sort((a, b) => Number(a) - Number(b));
  let totalQuestions = 0;
  const chapterLines = chapters.map((ch) => {
    const secs = bank[ch] || {};
    const secCounts = Object.keys(secs)
      .sort()
      .map((s) => {
        const n = Array.isArray(secs[s]) ? secs[s].length : 0;
        totalQuestions += n;
        return `${s} (${n})`;
      });
    return `   Chapter ${ch}: ${secCounts.join(", ") || "no sections"}`;
  });

  const ALL_CHAPTERS = [2, 3, 4, 5, 6, 7, 8, 9, 10];
  const missingChapters = ALL_CHAPTERS.filter((c) => !chapters.includes(String(c)));

  const pendingCount = pendingSum.total;

  const lines = [];
  lines.push(`SOURCE: quiz data — bot v${BOT_VERSION}`);
  lines.push("");
  lines.push("quizBank_fys240.json (pre-built bank, tried before live generation)");
  lines.push(`- Status: ${bankInfo.exists ? "loaded" : "NOT FOUND — every quiz live-generates via the Claude API"}`);
  lines.push(`- Health check (quizBankLooksHealthy): ${quizGenerator.quizBankLooksHealthy() ? "ok" : "FAILED"}`);
  lines.push(`- Coverage: ${chapters.length ? `chapters ${chapters.join(", ")} — ${totalQuestions} questions total` : "none"}`);
  chapterLines.forEach((l) => lines.push(l));
  lines.push(`- Missing chapters (live-generate every time): ${missingChapters.length ? missingChapters.join(", ") : "none"}`);
  lines.push(`- On disk: ${bankInfo.exists ? `modified ${bankInfo.modified}` : "file not found"}`);
  lines.push("");
  lines.push("quizBankPending_fys240.json (live-generated questions saved for later curation)");
  lines.push(`- Storage: ${pendingSum.persistentDir ? `persistent directory ${path.dirname(pendingSum.path)} (QUIZ_PENDING_DIR) — survives redeploys` : "repo directory — LOST on redeploy (set QUIZ_PENDING_DIR to a Railway Volume; admins can export with /pending)"}`);
  lines.push(`- Present: ${pendingInfo.exists ? "yes" : "no — none saved yet"}`);
  if (pendingInfo.exists) {
    lines.push(`- Pending questions saved: ${pendingCount}${pendingSum.corrupt ? " (file unreadable!)" : ""}`);
    lines.push(`- On disk: modified ${pendingInfo.modified}`);
  }
  lines.push("");
  lines.push(`Live generation model (used for any chapter not in the bank): ${MODEL}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("multivalueQuizBank_fys240.json (\"select all that apply\" add-on, separate from the above)");
  const mvBank = mvQuizGenerator.loadQuizBank();
  const mvBankInfo = fileInfo(MV_QUIZ_BANK_PATH);
  const mvPendingSum = mvQuizGenerator.pendingSummary();
  const mvPendingInfo = fileInfo(mvPendingSum.path);
  const mvChapters = Object.keys(mvBank).sort((a, b) => Number(a) - Number(b));
  let mvTotalQuestions = 0;
  let mvTotalFi = 0;
  const mvChapterLines = mvChapters.map((ch) => {
    const secs = mvBank[ch] || {};
    const secCounts = Object.keys(secs)
      .sort()
      .map((s) => {
        const arr = Array.isArray(secs[s]) ? secs[s] : [];
        const nFi = arr.filter((q) => q.lang === "fi").length;
        const nEn = arr.length - nFi;
        mvTotalQuestions += arr.length;
        mvTotalFi += nFi;
        return `${s} (${nEn} en / ${nFi} fi)`;
      });
    return `   Chapter ${ch}: ${secCounts.join(", ") || "no sections"}`;
  });
  const mvMissingChapters = ALL_CHAPTERS.filter((c) => !mvChapters.includes(String(c)));
  const mvPendingCount = mvPendingSum.total;
  lines.push(`- Status: ${mvBankInfo.exists ? "loaded" : "NOT FOUND — every multivalue quiz live-generates via the Claude API"}`);
  lines.push(`- Health check (multivalueQuizBankLooksHealthy): ${mvQuizGenerator.quizBankLooksHealthy() ? "ok" : "FAILED"}`);
  lines.push(`- Coverage: ${mvChapters.length ? `chapters ${mvChapters.join(", ")} — ${mvTotalQuestions} questions total (${mvTotalQuestions - mvTotalFi} en, ${mvTotalFi} fi)` : "none"}`);
  mvChapterLines.forEach((l) => lines.push(l));
  lines.push(`- Missing chapters (live-generate every time): ${mvMissingChapters.length ? mvMissingChapters.join(", ") : "none"}`);
  lines.push(`- On disk: ${mvBankInfo.exists ? `modified ${mvBankInfo.modified}` : "file not found"}`);
  lines.push(`- multivalueQuizBankPending_fys240.json: ${mvPendingInfo.exists ? `${mvPendingCount} question(s) saved for curation` : "no — none saved yet"}`);
  return lines.join("\n");
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
    .replace(/^\/(ask|help|start|reset|video|topics|week\d+|luennot|viikko\d+|define)(@\S+)?\s*/i, "")
    .trim();
}

// --------------------------------------------------------- HW commands ------
// Matches:  /HW3          (overview of Homework 3)
//           /HW3.2        (hint on Homework 3, problem 2)
//           /HW_hint3.2   (minimal one-line nudge on Homework 3, problem 2)
//           /HWQ3.2       (exact verbatim question text, no hint — see below)
// hwNum is expected to be 1-6 (six homework sets); the regex itself doesn't
// enforce that range, it just matches whatever digits follow /HW.
const HW_COMMAND_RE = /^\/HW(_hint)?(\d+)(?:\.(\d+))?(@\S+)?\b/i;

// Matches /HWQ3.2 (case-insensitive, so /hwq3.2 works too) — exact verbatim
// problem text, no hint, no API call. Shortened per request ("HWQ" = HW
// Question). Requires the sub-problem number — a whole homework set's text
// is several problems long and isn't meant to be dumped in one message;
// /HW3 already gives the one-line overview to navigate from.
const HW_TEXT_COMMAND_RE = /^\/HWQ(\d+)\.(\d+)(@\S+)?\b/i;

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

// Free, deterministic version of the full question text — no Claude call,
// so it can't paraphrase, hint, or accidentally leak toward a solution.
// Sends exactly what's stored in homework_problems.json, verbatim. Not
// bilingual by design — this returns the stored assignment text as-is, in
// whatever language it was authored in, rather than translating it.
function buildHwFullText(hwNum, problemNum, lang) {
  const exactText = HOMEWORK_PROBLEMS[hwNum]?.[problemNum];
  if (!exactText) {
    if (HOMEWORK_PROBLEMS_COURSE_MISMATCH) {
      return lang === "fi"
        ? `Kotitehtävien tarkkoja tekstejä ei ole juuri nyt saatavilla (tekninen ongelma kurssimateriaalin kanssa) — opettaja on tietoinen asiasta.\n` +
          `Kokeile /HW${hwNum} yleiskatsausta tai kysy minulta suoraan tehtävästä ${hwNum}.${problemNum}.`
        : `Exact homework text isn't available right now (a technical issue with the course material — the instructor's aware) — ` +
          `try /HW${hwNum} for an overview or just ask me directly about problem ${hwNum}.${problemNum}.`;
    }
    return lang === "fi"
      ? `Minulla ei ole tallennettuna Kotitehtävä ${hwNum}, tehtävä ${problemNum} tarkkaa tekstiä.\n` +
        `Kokeile /HW${hwNum} yleiskatsausta varten, tai /HW${hwNum}.${problemNum} vihjettä varten.`
      : `I don't have the exact text of Homework ${hwNum}, problem ${problemNum} stored.\n` +
        `Try /HW${hwNum} for an overview, or /HW${hwNum}.${problemNum} for a hint instead.`;
  }
  return exactText;
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
  "- Quiz me on chapter 2 (or a specific section, e.g. \"quiz me on section 2.3\") for a multiple-choice quiz, or just use /quiz\n" +
  "- /mvquiz 2 for a \"select all that apply\" multi-answer quiz on chapter 2\n\n" +
  "I'll explain concepts, point you to relevant videos or sections, and give hints on homework (but not solutions).\n\n" +
  "Commands:\n" +
  "/topics — see all video lecture topics\n" +
  "/week1 ... /week7 — see videos for a specific course week (week 7 = recap)\n" +
  "/luennot, /viikko1 ... /viikko7 — same as /topics and /week, but always in Finnish\n" +
  "/HW1 ... /HW6 — list the problems in a specific homework set\n" +
  "/HW3.2 — get a hint on Homework 3, problem 2\n" +
  "/HW_hint3.2 — just a one-line nudge, no explanation\n" +
  "/HWQ3.2 — see the exact question text for a problem, verbatim\n" +
  "/define <term> — look up a term in the course glossary\n" +
  "/quiz — multiple-choice quiz (e.g. \"/quiz 2\", \"/quiz 2.3\" or \"/quiz 2.3 8\" for 8 questions; \"/quiz\" alone lets you pick a chapter)\n" +
  "/mvquiz — \"select all that apply\" multi-answer quiz: /mvquiz 2 (chapter 2), /mvquiz 3.3 (section 3.3), /mvquiz 3-4 (chapters 3–4)\n" +
  "/moquiz or /mvquizFI — the same multi-answer quiz, always in Finnish (e.g. \"/moquiz 2\")\n" +
  "/usage — see how many AI credits you have used today\n" +
  "/reset — clear our conversation history";

const HELP_TEXT_FI =
  `Hei! Olen FYS.240 Optiikka -kurssin avustaja. Tunnen luentomuistiinpanot, oppikirjan ja ${VIDEO_DB ? VIDEO_DB.all().length : 0} luentovideota kaikista kurssin aiheista.\n\n` +
  "Voit kysyä esimerkiksi:\n" +
  "- Miten ohut linssi toimii?\n" +
  "- Mikä ero on reaalikuvalla ja virtuaalikuvalla?\n" +
  "- Jumitin tehtävässä 5.2, mistä kannattaisi aloittaa?\n" +
  "- Selitä, miten mikroskooppi toimii\n" +
  "- \"Kysele minulta luvusta 2\" (tai tietystä osiosta, esim. \"kysele minulta osiosta 2.3\") monivalintavisaa varten, tai käytä komentoa /quiz\n" +
  "- /moquiz 2 saadaksesi \"valitse kaikki oikeat\" -tyyppisen visan luvusta 2\n\n" +
  "Selitän käsitteitä, ohjaan sinut oikeiden videoiden tai lukujen pariin ja annan vinkkejä kotitehtäviin (mutten valmiita ratkaisuja).\n\n" +
  "Komennot:\n" +
  "/topics — kaikki luentovideoiden aiheet\n" +
  "/week1 ... /week7 — kyseisen kurssiviikon videot (viikko 7 = kertaus)\n" +
  "/luennot, /viikko1 ... /viikko7 — samat kuin /topics ja /week, mutta aina suomeksi\n" +
  "/HW1 ... /HW6 — listaa tietyn kotitehtäväsetin tehtävät\n" +
  "/HW3.2 — vinkki kotitehtävä 3:n tehtävään 2\n" +
  "/HW_hint3.2 — vain lyhyt vihje, ei selitystä\n" +
  "/HWQ3.2 — näytä tehtävän tarkka kysymysteksti\n" +
  "/define <termi> — hae termi kurssin sanastosta\n" +
  "/quiz — monivalintavisa (esim. \"/quiz 2\", \"/quiz 2.3\" tai \"/quiz 2.3 8\" = 8 kysymystä; pelkällä \"/quiz\":lla valitset luvun)\n" +
  "/mvquiz — \"valitse kaikki oikeat\" -monivalintavisa: /mvquiz 2 (luku 2), /mvquiz 3.3 (osio 3.3), /mvquiz 3-4 (luvut 3–4)\n" +
  "/moquiz tai /mvquizFI — sama \"monta oikein\" -visa, aina suomeksi (esim. /moquiz 2, /moquiz 3.3 tai /moquiz 3-4)\n" +
  "/usage — katso kuinka monta tekoälykrediittiä olet käyttänyt tänään\n" +
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

// ------------------------------------------------------------- glossary ----
// Formats a /define reply from corpusLoader.findGlossaryTerms(). Fully
// deterministic — no Claude API call — same design as /HWQ: can't
// paraphrase or hallucinate a definition. Bilingual, unlike the FYS.501
// bot.js this was ported from.
//
// Where an entry's introducedIn chapter matches a known video
// (VIDEO_DB.getChapter), links it in the canonical "[Video X.Y (Topic)]"
// form so fixVideoLinkLanguage's bilingual correction applies to it same
// as any other video link in a reply. Falls back to the glossary entry's
// own stored url/title (plain link, no language pairing available for it)
// when there's no video match.
function formatGlossaryReply(query, lang) {
  if (!corpusLoader.glossaryLooksHealthy()) {
    return lang === "fi"
      ? "Sanasto ei ole juuri nyt käytettävissä — yritä myöhemmin uudelleen."
      : "The glossary isn't available right now — please check back later.";
  }

  const matches = corpusLoader.findGlossaryTerms(query, 3);
  if (!matches.length) {
    return lang === "fi"
      ? `En löytänyt termiä "${query}" sanastosta. Sanasto on koottu automaattisesti kurssimateriaalin ` +
        `korostetuista termeistä, joten se ei kata kaikkea — kysy minulta suoraan sen sijaan.`
      : `I couldn't find "${query}" in the glossary. It's auto-extracted from highlighted terms in the ` +
        `course material, so it doesn't cover everything — try asking me directly instead.`;
  }

  return matches
    .map((g) => {
      // Page-only entries (terminology.json v2.6.0, source: "booklet-only"):
      // context/introducedIn/url are all null — the term is in the course
      // booklet's index but isn't named in the English lecture slides. Answer
      // honestly with the booklet page instead of printing "null".
      if (!g.context || !g.introducedIn) {
        const pages = Array.isArray(g.bookletPage) ? g.bookletPage : [];
        const pageStr = pages.length ? pages.join(", ") : null;
        if (lang === "fi") {
          return `**${g.term}** — mainitaan kurssin kirjan hakemistossa` +
            (pageStr ? ` (s. ${pageStr})` : "") +
            `. Tälle termille ei ole luentokatkelmaa tai videota — kysy minulta suoraan, niin selitän sen.`;
        }
        return `**${g.term}** — listed in the course booklet index` +
          (pageStr ? ` (${pages.length > 1 ? "pp." : "p."} ${pageStr})` : "") +
          `. There's no lecture excerpt or video for this term — ask me directly and I'll explain it.`;
      }

      const revisit =
        g.revisitedIn && g.revisitedIn.length
          ? lang === "fi"
            ? ` (myös kohdissa ${g.revisitedIn.join(", ")})`
            : ` (also covered in ${g.revisitedIn.join(", ")})`
          : "";

      let videoLine = "";
      const video = VIDEO_DB ? (VIDEO_DB.getChapter(g.introducedIn) || [])[0] : null;
      if (video) {
        const useFi = lang === "fi" && video.topic_fi && video.id_fi;
        const topic = useFi ? video.topic_fi : video.topic;
        const id = useFi ? video.id_fi : video.id;
        videoLine = `\n[Video ${g.introducedIn} (${topic})](https://youtube.com/watch?v=${id})`;
      } else if (g.url) {
        const label = g.introducedInTitle || g.introducedInLecture || (lang === "fi" ? "Katso video" : "Watch video");
        videoLine = `\n[${label}](${g.url})`;
      }

      const sectionLabel = lang === "fi" ? "esitelty kohdassa" : "introduced in section";
      return `**${g.term}** — ${sectionLabel} ${g.introducedIn}${revisit}\n${g.context}${videoLine}`;
    })
    .join("\n\n");
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
app.get("/", (_req, res) => res.send(`FYS.240 Optics bot v${BOT_VERSION} is running`));
app.get("/healthz", (_req, res) => res.json({ 
  ok: true, 
  version: BOT_VERSION,
  corpusChars: COURSE_CORPUS.length,
  corpusLooksHealthy: corpusLoader.corpusLooksHealthy(),
  videoLectures: VIDEO_DB ? VIDEO_DB.all().length : 0,
  homeworkProblemsLoaded: Object.values(HOMEWORK_PROBLEMS).reduce((n, hw) => n + Object.keys(hw).length, 0),
  homeworkProblemsCourseMismatch: HOMEWORK_PROBLEMS_COURSE_MISMATCH,
  glossaryLooksHealthy: corpusLoader.glossaryLooksHealthy(),
  glossaryCourseMismatch: corpusLoader.glossaryCourseMismatch(),
  quizBankLooksHealthy: quizGenerator.quizBankLooksHealthy(),
  multivalueQuizBankLooksHealthy: mvQuizGenerator.quizBankLooksHealthy(),
  pendingQuestions: {
    single: quizGenerator.pendingSummary().total,
    multi: mvQuizGenerator.pendingSummary().total,
    persistentDir: !!process.env.QUIZ_PENDING_DIR,
  },
  limiter: limiter.status(),
  membershipGate: !!process.env.COURSE_CHANNEL_ID,
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
  // ---- /usage — the student's AI credits today (free, no Claude call) ----
  if (/^\/usage(@\S+)?\b/i.test(text)) {
    return sendDiagnosticReport(chatId, accessGuard.usageText(userId, lang), message.message_id);
  }
  // ---- /pending (ADMIN_USER_IDS only, private chat only): export / clear the live-generated quiz
  // questions awaiting review. Silently ignored for everyone else — admin-gated internally by
  // pendingAdmin_fys240.js, so no membership/credit check is needed. See PENDING_QUESTIONS_fys240.md.
  const pendingMatch = text.match(/^\/pending(@\S+)?\b\s*(.*)$/i);
  if (pendingMatch) {
    return pendingAdmin
      .handlePendingCommand({
        chatId,
        userId,
        isPrivate: message.chat.type === "private",
        arg: pendingMatch[2],
        sendText: (c, t) => sendDiagnosticReport(c, t, message.message_id),
        sendDocument: tgSendDocument,
      })
      .catch((e) => console.error("/pending crashed:", e.message));
  }
  // ---- dev-only data-source introspection (v2.6.1) — not in /help/start ----
  if (/^\/source_materials/i.test(text)) {
    return sendDiagnosticReport(chatId, buildSourceMaterialsReport(), message.message_id);
  }
  if (/^\/source_HW/i.test(text)) {
    return sendDiagnosticReport(chatId, buildSourceHwReport(), message.message_id);
  }
  if (/^\/source_quizzes/i.test(text)) {
    return sendDiagnosticReport(chatId, buildSourceQuizzesReport(), message.message_id);
  }
  if (/^\/define/i.test(text)) {
    const term = text.replace(/^\/define(@\S+)?\s*/i, "").trim();
    if (!term) {
      return sendMessage(
        chatId,
        lang === "fi"
          ? 'Käyttö: /define <termi> — esim. "/define diffraktio"'
          : 'Usage: /define <term> — e.g. "/define diffraction"',
        message.message_id
      );
    }
    return sendMessage(chatId, formatGlossaryReply(term, lang), message.message_id);
  }
  // ---- /quiz — explicit command for the single-select multiple-choice quiz
  // (v2.7.0). "/quiz" alone shows the chapter picker; "/quiz 2", "/quiz chapter 2",
  // "/quiz 2.3", "/quiz 2.3 8" (chapter/section + optional question count) and
  // Finnish forms like "/quiz luku 2" all work — same hint-parsing as the free-text trigger.
  const quizMatch = text.match(/^\/quiz(@\S+)?\b\s*(.*)$/i);
  if (quizMatch) {
    const rest = normalizeQuizArgs(quizMatch[2]);
    const quizText = rest ? `quiz ${rest}` : "quiz";

    const nowQ = Date.now();
    if (nowQ - (lastCall.get(userId) || 0) < MIN_INTERVAL_MS) return;
    lastCall.set(userId, nowQ);

    console.log(`[${message.chat.type}:${chatId}] /quiz command: ${text.slice(0, 60)}`);

    return quizGenerator
      .startQuiz(quizBot, chatId, quizText, askWhichChapter, lang, makeQuizHooks(chatId, userId, lang))
      .catch((e) => console.error("quizGenerator.startQuiz (/quiz) crashed:", e.message));
  }

  // ---- /mvquiz, /moquiz, /mvquizFI — explicit commands for the multivalue
  // ("select all that apply") quiz add-on. "/mvquiz", "/mvquiz chapter 2",
  // "/mvquiz 2.3", "/mvquiz 3-4" are accepted (scope = chapter, section or
  // chapter range; see CHANGELOG v2.7.2). /mvquiz follows the student's
  // client language (getLang);
  // /moquiz ("monta oikein") and /mvquizFI are exact aliases of each other
  // that ALWAYS start the Finnish quiz. Alternation order matters: the
  // longer "mvquizFI" is tried before "mvquiz" (the trailing \b would
  // reject "/mvquizFI" for the plain /mvquiz branch anyway).
  const mvQuizMatch = text.match(/^\/(mvquizFI|moquiz|mvquiz)(@\S+)?\b\s*(.*)$/i);
  if (mvQuizMatch) {
    const mvCmd = mvQuizMatch[1].toLowerCase();
    const forceFi = mvCmd === "moquiz" || mvCmd === "mvquizfi";
    const mvLang = forceFi ? "fi" : lang;
    const rest = (mvQuizMatch[3] || "").trim();

    const nowMv = Date.now();
    if (nowMv - (lastCall.get(userId) || 0) < MIN_INTERVAL_MS) return;
    lastCall.set(userId, nowMv);

    console.log(`[${message.chat.type}:${chatId}] /${mvQuizMatch[1]} command (${mvLang}): ${text.slice(0, 60)}`);

    // rest is a numeric scope: "2" (chapter), "3.3" (section), "3-4" (range).
    return mvQuizGenerator
      .startMultivalueQuizByScope(quizBot, chatId, rest, askWhichChapterMv, mvLang, `/${mvCmd === "mvquizfi" ? "mvquizFI" : mvCmd}`, makeQuizHooks(chatId, userId, mvLang))
      .catch((e) => console.error(`mvQuizGenerator.startMultivalueQuizByScope (/${mvQuizMatch[1]}) crashed:`, e.message));
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
  // /luennot — Finnish alias for /topics, always Finnish regardless of the
  // student's Telegram client language (unlike /topics, which follows
  // getLang(message)).
  if (/^\/luennot/i.test(text)) {
    for (const chunk of generateTopicsMessages("fi")) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: chunk,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }).catch((e) =>
        console.error("Telegram sendMessage (/luennot) failed:", e.response?.status, JSON.stringify(e.response?.data))
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
  // /viikkoN — Finnish alias for /weekN, always Finnish regardless of the
  // student's Telegram client language.
  const viikkoMatch = text.match(/^\/viikko(\d+)/i);
  if (viikkoMatch) {
    const weekNum = parseInt(viikkoMatch[1], 10);
    for (const chunk of generateWeekMessages(weekNum, "fi")) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: chunk,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }).catch((e) =>
        console.error("Telegram sendMessage (/viikko) failed:", e.response?.status, JSON.stringify(e.response?.data))
      );
    }
    return;
  }

  // ---- /HWQ3.2 (exact verbatim question text, no hint, no API call)
  const hwTextMatch = text.match(HW_TEXT_COMMAND_RE);
  if (hwTextMatch) {
    const hwNum = hwTextMatch[1];
    const problemNum = hwTextMatch[2];

    const nowText = Date.now();
    if (nowText - (lastCall.get(userId) || 0) < MIN_INTERVAL_MS) return;
    lastCall.set(userId, nowText);

    console.log(`[${message.chat.type}:${chatId}] HWQ command: ${text.slice(0, 60)}`);

    await sendMessage(chatId, buildHwFullText(hwNum, problemNum, lang), message.message_id);
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

    await answerWithClaude({
      chatId,
      userId,
      lang,
      replyTo: message.message_id,
      prompt: directive,
      rememberAs: text,
    });
    return;
  }

  const question = stripMention(text);
  if (question.length < 3) return;

  const now = Date.now();
  if (now - (lastCall.get(userId) || 0) < MIN_INTERVAL_MS) return;
  lastCall.set(userId, now);

  console.log(`[${message.chat.type}:${chatId}] ${question.slice(0, 120)}`);

  // ---- "multiquiz" / "select all" / "monivalintavisa" — the SEPARATE
  // multi-answer quiz add-on. Checked first since its trigger words never
  // overlap with the single-select "quiz"/"kysele" ones below, so a plain
  // "quiz me on chapter 2" still reaches the single-select flow untouched.
  if (mvQuizGenerator.isMultivalueQuizRequest(question)) {
    return mvQuizGenerator
      .startMultivalueQuiz(quizBot, chatId, question, askWhichChapterMv, lang, makeQuizHooks(chatId, userId, lang))
      .catch((e) => console.error("mvQuizGenerator.startMultivalueQuiz crashed:", e.message));
  }

  // ---- "quiz me" / "quiz me on chapter 2" / "quiz me on section 2.3" ----
  if (quizGenerator.isQuizRequest(question)) {
    return quizGenerator
      .startQuiz(quizBot, chatId, question, askWhichChapter, lang, makeQuizHooks(chatId, userId, lang))
      .catch((e) => console.error("quizGenerator.startQuiz crashed:", e.message));
  }

  await answerWithClaude({
    chatId,
    userId,
    lang,
    replyTo: message.message_id,
    prompt: question,
    rememberAs: question,
    videoHints: VIDEO_DB ? VIDEO_DB.findRelevantSegments(question) : [],
  });
}

// callback_query updates: answer-option taps ("quiz:...") from
// quizGenerator's inline keyboards, and chapter-picker taps
// ("quizchapter:N:lang") from askWhichChapter() above.
async function handleCallbackQuery(cq) {
  const data = cq.data || "";
  const cbUserId = cq.from?.id; // the student who tapped — NOT the chat id (matters in groups)

  // ---- multivalue ("select all that apply") quiz add-on — its own
  // callback_data namespace, kept separate from "quiz:"/"quizchapter:" ----
  if (data.startsWith("mv:")) {
    return mvQuizGenerator
      .handleMultivalueQuizAnswer(quizBot, cq)
      .catch((e) => console.error("mvQuizGenerator.handleMultivalueQuizAnswer crashed:", e.message));
  }

  if (data.startsWith("mvquizchapter:")) {
    const [, chapterStr, langStr] = data.split(":");
    const chapter = chapterStr;
    const lang = langStr === "fi" ? "fi" : "en";
    const chatId = cq.message?.chat?.id;
    await quizBot.answerCallbackQuery(cq.id);
    if (!chatId) return;
    return mvQuizGenerator
      .startMultivalueQuiz(quizBot, chatId, `multiquiz chapter ${chapter}`, askWhichChapterMv, lang, makeQuizHooks(chatId, cbUserId, lang))
      .catch((e) => console.error("mvQuizGenerator.startMultivalueQuiz (chapter pick) crashed:", e.message));
  }

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
      .startQuiz(quizBot, chatId, `quiz me on chapter ${chapter}`, askWhichChapter, lang, makeQuizHooks(chatId, cbUserId, lang))
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
  const videoStatus = VIDEO_DB && VIDEO_DB.all().length > 0 ? "✓" : "⚠";
  const hwStatus = HOMEWORK_PROBLEMS_COURSE_MISMATCH ? "⚠ COURSE MISMATCH" : "✓";
  const glossaryStatus = corpusLoader.glossaryCourseMismatch() ? "⚠ COURSE MISMATCH" : "✓";
  console.log(
    `FYS.240 Optics bot v${BOT_VERSION} listening on port ${PORT} | model=${MODEL} | cache=${CACHE_TTL} | ` +
    `Math=Unicode | Videos=${videoStatus} | Homework=${hwStatus} | Glossary=${glossaryStatus}`
  );
});
