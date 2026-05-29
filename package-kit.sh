deno task transcribe:compile
mkdir -p cuebert-transcription-kit/models
cp cuebert-transcribe cuebert-transcription-kit/
cp /Users/pathall/Sites/whisper.cpp/build/bin/whisper-cli cuebert-transcription-kit/
cp /Users/pathall/Sites/whisper.cpp/models/ggml-small.bin cuebert-transcription-kit/models/
