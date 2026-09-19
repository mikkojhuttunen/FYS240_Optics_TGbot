#!/usr/bin/env node
/**
 * harvest_terminology.js — builds terminology.json from the \CDAlert /
 * \Alert-highlighted terms already present in the 61 canonical FYS.240
 * lecture .tex files, using clean.js's cleanTexMarked()/stripTermMarkers()
 * (built for exactly this purpose, but previously unused — nothing in the
 * project actually called it before this script).
 *
 * Usage: node harvest_terminology.js <lecturesDir> <chapterFileMap.json> <outPath>
 */

const fs = require('fs');
const path = require('path');
const { cleanTexMarked, stripTermMarkers, unwrapTwoArgMacro, TERM_OPEN, TERM_CLOSE } = require('./clean.js');
const VIDEO_DB = require('../fys240_videos.js');

const lecturesDir = process.argv[2] || './lectures';
const mapPath = process.argv[3] || './chapter_file_map.json';
const outPath = process.argv[4] || './terminology.json';

const chapterFileMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

function chapterSortKey(ch) {
  const [maj, min] = ch.split('.').map(Number);
  return maj * 1000 + (min || 0);
}
const orderedChapters = Object.keys(chapterFileMap).sort((a, b) => chapterSortKey(a) - chapterSortKey(b));

function normalizeTerm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// clean.js's convertHighlightMacros only expects ONE brace argument on
// \CDAlert/\Alert (\CDAlert[color]{term}), but many of these slides use a
// second brace argument as a hyperlink target: \CDAlert[color]{term}{url}.
// Left alone, that second argument's braces get stripped later while its
// URL text survives, gluing straight onto the end of the term with no
// separator (e.g. "Elliptical polarizationhttps://commons.wikimedia.org/...").
// Drops that second argument entirely using matchBrace (imported from
// clean.js) so nesting inside either argument is handled correctly.
function stripHighlightMacroSecondArg(text) {
  const { matchBrace } = require('./clean.js');
  let out = text;
  const re = /\\(CDAlert|Alert)(\[[^\]\n]*\])?\{/g;
  let m;
  while ((m = re.exec(out))) {
    const open1 = m.index + m[0].length - 1;
    const close1 = matchBrace(out, open1);
    if (close1 === -1) { re.lastIndex = m.index + m[0].length; continue; }
    let pos = close1 + 1;
    if (out[pos] === '{') {
      const close2 = matchBrace(out, pos);
      if (close2 !== -1) {
        out = out.slice(0, pos) + out.slice(close2 + 1);
      }
    }
    re.lastIndex = close1 + 1;
  }
  return out;
}

// Preprocessing clean.js doesn't do, needed specifically for these slides:
// - \CDAlert/\Alert's optional second {url} argument (see above)
// - \href{url}{label} (external citations, e.g. Wikipedia links in slide
//   notes) — clean.js only handles \hyperlink (internal), not \href, so an
//   \href's URL was leaking directly against its label with no separator.
// - "\\[<spacing>]" — a line-break with an explicit vertical-spacing
//   argument (\\[-4mm]), common in tabular/array layouts — clean.js's
//   line-break handling only expects a bare "\\", so the bracket argument
//   was surviving as literal leaked text.
function preprocess(raw) {
  let out = stripHighlightMacroSecondArg(raw);
  out = unwrapTwoArgMacro(out, 'href', 2);
  out = out.replace(/\\\\\[[^\]]*\]/g, '\n');
  // "\\}" (a line-break token immediately followed by an unescaped closing
  // brace, e.g. "...\gg \lambda$)\\}") gets misread by clean.js's own
  // unescapeChars: its "\}" -> literal-brace-placeholder regex doesn't
  // check backslash parity the way stripComments does for "%", so it
  // matches the SECOND backslash + brace as an escaped-brace pair,
  // orphaning the first backslash (found via inspection: produced a
  // stray "\❵" in one entry's context). Inserting a space breaks the
  // adjacency the flawed regex relies on, without changing meaning.
  out = out.replace(/\\\\\}/g, '\\\\ }');
  return out;
}

// Reassembles cleaned, marked text into logical bullet/paragraph units,
// joining any physically-wrapped source lines back into one continuous
// block (clean.js's whitespaceCleanup trims each line but does not merge
// lines a .tex author wrapped for readability — without this, a highlight
// near a mid-sentence line wrap would get a truncated "context" fragment).
function splitIntoBlocks(text) {
  const blocks = [];
  for (const para of text.split(/\n{2,}/)) {
    let current = '';
    for (const rawLine of para.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('•')) {
        if (current) blocks.push(current.trim());
        current = line.replace(/^•\s*/, '');
      } else {
        current = current ? current + ' ' + line : line;
      }
    }
    if (current) blocks.push(current.trim());
  }
  return blocks.filter(Boolean);
}

// A highlighted span in these slides is sometimes a genuine term/phrase
// ("Huygens--Fresnel principle") and sometimes an over-captured sentence
// fragment ("forget the existence of the B-field") — the source's own
// highlighting is for visual emphasis in a slide, not glossary curation,
// so this filters toward the former. Rejects: fragments opening with a
// common verb/pronoun/conjunction (real physics terms essentially never
// do), anything longer than 6 words (an actual term/phrase, not a clause),
// and anything without enough letters to be a real word/phrase (catches
// bare math notation like "(50 / 50)" or "X/R and Y/R").
const LEADING_STOPWORDS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'it', 'its', "it's",
  'forget', 'let', "let's", 'we', 'our', 'in', 'on', 'of', 'for', 'and',
  'or', 'to', 'is', 'are', 'was', 'were', 'has', 'have', 'had', 'if',
  'when', 'while', 'note', 'recall', 'consider', 'assume', 'since',
  'because', 'so', 'then', 'now', 'here', 'there', 'with', 'from', 'as',
  'can', 'will', 'would', 'should', 'i.e', 'e.g', 'becomes', 'through',
  'easier', 'all', 'notation', 'really', 'also', 'using', 'such', 'only',
  'some', 'many', 'most', 'much', 'more', 'less', 'very', 'just', 'even',
  'without', 'within', 'about', 'after', 'before', 'each', 'every',
]);
function isPlausibleTerm(rawTerm) {
  const words = rawTerm.split(/\s+/);
  if (words.length > 6) return false;
  if (LEADING_STOPWORDS.has(words[0].toLowerCase().replace(/[.,;:]+$/, ''))) return false;
  const letters = (rawTerm.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  if (letters < 3) return false;
  const opens = (rawTerm.match(/\(/g) || []).length;
  const closes = (rawTerm.match(/\)/g) || []).length;
  if (opens !== closes) return false; // catches broken/truncated math fragments
  return true;
}

const termRe = new RegExp(`${TERM_OPEN}(.*?)${TERM_CLOSE}`, 'g');

// key (normalized) -> accumulated entry data
const terms = new Map();
const report = [];

for (const chapter of orderedChapters) {
  const fname = chapterFileMap[chapter];
  const raw = preprocess(fs.readFileSync(path.join(lecturesDir, fname), 'utf8'));
  const marked = cleanTexMarked(raw);
  const blocks = splitIntoBlocks(marked);

  const video = (VIDEO_DB.getChapter(chapter) || [])[0];
  const lectureTitle = video ? `FYS.240 Optics ${chapter} — ${video.topic}` : `FYS.240 Optics ${chapter}`;
  const url = video ? video.url : null;

  let chapterHits = 0;

  for (const block of blocks) {
    if (!block.includes(TERM_OPEN)) continue;
    let m;
    termRe.lastIndex = 0;
    while ((m = termRe.exec(block))) {
      let rawTerm = m[1].trim().replace(/\s+/g, ' ');
      rawTerm = rawTerm.replace(/^[:.,;()\[\]\/\\]+|[:.,;()\[\]\/\\]+$/g, '').trim(); // trim stray leading/trailing punctuation
      if (!rawTerm || !isPlausibleTerm(rawTerm)) continue;

      const key = normalizeTerm(rawTerm);
      if (!key) continue;

      const context = stripTermMarkers(block);
      chapterHits++;

      if (!terms.has(key)) {
        terms.set(key, {
          term: rawTerm,
          introducedIn: chapter,
          introducedInTitle: lectureTitle,
          introducedInLecture: lectureTitle,
          url,
          context,
          revisitedIn: [],
          occurrenceCount: 1,
        });
      } else {
        const entry = terms.get(key);
        entry.occurrenceCount++;
        // Prefer a shorter display form of the term (e.g. "diffraction"
        // over "the diffraction pattern") if a later occurrence is more
        // concise, since it reads better as a glossary headword.
        if (rawTerm.length < entry.term.length) entry.term = rawTerm;
        if (chapter !== entry.introducedIn && !entry.revisitedIn.includes(chapter)) {
          entry.revisitedIn.push(chapter);
        }
      }
    }
  }
  report.push(`${chapter} (${fname}): ${chapterHits} highlighted-term occurrences`);
}

const result = [...terms.values()].sort((a, b) => a.term.localeCompare(b.term));

// Sort each entry's revisitedIn in course order for readability
for (const entry of result) {
  entry.revisitedIn.sort((a, b) => chapterSortKey(a) - chapterSortKey(b));
}

fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');

console.log(report.join('\n'));
console.log();
console.log(`✓ ${outPath}: ${result.length} unique terms harvested from ${orderedChapters.length} lectures`);
