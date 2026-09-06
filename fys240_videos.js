/**
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

const VIDEOS = [
  {
    "id": "WKIGee5ISaw",
    "chapter": "10.1",
    "topic": "Basic definitions",
    "url": "https://youtube.com/watch?v=WKIGee5ISaw"
  },
  {
    "id": "ZzNvEyRSFEM",
    "chapter": "10.10",
    "topic": "Magnifying glass",
    "url": "https://youtube.com/watch?v=ZzNvEyRSFEM"
  },
  {
    "id": "a0AGftBDXzI",
    "chapter": "10.11",
    "topic": "Eyepiece",
    "url": "https://youtube.com/watch?v=a0AGftBDXzI"
  },
  {
    "id": "AGc87oSBf7s",
    "chapter": "10.12",
    "topic": "Microscope",
    "url": "https://youtube.com/watch?v=AGc87oSBf7s"
  },
  {
    "id": "H_tQ8I7Fhns",
    "chapter": "10.13",
    "topic": "Telescope",
    "url": "https://youtube.com/watch?v=H_tQ8I7Fhns"
  },
  {
    "id": "6eMo9rIPaw4",
    "chapter": "10.2",
    "topic": "Refraction at a spherical surface",
    "url": "https://youtube.com/watch?v=6eMo9rIPaw4"
  },
  {
    "id": "_P3oLukTFTE",
    "chapter": "10.3",
    "topic": "Thin lenses",
    "url": "https://youtube.com/watch?v=_P3oLukTFTE"
  },
  {
    "id": "mHaqg91mdqU",
    "chapter": "10.4",
    "topic": "Image formation",
    "url": "https://youtube.com/watch?v=mHaqg91mdqU"
  },
  {
    "id": "pSjhB-N4yOU",
    "chapter": "10.5",
    "topic": "Combination of lenses",
    "url": "https://youtube.com/watch?v=pSjhB-N4yOU"
  },
  {
    "id": "LsSDUs54BzA",
    "chapter": "10.6",
    "topic": "Apertures and stops",
    "url": "https://youtube.com/watch?v=LsSDUs54BzA"
  },
  {
    "id": "XCxuW52jv-4",
    "chapter": "10.7",
    "topic": "Mirrors",
    "url": "https://youtube.com/watch?v=XCxuW52jv-4"
  },
  {
    "id": "ZyEEYqvkbt4",
    "chapter": "10.8",
    "topic": "Prisms",
    "url": "https://youtube.com/watch?v=ZyEEYqvkbt4"
  },
  {
    "id": "uHOZb69Qcgo",
    "chapter": "10.9",
    "topic": "Human eye",
    "url": "https://youtube.com/watch?v=uHOZb69Qcgo"
  }
];

const BY_CHAPTER = {
  "10.6": [
    "LsSDUs54BzA"
  ],
  "10.1": [
    "WKIGee5ISaw"
  ],
  "10.2": [
    "6eMo9rIPaw4"
  ],
  "10.12": [
    "AGc87oSBf7s"
  ],
  "10.7": [
    "XCxuW52jv-4"
  ],
  "10.5": [
    "pSjhB-N4yOU"
  ],
  "10.4": [
    "mHaqg91mdqU"
  ],
  "10.3": [
    "_P3oLukTFTE"
  ],
  "10.11": [
    "a0AGftBDXzI"
  ],
  "10.13": [
    "H_tQ8I7Fhns"
  ],
  "10.9": [
    "uHOZb69Qcgo"
  ],
  "10.10": [
    "ZzNvEyRSFEM"
  ],
  "10.8": [
    "ZyEEYqvkbt4"
  ]
};

const BY_TOPIC = {
  "apertures": [
    "LsSDUs54BzA"
  ],
  "stops": [
    "LsSDUs54BzA"
  ],
  "basic": [
    "WKIGee5ISaw"
  ],
  "definitions": [
    "WKIGee5ISaw"
  ],
  "refraction": [
    "6eMo9rIPaw4"
  ],
  "spherical": [
    "6eMo9rIPaw4"
  ],
  "surface": [
    "6eMo9rIPaw4"
  ],
  "microscope": [
    "AGc87oSBf7s"
  ],
  "mirrors": [
    "XCxuW52jv-4"
  ],
  "combination": [
    "pSjhB-N4yOU"
  ],
  "lenses": [
    "pSjhB-N4yOU",
    "_P3oLukTFTE"
  ],
  "image": [
    "mHaqg91mdqU"
  ],
  "formation": [
    "mHaqg91mdqU"
  ],
  "thin": [
    "_P3oLukTFTE"
  ],
  "eyepiece": [
    "a0AGftBDXzI"
  ],
  "telescope": [
    "H_tQ8I7Fhns"
  ],
  "human": [
    "uHOZb69Qcgo"
  ],
  "magnifying": [
    "ZzNvEyRSFEM"
  ],
  "glass": [
    "ZzNvEyRSFEM"
  ],
  "prisms": [
    "ZyEEYqvkbt4"
  ]
};

module.exports = {
  course: {"code":"FYS.240","name":"Optics","finnish":"Optiikka","channel":"https://www.youtube.com/@fysiikkaakotisohvalle1510"},
  
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
    const keywords = lower.split(/\s+/);
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
