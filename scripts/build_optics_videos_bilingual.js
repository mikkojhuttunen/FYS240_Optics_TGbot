#!/usr/bin/env node
/**
 * Parse the EN + FI YouTube analytics CSVs and generate a BILINGUAL
 * fys240_videos.js for the FYS.240 Optics Telegram bot.
 *
 * Unlike the old build_optics_videos.js (English-only, no topic_fi/id_fi
 * fields — this is what caused the Finnish links to get lost when it was
 * re-run), this script always merges both languages by chapter number and
 * writes topic_fi/id_fi onto every video that has a Finnish counterpart.
 *
 * Usage:
 *   node build_optics_videos_bilingual.js <en.csv> <fi.csv> [outputPath]
 *
 * Defaults match this project's actual filenames so it can be run with no
 * arguments from a directory containing both CSVs.
 */

const fs = require('fs');
const path = require('path');

const enCsvPath = process.argv[2] || './FYS_240_Optics_YT_links.csv';
const fiCsvPath = process.argv[3] || './FYS_240_Optiikka_YT_links.csv';
const outputPath = process.argv[4] || './fys240_videos.js';

function parseCSV(content) {
  const lines = content.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"/, '').replace(/"$/, ''));
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let j = 0; j < lines[i].length; j++) {
      const char = lines[i][j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        fields.push(current.trim().replace(/^"/, '').replace(/"$/, ''));
        current = '';
      } else {
        current += char;
      }
    }
    fields.push(current.trim().replace(/^"/, '').replace(/"$/, ''));

    const row = {};
    headers.forEach((header, idx) => {
      row[header] = fields[idx] || '';
    });

    records.push(row);
  }

  return records;
}

// title formats:
//   EN: "Optics 10.1 Basic definitions"
//   FI: "FYS.240 Optiikka 10.1 Perusmääritelmät"
function extractChapterAndTopic(title, langPrefixRegex) {
  const m = title.match(langPrefixRegex);
  if (!m) return null;
  return { chapter: m[1], topic: m[2].trim() };
}

function loadLanguage(csvPath, prefixRegex, label) {
  const content = fs.readFileSync(csvPath, 'utf8');
  const records = parseCSV(content);
  const byChapter = new Map(); // chapter -> {id, topic}

  const skipped = [];
  records
    .filter(r => r.Content && r.Content !== 'Total' && r.Content.length > 0)
    .forEach(r => {
      const id = r.Content.trim();
      const title = (r['Video title'] || '').trim();
      if (!id || !title) return;

      const parsed = extractChapterAndTopic(title, prefixRegex);
      if (!parsed) {
        skipped.push(title);
        return;
      }
      byChapter.set(parsed.chapter, { id, topic: parsed.topic });
    });

  if (skipped.length) {
    console.warn(`[${label}] Skipped ${skipped.length} row(s) that didn't match the expected title pattern:`);
    skipped.forEach(t => console.warn(`  - "${t}"`));
  }
  console.log(`[${label}] Parsed ${byChapter.size} videos from ${path.basename(csvPath)}`);
  return byChapter;
}

try {
  const enByChapter = loadLanguage(enCsvPath, /Optics\s+([\d.]+)\s+(.+)$/, 'EN');
  const fiByChapter = loadLanguage(fiCsvPath, /FYS\.240\s+Optiikka\s+([\d.]+)\s+(.+)$/, 'FI');

  const data = {
    course: {
      code: "FYS.240",
      name: "Optics",
      finnish: "Optiikka",
      channel: "https://www.youtube.com/@fysiikkaakotisohvalle1510"
    },
    videos: [],
    byChapter: {},
    byTopic: {}
  };

  for (const [chapter, en] of enByChapter.entries()) {
    const fi = fiByChapter.get(chapter);

    const entry = {
      id: en.id,
      chapter,
      topic: en.topic,
      url: `https://youtube.com/watch?v=${en.id}`
    };
    if (fi) {
      entry.id_fi = fi.id;
      entry.topic_fi = fi.topic;
      entry.url_fi = `https://youtube.com/watch?v=${fi.id}`;
    }

    data.videos.push(entry);

    if (!data.byChapter[chapter]) data.byChapter[chapter] = [];
    data.byChapter[chapter].push(en.id);

    // Index EN + FI topic words for /search-style lookups
    const keywordSource = fi ? `${en.topic} ${fi.topic}` : en.topic;
    const keywords = keywordSource.toLowerCase()
      .split(/[\s\-&(),.äöå]+/)
      .filter(w => w.length > 3);

    keywords.forEach(keyword => {
      if (!data.byTopic[keyword]) data.byTopic[keyword] = [];
      if (!data.byTopic[keyword].includes(en.id)) data.byTopic[keyword].push(en.id);
    });
  }

  // Report any FI videos whose chapter has no EN match (shouldn't normally happen)
  const missingEn = [...fiByChapter.keys()].filter(ch => !enByChapter.has(ch));
  if (missingEn.length) {
    console.warn(`WARNING: ${missingEn.length} FI video(s) have no EN counterpart and were dropped: ${missingEn.join(', ')}`);
  }

  const chaptersWithoutFi = data.videos.filter(v => !v.topic_fi).map(v => v.chapter);
  console.log(`Chapters with NO Finnish video (EN-only fallback in bot): ${chaptersWithoutFi.length ? chaptersWithoutFi.join(', ') : 'none'}`);

  // Sort by chapter (major.minor aware, not parseFloat — parseFloat("10.1") < parseFloat("2.1")
  // would be wrong here as a plain string, but numerically "10.1" > "2.1" is correct;
  // the real trap is minor-part padding e.g. "2.10" vs "2.2", so compare major/minor separately.
  function chapterSortKey(chapter) {
    const [major, minor] = chapter.split('.').map(Number);
    return major * 1000 + (minor || 0);
  }
  data.videos.sort((a, b) => chapterSortKey(a.chapter) - chapterSortKey(b.chapter));

  const jsContent = `/**
 * FYS.240 Optics - Video References Database (bilingual)
 * Lightweight data format for Telegram bot
 * Generated from YouTube analytics CSVs (EN + FI) by build_optics_videos_bilingual.js
 *
 * Each video carries EN fields (id, chapter, topic, url) and, where a
 * Finnish recording exists, FI fields (id_fi, topic_fi, url_fi). Entries
 * with no FI fields fall back to the EN video in the bilingual bot.
 *
 * Usage:
 *   const db = require('./fys240_videos');
 *   db.search('lenses');        // Find videos about lenses
 *   db.getChapter('10.3');      // Get all videos for chapter 10.3
 *   db.getVideo('WKIGee5ISaw'); // Get specific video
 */

const VIDEOS = ${JSON.stringify(data.videos, null, 2)};

const BY_CHAPTER = ${JSON.stringify(data.byChapter, null, 2)};

const BY_TOPIC = ${JSON.stringify(data.byTopic, null, 2)};

module.exports = {
  course: ${JSON.stringify(data.course)},

  /**
   * Get all videos as array
   */
  all() {
    return VIDEOS;
  },

  /**
   * Get video by ID (matches EN or FI video id)
   * @param {string} videoId - YouTube video ID
   * @returns {Object|null}
   */
  getVideo(videoId) {
    return VIDEOS.find(v => v.id === videoId || v.id_fi === videoId) || null;
  },

  /**
   * Get all videos in a chapter
   * @param {string} chapter - Chapter number (e.g., "10.1")
   * @returns {Array}
   */
  getChapter(chapter) {
    const ids = BY_CHAPTER[chapter] || [];
    return VIDEOS.filter(v => ids.includes(v.id));
  },

  /**
   * Search videos by topic keyword (matches EN or FI topic)
   * @param {string} keyword - Search keyword
   * @returns {Array} Matching videos sorted by chapter
   */
  search(keyword) {
    const lower = keyword.toLowerCase();
    return VIDEOS.filter(v =>
      v.topic.toLowerCase().includes(lower) ||
      (v.topic_fi && v.topic_fi.toLowerCase().includes(lower))
    );
  },

  /**
   * Get chapters list
   * @returns {Array} Sorted array of chapter numbers
   */
  getChapters() {
    return Object.keys(BY_CHAPTER).sort((a, b) => {
      const [aMaj, aMin] = a.split('.').map(Number);
      const [bMaj, bMin] = b.split('.').map(Number);
      return (aMaj * 1000 + (aMin || 0)) - (bMaj * 1000 + (bMin || 0));
    });
  },

  /**
   * Get quick topic summary for bot responses
   * @param {string} topic - Topic to find
   * @returns {Object|null} {chapter, topic, url, topic_fi?, url_fi?}
   */
  findBestMatch(topic) {
    const lower = topic.toLowerCase();

    let match = VIDEOS.find(v =>
      v.topic.toLowerCase().includes(lower) ||
      (v.topic_fi && v.topic_fi.toLowerCase().includes(lower))
    );
    if (match) return match;

    const keywords = lower.split(/\\s+/);
    for (const keyword of keywords) {
      match = VIDEOS.find(v =>
        v.topic.toLowerCase().includes(keyword) ||
        (v.topic_fi && v.topic_fi.toLowerCase().includes(keyword))
      );
      if (match) return match;
    }

    return null;
  },

  /**
   * Get all unique EN topics
   * @returns {Array}
   */
  getTopics() {
    return VIDEOS.map(v => v.topic);
  }
};
`;

  fs.writeFileSync(outputPath, jsContent);

  const withFi = data.videos.filter(v => v.topic_fi).length;
  console.log(`\n✓ Generated: ${outputPath}`);
  console.log(`  Videos: ${data.videos.length} (${withFi} with Finnish pair, ${data.videos.length - withFi} EN-only)`);
  console.log(`  Chapters: ${Object.keys(data.byChapter).length}`);
  console.log(`  Searchable topics: ${Object.keys(data.byTopic).length}`);

} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
