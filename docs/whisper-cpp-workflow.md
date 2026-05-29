# Cuebert transcription kit

This guide assumes the transcription kit has already been prepared. In the
desktop app, it is also available from **Help > Transcription Setup Guide**.

## For the transcriber

Put each media file somewhere easy to find, such as the Desktop.

Open Terminal and run:

```sh
cuebert-transcribe ~/Desktop/interview.mp3
```

The command writes a JSON transcript next to the media file:

```text
~/Desktop/interview.json
```

Open that JSON file in Cuebert with **Load transcript**. If the media file is
next to it, Cuebert should automatically load the audio or video too.

Send both files to the editor:

```text
interview.json
interview.mp3
```

If the editor will keep working in Cuebert, they can save a
`interview.cuebert.json` file and use that from then on.

## Useful commands

Check that the kit is ready:

```sh
cuebert-transcribe --setup-check
```

Transcribe Spanish audio:

```sh
cuebert-transcribe --language es ~/Desktop/interview.mp3
```

Replace an existing JSON transcript:

```sh
cuebert-transcribe --overwrite ~/Desktop/interview.mp3
```

Transcribe several files:

```sh
cuebert-transcribe ~/Desktop/one.mp3 ~/Desktop/two.mp3
```

## Prepared kit layout

The wrapper can auto-find whisper.cpp and the model when the folder looks like
this:

```text
cuebert-transcription-kit/
  cuebert-transcribe
  whisper-cli
  models/
    ggml-large-v3.bin
```

On Windows, the executable names are:

```text
cuebert-transcribe.exe
whisper-cli.exe
```

## Setup notes

The person preparing the kit needs to provide:

- the compiled `cuebert-transcribe` wrapper
- a matching `whisper-cli` binary for the operating system
- one whisper.cpp `ggml` model in the `models/` folder

No Deno, Homebrew, Git, or Xcode install is needed on the transcriber's machine
when those files are already in the kit.
