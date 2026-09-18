#!/usr/bin/env node
/**
 * Parse YouTube analytics CSV and generate lightweight video reference data
 * for FYS.240 Optics Telegram bot (no external dependencies)
 */

const fs = require('fs');
const path = require('path');

const csvPath = process.argv[2] || '/mnt/user-data/uploads/Table_data.csv';
const outputPath = process.argv[3] || '/home/claude/fys240_videos.js';

function parseCSV(content) {
  const lines = content.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"/, '').replace(/"$/, ''));
  const records = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    // Simple CSV parser (handles quoted fields)
    const row = {};
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
    
    headers.forEach((header, idx) => {
      row[header] = fields[idx] || '';
    });
    
    records.push(row);
  }
  
  return records;
}

try {
  const fileContent = fs.readFileSync(csvPath, 'utf8');
  const records = parseCSV(fileContent);
  
  // Filter out the "Total" row
  const videos = records.filter(r => 
    r.Content && 
    r.Content !== 'Total' && 
    r.Content.length > 0
  );

  console.log(`Parsed ${videos.length} videos from CSV`);

  // Build data structure
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

  // Process videos
  videos.forEach(video => {
    const videoId = video.Content.trim();
    const title = (video['Video title'] || '').trim();
    
    if (!videoId || !title) return;

    // Extract chapter (e.g., "Optics 10.1 Basic definitions" -> "10.1")
    const chapterMatch = title.match(/Optics\s+([\d.]+)/);
    const chapter = chapterMatch ? chapterMatch[1] : '';

    // Extract topic name
    const topicMatch = title.match(/Optics\s+[\d.]+\s+(.+)$/);
    const topicName = topicMatch ? topicMatch[1].trim() : '';

    if (!chapter || !topicName) {
      console.warn(`Skipping: "${title}" - couldn't parse chapter/topic`);
      return;
    }

    const entry = {
      id: videoId,
      chapter: chapter,
      topic: topicName,
      url: `https://youtube.com/watch?v=${videoId}`
    };

    data.videos.push(entry);

    // Index by chapter
    if (!data.byChapter[chapter]) {
      data.byChapter[chapter] = [];
    }
    data.byChapter[chapter].push(videoId);

    // Index by topic keywords for searching
    const keywords = topicName.toLowerCase()
      .split(/[\s\-&(),]+/)
      .filter(w => w.length > 3);
    
    keywords.forEach(keyword => {
      if (!data.byTopic[keyword]) {
        data.byTopic[keyword] = [];
      }
      if (!data.byTopic[keyword].includes(videoId)) {
        data.byTopic[keyword].push(videoId);
      }
    });
  });

  // Sort by chapter
  data.videos.sort((a, b) => {
    const aChapter = parseFloat(a.chapter);
    const bChapter = parseFloat(b.chapter);
    return aChapter - bChapter;
  });

  // Generate JavaScript module
  const jsContent = `/**
 * FYS.240 Optics - Video References Database
 * Lightweight data format for Telegram bot
 * Generated from YouTube analytics CSV
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
   * Get video by ID
   * @param {string} videoId - YouTube video ID
   * @returns {Object|null}
   */
  getVideo(videoId) {
    return VIDEOS.find(v => v.id === videoId) || null;
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
   * Search videos by topic keyword
   * @param {string} keyword - Search keyword
   * @returns {Array} Matching videos sorted by chapter
   */
  search(keyword) {
    const lower = keyword.toLowerCase();
    const results = VIDEOS.filter(v => 
      v.topic.toLowerCase().includes(lower)
    );
    return results;
  },
  
  /**
   * Get chapters list
   * @returns {Array} Sorted array of chapter numbers
   */
  getChapters() {
    return Object.keys(BY_CHAPTER).sort((a, b) => 
      parseFloat(a) - parseFloat(b)
    );
  },
  
  /**
   * Get quick topic summary for bot responses
   * @param {string} topic - Topic to find
   * @returns {Object|null} {chapter, topic, url}
   */
  findBestMatch(topic) {
    const lower = topic.toLowerCase();
    
    // Exact or partial match in topic name
    let match = VIDEOS.find(v => 
      v.topic.toLowerCase().includes(lower)
    );
    if (match) return match;
    
    // Try keyword search
    const keywords = lower.split(/\\s+/);
    for (const keyword of keywords) {
      match = VIDEOS.find(v => 
        v.topic.toLowerCase().includes(keyword)
      );
      if (match) return match;
    }
    
    return null;
  },
  
  /**
   * Get all unique topics
   * @returns {Array}
   */
  getTopics() {
    return VIDEOS.map(v => v.topic);
  }
};
`;

  // Write output
  fs.writeFileSync(outputPath, jsContent);

  // Print stats
  const fileSize = Math.round(jsContent.length / 1024 * 100) / 100;
  console.log(`\n✓ Generated: ${outputPath}`);
  console.log(`  Videos: ${data.videos.length}`);
  console.log(`  Chapters: ${Object.keys(data.byChapter).length}`);
  console.log(`  Searchable topics: ${Object.keys(data.byTopic).length}`);
  console.log(`  File size: ${fileSize} KB`);
  console.log(`\nSample videos:`);
  data.videos.slice(0, 3).forEach(v => {
    console.log(`  ${v.chapter}: ${v.topic}`);
  });

} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
