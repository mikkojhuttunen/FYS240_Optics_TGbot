/**
 * Regenerate course_corpus.txt for the FYS.240 Optics bot — directly from
 * the .tex lecture-slide sources (one file per section, in English and in
 * Finnish), using clean_fys240.js to convert LaTeX to clean Unicode text.
 *
 * Run locally whenever a .tex source changes:
 *
 *   node build_corpus.js <tex_dir> <titles_en.json> <titles_fi.json>
 *
 * Then commit the new course_corpus.txt and redeploy.
 *
 * SOURCE FILE SELECTION: the tex_dir is expected to contain exactly the
 * canonical section files — i.e. NOT the "_old", "_copy", "conflicted copy"
 * Dropbox-duplicate, or "II_SLIDE_template.tex" files that also exist
 * alongside the real ones in the original material. See SECTION_MAP below
 * for the exact filename chosen for each section (worked out by diffing the
 * duplicates against the canonical files — the "_old" ones are short stubs,
 * "_copy" belongs to a different, older master file).
 *
 * SPECIAL CASE — 7.4 / 7.5: the English lecture slides split "Superposition
 * of several frequencies and coherence" into two separate files (7.4 and
 * 7.5), but the Finnish slides (and the textbook) never split them — the
 * single Finnish file covers both. So section "7.4" carries combined
 * Finnish content across both English sections 7.4 and 7.5.
 */

const fs = require('fs');
const path = require('path');
const clean = require('./clean_fys240.js');

const CHAPTER_TITLES_EN = {
  2: 'Descriptions of light',
  3: 'Wave motion',
  4: 'Electromagnetic waves',
  5: 'Light–matter interaction',
  6: 'Propagation',
  7: 'Superposition',
  8: 'Interference',
  9: 'Diffraction',
  10: 'Geometrical optics',
};

const CHAPTER_TITLES_FI = {
  2: 'Valon Matemaattinen kuvaaminen',
  3: 'Aaltoliike',
  4: 'Sähkömagneettiset Aallot',
  5: 'Valon ja Aineen Vuorovaikutus',
  6: 'Valon eteneminen',
  7: 'Superpositio',
  8: 'Interferenssi',
  9: 'Diffraktio',
  10: 'Geometrinen optiikka',
};

// section -> { en: filename, fi: filename|null }
// fi: null for 7.5 (no standalone Finnish file — folded into 7.4's Finnish file)
const SECTION_MAP = {
  '2.1': { en: 'II_2_1_Sa_hko_magneettiset_aallot.tex', fi: 'II_2_1_Sähkömagneettiset_aallot_FI.tex' },
  '2.2': { en: 'II_2_2_Sa_teet.tex', fi: 'II_2_2_Säteet_FI.tex' },
  '2.3': { en: 'II_2_3_Hiukkaset.tex', fi: 'II_2_3_Hiukkaset_FI.tex' },
  '3.1': { en: 'III_3_1_Liikkuva_ha_irio_.tex', fi: 'III_3_1_Liikkuva_häiriö_FI.tex' },
  '3.2': { en: 'III_3_2_Aaltoliike.tex', fi: 'III_3_2_Aaltoliike_FI.tex' },
  '3.3': { en: 'III_3_3_Harmoniset_aallot.tex', fi: 'III_3_3_Harmoniset_aallot_FI.tex' },
  '3.4': { en: 'III_3_4_Vaihe_ja_vaihenopeus.tex', fi: 'III_3_4_Vaihe_ja_vaihenopeus_FI.tex' },
  '3.5': { en: 'III_3_5_Superpositioperiaate.tex', fi: 'III_3_5_Superpositioperiaate_FI.tex' },
  '3.6': { en: 'III_3_6_Aaltojen_kompleksinen_esitys.tex', fi: 'III_3_6_Aaltojen_kompleksinen_esitys_FI.tex' },
  '3.7': { en: 'III_3_7_Tasoaallot.tex', fi: 'III_3_7_Tasoaallot_FI.tex' },
  '3.8': { en: 'III_3_8_Aaltoyhta_lo__kolmessa_ulottuvuudessa.tex', fi: 'III_3_8_Aaltoyhtälö_kolmessa_ulottuvuudessa_FI.tex' },
  '3.9': { en: 'III_3_9_Pallo_ja_sylinteriaallot.tex', fi: 'III_3_9_Pallo_ja_sylinteriaallot_FI.tex' },
  '3.10': { en: 'III_3_10_Vektorikenta_t.tex', fi: 'III_3_10_Vektorikentät_FI.tex' },
  '3.11': { en: 'III_3_11_Vektorianalyysin_perusteet.tex', fi: 'III_3_11_Vektorianalyysin_perusteet_FI.tex' },
  '3.12': { en: 'III_3_12_Sa_hko_statiikka_ja_sa_hko_staattiset_potentiaalit.tex', fi: 'III_3_12_Sähköstatiikka_ja_sähköstaattiset_potentiaalit_FI.tex' },
  '4.1': { en: 'IV_4_1_Mikroskooppiset_Maxwellin_yhta_lo_t.tex', fi: 'IV_4_1_Mikroskooppiset_Maxwellin_yhtälöt_FI.tex' },
  '4.2': { en: 'IV_4_2_Poikittainen_aaltoliike_ja_varauksen_sa_ilyminen.tex', fi: 'IV_4_2_Poikittainen_aaltoliike_ja_varauksen_säilyminen_FI.tex' },
  '4.3': { en: 'IV_4_3_Sa_hko_magneettisen_kenta_n_energia.tex', fi: 'IV_4_3_Sähkömagneettisen_kentän_energia_FI.tex' },
  '4.4': { en: 'IV_4_4_Sa_teilypaine_ja_liikema_a_ra_.tex', fi: 'IV_4_4_Säteilypaine_ja_liikemäärä_FI.tex' },
  '4.5': { en: 'IV_4_5_Dipolikentta_.tex', fi: 'IV_4_5_Dipolikenttä_FI.tex' },
  '4.6': { en: 'IV_4_6_Maxwellin_yhta_lo_t_va_liaineessa.tex', fi: 'IV_4_6_Maxwellin_yhtälöt_väliaineessa_FI.tex' },
  '5.1': { en: 'V_5_1_Atomien_ja_molekyylien_sa_teily.tex', fi: 'V_5_1_Atomien_ja_molekyylien_säteily_FI.tex' },
  '5.2': { en: 'V_5_2_Valon_ja_aineen_vuorovaikutus.tex', fi: 'V_5_2_Valon_ja_aineen_vuorovaikutus_FI.tex' },
  '5.3': { en: 'V_5_3_Lorentzin_atomimalli.tex', fi: 'V_5_3_Lorentzin_atomimalli_FI.tex' },
  '5.4': { en: 'V_5_4_Laserin_toimintaperiaate.tex', fi: 'V_5_4_Laserin_toimintaperiaate_FI.tex' },
  '6.1': { en: 'VI_6_1_Aaltorintamat_ja_sa_teet.tex', fi: 'VI_6_1_Aaltorintamat_ja_säteet_FI.tex' },
  '6.2': { en: 'VI_6_2_La_pa_isy_ja_heijastus_ilmio_ina_.tex', fi: 'VI_6_2_Läpäisy_ja_heijastus_ilmiöinä_FI.tex' },
  '6.3': { en: 'VI_6_3_La_pa_isyn_ja_heijastuksen_SMG_teoria.tex', fi: 'VI_6_3_Läpäisyn_ja_heijastuksen_SMG_teoria_FI.tex' },
  '6.4': { en: 'VI_6_4_Fresnelin_kertoimet.tex', fi: 'VI_6_4_Fresnelin_kertoimet_FI.tex' },
  '6.5': { en: 'VI_6_5_Heijastavuus_ja_la_pa_isevyys.tex', fi: 'VI_6_5_Heijastavuus_ja_läpäisevyys_FI.tex' },
  '6.6': { en: 'VI_6_6_Kokonaisheijastus.tex', fi: 'VI_6_6_Kokonaisheijastus_FI.tex' },
  '7.1': { en: 'VII_7_1_Superpositioperiaate.tex', fi: 'VII_7_1_Superpositioperiaate_FI.tex' },
  '7.2': { en: 'VII_7_2_Harmoniset_aallot.tex', fi: 'VII_7_2_Harmoniset_aallot_FI.tex' },
  '7.3': { en: 'VII_7_3_Seisovat_aallot.tex', fi: 'VII_7_3_Seisovat_aallot_FI.tex' },
  '7.4': { en: 'VII_7_4_Usean_aallon_superpositio.tex', fi: 'VII_7_4_Usean_aallon_superpositio_ja_koherenssi_FI.tex' },
  '7.5': { en: 'VII_7_5_Koherenssi.tex', fi: null },
  '8.1': { en: 'VIII_8_1_Vaatimukset_interferenssille.tex', fi: 'VIII_8_1_Vaatimukset_interferenssille_FI.tex' },
  '8.2': { en: 'VIII_8_2_Aaltorintaman_jakavat_interferometrit.tex', fi: 'VIII_8_2_Aaltorintaman_jakavat_interferometrit_FI.tex' },
  '8.3': { en: 'VIII_8_3_Amplitudin_jakavat_interferometrit.tex', fi: 'VIII_8_3_Amplitudin_jakavat_interferometrit_FI.tex' },
  '8.4': { en: 'VIII_8_4_Michelsonin_interferometri.tex', fi: 'VIII_8_4_Michelsonin_interferometri_FI.tex' },
  '8.5': { en: 'VIII_8_5_Usean_sa_teen_interferenssi.tex', fi: 'VIII_8_5_Usean_säteen_interferenssi_FI.tex' },
  '8.6': { en: 'VIII_8_6_Fabryn_Perotn_instrumentit.tex', fi: 'VIII_8_6_Fabryn_Perotn_instrumentit_FI.tex' },
  '8.7': { en: 'VIII_8_7_Fabryn_Perotn_spektroskopia.tex', fi: 'VIII_8_7_Fabryn_Perotn_spektroskopia_FI.tex' },
  '9.1': { en: 'IX_9_1_Diffraktio_ilmio_t.tex', fi: 'IX_9_1_Diffraktio_ilmiöt_FI.tex' },
  '9.2': { en: 'IX_9_2_Fraunhofer.tex', fi: 'IX_9_2_Fraunhofer_FI.tex' },
  '9.3': { en: 'IX_9_3_Yksinkertaisten_aukkojen_diffraktio.tex', fi: 'IX_9_3_Yksinkertaisten_aukkojen_diffraktio_FI.tex' },
  '9.4': { en: 'IX_9_4_Usean_aukon_diffraktio.tex', fi: 'IX_9_4_Usean_aukon_diffraktio_FI.tex' },
  '9.5': { en: 'IX_9_5_Diffraktiohilat.tex', fi: 'IX_9_5_Diffraktiohilat_FI.tex' },
  '10.1': { en: 'X_10_1_Perusma_a_ritelma_t.tex', fi: 'X_10_1_Perusmääritelmät_FI.tex' },
  '10.2': { en: 'X_10_2_Taittuminen_pallopinnalla.tex', fi: 'X_10_2_Taittuminen_pallopinnalla_FI.tex' },
  '10.3': { en: 'X_10_3_Ohut_linssi.tex', fi: 'X_10_3_Ohut_linssi_FI.tex' },
  '10.4': { en: 'X_10_4_Kuvanmuodostus.tex', fi: 'X_10_4_Kuvanmuodostus_FI.tex' },
  '10.5': { en: 'X_10_5_Linssisysteemit.tex', fi: 'X_10_5_Linssisysteemit_FI.tex' },
  '10.6': { en: 'X_10_6_Aukot_ja_rajoittimet.tex', fi: 'X_10_6_Aukot_ja_rajoittimet_FI.tex' },
  '10.7': { en: 'X_10_7_Peili.tex', fi: 'X_10_7_Peili_FI.tex' },
  '10.8': { en: 'X_10_8_Prisma.tex', fi: 'X_10_8_Prisma_FI.tex' },
  '10.9': { en: 'X_10_9_Ihmissilma_.tex', fi: 'X_10_9_Ihmissilmä_FI.tex' },
  '10.10': { en: 'X_10_10_Suurennuslasi.tex', fi: 'X_10_10_Suurennuslasi_FI.tex' },
  '10.11': { en: 'X_10_11_Okulaari.tex', fi: 'X_10_11_Okulaari_FI.tex' },
  '10.12': { en: 'X_10_12_Mikroskooppi.tex', fi: 'X_10_12_Mikroskooppi_FI.tex' },
  '10.13': { en: 'X_10_13_Kaukoputki.tex', fi: 'X_10_13_Kaukoputki_FI.tex' },
};

function sortSections(a, b) {
  const [am, as] = a.split('.').map(Number);
  const [bm, bs] = b.split('.').map(Number);
  return am - bm || as - bs;
}

function main() {
  const texDir = process.argv[2] || './tex';
  const titlesEnPath = process.argv[3] || './titles_en.json';
  const titlesFiPath = process.argv[4] || './titles_fi.json';

  const titlesEn = JSON.parse(fs.readFileSync(titlesEnPath, 'utf8'));
  const titlesFi = JSON.parse(fs.readFileSync(titlesFiPath, 'utf8'));
  // 7.5 has no textbook entry (slides-only split of 7.4) — title from the slides themselves
  if (!titlesEn['7.5']) titlesEn['7.5'] = 'Coherence';

  const sections = Object.keys(SECTION_MAP).sort(sortSections);

  const parts = [
    'COURSE MATERIAL CORPUS — FYS.240 Optics',
    'Text derived directly from the .tex lecture-slide sources (not PDF text extraction), so',
    'math renders as clean Unicode instead of garbled PDF glyphs. Both the English and Finnish',
    'lecture-slide sources are included, since the course is taught in both languages.',
    'Section 7.4/7.5: the English slides split "Superposition of several frequencies and',
    'coherence" into two files (7.4, 7.5); the Finnish slides never split it, so the Finnish',
    '7.4 block below covers both topics.',
    `Built ${new Date().toISOString().slice(0, 10)} by build_corpus.js.`,
  ];

  let chapterOpen = null;
  const stats = [];

  for (const sec of sections) {
    const chapter = Number(sec.split('.')[0]);
    if (chapter !== chapterOpen) {
      if (chapterOpen !== null) parts.push(`\n\n===== END CHAPTER ${chapterOpen} =====`);
      parts.push(
        `\n\n===== BEGIN CHAPTER ${chapter}: ${CHAPTER_TITLES_EN[chapter]} / ${CHAPTER_TITLES_FI[chapter]} =====`
      );
      chapterOpen = chapter;
    }

    const { en, fi } = SECTION_MAP[sec];
    const titleEn = titlesEn[sec] || '(untitled)';
    const titleFi = titlesFi[sec] || (sec === '7.5' ? titlesFi['7.4'] : '(untitled)');

    const rawEn = fs.readFileSync(path.join(texDir, en), 'utf8');
    const cleanedEn = clean.cleanTex(rawEn);
    parts.push(`\n\n### ${sec} ${titleEn} (EN) ###\n\n${cleanedEn}`);
    let charsEn = cleanedEn.length;
    let charsFi = 0;

    if (fi) {
      const rawFi = fs.readFileSync(path.join(texDir, fi), 'utf8');
      const cleanedFi = clean.cleanTex(rawFi);
      parts.push(`\n\n### ${sec} ${titleFi} (FI) ###\n\n${cleanedFi}`);
      charsFi = cleanedFi.length;
    } else {
      parts.push(
        `\n\n### ${sec} ${titleFi} (FI) ###\n\n[No separate Finnish recording/section for ${sec} — see the combined 7.4 Finnish block above, which covers both 7.4 and 7.5.]`
      );
    }

    stats.push({ sec, en, fi: fi || '(none — folded into 7.4 FI)', charsEn, charsFi });
  }
  parts.push(`\n\n===== END CHAPTER ${chapterOpen} =====`);

  const corpus = parts.join('\n');
  fs.writeFileSync('course_corpus.txt', corpus, 'utf8');

  console.log('Section  EN file'.padEnd(60) + 'FI file'.padEnd(55) + 'ENchars  FIchars');
  for (const s of stats) {
    console.log(
      s.sec.padEnd(8) + s.en.padEnd(60) + s.fi.padEnd(55) + String(s.charsEn).padEnd(8) + s.charsFi
    );
  }
  console.log(
    `\nWrote course_corpus.txt — ${corpus.length.toLocaleString()} chars ` +
    `(~${Math.round(corpus.length / 3.7).toLocaleString()} tokens)`
  );
  if (corpus.length / 3.7 > 150000) {
    console.warn('WARNING: corpus is large. Consider splitting by topic/language.');
  }
}

main();
