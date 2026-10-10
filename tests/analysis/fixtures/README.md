# Synthetic audio container fixture

`chromium-synthetic-speech.webm` was recorded offline with Chromium MediaRecorder
from Windows built-in TTS saying the photosynthesis smoke-test explanation. It
contains no user speech and no AI response. It exercises audio-only WebM headers,
Opus sample blocks and unknown-size sibling Clusters. Tests repeat a Cluster to
expose the former parser recursion bug; they do not prove audio-decoding or
transcription accuracy. Codec decoding remains the provider's responsibility.
