FYS.240 bot update — merges the bilingual-links versions (Finnish/English
video links, per-user language for /help /topics /weekN, bilingual quiz)
with the in-video-timestamp feature (precise &t= links into lectures).

FILES — all 5 replace their same-named files in your repo root:
  bot_fys240.js         was bot_fys240_bilingual_links.js + timestamp support
  quizGenerator_fys240.js  was quizGenerator_fys240_bilingual_links.js, unchanged
  fys240_videos.js      adds segments/findSegment/getSegments/findRelevantSegments,
                         loads video_segments.json
  video_segments.json   NEW — Finnish timestamps for ALL 59 lectures with content in the
                         source (chapters 2.1-10.13; only 9.4 has no timestamps listed
                         at all in the source doc), from FYS_240_video_contents_FI_all.docx
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

UPDATE: timestamp matching is now done in code, not left to the model.
findRelevantSegments(question) in fys240_videos.js fuzzy-matches the student's
question against every segment label (tolerant of Finnish case suffixes, e.g.
"yhtälöstä" matching a label of "yhtälö"), and bot_fys240.js sends the top 3
candidates alongside the question as a <possible_video_moments> block so Claude
picks from a short pre-matched list instead of scanning the whole raw dump. This
fixed a real miss: "kerro lisää poissonin yhtälöstä" wasn't finding the existing
"Poissonin yhtälö" timestamp before this change.

UPDATE: when a timestamp matches, the bot now gives TWO links in the sentence
instead of one combined link: the timestamp itself is clickable (e.g. "[16:48](url&t=1008s)")
and the video title is a separate plain link to the start of the video ("[Video 4.3 (Topic)](url)"),
e.g. "Tarkemmin asiasta kerrotaan kohdassa [16:48](...) videolla [Video 4.3 (...)](...).
Only bot_fys240.js changed for this.

UPDATE: rebuilt video_segments.json from FYS_240_video_contents_FI_all.docx (the
complete-course version of the earlier partial file), covering all chapters instead of
just 2.1-3.12. This also fixed a real parsing bug: several chapters (4.2-4.6, 5.4, ...)
have ALL their timestamps crammed onto a single line with no line breaks between entries
in the source doc, which the old line-by-line parser mistook for one giant entry (e.g.
chapter 4.2 went from 1 'segment' to the correct 18). import_docx_segments.js now splits
on timestamp tokens found anywhere in the text rather than assuming one per line, so it
handles both formats. Chapter 9.4 has no timestamps at all in the source and is skipped.

UPDATE: found and fixed a real bug I introduced last time — the previous glued-
timestamp fix wasn't precise enough and was silently corrupting ~300 legitimate
timestamps (e.g. "16:31" became "1 6:31", losing the real 16:31 entry and creating a
bogus 6:31 one). Replaced it with a narrower rule that only fires when a LETTER or ")"
sits directly against a timestamp with no space (the one real case in the source:
"g(x)h(y)3:50") and never when a digit precedes it, which is what caused the corruption.

import_docx_segments.js now also warns (but doesn't guess/auto-fix) whenever a chapter's
timestamps aren't in increasing order — that almost always means a typo in the SOURCE
document, not a parsing issue. Two remain, both look like real typos worth checking
against the actual videos:
  - Chapter 3.12: "17:00 Gaussin laki potentiaalimuodossa" appears twice (the second,
    labeled "osa 2", is also stamped 17:00 - almost certainly meant to be a later time).
  - Chapter 6.5: entries run 0:00, 0:26, then jump to 10:05 ("Tarkastelun siirto
    kentista irradiansseihin"), then back down to 3:16 - the 10:05 is likely a typo
    (perhaps meant to be ~1:05) for where that entry belongs chronologically.
Both are stored as-is (with segments still sorted by their stated time), so the bot will
link to whatever time the source doc says until you correct it by hand.

UPDATE: refreshed video_segments.json from your corrected source doc. Both
previously-flagged typos are now fixed (chapter 3.12's duplicate 17:00 entry is
gone; chapter 6.5's timestamps are now in correct chronological order), and the
duplicate 3.5 block is also gone. 628 timestamps across 59 videos, all clean —
the importer's out-of-order check now reports zero warnings.

Minor, not flagged as an error since it's not a duplicate/ordering issue: chapter
3.12's very last entry, "27:50 Sähkömagneetti", still trails off mid-word right
before the next chapter header. Timestamp itself is fine, just the description text.

Only video_segments.json changed in this update.
