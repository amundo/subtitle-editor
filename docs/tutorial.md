---
title: Cuebert Tutorial Syllabus
author: Pat
---

Cuebert is a subtitle editor for reviewing and correcting machine-generated transcripts. It is built around cue-by-cue editing: each subtitle cue has its own text, timing controls, speaker label, and local waveform. The goal is to make subtitle correction feel less like navigating a long timeline and more like working through a clear list of moments in the media.

This syllabus introduces the software as a guided tutorial. By the end, a learner should understand the main editing workflow, how cue timing relates to audio, how autosave and export work, and how to reason about common subtitle-editing decisions.

## 1. What Cuebert Edits

A subtitle file is a sequence of cues. Each cue has:

- a start time
- an end time
- subtitle text
- an optional speaker label
- optional source metadata from the original transcript

Cuebert can load transcript formats such as VTT and aTrain-style JSON, then present those cues as editable blocks. The media file provides playback and waveform context, but the cue list is the primary workspace.

### Try It

1. Open Cuebert.
2. Load a transcript.
3. Load or auto-load the matching media file.
4. Scroll through the cue list and identify where timing, speaker, text, and waveform controls appear.

### Study Questions

1. What information does a subtitle cue need in order to appear at the right time?
2. Why might a cue list be easier to edit than a single global timeline?
3. What parts of a cue can change without changing the text?

## 2. The Main Editing Loop

Most correction work follows a repeated loop:

1. Focus a cue.
2. Play the cue.
3. Compare the text to the audio.
4. Correct the text.
5. Adjust the cue boundaries if the subtitle starts or ends too early or too late.
6. Move to the next cue.

Cuebert keeps the current cue near the center of the workflow. The play button on a cue previews that cue's time range. The bottom transport controls play or pause the media globally.

### Try It

1. Click into a cue's text box.
2. Use the cue play button to preview that cue.
3. Edit the text.
4. Move to the next cue and repeat.

### Study Questions

1. When should you edit text, and when should you adjust timing?
2. What is the difference between playing a cue and playing the media from the transport bar?
3. Why is it useful for cue playback to stop at the cue's end time?

## 3. Working With Waveforms

Cuebert renders a compact waveform for each cue. The center region represents the cue itself, while nearby audio gives context before and after the cue. This makes it easier to see whether speech begins before the cue, continues after it, or includes silence inside the current timing.

The waveform is not a substitute for listening. It is a visual guide that helps the editor decide where to listen closely and where timing may need adjustment.

### Try It

1. Find a cue where the waveform starts before the cue boundary.
2. Listen to the cue.
3. Adjust the start or end boundary if the subtitle appears too early or too late.
4. Preview the cue again.

### Study Questions

1. What can a waveform show that text cannot?
2. Why should timing changes be checked by listening, not only by looking?
3. What might a quiet section inside a cue indicate?

## 4. Splitting, Merging, and Deleting Cues

Cuebert supports structural cue edits:

- Split a cue when one subtitle contains two distinct subtitle moments.
- Merge cues when one thought was divided too aggressively.
- Delete a cue when it is empty, duplicated, or not useful.

After deleting a focused cue, focus should move to the next cue so editing can continue without breaking the flow. If there is no next cue, focus should move to the previous cue.

### Try It

1. Split a cue at the current media timestamp.
2. Merge two adjacent cues.
3. Delete a cue and observe where focus goes next.

### Study Questions

1. What makes a cue a good candidate for splitting?
2. What risks come with merging two cues?
3. After deleting a cue, why should focus move to the next cue rather than disappearing?

## 5. Speaker Labels

Speaker labels help identify who is talking. Cuebert allows a cue to have a speaker, no speaker, or a renamed speaker. Consistent speaker labels make exported transcripts easier to read and review.

Speaker labels should be meaningful, brief, and consistent. For example, use `Host` and `Guest` consistently instead of alternating between `host`, `Interviewer`, and `Speaker 1` unless those labels mean different people.

### Try It

1. Assign a speaker to a cue.
2. Rename a speaker.
3. Clear a speaker from a cue that does not need one.

### Study Questions

1. When does a subtitle cue need a speaker label?
2. What problems can inconsistent speaker names create?
3. Why might some cues intentionally have no speaker?

## 6. Finding and Reviewing Cues

Cuebert includes cue search for finding words, names, or repeated errors. Search can be used as a review tool after the first editing pass.

Useful search tasks include:

- checking spelling of names
- finding repeated filler words
- reviewing all cues from a specific speaker
- locating empty or suspicious cues

### Try It

1. Search for a word that appears multiple times.
2. Toggle match-case or whole-word matching.
3. Clear the search and return to the cue in context.

### Study Questions

1. How can search help after a transcript has already been edited once?
2. When is whole-word matching more useful than a regular text search?
3. What kinds of subtitle problems are easiest to find by search?

## 7. Gap Cues and Missing Audio

Cuebert can detect places where there is audible sound between existing cues and insert empty generated gap cues. These help editors notice speech or sound that the original transcript may have missed.

Short gaps are ignored unless they meet the minimum cue duration. This prevents very small audio fragments from becoming distracting cue candidates.

### Try It

1. Load a transcript and matching media.
2. Look for empty generated cues.
3. Listen to each generated cue.
4. Add text if speech is present, or delete the cue if it is not useful.

### Study Questions

1. Why might an automatic transcript miss audio between cues?
2. Why should Cuebert ignore very short gaps?
3. What should an editor do with an empty generated gap cue?

## 8. Autosave and Export

Cuebert can autosave work in a Cuebert JSON format so editing state is preserved. It can also export subtitle or text formats for sharing and publishing.

Use autosave for ongoing work. Use export when the transcript is ready to leave Cuebert or be used somewhere else.

### Try It

1. Confirm that autosave is enabled.
2. Make a small edit.
3. Export a Cuebert JSON copy.
4. Export a VTT or TXT version.

### Study Questions

1. What is the difference between saving editing state and exporting a final subtitle file?
2. Why is autosave useful during subtitle correction?
3. Which export format would you choose for a video player, and why?

## 9. Keyboard Workflow

Cuebert is designed for repeated editing, so keyboard shortcuts help reduce unnecessary clicking. Important workflows include playing the current cue, moving between cue text boxes, searching, and deleting with confirmation.

The exact shortcuts are shown inside the app's keyboard shortcut guide.

### Try It

1. Open the keyboard shortcut guide.
2. Practice playing the current cue from the keyboard.
3. Move between cue text boxes.
4. Delete a cue and confirm that focus moves to the next cue.

### Study Questions

1. Which actions happen often enough to deserve keyboard shortcuts?
2. Why should destructive actions, such as deleting a cue, still require confirmation?
3. How does keyboard focus affect editing speed?

## 10. Final Practice Project

Choose a short audio or video clip with a draft transcript. Edit it in Cuebert from start to finish.

Your finished project should have:

- corrected subtitle text
- reasonable cue start and end times
- consistent speaker labels where useful
- reviewed gap cues
- no obvious duplicate, empty, or misplaced cues
- an exported final file

### Final Study Questions

1. What were the most common errors in the draft transcript?
2. Which cues needed timing changes, and why?
3. How did waveform context change your editing decisions?
4. What checks did you perform before export?
5. If you were editing a longer transcript, what workflow would help you stay consistent?
