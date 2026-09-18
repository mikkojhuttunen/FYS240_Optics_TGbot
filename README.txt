FYS.240 bot update — merges the bilingual-links versions (Finnish/English
video links, per-user language for /help /topics /weekN, bilingual quiz)
with the in-video-timestamp feature (precise &t= links into lectures).

FILES — all 5 replace their same-named files in your repo root:
  bot_fys240.js         was bot_fys240_bilingual_links.js + timestamp support
  quizGenerator_fys240.js  was quizGenerator_fys240_bilingual_links.js, unchanged
  fys240_videos.js      adds segments/findSegment/getSegments, loads video_segments.json
  video_segments.json   NEW — Finnish timestamps for chapters 2.1-3.12 (16 videos, from
                         FYS_240_video_contents_FI.docx) + the ch. 4.3 example
  add_video_segments.js NEW — CLI to add more, one video at a time:
                         node add_video_segments.js <videoId> file.txt
  import_docx_segments.js NEW — bulk importer for a whole "FYS. 240 Optiikka X.Y ..."
                         style document like FYS_240_video_contents_FI.docx:
                         node import_docx_segments.js path/to/that_file

Nothing else in your repo needs to change (latex-renderer.js, corpusLoader.js,
course_corpus.txt, homework_problems.json, etc. are untouched).

After deploying, sanity-check:
  - /topics and /help should reply in Finnish for a Finnish-language Telegram client
  - a Finnish question about a chapter-4.3 topic (e.g. "irradianssi") should get
    a link to https://youtube.com/watch?v=KCRFMlnFNbQ&t=... at a specific timestamp
  - same for anything in chapters 2.1-3.12, e.g. "Snellin laki" -> chapter 2.2 around 11:53

NOTE: FYS_240_video_contents_FI.docx only covers chapters 2.1-3.12, and cuts off
mid-sentence at the very end of 3.12 (the last incomplete line was dropped rather
than stored). Chapters 3.12 onward (4.x-10.x) have no Finnish timestamps yet -- run
add_video_segments.js for those once you have the source text, same as before.
