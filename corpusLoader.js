/**
 * corpusLoader.js — FYS.240 Optics
 * ---------------------------------
 * Chapter- and section-tagged access into course_corpus.txt.
 *
 * REWRITTEN for the FYS.240 corpus built by build_corpus.js directly from
 * the .tex lecture-slide sources (see that file). This replaces the
 * earlier version of corpusLoader.js, which indexed the FYS.501 Laser
 * Physics corpus (chapters 1-4, built from a mix of PDF-extracted textbook
 * chapters and lecture slides in two different heading-numbering
 * conventions). None of that applies here:
 *
 *   - FYS.240 covers chapters 2-10, sections 2.1 through 10.13 (61 sections
 *     total), not chapters 1-4.
 *   - The corpus is built straight from .tex sources, not PDF text
 *     extraction, so headings are always plain ASCII digits — there's no
 *     Unicode math-digit fallback to handle (contrast the old file's
 *     MATH_DIGIT/digitClass/normalizeHeadingNumber machinery, all removed).
 *   - There's no separate "textbook chapter" vs "lecture slides" split.
 *     Each section is ONE unified block, e.g.:
 *       ### 2.1 Electromagnetic waves (EN) ###
 *       ...content...
 *       ### 2.1 Sähkömagneettiset Aallot (FI) ###
 *       ...content...
 *     so there's also no getTextbookChapterBlock()/getSlidesBlock() split
 *     to maintain — one flat heading index covers everything.
 *   - The course (and its students) are bilingual, so getCorpusSection()
 *     takes an opts.lang ('en' | 'fi' | 'both', default 'en') that the old
 *     file had no equivalent for.
 *
 * SECTION_INDEX below is the canonical chapter/section list, generated
 * from the booklet's table of contents (English titles) and the Finnish
 * lecture-slide deck's mini-TOCs (Finnish titles) — see titles_en.json /
 * titles_fi.json alongside build_corpus.js. Section 7.4/7.5 is a known
 * quirk: the English lecture slides split "Superposition of several
 * frequencies and coherence" into two files (7.4, 7.5); the Finnish slides
 * (and the textbook) never split it. SECTION_INDEX lists 7.5 as its own
 * English section ("Coherence") with a Finnish title borrowed from 7.4,
 * matching how build_corpus.js and build_terminology.js already handle it
 * (see course_corpus.txt's own note on this at 7.5 (FI)).
 *
 * The public API (getCorpusSection, listChapters, listSections,
 * getChapterTitle, getSectionTitle, isValidSection, corpusLooksHealthy,
 * glossaryLooksHealthy, findGlossaryTerms) is unchanged from the FYS.501
 * version, so existing call sites (quizGenerator.js, bot.js-style /define
 * and quiz-picker code) work as-is if ported over to bot_fys240.js. New,
 * additive-only exports: getChapterTitleFi, getSectionTitleFi, and the
 * opts.lang option on getCorpusSection.
 */

const fs = require('fs');
const path = require('path');

const CORPUS_PATH = path.join(__dirname, 'course_corpus.txt');

// terminology.json is built offline by build_terminology.js (harvested from
// the \CDAlert/\Alert/\CUAlert/\UAlert-marked English .tex sources) and
// committed alongside the corpus. It backs the /define command in the bot.
const TERMINOLOGY_PATH = path.join(__dirname, 'terminology.json');

// Default cap on how much text getCorpusSection() returns, to keep LLM
// prompts (and eyeballing during quiz-bank-build runs) reasonably sized.
// Bumped up from the FYS.501 defaults (9000 / 14000): FYS.240 chapters run
// up to 13 sections each (vs. at most 6 for the laser course), so the old
// per-chapter cap would truncate each section down to almost nothing.
const DEFAULT_MAX_CHARS = 9000;
const DEFAULT_MAX_CHARS_CHAPTER = 22000;

// ---------- canonical chapter/section index ----------

const SECTION_INDEX = {
  2: {
    title: 'Descriptions of light',
    titleFi: 'Valon Matemaattinen kuvaaminen',
    sections: {
      '2.1': 'Electromagnetic waves',
      '2.2': 'Rays',
      '2.3': 'Particles',
    },
    sectionsFi: {
      '2.1': 'Sähkömagneettiset Aallot',
      '2.2': 'Säteet',
      '2.3': 'Hiukkaset',
    },
  },
  3: {
    title: 'Wave motion',
    titleFi: 'Aaltoliike',
    sections: {
      '3.1': 'Moving perturbation',
      '3.2': 'Wave equation',
      '3.3': 'Harmonic waves',
      '3.4': 'Phase and phase velocity',
      '3.5': 'Superposition principle',
      '3.6': 'Complex representation of waves',
      '3.7': 'Plane waves',
      '3.8': 'Wave equation in three dimensions',
      '3.9': 'Spherical and cylindrical waves',
      '3.10': 'Vector waves and Polarization of Light',
      '3.11': 'Tutorial on vector calculus',
      '3.12': 'Electrostatic approximation',
    },
    sectionsFi: {
      '3.1': 'Liikkuva Häiriö',
      '3.2': 'Aaltoyhtälö',
      '3.3': 'Harmoniset Aallot',
      '3.4': 'Vaihe ja Vaihenopeus',
      '3.5': 'Superpositioperiaate',
      '3.6': 'Aaltojen Kompleksinen Esitys',
      '3.7': 'Tasoaallot',
      '3.8': 'Aaltoyhtälö Kolmessa Ulottuvuudessa',
      '3.9': 'Pallo- ja Sylinteriaallot',
      '3.10': 'Vektorikentät',
      '3.11': 'Vektorianalyysin Perusteet',
      '3.12': 'Sähköstatiikka ja Sähköstaattiset Potentiaalit',
    },
  },
  4: {
    title: 'Electromagnetic waves',
    titleFi: 'Sähkömagneettiset Aallot',
    sections: {
      '4.1': 'Microscopic Maxwell’s equations',
      '4.2': 'Transverse waves and charge conservation',
      '4.3': 'Energy of electromagnetic field',
      '4.4': 'Radiation pressure and momentum',
      '4.5': 'Dipole radiation',
      '4.6': 'Light in matter (macroscopic Maxwell’s equations)',
    },
    sectionsFi: {
      '4.1': 'Mikroskooppiset Maxwellin Yhtälöt',
      '4.2': 'Poikittainen Aaltoliike ja Varauksen Säilyminen',
      '4.3': 'Sähkömagneettisen Kentän Energia',
      '4.4': 'Säteilypaine ja Liikemäärä',
      '4.5': 'Dipolikenttä',
      '4.6': 'Maxwellin Yhtälöt Väliaineessa',
    },
  },
  5: {
    title: 'Light–matter interaction',
    titleFi: 'Valon ja Aineen Vuorovaikutus',
    sections: {
      '5.1': 'Radiation from atoms and molecules',
      '5.2': 'Basic light–matter interactions',
      '5.3': 'Lorentz model of an atom',
      '5.4': 'Laser principle',
    },
    sectionsFi: {
      '5.1': 'Atomien ja Molekyylien Säteily',
      '5.2': 'Valon ja Aineen Vuorovaikutus',
      '5.3': 'Lorentzin Atomimalli',
      '5.4': 'Laserin Toimintaperiaate',
    },
  },
  6: {
    title: 'Propagation',
    titleFi: 'Valon eteneminen',
    sections: {
      '6.1': 'Wave fronts and rays',
      '6.2': 'Phenomenology of transmission and reflection',
      '6.3': 'Electromagnetic theory of reflection and refraction',
      '6.4': 'Fresnel coefficients',
      '6.5': 'Reflectivity and transmissivity',
      '6.6': 'Total internal reflection',
    },
    sectionsFi: {
      '6.1': 'Aaltorintamat ja säteet',
      '6.2': 'Läpäisy ja heijastus ilmiöinä',
      '6.3': 'Läpäisyn ja heijastuksen SMG-teoria',
      '6.4': 'Fresnelin kertoimet',
      '6.5': 'Heijastavuus ja läpäisevyys',
      '6.6': 'Kokonaisheijastus',
    },
  },
  7: {
    title: 'Superposition',
    titleFi: 'Superpositio',
    sections: {
      '7.1': 'Superposition principle',
      '7.2': 'Harmonic waves',
      '7.3': 'Standing waves',
      '7.4': 'Superposition of several frequencies and coherence',
      '7.5': 'Coherence',
    },
    sectionsFi: {
      '7.1': 'Superpositioperiaate',
      '7.2': 'Harmoniset aallot',
      '7.3': 'Seisovat aallot',
      '7.4': 'Usean aallon superpositio ja koherenssi',
      '7.5': 'Usean aallon superpositio ja koherenssi',
    },
  },
  8: {
    title: 'Interference',
    titleFi: 'Interferenssi',
    sections: {
      '8.1': 'Conditions for interference',
      '8.2': 'Wavefront splitting interferometers',
      '8.3': 'Amplitude-splitting interferometers',
      '8.4': 'Michelson interferometer',
      '8.5': 'Multiple-beam interference',
      '8.6': 'Fabry–Pérot instruments',
      '8.7': 'Fabry–Pérot spectroscopy',
    },
    sectionsFi: {
      '8.1': 'Vaatimukset interferenssille',
      '8.2': 'Aaltorintaman jakavat interferometrit',
      '8.3': 'Amplitudin jakavat interferometrit',
      '8.4': 'Michelsonin interferometri',
      '8.5': 'Usean säteen interferenssi',
      '8.6': 'Fabryn-Perot’n instrumentit',
      '8.7': 'Fabryn-Perot’n spektroskopia',
    },
  },
  9: {
    title: 'Diffraction',
    titleFi: 'Diffraktio',
    sections: {
      '9.1': 'Basic theory',
      '9.2': 'Fraunhofer diffraction',
      '9.3': 'Diffraction from basic aperture shapes',
      '9.4': 'Diffraction from multiple slits',
      '9.5': 'Diffraction gratings',
    },
    sectionsFi: {
      '9.1': 'Diffraktio-ilmiön matemaattinen malli',
      '9.2': 'Fraunhoferin diffraktio',
      '9.3': 'Yksinkertaisten aukkojen aiheuttama diffraktio',
      '9.4': 'Usean aukon aiheuttama diffraktio',
      '9.5': 'Diffraktiohilat',
    },
  },
  10: {
    title: 'Geometrical optics',
    titleFi: 'Geometrinen optiikka',
    sections: {
      '10.1': 'Basic definitions',
      '10.2': 'Refraction at a spherical surface',
      '10.3': 'Thin lenses',
      '10.4': 'Image formation',
      '10.5': 'Combinations of lenses',
      '10.6': 'Apertures and stops',
      '10.7': 'Mirrors',
      '10.8': 'Prisms',
      '10.9': 'The human eye',
      '10.10': 'Magnifying glass',
      '10.11': 'Eyepiece (ocular)',
      '10.12': 'Microscope',
      '10.13': 'Telescope',
    },
    sectionsFi: {
      '10.1': 'Perusmääritelmät',
      '10.2': 'Taittuminen pallopinnalla',
      '10.3': 'Ohut linssi',
      '10.4': 'Kuvanmuodostus',
      '10.5': 'Linssisysteemit',
      '10.6': 'Aukot ja rajoittimet',
      '10.7': 'Peili',
      '10.8': 'Prisma',
      '10.9': 'Ihmissilmä',
      '10.10': 'Suurennuslasi',
      '10.11': 'Okulaari',
      '10.12': 'Mikroskooppi',
      '10.13': 'Kaukoputki',
    },
  },
};

// ---------- corpus loading (cached) ----------

let _corpusText = null;
let _corpusMtimeMs = null;

function loadCorpus({ forceReload = false } = {}) {
  if (_corpusText !== null && !forceReload) return _corpusText;
  let stat;
  try {
    stat = fs.statSync(CORPUS_PATH);
    _corpusText = fs.readFileSync(CORPUS_PATH, 'utf8');
    _corpusMtimeMs = stat.mtimeMs;
  } catch (e) {
    _corpusText = null;
    _corpusMtimeMs = null;
    throw new Error(`corpusLoader: could not read ${CORPUS_PATH}: ${e.message}`);
  }
  _headingIndexCache = null; // invalidate on (re)load
  return _corpusText;
}

function corpusLooksHealthy() {
  try {
    const text = loadCorpus();
    return typeof text === 'string' && text.length > 1000;
  } catch (e) {
    return false;
  }
}

// ---------- heading index ----------
//
// Every section in course_corpus.txt is introduced by a heading line of the
// exact form build_corpus.js emits:
//   ### 2.1 Electromagnetic waves (EN) ###
//   ### 2.1 Sähkömagneettiset Aallot (FI) ###
// on its own line. This scans the WHOLE corpus once and builds a flat list
// of { chapter, section, lang, title, contentStart, contentEnd }, replacing
// the old file's separate textbook-block/slides-block/HEADING_RE machinery
// — there's only one kind of block now, so one index covers it.
const HEADING_RE = /^### (\d+)\.(\d+) (.+?) \((EN|FI)\) ###$/gm;

let _headingIndexCache = null;

function buildHeadingIndex(corpusText) {
  const matches = [...corpusText.matchAll(HEADING_RE)];
  const headings = matches.map((m) => ({
    chapter: Number(m[1]),
    section: `${m[1]}.${m[2]}`,
    title: m[3],
    lang: m[4].toLowerCase(),
    index: m.index,
    contentStart: m.index + m[0].length,
  }));
  for (let i = 0; i < headings.length; i++) {
    headings[i].contentEnd = i + 1 < headings.length ? headings[i + 1].index : corpusText.length;
  }
  return headings;
}

function getHeadingIndex() {
  if (_headingIndexCache) return _headingIndexCache;
  const corpusText = loadCorpus();
  _headingIndexCache = buildHeadingIndex(corpusText);
  return _headingIndexCache;
}

// Strips the outer "===== BEGIN/END CHAPTER ... =====" markers that can
// otherwise get swept into a section's content — they sit between one
// section's heading and the next, so whichever section happens to be last
// in its chapter (or, like 7.5 FI, has no real content of its own) would
// otherwise have the chapter boundary marker text appended to its excerpt.
function stripChapterMarkers(text) {
  return text.replace(/^===== (BEGIN|END) CHAPTER.*=====$/gm, '').trim();
}

// Returns the trimmed content for one (section, lang) heading, or null if
// no such heading exists (e.g. a typo'd section number).
function extractSectionLang(corpusText, headings, section, lang) {
  const h = headings.find((x) => x.section === section && x.lang === lang);
  if (!h) return null;
  const chunk = stripChapterMarkers(corpusText.slice(h.contentStart, h.contentEnd));
  return chunk || null;
}

function resolveLangs(optLang) {
  const l = (optLang || 'en').toLowerCase();
  if (l === 'both') return ['en', 'fi'];
  if (l === 'fi') return ['fi'];
  return ['en'];
}

// Builds the part(s) for one section across the requested language(s). For
// 'both', each language's content is labelled so a multi-language excerpt
// doesn't read as one undifferentiated blob.
function sectionParts(corpusText, headings, section, langs) {
  const parts = [];
  for (const lang of langs) {
    const text = extractSectionLang(corpusText, headings, section, lang);
    if (!text) continue;
    parts.push(langs.length > 1 ? `[${lang.toUpperCase()}]\n${text}` : text);
  }
  return parts;
}

// ---------- balanced multi-part truncation ----------

// Truncates a list of text parts to fit within `maxChars` total, splitting
// the budget so no single part can starve the others out entirely (which is
// what a naive join-then-slice(0, maxChars) does when the first part alone
// exceeds maxChars). Parts that fit within an equal share keep their full
// text; the leftover budget from those is redistributed to the parts that
// still need it, so a short part never wastes budget and a long part never
// hogs it beyond what the others actually need.
function truncateBalanced(parts, maxChars) {
  const nonEmpty = parts.filter(Boolean);
  if (nonEmpty.length === 0) return '';
  if (nonEmpty.length === 1) {
    const p = nonEmpty[0];
    return p.length > maxChars ? p.slice(0, maxChars) + '\n\n[...excerpt truncated...]' : p;
  }

  const SEP = '\n\n';
  let budget = maxChars - SEP.length * (nonEmpty.length - 1);
  const shares = new Array(nonEmpty.length).fill(0);
  const active = nonEmpty.map((_, i) => i);

  while (active.length > 0) {
    const per = Math.floor(budget / active.length);
    const satisfied = active.filter((i) => nonEmpty[i].length <= per);
    if (satisfied.length === 0) {
      // No remaining part fits within an equal share of what's left —
      // split the rest evenly among them.
      active.forEach((i) => { shares[i] = per; });
      break;
    }
    satisfied.forEach((i) => {
      shares[i] = nonEmpty[i].length;
      budget -= nonEmpty[i].length;
    });
    satisfied.forEach((i) => active.splice(active.indexOf(i), 1));
  }

  return nonEmpty
    .map((p, i) => (p.length <= shares[i] ? p : p.slice(0, shares[i]) + '\n\n[...truncated...]'))
    .join(SEP);
}

// ---------- glossary (terminology.json) ----------

let _glossary = null;

function loadGlossary({ forceReload = false } = {}) {
  if (_glossary !== null && !forceReload) return _glossary;
  try {
    const raw = fs.readFileSync(TERMINOLOGY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    _glossary = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error(`corpusLoader: could not read/parse ${TERMINOLOGY_PATH}: ${e.message}`);
    _glossary = [];
  }
  return _glossary;
}

function glossaryLooksHealthy() {
  const g = loadGlossary();
  return Array.isArray(g) && g.length > 50;
}

function normalizeTerm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Looks up a student-typed term against the glossary. Ranks exact
// normalized matches first, then prefix/substring matches either
// direction (so "population inversion" matches a query of just
// "inversion", and "gain" matches an entry titled "gain saturation").
function findGlossaryTerms(query, limit = 3) {
  const glossary = loadGlossary();
  const q = normalizeTerm(query);
  if (!q || !glossary.length) return [];

  const exact = [];
  const starts = [];
  const includes = [];

  for (const entry of glossary) {
    const termNorm = normalizeTerm(entry.term);
    if (!termNorm) continue;
    if (termNorm === q) {
      exact.push(entry);
    } else if (termNorm.startsWith(q) || q.startsWith(termNorm)) {
      starts.push(entry);
    } else if (termNorm.includes(q) || q.includes(termNorm)) {
      includes.push(entry);
    }
  }

  return [...exact, ...starts, ...includes].slice(0, limit);
}

// ---------- public API ----------

/**
 * Returns a text excerpt for a chapter (optionally narrowed to one
 * section), in the requested language(s). Throws only if the corpus file
 * itself can't be read or the chapter/section number is invalid — a
 * missing heading for an otherwise-valid section (e.g. 7.5 in Finnish,
 * which has no standalone recording — see the module doc comment) falls
 * back gracefully rather than throwing.
 *
 * When the excerpt would exceed the char cap, parts are truncated via a
 * balanced budget split (truncateBalanced) rather than concatenating first
 * and slicing from the front — otherwise one long section/language could
 * consume the entire cap before the rest is ever appended.
 *
 * @param {number|string} chapter - 2-10
 * @param {string} [section] - e.g. "10.3"; omit for the whole chapter
 * @param {object} [opts]
 * @param {number} [opts.maxChars] - truncate the returned excerpt
 * @param {'en'|'fi'|'both'} [opts.lang] - which language(s) to return; default 'en'
 * @returns {string}
 */
function getCorpusSection(chapter, section, opts = {}) {
  const chapterNum = parseInt(chapter, 10);
  if (!SECTION_INDEX[chapterNum]) {
    throw new Error(`corpusLoader: unknown chapter "${chapter}" (expected 2-10)`);
  }
  if (section && !SECTION_INDEX[chapterNum].sections[section]) {
    throw new Error(`corpusLoader: unknown section "${section}" for chapter ${chapterNum}`);
  }

  const corpusText = loadCorpus(); // throws if unreadable
  const headings = getHeadingIndex();
  const langs = resolveLangs(opts.lang);

  if (!headings.length) {
    throw new Error(
      `corpusLoader: no section headings found in course_corpus.txt ` +
      `(corpus may be stale or malformed — try re-running build_corpus.js)`
    );
  }

  if (!section) {
    // Whole chapter: every known section's content, in section order, for
    // each requested language. Each part gets a fair share of the char
    // budget (truncateBalanced) rather than the first section eating the
    // whole cap.
    const maxChars = opts.maxChars || DEFAULT_MAX_CHARS_CHAPTER;
    const parts = listSections(chapterNum).flatMap((sec) => sectionParts(corpusText, headings, sec, langs));
    if (!parts.length) {
      throw new Error(
        `corpusLoader: could not locate any content for chapter ${chapterNum} in course_corpus.txt ` +
        `(corpus may be stale or malformed — try re-running build_corpus.js)`
      );
    }
    return truncateBalanced(parts, maxChars);
  }

  const maxChars = opts.maxChars || DEFAULT_MAX_CHARS;
  const parts = sectionParts(corpusText, headings, section, langs);

  if (parts.length) {
    return truncateBalanced(parts, maxChars);
  }

  console.warn(
    `corpusLoader: no heading match for section ${section} (lang: ${langs.join(',')}) ` +
    `— falling back to the whole chapter ${chapterNum} excerpt`
  );
  const chapterParts = listSections(chapterNum).flatMap((sec) => sectionParts(corpusText, headings, sec, langs));
  return truncateBalanced(chapterParts, maxChars);
}

function listChapters() {
  return Object.keys(SECTION_INDEX).map(Number).sort((a, b) => a - b);
}

function listSections(chapter) {
  const entry = SECTION_INDEX[parseInt(chapter, 10)];
  if (!entry) return [];
  return Object.keys(entry.sections).sort((a, b) => {
    const [as] = a.split('.').slice(1).map(Number);
    const [bs] = b.split('.').slice(1).map(Number);
    return as - bs;
  });
}

function getChapterTitle(chapter) {
  return SECTION_INDEX[parseInt(chapter, 10)]?.title || null;
}

function getChapterTitleFi(chapter) {
  return SECTION_INDEX[parseInt(chapter, 10)]?.titleFi || null;
}

function getSectionTitle(chapter, section) {
  return SECTION_INDEX[parseInt(chapter, 10)]?.sections?.[section] || null;
}

function getSectionTitleFi(chapter, section) {
  return SECTION_INDEX[parseInt(chapter, 10)]?.sectionsFi?.[section] || null;
}

function isValidSection(chapter, section) {
  return Boolean(SECTION_INDEX[parseInt(chapter, 10)]?.sections?.[section]);
}

module.exports = {
  getCorpusSection,
  listChapters,
  listSections,
  getChapterTitle,
  getSectionTitle,
  isValidSection,
  corpusLooksHealthy,
  SECTION_INDEX,
  // additive vs. the FYS.501 version — Finnish titles + language selection
  getChapterTitleFi,
  getSectionTitleFi,
  // glossary / /define command
  glossaryLooksHealthy,
  findGlossaryTerms,
  // exposed mainly for tests / quiz-bank-build diagnostics
  _loadCorpus: loadCorpus,
  _loadGlossary: loadGlossary,
  _getHeadingIndex: getHeadingIndex,
};
