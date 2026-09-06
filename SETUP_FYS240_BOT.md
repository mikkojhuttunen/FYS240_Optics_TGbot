# FYS.240 Optics — Telegram Bot Setup Guide

This guide explains how to set up and deploy the teaching assistant bot for **FYS.240 Optics** with integrated YouTube lecture videos.

## Overview

The bot provides students with:
- Quick answers to conceptual questions about optics topics
- Direct links to relevant video lectures
- Homework hints (not solutions)
- Course material references

## Generated Files

### Core Files

1. **`fys240_videos.js`** (5.4 KB)
   - Lightweight video database generated from CSV analytics
   - 13 lecture videos organized by chapter (10.1-10.13)
   - Searchable by topic or chapter
   - Helper methods: `search()`, `getChapter()`, `findBestMatch()`

2. **`bot_fys240.js`**
   - Modified bot for FYS.240 Optics course
   - Replaces the old FYS.501-specific bot
   - Integrates `fys240_videos.js` database
   - Updated system prompt and help text

3. **`video_references_updated.json`**
   - Updated JSON reference file with individual FYS.240 videos
   - Can be used as alternative to `fys240_videos.js`
   - Also retains FYS.501 data for reference

## Setup Steps

### 1. Prerequisites

```bash
npm install express axios
```

Ensure you have Node.js v14+ installed.

### 2. Environment Variables

Set these before running the bot:

```bash
export TELEGRAM_TOKEN="your_bot_token_here"
export ANTHROPIC_API_KEY="your_api_key_here"
export BOT_USERNAME="@your_bot_username"  # Used for mention detection
export WEBHOOK_SECRET="your_secret_token" # For webhook security
export LATEX_ENABLED="true"               # Enable LaTeX rendering (optional)
export CACHE_TTL="1h"                     # Cache duration
export MODEL="claude-haiku-4-5-20251001"  # Claude model
export PORT="3000"                        # Server port
```

### 3. Course Material (Optional)

Place a `course_corpus.txt` file in the bot directory with course material:
- Lecture notes
- Textbook excerpts
- Problem summaries

The bot will cache this content for efficient querying.

### 4. LaTeX Support (Optional)

If `LATEX_ENABLED=true`, the bot will:
- Parse LaTeX equations in Claude's responses
- Render them as PNG images
- Send readable equations to Telegram

Requires `latex-renderer.js` from the original project.

### 5. Deploy the Bot

**Development (polling):**
```bash
node bot_fys240.js
```

**Production (webhook):**
```bash
# Set webhook URL at Telegram
curl -X POST https://api.telegram.org/bot{TOKEN}/setWebhook \
  -d url=https://your-domain.com/webhook \
  -d secret_token={WEBHOOK_SECRET}

# Run server
node bot_fys240.js
```

## Using the Video Database

### In Your Code

```javascript
const videoDB = require('./fys240_videos');

// Get all videos
videoDB.all();

// Search by topic
videoDB.search('lenses');        // Returns array of videos
videoDB.search('image');         // Multiple topic matches

// Get specific chapter
videoDB.getChapter('10.3');      // Get Thin lenses video

// Get single video
videoDB.getVideo('WKIGee5ISaw'); // Returns video object with URL

// Get best match for a student question
const video = videoDB.findBestMatch('how do lenses focus light');
```

### Video Object Structure

```javascript
{
  id: "WKIGee5ISaw",           // YouTube video ID
  chapter: "10.1",              // Chapter number
  topic: "Basic definitions",   // Video title/topic
  url: "https://youtube.com/watch?v=WKIGee5ISaw"
}
```

### Search Capabilities

The video database indexes content by:
- **Chapter number**: `10.1`, `10.2`, etc.
- **Topic keywords**: "lenses", "magnification", "refraction", etc.
- **Exact title matches**: "Basic definitions", "Thin lenses", etc.

## Video Lectures Included

All from Chapter 10 (Geometric Optics):

| Chapter | Topic | Video ID |
|---------|-------|----------|
| 10.1 | Basic definitions | WKIGee5ISaw |
| 10.2 | Refraction at a spherical surface | 6eMo9rIPaw4 |
| 10.3 | Thin lenses | _P3oLukTFTE |
| 10.4 | Image formation | mHaqg91mdqU |
| 10.5 | Combination of lenses | pSjhB-N4yOU |
| 10.6 | Apertures and stops | LsSDUs54BzA |
| 10.7 | Mirrors | XCxuW52jv-4 |
| 10.8 | Prisms | ZyEEYqvkbt4 |
| 10.9 | Human eye | uHOZb69Qcgo |
| 10.10 | Magnifying glass | ZzNvEyRSFEM |
| 10.11 | Eyepiece | a0AGftBDXzI |
| 10.12 | Microscope | AGc87oSBf7s |
| 10.13 | Telescope | H_tQ8I7Fhns |

## Bot Commands

```
/start          - Show help message
/help           - Show detailed help
/topics         - List all video lectures
/reset          - Clear conversation history
@bot_mention    - Direct mention in group chat
```

## Student Interactions

### Example 1: Conceptual Question
**Student:** "How do thin lenses work?"

**Bot:** "Thin lenses bend light rays to focus them at a focal point. Video 10.3 covers this in detail: https://youtube.com/watch?v=_P3oLukTFTE. The focal length depends on the lens shape and the refractive index of the material."

### Example 2: Homework Help
**Student:** "I'm stuck on problem 5.3 about image formation"

**Bot:** "Image formation is covered in Video 10.4: https://youtube.com/watch?v=mHaqg91mdqU. Try drawing a ray diagram first—where do the principal rays intersect? That's where the image forms."

### Example 3: Multiple Topics
**Student:** "Explain magnification"

**Bot:** "Magnification is how much larger (or smaller) an image appears. For lenses, it's the ratio of image height to object height. Videos 10.10 (magnifying glass), 10.12 (microscope), and 10.13 (telescope) show practical applications."

## Troubleshooting

### Video database not loading
- Check that `fys240_videos.js` is in the bot directory
- Verify file path in `bot_fys240.js`: `require("./fys240_videos")`
- Check Node.js console for error messages

### Bot not responding to mentions
- Verify `BOT_USERNAME` environment variable is set correctly
- Remove `@` from username: use `mybot`, not `@mybot`
- Bot responds to mentions in group chats and direct messages

### LaTeX not rendering
- Ensure `latex-renderer.js` exists in the project
- Set `LATEX_ENABLED=true`
- Check that pdflatex/LaTeX is installed on the server

### Videos not suggested
- Claude might not recognize a topic as matching available videos
- Check `videoDB.search()` directly for what's available
- Add more context to the student question

## Customization

### Adding More Videos

1. Export new YouTube analytics CSV
2. Update `/mnt/user-data/uploads/Table_data.csv`
3. Run the parser:
   ```bash
   node build_optics_videos.js
   ```
4. Restart the bot

### Changing System Prompt

Edit `TA_INSTRUCTIONS` in `bot_fys240.js`:
- Adjust tone or teaching style
- Add course-specific policies
- Modify video suggestion logic

### Adjusting Response Length

Change `MAX_TOKENS` environment variable:
- Smaller values (500-700) → shorter, punchier responses
- Larger values (1000+) → more detailed explanations

## Performance Notes

- **Video database size**: 5.4 KB (minimal memory footprint)
- **Response time**: ~2-3 seconds average (Claude API + Telegram)
- **Context caching**: 1-hour cache for course material saves API costs
- **Rate limiting**: 4 seconds minimum between user requests (configurable)

## Migration from FYS.501

If you were running the FYS.501 bot:

1. Replace `bot.js` with `bot_fys240.js`
2. Replace `video_references.json` with `video_references_updated.json`
3. Add `fys240_videos.js` to project directory
4. Update `TELEGRAM_TOKEN` if bot token changed
5. Restart the bot

The FYS.501 data is still in `video_references_updated.json` if needed for reference or dual-course support.

## API & Advanced Usage

### Generating Video Database from Custom CSV

```bash
# Using the provided parser
node build_optics_videos.js /path/to/your/analytics.csv /path/to/output.js
```

The parser expects CSV columns:
- `Content` — YouTube video ID
- `Video title` — Title containing "Optics X.Y Topic Name" format

### Using with Claude API

Include video references in system prompt:

```javascript
const videoDB = require('./fys240_videos');

const systemPrompt = `You are a teaching assistant.
Reference these videos when relevant:
${videoDB.all().map(v => `${v.chapter}: ${v.topic} - ${v.url}`).join('\n')}`;
```

## Support & Debugging

Enable detailed logging:

```bash
DEBUG=* node bot_fys240.js
```

Check health endpoint:
```bash
curl http://localhost:3000/healthz
```

Response example:
```json
{
  "ok": true,
  "corpusChars": 250000,
  "videoLectures": 13,
  "latexEnabled": true
}
```

## License & Attribution

- Bot framework adapted from FYS.501 implementation
- Video lectures: [@fysiikkaakotisohvalle1510](https://www.youtube.com/@fysiikkaakotisohvalle1510)
- Course: FYS.240 Optics, University of Jyväskylä
