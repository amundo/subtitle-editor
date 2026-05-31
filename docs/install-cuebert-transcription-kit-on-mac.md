# Install Cuebert transcription kit on another Mac

This is a future-reference checklist for installing the prepared
`cuebert-transcription-kit` on a Mac. It assumes the kit was
already built on the development Mac and includes:

```text
cuebert-transcription-kit/
  cuebert-transcribe
  whisper-cli
  lib/
    libwhisper.1.dylib
    libggml.0.dylib
    ...
  models/
    ggml-small.bin
    ggml-silero-v6.2.0.bin
```

The Whisper model file name can be different. `cuebert-transcribe` auto-finds
the first Whisper `.bin` file in the kit's `models/` folder and uses
`ggml-silero-v6.2.0.bin` automatically when it is present for VAD segmentation.

## 1. Prepare the kit on this Mac

From the repo:

```sh
cd /Users/pathall/Sites/Video/subtitle-editor
sh package-kit.sh
```

That creates or refreshes:

```text
/Users/pathall/Sites/Video/subtitle-editor/cuebert-transcription-kit/
```

Optional: make a zip that is easier to move:

```sh
zip -r cuebert-transcription-kit.zip cuebert-transcription-kit
```

## 2. Copy the kit to the other Mac

Move either the folder or the zip file by AirDrop, USB drive, or file sharing.
Put the unpacked folder here on the other Mac:

```text
~/Applications/cuebert-transcription-kit/
```

Any folder works, but `~/Applications` keeps the kit out of the way and avoids
needing administrator access.

If a zip was copied, double-click it first so the real
`cuebert-transcription-kit` folder exists.

## 3. Remove macOS quarantine and make binaries executable

On the other Mac, open Terminal and run:

```sh
cd ~/Applications/cuebert-transcription-kit
xattr -dr com.apple.quarantine .
chmod +x cuebert-transcribe whisper-cli
```

The `xattr` command prevents Gatekeeper from blocking the copied command-line
tools. The `chmod` command is harmless if the execute bit is already set.

## 4. Add a convenient command

Create a personal `bin` folder and symlink the wrapper into it:

```sh
mkdir -p ~/bin
ln -sf ~/Applications/cuebert-transcription-kit/cuebert-transcribe ~/bin/cuebert-transcribe
```

Make sure `~/bin` is on the shell path:

```sh
grep -q 'export PATH="$HOME/bin:$PATH"' ~/.zshrc || echo 'export PATH="$HOME/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

If `cuebert-transcribe --setup-check` says the model is missing after this
step, the copied wrapper may be an older build that does not resolve symlinks.
Use the direct kit path instead:

```sh
~/Applications/cuebert-transcription-kit/cuebert-transcribe --setup-check
```

Or set the model path explicitly:

```sh
WHISPER_CPP_MODEL=~/Applications/cuebert-transcription-kit/models/ggml-small.bin cuebert-transcribe --setup-check
```

## 5. Verify the install

Run:

```sh
cuebert-transcribe --setup-check
```

A working install prints the paths it found for:

```text
whisper.cpp:  .../cuebert-transcription-kit/whisper-cli
Model:        .../cuebert-transcription-kit/models/ggml-small.bin
VAD model:    .../cuebert-transcription-kit/models/ggml-silero-v6.2.0.bin
```

The exact Whisper model file name may differ. If the VAD model line says it was
not found, transcription still works, but speech/silence detection is less
precise. Cuebert still adds readable cue-sized transcript breaks.

## 6. Transcribe a file

Put an audio or video file on the Desktop, then run:

```sh
cuebert-transcribe ~/Desktop/interview.mp3
```

For Spanish audio:

```sh
cuebert-transcribe --language es ~/Desktop/interview.mp3
```

If word edges sound clipped or the transcript splits too aggressively, try:

```sh
cuebert-transcribe --language es --vad-silence-ms 500 --vad-pad-ms 200 ~/Desktop/interview.mp3
```

The output appears next to the media file:

```text
~/Desktop/interview.json
```

Open that JSON file in Cuebert with **Load transcript**. If the media file is
still next to the JSON file, Cuebert should load the media automatically.

The generated JSON has speech/silence timing and Cuebert-sized transcript
breaks. It does not have automatic speaker diarization yet, so assign speakers
inside Cuebert after import.

## Troubleshooting

If Terminal says `command not found: cuebert-transcribe`, run:

```sh
source ~/.zshrc
```

If it still fails, run the wrapper directly:

```sh
~/Applications/cuebert-transcription-kit/cuebert-transcribe --setup-check
```

If macOS says the tool cannot be opened because it is from an unidentified
developer, repeat:

```sh
xattr -dr com.apple.quarantine ~/Applications/cuebert-transcription-kit
```

If `--setup-check` says the model is missing, confirm there is at least one
`.bin` file here:

```text
~/Applications/cuebert-transcription-kit/models/
```

Then try the direct path, which avoids problems caused by older symlinked
wrappers:

```sh
~/Applications/cuebert-transcription-kit/cuebert-transcribe --setup-check
```

If transcription fails with `Library not loaded: @rpath/libwhisper.1.dylib`,
the installed kit is missing the bundled dynamic libraries or has an older
`whisper-cli`. Replace it with a fresh zip whose kit includes a `lib/` folder.

If transcription crashes after mentioning Metal or GPU buffers, run it with
CPU processing:

```sh
cuebert-transcribe --no-gpu ~/Desktop/interview.mp3
```

If `Bad CPU type in executable` appears, the kit was built for the wrong Mac
architecture. Rebuild or copy a kit that matches the target laptop's CPU
architecture.
