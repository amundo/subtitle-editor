deno task transcribe:compile
mkdir -p cuebert-transcription-kit/lib cuebert-transcription-kit/models
cp cuebert-transcribe cuebert-transcription-kit/
cp /Users/pathall/Sites/whisper.cpp/build/bin/whisper-cli cuebert-transcription-kit/
cp /Users/pathall/Sites/whisper.cpp/build/src/libwhisper.1.dylib cuebert-transcription-kit/lib/
cp /Users/pathall/Sites/whisper.cpp/build/ggml/src/libggml.0.dylib cuebert-transcription-kit/lib/
cp /Users/pathall/Sites/whisper.cpp/build/ggml/src/libggml-cpu.0.dylib cuebert-transcription-kit/lib/
cp /Users/pathall/Sites/whisper.cpp/build/ggml/src/libggml-base.0.dylib cuebert-transcription-kit/lib/
cp /Users/pathall/Sites/whisper.cpp/build/ggml/src/ggml-blas/libggml-blas.0.dylib cuebert-transcription-kit/lib/
cp /Users/pathall/Sites/whisper.cpp/build/ggml/src/ggml-metal/libggml-metal.0.dylib cuebert-transcription-kit/lib/
cp /Users/pathall/Sites/whisper.cpp/models/ggml-small.bin cuebert-transcription-kit/models/
if [ -f /Users/pathall/Sites/whisper.cpp/models/ggml-silero-v6.2.0.bin ]; then
  cp /Users/pathall/Sites/whisper.cpp/models/ggml-silero-v6.2.0.bin cuebert-transcription-kit/models/
elif [ -f cuebert-transcription-kit/models/ggml-silero-v6.2.0.bin ]; then
  true
else
  echo "warning: ggml-silero-v6.2.0.bin was not found; VAD will be unavailable in the packaged kit" >&2
fi
install_name_tool -delete_rpath /Users/pathall/Sites/whisper.cpp/build/src cuebert-transcription-kit/whisper-cli 2>/dev/null || true
install_name_tool -delete_rpath /Users/pathall/Sites/whisper.cpp/build/ggml/src cuebert-transcription-kit/whisper-cli 2>/dev/null || true
install_name_tool -delete_rpath /Users/pathall/Sites/whisper.cpp/build/ggml/src/ggml-blas cuebert-transcription-kit/whisper-cli 2>/dev/null || true
install_name_tool -delete_rpath /Users/pathall/Sites/whisper.cpp/build/ggml/src/ggml-metal cuebert-transcription-kit/whisper-cli 2>/dev/null || true
install_name_tool -add_rpath @executable_path/lib cuebert-transcription-kit/whisper-cli 2>/dev/null || true
for lib in cuebert-transcription-kit/lib/*.dylib; do
  install_name_tool -add_rpath @loader_path "$lib" 2>/dev/null || true
done
