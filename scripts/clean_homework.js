/**
 * clean_homework.js — turns raw HW<N>_Optics.tex exercise/solution content
 * into clean, flowing plain text with Unicode math.
 *
 * Reuses clean.js's tested low-level helpers (matchBrace, unwrapMacro,
 * stripComments, convertMathMacros, convertMathEnvAndDelimiters, etc. —
 * the same pipeline used for course_corpus.txt) and adds handling for the
 * extra macros these homework files use that the lecture-slide corpus
 * doesn't: \ExerciseNu/\SolutionNu extraction, the physics-package-style
 * macros (\vb, \vu, \pdv, \grad, \laplacian, \cross, \vdot, \rme, \rmi,
 * \rmd, \ii, \iint, ...), \newcommand/\renewcommand definitions, and the
 * \abc / \item[<label>] sub-part labeling conventions.
 */

const {
  matchBrace,
  unwrapMacro,
  removeEnvironment,
  stripComments,
  unescapeChars,
  dropStructuralMacros,
  removeFigures,
  convertMisc,
  convertHighlightMacros,
  convertMathMacros,
  convertMathEnvAndDelimiters,
  convertLists,
  stripStrayEnvironments,
  catchAll,
  whitespaceCleanup,
  GREEK,
  OPERATOR_WORDS,
} = require('./clean.js');

// ---------- \ExerciseNu{ID}{content} / \SolutionNu{ID}{content} extraction ----------

// Scans for \<macroName>{ID}{content} (two consecutive brace groups) and
// returns [{id, content}], using matchBrace so nested braces inside either
// group are handled correctly.
function extractTwoBraceMacro(text, macroName) {
  const results = [];
  const re = new RegExp(`\\\\${macroName}\\{`, 'g');
  let m;
  while ((m = re.exec(text))) {
    const idOpen = m.index + m[0].length - 1;
    const idClose = matchBrace(text, idOpen);
    if (idClose === -1) { re.lastIndex = m.index + m[0].length; continue; }
    const id = text.slice(idOpen + 1, idClose).trim();

    let contentOpen = idClose + 1;
    while (contentOpen < text.length && /\s/.test(text[contentOpen])) contentOpen++;
    if (text[contentOpen] !== '{') { re.lastIndex = idClose + 1; continue; }
    const contentClose = matchBrace(text, contentOpen);
    if (contentClose === -1) { re.lastIndex = contentOpen + 1; continue; }
    const content = text.slice(contentOpen + 1, contentClose);

    results.push({ id, content });
    re.lastIndex = contentClose + 1;
  }
  return results;
}

// ---------- \newcommand / \renewcommand definitions — drop entirely ----------
// These files locally (re)define a handful of macros (\pdiff, \Tav, \sij,
// \viiva, \dline, \e, \ii, \p, \sinc, ...) at the top of some files. None
// of their content belongs in the extracted question/solution text — we
// handle every macro they define directly (see substituteCustomMacros
// below) rather than expanding these definitions, so the definition
// constructs themselves are just noise to remove.
function stripCommandDefinitions(text) {
  const startRe = /\\(?:re)?newcommand\*?\s*/g;
  let out = '';
  let idx = 0;
  let m;
  while ((m = startRe.exec(text))) {
    out += text.slice(idx, m.index);
    let pos = m.index + m[0].length;

    // macro-name argument: either {\name} or bare \name
    if (text[pos] === '{') {
      const close = matchBrace(text, pos);
      pos = close === -1 ? pos + 1 : close + 1;
    } else {
      const nameMatch = text.slice(pos).match(/^\\[A-Za-z]+/);
      if (nameMatch) pos += nameMatch[0].length;
    }

    // optional [n] arg-count
    if (text[pos] === '[') {
      const closeIdx = text.indexOf(']', pos);
      if (closeIdx !== -1) pos = closeIdx + 1;
    }

    // definition body {...}
    while (pos < text.length && /\s/.test(text[pos])) pos++;
    if (text[pos] === '{') {
      const close = matchBrace(text, pos);
      pos = close === -1 ? pos + 1 : close + 1;
    }

    idx = pos;
    startRe.lastIndex = pos;
  }
  out += text.slice(idx);
  return out;
}

// ---------- robust \frac{...}{...} — tolerant of nested braces ----------
// clean.js's own \frac regex requires BOTH argument groups to contain no
// braces at all, which fails on the extremely common case of a superscript/
// subscript or \mathbf{} inside a fraction (e.g. \frac{\partial \mathbf{B}}
// {\partial t} — the numerator has a nested {B}). A failed match there
// doesn't just skip the fraction: it leaves the \frac token completely
// unprocessed, so later steps unwrap the numerator and denominator as two
// independent, un-separated brace groups — silently dropping the division
// entirely (e.g. "∂B∂t" instead of "∂B/∂t"). This version uses matchBrace,
// so nesting of any depth is handled correctly. Must run BEFORE
// convertMathMacros so its own (fragile) \frac handling never sees a
// \frac token to mishandle.
function convertFractionsRobust(text) {
  let out = text;
  let guard = 0;
  while (guard++ < 5000) {
    const m = out.match(/\\[Ff]rac\{/);
    if (!m) break;
    const numOpen = m.index + m[0].length - 1;
    const numClose = matchBrace(out, numOpen);
    if (numClose === -1) { out = out.slice(0, m.index) + out.slice(m.index + m[0].length); continue; }
    let denOpen = numClose + 1;
    while (denOpen < out.length && /\s/.test(out[denOpen])) denOpen++;
    if (out[denOpen] !== '{') { out = out.slice(0, m.index) + out.slice(m.index + m[0].length); continue; }
    const denClose = matchBrace(out, denOpen);
    if (denClose === -1) { out = out.slice(0, m.index) + out.slice(m.index + m[0].length); continue; }
    const num = out.slice(numOpen + 1, numClose);
    const den = out.slice(denOpen + 1, denClose);
    out = out.slice(0, m.index) + `(${num})/(${den})` + out.slice(denClose + 1);
  }
  return out;
}

// ---------- robust \sqrt{...} — tolerant of nested braces ----------
// Same class of bug as \frac: clean.js's own \sqrt regex requires the
// argument to contain no braces at all, so \sqrt{(f+d)^{2}+h^{2}} (a
// superscript nested inside the sqrt argument) fails to match there,
// and the outer grouping parens are lost by the time other steps unwrap
// the nested pieces — e.g. "√(f+d)²+h²" instead of "√((f+d)²+h²)",
// changing what's inside vs. outside the root visually. matchBrace
// handles nesting correctly regardless of depth.
function convertSqrtRobust(text) {
  let out = text;
  let guard = 0;
  while (guard++ < 3000) {
    const m = out.match(/\\sqrt\{/);
    if (!m) break;
    const open = m.index + m[0].length - 1;
    const close = matchBrace(out, open);
    if (close === -1) { out = out.slice(0, m.index) + out.slice(m.index + m[0].length); continue; }
    const inner = out.slice(open + 1, close);
    out = out.slice(0, m.index) + `\u221a(${inner})` + out.slice(close + 1);
  }
  return out;
}

// ---------- \pdv (physics package partial derivative) ----------
// \pdv{a}{b} -> ∂(a)/∂(b); \pdv[2]{a}{b} -> ∂²(a)/∂(b)² (only order 1/2
// appear in these files). Converts directly to Unicode rather than via
// convertFractionsRobust, since the numerator/denominator both need an
// extra ∂ prefix (and the denominator an order-exponent suffix) that a
// plain fraction doesn't have.
function convertPdv(text) {
  let out = text;
  let guard = 0;
  while (guard++ < 2000) {
    const m = out.match(/\\pdv(\[(\d+)\])?\{/);
    if (!m) break;
    const order = m[2] ? Number(m[2]) : 1;
    const numOpen = m.index + m[0].length - 1;
    const numClose = matchBrace(out, numOpen);
    if (numClose === -1) { out = out.slice(0, m.index) + out.slice(m.index + m[0].length); continue; }
    let denOpen = numClose + 1;
    while (denOpen < out.length && /\s/.test(out[denOpen])) denOpen++;
    if (out[denOpen] !== '{') { out = out.slice(0, m.index) + out.slice(m.index + m[0].length); continue; }
    const denClose = matchBrace(out, denOpen);
    if (denClose === -1) { out = out.slice(0, m.index) + out.slice(m.index + m[0].length); continue; }
    const num = out.slice(numOpen + 1, numClose);
    const den = out.slice(denOpen + 1, denClose);
    const sup = { 1: '', 2: '\u00b2', 3: '\u00b3' }[order] || `^${order}`;
    const replacement = order === 1
      ? `\u2202(${num})/\u2202(${den})`
      : `\u2202${sup}(${num})/\u2202(${den})${sup}`;
    out = out.slice(0, m.index) + replacement + out.slice(denClose + 1);
  }
  return out;
}

// ---------- custom / physics-package macros not in clean.js's base dictionary ----------
function substituteCustomMacros(text) {
  let out = text;

  // LaTeX's controlled interword space "\ " and the escaped norm/absolute-
  // value bar "\|" aren't handled by clean.js's unescapeChars — left alone
  // they survive verbatim as a literal backslash all the way to the final
  // output (e.g. "i.e.\ it behaves" instead of "i.e. it behaves").
  out = out.replace(/\\ /g, ' ');
  out = out.replace(/\\\|/g, '\u2016'); // ‖ (double vertical line, for ‖r‖ norm notation)
  out = out.replace(/~/g, ' ');          // LaTeX non-breaking space -> plain space

  // Normalize LaTeX's "_\text{word}" / "_\mathrm{word}" idiom (a bare
  // macro immediately after "_", no outer braces around the whole
  // subscript — valid LaTeX, since \text{word} is itself one token) into
  // "_{word}" BEFORE calling clean.js's pipeline. clean.js's subscript
  // regex requires an outer brace right after "_"; left unbraced, only
  // clean.js's single-CHARACTER fallback regex (_[0-9a-zA-Z]) ends up
  // matching, silently consuming just the first letter of the word and
  // leaving the rest as ordinary trailing text — found via inspection:
  // "I_\text{inc}" was rendering as "Iᵢnc" (a stray subscript-i followed
  // by plain "nc"), silently mangling every such label in these files.
  out = out.replace(/_\\text\{([^{}]*)\}/g, '_{$1}');
  out = out.replace(/_\\mathrm\{([^{}]*)\}/g, '_{$1}');

  // Figure wrappers with no useful text content
  out = removeEnvironment(out, 'wrapfigure');

  // External code-listing include -> drop entirely (filename + options)
  out = out.replace(/\\lstinputlisting(\[[^\]]*\])?\{[^{}]*\}/g, '');

  // Counter bookkeeping (resets the \abc counter) -> no textual content
  out = out.replace(/\\setcounter\{[^{}]*\}\{[^{}]*\}/g, '');

  // Equation-number cross-references don't resolve to real numbers in
  // extracted plain text — drop rather than leak the raw \label text
  out = unwrapMacro(out, 'eqref', { drop: true });
  out = unwrapMacro(out, 'ref', { drop: true });

  // \split behaves like \aligned for our purposes (multi-line, &-aligned)
  out = out.replace(/\\begin\{split\}/g, '\\begin{aligned}').replace(/\\end\{split\}/g, '\\end{aligned}');

  // Greek letters + OPERATOR_WORDS (\gamma, \omega, \partial, \times, ...)
  // MUST be resolved before anything below that produces a bare letter
  // (the \vec/\vu/\dot/\ddot accent resolution). clean.js's own greedy
  // "\\([A-Za-z]+)" matcher (used both here, replicated, and later inside
  // convertMathMacros/catchAll) has no way to know where a macro name
  // ends if the very next character is ALSO a letter — normally that
  // never happens in real LaTeX source (a macro name is always followed
  // by a space, digit, brace, underscore, or another backslash), but if
  // MY OWN resolution runs first and glues a bare letter directly onto a
  // still-unresolved PRECEDING macro with no source-level separator (e.g.
  // "m\gamma\dot{\vb{x}}" -> "\dot{\vb{x}}" resolves to "x⃗̇" first,
  // producing "m\gammax⃗̇" with "gammax" now looking like one unknown
  // 6-letter macro name), the greedy regex swallows the extra letter into
  // the macro name, fails the dictionary lookup, and catchAll's blanket
  // bare-macro-strip later erases the whole fused token — silently
  // dropping BOTH the Greek letter AND the base letter I'd already
  // resolved (found via inspection: "m γ ẍ" was collapsing to just "m").
  // Resolving Greek/operator words here, first, while \dot/\vec/etc. are
  // still their original backslash form (a non-letter boundary), avoids
  // the whole class of bug.
  out = out.replace(/\\([A-Za-z]+)/g, (m, name) => GREEK[name] ?? OPERATOR_WORDS[name] ?? m);

  // Bare-symbol / function-name substitutions that rely on a "not
  // followed by another letter" lookahead — MUST run before anything
  // that can produce an accented Unicode letter (a plain ASCII base
  // letter + a combining mark, e.g. "ê" = 'e' + U+0302). Found via
  // inspection: "\vu{e}...\cross\vu{e}_{z}" — once \vu resolves to "ê",
  // \cross's lookahead sees the following 'e' (the base letter of "ê")
  // and — correctly, by the letter-boundary rule, but wrongly in this
  // case — treats it as a continuation of a longer macro name, refusing
  // to match; \cross then gets silently erased later as a bare unknown
  // macro. Running these while the surrounding text is still close to
  // raw LaTeX (nothing here has yet produced an accented letter) avoids
  // the whole class of ordering bug.
  const MACRO_END = '(?![a-zA-Z])';
  out = out.replace(new RegExp(`\\\\grad${MACRO_END}`, 'g'), '\u2207');            // ∇  (gradient)
  out = out.replace(new RegExp(`\\\\laplacian${MACRO_END}`, 'g'), '\u2207\u00b2'); // ∇² (Laplacian)
  out = out.replace(new RegExp(`\\\\cross${MACRO_END}`, 'g'), '\u00d7');           // ×  (cross product)
  out = out.replace(new RegExp(`\\\\vdot${MACRO_END}`, 'g'), '\u00b7');            // ·  (dot product)
  out = out.replace(new RegExp(`\\\\iint${MACRO_END}`, 'g'), '\u222c');            // ∬  (double integral)
  out = out.replace(new RegExp(`\\\\arctan${MACRO_END}`, 'g'), 'arctan');
  out = out.replace(new RegExp(`\\\\atan${MACRO_END}`, 'g'), 'atan');
  out = out.replace(new RegExp(`\\\\arcsin${MACRO_END}`, 'g'), 'arcsin');
  out = out.replace(new RegExp(`\\\\cot${MACRO_END}`, 'g'), 'cot');
  out = out.replace(new RegExp(`\\\\sinc${MACRO_END}`, 'g'), 'sinc');
  out = out.replace(new RegExp(`\\\\Im${MACRO_END}`, 'g'), 'Im');
  out = out.replace(new RegExp(`\\\\Re${MACRO_END}`, 'g'), 'Re');
  out = out.replace(new RegExp(`\\\\rme${MACRO_END}`, 'g'), 'e');
  out = out.replace(new RegExp(`\\\\rmi${MACRO_END}`, 'g'), 'i');
  out = out.replace(new RegExp(`\\\\rmd${MACRO_END}`, 'g'), 'd');
  out = out.replace(new RegExp(`\\\\dd${MACRO_END}`, 'g'), 'd');
  out = out.replace(new RegExp(`\\\\ii${MACRO_END}`, 'g'), 'i');
  out = out.replace(new RegExp(`\\\\p${MACRO_END}`, 'g'), '\u2032');
  out = out.replace(new RegExp(`\\\\prime${MACRO_END}`, 'g'), '\u2032');

  // \e{X} (physics package Euler-exponential shorthand, e.g. \e{-i\omega t}
  // means e^{-i\omega t}) -> raw "e^{X}" so clean.js's own superscript
  // handling (in convertMathMacros, run later) picks it up naturally.
  // Safe to do now (before the accent-producing macros below): its
  // replacement ends in "}", not a bare letter, so it can't create the
  // same false-adjacency problem for anything still pending above.
  out = unwrapMacro(out, 'e', { transform: (inner) => `e^{${inner}}` });

  // Bold/unit vector macros (physics package) -> reuse clean.js's own
  // \vec (adds a combining arrow ⃗) for bold vectors; unit vectors get a
  // combining circumflex (hat) accent instead. These — and \dot/\ddot
  // just below — are resolved fully to plain accented letters HERE
  // (rather than left for clean.js's later convertMathMacros) so that
  // \dot{\vb{x}} etc. wraps the actual base letter, not a dangling
  // "\vec{x}" token whose brace would otherwise catch the accent instead
  // of the letter itself.
  out = out.replace(new RegExp(`\\\\vb${MACRO_END}`, 'g'), '\\vec');
  out = out.replace(new RegExp(`\\\\vek${MACRO_END}`, 'g'), '\\vec');
  out = unwrapMacro(out, 'vec', { transform: (inner) => inner + '\u20d7' }); // combining right arrow above
  out = unwrapMacro(out, 'vu', { transform: (inner) => inner + '\u0302' });
  out = unwrapMacro(out, 'uvec', { transform: (inner) => inner + '\u0302' });

  // Derivative-dot accents. clean.js's own \dot handling just unwraps with
  // no accent at all, and doesn't handle \ddot — both would otherwise
  // silently drop the derivative order (e.g. "m ẍ + m γ ẋ + k x = ..."
  // degrading to the meaningless "m x + m x + k x = ..."). Runs AFTER the
  // vector macros above so \dot{\vec{x}} wraps the already-resolved "x⃗",
  // not a dangling brace.
  out = unwrapMacro(out, 'ddot', { transform: (inner) => inner + '\u0308' }); // combining diaeresis
  out = unwrapMacro(out, 'dot', { transform: (inner) => inner + '\u0307' });  // combining dot above

  // Partial derivatives, THEN generic fractions (order matters: \pdv's own
  // regex looks for the literal "\pdv" token, so it must run before
  // anything that might otherwise misinterpret it — nothing here does,
  // but keeping \pdv before \frac mirrors the source's own convention of
  // \pdv being a specialized \frac). Both are nested-brace-safe.
  out = convertPdv(out);
  out = convertSqrtRobust(out);
  out = convertFractionsRobust(out);

  return out;
}

// ---------- \abc counters and \item[<label>] sub-part labels ----------
// Exercises label sub-parts either with a bare \abc token repeated inline
// ("...  \abc Under what condition ... \abc Under what conditions ...")
// or with \item[\abc] inside an itemize list; solutions instead hardcode
// literal labels like \item[\textbf{a)}] or \item[\textbf{I}:]. Both
// conventions are resolved here, in one left-to-right pass so a shared
// counter advances correctly regardless of which form is used.
function resolveAbcAndItemLabels(text) {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let counter = 0;
  let out = text.replace(/\\item\s*\[\s*\\abc\s*\]|\\abc\b/g, () => {
    const label = letters[counter] ?? `(${counter + 1})`;
    counter++;
    return `\n${label}) `;
  });
  out = out.replace(/\\item\s*\[([^\]]*)\]/g, (_, label) => {
    const cleanLabel = label.replace(/\\textbf\{([^{}]*)\}/g, '$1').trim();
    return `\n${cleanLabel} `;
  });
  return out;
}

function whitespaceCleanupExtra(text) {
  // Tidy up a cosmetic artifact from source lines like "\text {word}"
  // (a space between the macro and its brace, preserved verbatim through
  // unwrapping) — strip a leading/trailing space touching a parenthesis
  // introduced by resolveScript's "_(...)" / "^(...)" fallback form.
  return text.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
}

// Full pipeline: raw \ExerciseNu/\SolutionNu inner content -> clean plain text
function cleanHomeworkText(raw) {
  let t = stripComments(raw);
  t = stripCommandDefinitions(t);
  t = unescapeChars(t);
  t = substituteCustomMacros(t);
  t = resolveAbcAndItemLabels(t);
  t = dropStructuralMacros(t);
  t = removeFigures(t);
  t = convertMisc(t);
  t = convertHighlightMacros(t);
  t = convertMathMacros(t);
  t = convertMathEnvAndDelimiters(t);
  t = convertLists(t);
  t = stripStrayEnvironments(t);
  t = catchAll(t);
  t = whitespaceCleanup(t);
  t = whitespaceCleanupExtra(t);
  return t;
}

module.exports = {
  extractTwoBraceMacro,
  stripCommandDefinitions,
  substituteCustomMacros,
  resolveAbcAndItemLabels,
  cleanHomeworkText,
};



