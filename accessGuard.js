'use strict';
/**
 * accessGuard.js - thin helpers used from bot_fys240.js. Student-facing texts live here.
 *
 * Access model (v2.7.1): the bot is OPEN by default. Commands, lecture links, /define, /HWQ and
 * quizzes served from the question bank work for everyone. Only the AI-backed features (free-text
 * answers, /HW hints, quizzes that need live generation) require course-channel membership — see
 * requireMember() / isMember() and the 'not_member' denial reason below.
 *
 * Every helper takes an optional trailing `lang` ("en" | "fi"). bot_fys240.js passes the same
 * language it uses for its other deterministic replies (getLang(message)); anything that is not
 * "fi" falls back to English.
 */
const { isCourseMember } = require('./membership');
const limiter = require('./usageLimiter');

const TEXT = {
  en: {
    notMember:
      'AI answers are for FYS.240 course members. Please join the course channel, then ask again. ' +
      'Commands, lecture links and quizzes work for everyone in the meantime.',

    userLimit:
      "You've used today's AI-assistant allowance. It resets at midnight (Finnish time). " +
      'Lecture links, commands and ready-made quizzes still work in the meantime.',

    backstop:
      'The assistant has reached its shared daily capacity, so AI answers are paused until midnight ' +
      '(Finnish time). Lecture links, commands and ready-made quizzes still work. Sorry for the inconvenience - please try again tomorrow.',

    lowRemaining: (n) => `ℹ️ ${n} AI answer${n === 1 ? '' : 's'} left today.`,
    usage: (used, limit) => `Today you have used ${used} of ${limit} AI credits. Resets at midnight (Finnish time).`,
    usageAdmin: 'Admin: no limits apply to you.',
  },
  fi: {
    notMember:
      'Tekoälyvastaukset on tarkoitettu FYS.240-kurssin jäsenille. Liity kurssin kanavalle ja kysy sitten uudelleen. ' +
      'Komennot, luentolinkit ja visat toimivat kaikille sillä välin.',

    userLimit:
      'Olet käyttänyt tämänpäiväisen tekoälyavustajan kiintiösi. Se nollautuu keskiyöllä (Suomen aikaa). ' +
      'Luentolinkit, komennot ja valmiit visat toimivat sillä välin.',

    backstop:
      'Avustajan yhteinen päiväkiintiö on täynnä, joten tekoälyvastaukset ovat tauolla keskiyöhön (Suomen aikaa) asti. ' +
      'Luentolinkit, komennot ja valmiit visat toimivat silti. Pahoittelut häiriöstä - yritä huomenna uudelleen.',

    lowRemaining: (n) => `ℹ️ ${n} tekoälyvastaus${n === 1 ? '' : 'ta'} jäljellä tänään.`,
    usage: (used, limit) => `Tänään olet käyttänyt ${used}/${limit} tekoälykrediittiä. Nollautuu keskiyöllä (Suomen aikaa).`,
    usageAdmin: 'Ylläpitäjä: sinuun ei sovelleta rajoja.',
  },
};

function t(lang) {
  return TEXT[lang] || TEXT.en;
}

// Kept for backward compatibility with the original (English-only) guard.
const MSG = TEXT.en;

/** Silent membership check (no message sent). Admins and "gate off" (COURSE_CHANNEL_ID unset) pass. */
async function isMember(bot, userId) {
  return isCourseMember(bot, userId);
}

/**
 * Members-only gate for AI-backed features: returns true if allowed, otherwise tells the student
 * how to get access and returns false. Call it BEFORE reserving credits, right at the point a
 * Claude call would start — not at the top of every handler (the free features are for everyone).
 */
async function requireMember(bot, chatId, userId, lang = 'en') {
  if (await isMember(bot, userId)) return true;
  await bot.sendMessage(chatId, t(lang).notMember);
  return false;
}

/** The student-facing text for a failed reservation (reason: 'not_member' | 'backstop' | 'user_limit'). */
function denialText(reservation, lang = 'en') {
  const reason = reservation && reservation.reason;
  if (reason === 'not_member') return t(lang).notMember;
  if (reason === 'backstop') return t(lang).backstop;
  return t(lang).userLimit;
}

/** Tell the student why a reservation was refused. */
async function notifyDenied(bot, chatId, reservation, lang = 'en') {
  await bot.sendMessage(chatId, denialText(reservation, lang));
}

/**
 * Call right before an LLM-backed action (Q&A answers, /HW hints, quizzes that need live generation).
 * Returns the reservation; if reservation.ok is false the student was already notified.
 */
async function requireLLMBudget(bot, chatId, userId, kind = 'chat', lang = 'en') {
  const r = limiter.reserve(userId, kind);
  if (!r.ok) await notifyDenied(bot, chatId, r, lang);
  return r;
}

/** Optional "running low" note after a successful answer. */
async function maybeWarnLow(bot, chatId, reservation, lang = 'en') {
  if (reservation && reservation.ok && !reservation.admin && reservation.remaining <= 2 && reservation.remaining >= 0) {
    await bot.sendMessage(chatId, t(lang).lowRemaining(reservation.remaining));
  }
}

/** Text for a /usage command (free, no LLM). */
function usageText(userId, lang = 'en') {
  const s = limiter.userStatus(userId);
  return s.admin ? t(lang).usageAdmin : t(lang).usage(s.used, s.limit);
}

/** Call when the LLM call failed, so the student is not charged. */
function refundLLM(userId, reservation) {
  if (reservation && reservation.ok) limiter.refund(userId, reservation.cost);
}

module.exports = {
  isMember,
  requireMember,
  requireLLMBudget,
  maybeWarnLow,
  usageText,
  refundLLM,
  denialText,
  notifyDenied,
  MSG,
  TEXT,
};
