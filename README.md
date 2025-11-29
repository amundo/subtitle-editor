---
title: Subtitle editing tool
author: Patrick Hall
description: A web-based subtitle editing tool for transcribing VTT files from audio or video.
---

This is aan exprimental UI for editing subtitles (VTT format) directly from media. 

## Background

Writing accurate subtitles is a time-consuming task. AI can help, but nothing is as accurate as a human ear when it comes to understanding speech. So the best approach is to have AI generate a first draft, and then have a human editor correct it.

But at the human-editing stage, there is a lot of "received wisdom" about how a subtitle UI should look; typically, a waveform of the entire media file is shown at the top of the screen, and the subtitles are shown in a list below. The editor can then click on a subtitle to jump to that point in the waveform, or click on the waveform to jump to that point in the subtitles. This is clearly effective, but I think there is room for experimentation.


## Rationale

Rather than using a single global waveform to represent the whole media file, and then syncing with and navigating through subselections of that global file, this tool tries a different approach: each segment (cue) of the transcription is given its own small waveform directly adjacent to the transcription in quesiton. This reduces the need for navigation, as the editor can see the waveform for each cue directly next to the text they are editing. The preceding and following cues are also visible, so the editor can see the context of the current cue and make adjustments as needed in an intuitive way.


## Technical details

This tool is a web application built with Web Standards. As of now it is purely client-side. 

## Other tools for comparison

There are several tools available for editing subtitles, such as:

* [Aegisub](http://www.aegisub.org/)
* [Subtitle Edit](https://www.nikse.dk/SubtitleEdit)
* [Jubler](http://www.jubler.org/)
* [Amara](https://amara.org/)
* [YouTube Studio](https://studio.youtube.com/)
* [VTT Editor](https://www.nikse.dk/SubtitleEdit/Online)