# Student usage caps & access control (v2.7.1)

New files: `usageLimiter.js`, `accessGuard.js`, `membership.js` (ported from the FYS.501 bot).
All settings are **optional** Railway variables — with none set the bot runs with the defaults below.

| Variable | Default | Meaning |
|---|---|---|
| `STUDENT_LLM_DAILY_USAGE` | `10` | AI credits per student per day |
| `DAILY_BACKSTOP_EUR` | `5` | Shared estimated spend cap per day (`0` = off) |
| `USD_TO_EUR` | `0.9` | Conversion used for the estimate |
| `LLM_WEIGHT_CHAT` | `1` | Credits for a Q&A answer or `/HW3.2`-style hint |
| `LLM_WEIGHT_QUIZ` | `1` | Credits for a quiz that needs live AI generation |
| `ADMIN_USER_IDS` | – | Comma-separated Telegram IDs exempt from limits and the membership gate |
| `LIMIT_TIMEZONE` | `Europe/Helsinki` | Day boundary (counters reset at local midnight) |
| `PRICING_JSON` | – | Override prices, e.g. `{"haiku":{"in":1,"out":5}}` (USD per million tokens) |
| `COURSE_CHANNEL_ID` | – | Course channel/group chat ID, e.g. `-1001234567890`. Only **AI features** require membership. **If unset, everyone counts as a member.** The bot must be in the chat (admin is safest) |
| `MEMBERSHIP_CACHE_SECONDS` | `300` | How long a membership answer is cached |
| `MEMBERSHIP_FAIL_OPEN` | `false` | `true` = let people in when Telegram can't be reached |

## Who can use what
The bot is **open**: everything that doesn't call Claude works for everyone, members or not — `/help`, `/topics`, `/weekN`, `/define`, `/HWQ`, `/HW3` (overview), `/usage`, `/reset`, and quizzes served from the question bank (including the chapter-picker buttons).

**Course members only** (membership of `COURSE_CHANNEL_ID`): free-text AI answers, `/HW3.2` / `/HW_hint3.2` hints, and quizzes that need live AI generation. A non-member asking for these is told how to get access and is never charged. A non-member asking for a bigger quiz than the bank holds gets the bank's questions plus a note that extra AI questions are for members.

Membership is only looked up when one of these AI actions is attempted (cached `MEMBERSHIP_CACHE_SECONDS`), so open features never call Telegram's `getChatMember`.

## What costs a credit
- Free-text questions to the assistant, and `/HW3.2`, `/HW_hint3.2`, `/HW3` when no stored problem text exists: **1 credit** (refunded if the Claude call fails).
- `/quiz`, `/mvquiz` and "quiz me…": **free when served from the question bank**; **1 credit only when a live generation is needed** (refunded on failure). If the limit blocks generation, the student still gets whatever the bank had, with a note.
- Free: `/help`, `/topics`, `/weekN`, `/define`, `/HWQ`, `/usage`, `/reset`, bank-served quizzes.

## Notes
- Counters live in memory → they reset on every redeploy/restart. Treat this as a soft guard; the monthly spend limit in the Anthropic Console is the hard stop.
- Every Claude call (chat and quiz generation, admins included) feeds the shared spend estimate. `/healthz` shows the limiter status (`limiter`, `membershipGate`).
- Optional BotFather `/setcommands` entries: `quiz - Multiple-choice quiz (e.g. /quiz 2.3)`, `mvquiz - Select-all-that-apply quiz`, `usage - Your AI credits today`.
