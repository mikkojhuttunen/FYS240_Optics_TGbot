/**
 * e2e_pending_test_fys240.js — regression test for the pending-question pipeline (no network, no Telegram).
 *   node e2e_pending_test_fys240.js
 * Covers: live-generation capture into the pending files (single + multi, EN + FI), validation of live
 * output, QUIZ_PENDING_DIR volume, size cap, corrupt-file quarantine, the /pending admin module, and the
 * mergePending_fys240.js extract / review / merge CLI incl. the bilingual id / lang / stem-suffix rules.
 * Uses temp folders only; repo files are not touched.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pending-test-'));
process.env.ANTHROPIC_API_KEY = 'dummy';
process.env.ADMIN_USER_IDS = '111';
process.env.QUIZ_PENDING_DIR = path.join(tmp, 'vol', 'nested'); // does not exist yet -> must be created
process.env.QUIZ_PENDING_MAX = '6';

const limiter = require('./usageLimiter');
const single = require('./quizGenerator_fys240');
const multi = require('./multivalueQuizGenerator_fys240');
const admin = require('./pendingAdmin_fys240');
const sBank = require('./quizBank_fys240.json');
const mBank = require('./multivalueQuizBank_fys240.json');

let passed = 0;
const logs = [], warns = [];
const realLog = console.log, realWarn = console.warn;
const ok = (name) => { passed++; realLog(`  ok  ${name}`); };
console.log = (...a) => { logs.push(a.join(' ')); };
console.warn = (...a) => { warns.push(a.join(' ')); };
const say = (...a) => realLog(...a);

const sPath = path.join(process.env.QUIZ_PENDING_DIR, 'quizBankPending_fys240.json');
const mPath = path.join(process.env.QUIZ_PENDING_DIR, 'multivalueQuizBankPending_fys240.json');
const readP = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const countLang = (bank, ch, sec, lang) => (bank[ch][sec] || []).filter((q) => (q.lang || 'en') === lang).length;
const maxNum = (bank, ch, sec) => Math.max(...bank[ch][sec].map((q) => parseInt(String(q.id).match(/_(\d+)/)[1], 10)));

const goodS = (n) => ({ stem: `Live single question ${n} about interference?`, options: [`right ${n}`, `wrong a ${n}`, `wrong b ${n}`, `wrong c ${n}`], correctIndex: 1, explanation: 'because' });
const goodM = (n, fi = false) => ({ stem: `Live multi question ${n} about diffraction ${fi ? '(Valitse kaikki oikeat)' : '(Select all that apply)'}`, options: ['a1', 'b2', 'c3', 'd4', 'e5'].map((x) => `${x} ${n}`), correctIndices: [0, 2, 3], explanation: 'because' });
let nextText = '';
limiter.trackedCreate = async () => ({ content: [{ type: 'text', text: nextText }] });

(async () => {
  say('Part 1 — live-generation capture');
  // single EN: ask for (bank size + 4) in 2.3 -> 4 generated; LLM returns 4 good + 1 malformed
  const nS = countLang(sBank, '2', '2.3', 'en');
  nextText = JSON.stringify({ questions: [goodS(1), goodS(2), { ...goodS(9), correctIndex: 9 }, goodS(3), goodS(4)] });
  let qs = await single.getQuizQuestions(9001, '2', '2.3', nS + 4, 'en');
  assert.strictEqual(qs.length, nS + 4); ok(`single EN: ${nS} bank + 4 valid live questions served (malformed one dropped)`);
  assert.ok(fs.existsSync(sPath)); ok('QUIZ_PENDING_DIR created on demand and pending file written there');
  let p = readP(sPath);
  assert.strictEqual(p.length, 4);
  assert.ok(p.every((e) => e.chapter === '2' && e.section === '2.3' && e.lang === 'en' && /^gen_en_2\.3_/.test(e.question.id) && e.generatedAt));
  ok('single: 4 pending entries with chapter/section/lang/id/timestamp, malformed question NOT captured');
  assert.strictEqual(logs.filter((l) => l.startsWith('QUIZ_PENDING_QUESTION ')).length, 4); ok('single: 4 QUIZ_PENDING_QUESTION log lines');
  assert.ok(!fs.readdirSync(process.env.QUIZ_PENDING_DIR).some((f) => f.endsWith('.tmp'))); ok('atomic write left no .tmp file');

  // multi FI: 3.1 has k FI questions; ask k+3 -> 3 generated; LLM returns 3 good + 1 single-correct (invalid) + 1 with 3 options
  const nM = countLang(mBank, '3', '3.1', 'fi');
  nextText = JSON.stringify({ questions: [goodM(1, true), { ...goodM(8, true), correctIndices: [1] }, goodM(2, true), { ...goodM(7, true), options: ['a', 'b', 'c'], correctIndices: [0, 1] }, goodM(3, true)] });
  qs = await multi.getQuizQuestions(9002, '3', '3.1', nM + 3, 'fi');
  assert.strictEqual(qs.length, nM + 3); ok(`multi FI: ${nM} bank + 3 valid live questions served (single-correct and 3-option ones dropped)`);
  p = readP(mPath);
  assert.strictEqual(p.length, 3);
  assert.ok(p.every((e) => e.section === '3.1' && e.lang === 'fi' && /^mvgen_fi_3\.1_/.test(e.question.id)));
  assert.strictEqual(logs.filter((l) => l.startsWith('MVQUIZ_PENDING_QUESTION ')).length, 3); ok('multi: 3 FI pending entries + 3 MVQUIZ_PENDING_QUESTION log lines');
  assert.strictEqual(readP(sPath).length, 4); ok('single file untouched by multi capture');

  // cap: QUIZ_PENDING_MAX=6, single has 4 -> 4 more would exceed it
  const before = logs.length;
  nextText = JSON.stringify({ questions: [goodS(11), goodS(12), goodS(13), goodS(14)] });
  await single.getQuizQuestions(9003, '2', '2.3', nS + 4, 'en');
  assert.strictEqual(readP(sPath).length, 4); assert.ok(warns.some((w) => /pending file is full/.test(w)));
  assert.strictEqual(logs.slice(before).filter((l) => l.startsWith('QUIZ_PENDING_QUESTION ')).length, 4);
  ok('cap: file not grown past QUIZ_PENDING_MAX, warning issued, log lines still emitted');

  // corrupt file is quarantined, never silently overwritten
  fs.writeFileSync(sPath, '{ this is not json');
  nextText = JSON.stringify({ questions: [goodS(21)] });
  await single.getQuizQuestions(9004, '2', '2.3', nS + 1, 'en');
  assert.ok(fs.readdirSync(process.env.QUIZ_PENDING_DIR).some((f) => f.startsWith('quizBankPending_fys240.json.corrupt-')));
  assert.strictEqual(readP(sPath).length, 1); ok('corrupt pending file moved aside (.corrupt-<ts>) and a fresh file started');

  // summary / clear
  const sum = single.pendingSummary();
  assert.deepStrictEqual([sum.total, sum.bySection['2.3'], sum.byLang.en, sum.persistentDir], [1, 1, 1, true]); ok('pendingSummary() counts by section and language');
  assert.strictEqual(multi.clearPending(), 3); assert.deepStrictEqual(readP(mPath), []); ok('clearPending() empties the file and reports the count');

  // hooks: a refused reservation must NOT generate or capture anything
  const cntBefore = readP(sPath).length;
  nextText = JSON.stringify({ questions: [goodS(41)] });
  const res = await single.getQuizQuestionsDetailed(9007, '2', '2.3', nS + 1, 'en', { reserve: async () => ({ ok: false, reason: 'user_limit' }) });
  assert.ok(res.limited && readP(sPath).length === cntBefore); ok('refused credit reservation -> nothing generated, nothing captured');

  say('Part 2 — admin /pending command module');
  nextText = JSON.stringify({ questions: [goodS(31), goodS(32)] }); await single.getQuizQuestions(9005, '2', '2.3', nS + 2, 'en');
  nextText = JSON.stringify({ questions: [goodM(31)] }); await multi.getQuizQuestions(9006, '3', '3.1', countLang(mBank, '3', '3.1', 'en') + 1, 'en');
  const sent = [], docs = [];
  const deps = { sendText: async (c, t) => sent.push(t), sendDocument: async (c, f, name, cap) => docs.push({ f, name, cap }) };
  assert.strictEqual(await admin.handlePendingCommand({ chatId: 1, userId: 555, arg: '', ...deps }), false);
  assert.strictEqual(sent.length + docs.length, 0); ok('non-admin: silently ignored, nothing sent');
  assert.strictEqual(await admin.handlePendingCommand({ chatId: 1, userId: 111, isPrivate: false, arg: '', ...deps }), true);
  assert.ok(/private chat/.test(sent[0]) && !docs.length); ok('admin in a group chat: told to use a private chat, nothing exported');
  sent.length = 0;
  assert.strictEqual(await admin.handlePendingCommand({ chatId: 1, userId: 111, isPrivate: true, arg: '', ...deps }), true);
  assert.ok(/Single-select: 3 \[en 3\] \(2\.3: 3\)/.test(sent[0]) && /Multi-select: 1 \[en 1\] \(3\.1: 1\)/.test(sent[0]) && /persistent directory/.test(sent[0])); ok('admin: summary shows counts per language and section, and storage location');
  assert.deepStrictEqual(docs.map((d) => d.name).sort(), ['multivalueQuizBankPending_fys240.json', 'quizBankPending_fys240.json']); ok('admin: both pending files sent as documents');
  sent.length = 0; docs.length = 0;
  await admin.handlePendingCommand({ chatId: 1, userId: 111, arg: 'bogus', ...deps }); assert.ok(/Usage/.test(sent[0]) && !docs.length); ok('admin: unknown argument -> usage text');
  sent.length = 0;
  await admin.handlePendingCommand({ chatId: 1, userId: 111, arg: 'clear', ...deps });
  assert.ok(/3 single-select and 1 multi-select/.test(sent[0])); assert.deepStrictEqual(readP(sPath), []); ok('admin: /pending clear empties both files');
  sent.length = 0;
  await admin.handlePendingCommand({ chatId: 1, userId: 111, arg: '', ...deps }); assert.strictEqual(docs.length, 0); ok('admin: nothing to export -> no documents sent');

  say('Part 3 — mergePending_fys240.js CLI');
  const work = path.join(tmp, 'merge'); fs.mkdirSync(work);
  const banks = { s: path.join(work, 'quizBank_fys240.json'), m: path.join(work, 'multivalueQuizBank_fys240.json') };
  fs.copyFileSync('quizBank_fys240.json', banks.s); fs.copyFileSync('multivalueQuizBank_fys240.json', banks.m);
  const bankStemEn = sBank['2']['2.3'].find((q) => !q.lang).stem;
  const bankStemFi = sBank['2']['2.3'].find((q) => q.lang === 'fi').stem;
  const entry = (chapter, section, q, lang = 'en') => ({ chapter, section, lang, question: q, generatedAt: '2026-09-21T10:00:00.000Z' });
  const cue = { stem: 'Which effect widens a spectral line uniformly for every atom?', options: ['Natural broadening from the finite lifetime of the excited state, identical for all atoms in the medium', 'Doppler shift', 'Local field', 'Strain'], correctIndex: 0, explanation: 'x' };
  const pendS = [
    entry('2', '2.3', goodS(101)),                                                                  // 0 OK (EN)
    entry('2', '2.3', { ...goodS(102), correctIndex: 7 }),                                          // 1 INVALID
    entry('2', '2.3', { ...goodS(103), stem: bankStemEn }),                                         // 2 DUPLICATE of EN bank
    entry('2', '2.3', { ...goodS(104), stem: bankStemEn.replace(/\?$/, '') + ' here?' }),           // 3 SIMILAR
    entry('2', null, goodS(105)),                                                                   // 4 needs section
    entry('10', '10.13', cue),                                                                      // 5 OK + LENGTH CUE, two-digit section
    entry('2', '2.3', { ...goodS(106), stem: 'Elävä kysymys 106 interferenssistä?' }, 'fi'),        // 6 OK (FI)
    entry('2', '2.3', { ...goodS(107), stem: bankStemFi }, 'fi'),                                   // 7 DUPLICATE of FI bank
    entry('2', '2.3', { ...goodS(108), stem: bankStemFi }, 'en'),                                   // 8 same words but EN -> NOT a duplicate (cross-language)
    entry('3', '2.3', goodS(109)),                                                                  // 9 INVALID: chapter/section mismatch
    entry('11', '11.1', goodS(110)),                                                                // 10 INVALID: no such chapter
    entry('2', '2.3', goodS(111), 'de'),                                                            // 11 INVALID: unknown language
  ];
  const pendM = [
    entry('3', '3.1', { ...goodM(101), stem: 'Live multi question 101 about cavities' }),                      // 0 OK, EN suffix missing -> appended
    entry('3', '3.1', { ...goodM(102), correctIndices: [1] }),                                                 // 1 INVALID
    entry('3', '3.1', { ...goodM(103), stem: 'Elävä monivalinta 103 diffraktiosta' }, 'fi'),                  // 2 OK, FI suffix missing -> appended
    entry('3', '3.1', { ...goodM(104, true), stem: 'Elävä monivalinta 104 (Valitse kaikki oikeat)' }, 'fi'), // 3 OK, FI suffix already present -> not doubled
  ];
  fs.writeFileSync(path.join(work, 'quizBankPending_fys240.json'), JSON.stringify(pendS));
  fs.writeFileSync(path.join(work, 'multivalueQuizBankPending_fys240.json'), JSON.stringify(pendM));
  const cli = (...a) => spawnSync('node', [path.join(__dirname, 'mergePending_fys240.js'), ...a], { encoding: 'utf8' });
  const { keyOf } = require('./mergePending_fys240.js');
  const key = (k, e) => keyOf(k, e.question);

  let r = cli('review', '--dir', work, '--bank-dir', work, '--out', path.join(work, 'review.md'));
  assert.strictEqual(r.status, 0, r.stderr);
  for (const re of [/single-select: 12 pending/, /3 OK/, /5 INVALID/, /2 DUPLICATE/, /1 SIMILAR/, /multi-select: 4 pending — 3 OK, 1 INVALID/]) assert.ok(re.test(r.stdout), `${re} not in ${r.stdout}`);
  const sheet = fs.readFileSync(path.join(work, 'review.md'), 'utf8');
  assert.ok(/DUPLICATE: identical stem already in bank/.test(sheet) && /SIMILAR: \d+% word overlap/.test(sheet) && /LENGTH CUE/.test(sheet) && /no section/.test(sheet) && /at least 2 correct/.test(sheet));
  assert.ok(/does not match chapter/.test(sheet) && /bad section "11\.1"/.test(sheet) && /unknown language "de"/.test(sheet) && /— FI — section 2\.3/.test(sheet));
  ok('review: OK / INVALID / DUPLICATE / SIMILAR, length cue, missing section, chapter mismatch, bad section 11.1, unknown language all detected');
  assert.ok(new RegExp(`${key('single', pendS[8])} — EN — section 2\\.3 — OK`).test(sheet)); ok('review: identical wording in another language is NOT a duplicate');
  assert.ok(new RegExp(`${key('single', pendS[5])} — EN — section 10\\.13 — OK`).test(sheet)); ok('review: two-digit section 10.13 accepted');

  r = cli('merge', '--dir', work, '--bank-dir', work, '--accept', key('single', pendS[1]));
  assert.ok(/INVALID/.test(r.stdout) && /Nothing to do/.test(r.stdout)); ok('merge: refuses to merge an INVALID question');
  r = cli('merge', '--dir', work, '--bank-dir', work, '--accept', 'S-000000'); assert.strictEqual(r.status, 1); ok('merge: unknown key -> error exit');
  r = cli('merge', '--dir', work, '--bank-dir', work); assert.strictEqual(r.status, 1); ok('merge: without --accept/--all-valid -> error exit');

  const acc = [key('single', pendS[0]), key('single', pendS[6]), key('single', pendS[5]), key('single', pendS[4]), key('multi', pendM[0]), key('multi', pendM[2]), key('multi', pendM[3])].join(',');
  const n23 = sBank['2']['2.3'].length;
  const dry = cli('merge', '--dir', work, '--bank-dir', work, '--accept', acc, '--assign', `${key('single', pendS[4])}=2.3`, '--reviewed', '--drop-rest', '--dry-run');
  assert.ok(/Dry run/.test(dry.stdout) && readP(banks.s)['2']['2.3'].length === n23); ok('merge --dry-run changes nothing');
  r = cli('merge', '--dir', work, '--bank-dir', work, '--accept', acc, '--assign', `${key('single', pendS[4])}=2.3`, '--reviewed', '--drop-rest');
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
  const sb = readP(banks.s), mb = readP(banks.m);

  // ids: numbering continues from the highest number used by EITHER language, FI gets the _fi suffix
  const N = maxNum(sBank, '2', '2.3');
  const pad = (n) => String(n).padStart(3, '0');
  // merge walks the pending file in order: #0 EN, #4 EN (sectionless, --assign 2.3), #6 FI
  assert.deepStrictEqual(sb['2']['2.3'].slice(n23).map((q) => q.id), [`q2.3_${pad(N + 1)}`, `q2.3_${pad(N + 2)}`, `q2.3_${pad(N + 3)}_fi`]);
  ok('single: EN q2.3_N+1, EN (assigned 2.3) q2.3_N+2, FI q2.3_N+3_fi — one shared number sequence across languages');
  const M13 = maxNum(sBank, '10', '10.13');
  assert.deepStrictEqual(sb['10']['10.13'].slice(sBank['10']['10.13'].length).map((q) => q.id), [`q10.13_${pad(M13 + 1)}`]); ok('single: section 10.13 continues its own numbering');
  const [enS, fiS] = [sb['2']['2.3'][n23], sb['2']['2.3'][n23 + 2]];
  assert.ok(!('lang' in enS) && fiS.lang === 'fi' && enS.correctIndex === 1 && !('translationOf' in fiS)); ok('single: EN record untagged, FI record lang "fi" (existing bank convention), no bogus translationOf');
  const mN = maxNum(mBank, '3', '3.1'); const mLen = mBank['3']['3.1'].length;
  assert.deepStrictEqual(mb['3']['3.1'].slice(mLen).map((q) => q.id), [`q3.1_${pad(mN + 1)}`, `q3.1_${pad(mN + 2)}_fi`, `q3.1_${pad(mN + 3)}_fi`]); ok('multi: ids continue the section sequence, q-prefix like the existing multi bank, _fi for Finnish');
  const [mEn, mFi1, mFi2] = mb['3']['3.1'].slice(mLen);
  assert.ok([mEn, mFi1, mFi2].every((q) => q.questionType === 'multi_select' && q.correctIndices.length === 3 && q.source === 'claude-live-generated' && q.reviewed === true && /^\d{4}-\d\d-\d\d$/.test(q.addedAt))); ok('multi: questionType, sorted correctIndices, source, reviewed, addedAt set');
  assert.ok(mEn.lang === 'en' && mFi1.lang === 'fi' && mFi2.lang === 'fi'); ok('multi: lang always set (existing multi bank convention)');
  assert.ok(/\(Select all that apply\)$/.test(mEn.stem) && /\(Valitse kaikki oikeat\)$/.test(mFi1.stem)); ok('multi: missing stem suffix appended in the right language');
  assert.strictEqual((mFi2.stem.match(/Valitse kaikki oikeat/g) || []).length, 1); ok('multi: existing suffix is not doubled');
  assert.deepStrictEqual([readP(path.join(work, 'quizBankPending_fys240.json')), readP(path.join(work, 'multivalueQuizBankPending_fys240.json'))], [[], []]); ok('merged and dropped questions removed from both pending files');
  assert.ok(fs.existsSync(`${banks.s}.bak`) && fs.existsSync(`${banks.m}.bak`)); ok('.bak backups of the banks written');
  // the merged banks must still be readable by the bot's own sampling code, per language
  const sampled = single.sampleFromBank('2', '2.3', 99, [], 'fi').questions.map((q) => q.id);
  assert.ok(sampled.length >= 1); ok('bank sampling by language still works (sanity)');

  // extract from a Railway-style log
  const ex = path.join(tmp, 'extract'); fs.mkdirSync(ex);
  const line = (tag, o) => `2026-09-21T10:05:00Z ${tag} ${JSON.stringify(o)}`;
  const logFile = path.join(tmp, 'railway.log');
  fs.writeFileSync(logFile, [
    'some unrelated line', line('QUIZ_PENDING_QUESTION', pendS[0]), line('MVQUIZ_PENDING_QUESTION', pendM[2]),
    JSON.stringify({ message: `QUIZ_PENDING_QUESTION ${JSON.stringify(pendS[6])}`, timestamp: 'x' }),
    line('QUIZ_PENDING_QUESTION', pendS[0]), 'QUIZ_PENDING_QUESTION {broken json}',
  ].join('\n'));
  r = cli('extract', logFile, '--dir', ex); assert.strictEqual(r.status, 0, r.stderr);
  const exS = readP(path.join(ex, 'quizBankPending_fys240.json'));
  assert.strictEqual(exS.length, 2); assert.strictEqual(readP(path.join(ex, 'multivalueQuizBankPending_fys240.json')).length, 1);
  assert.deepStrictEqual(exS.map((e) => e.lang).sort(), ['en', 'fi']);
  assert.ok(/unparseable/.test(r.stdout)); ok('extract: plain + JSON-wrapped log lines parsed, lang kept, MVQUIZ/QUIZ apart, duplicate and broken lines handled');
  r = cli('extract', logFile, '--dir', ex); assert.ok(/0 new added/.test(r.stdout)); ok('extract: running it twice does not duplicate entries');

  console.log = realLog; console.warn = realWarn;
  say(`\nAll ${passed} checks passed. Temp files in ${tmp}`);
})().catch((e) => { console.log = realLog; console.warn = realWarn; console.error('FAILED:', e.stack || e); process.exit(1); });
