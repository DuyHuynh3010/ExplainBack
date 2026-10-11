# Synthetic audio container fixture

`chromium-synthetic-speech.webm` was recorded offline with Chromium MediaRecorder
from Windows built-in TTS saying the photosynthesis smoke-test explanation. It
contains no user speech and no AI response. It exercises audio-only WebM headers,
Opus sample blocks and unknown-size sibling Clusters. Tests repeat a Cluster to
expose the former parser recursion bug; they do not prove audio-decoding or
transcription accuracy. Codec decoding remains the provider's responsibility.

## Extraction quality source

`extraction-quality-source.txt` preserves the two-paragraph learning source supplied
for the graph-v2 extraction-quality task, including `photosynthesis.The` without an
inserted space. It is input data, not an AI response. Hand-authored outputs live in
`../extraction-quality-fixture.mjs` and are explicitly synthetic. Original real
captures are not overwritten or corrected to make a fixture pass.

## Participant and representation follow-up

`representation-quality-source.txt` is the exact source from the follow-up request,
including the space after `photosynthesis.`. The earlier source file stays unchanged.
`../representation-quality-fixture.mjs` contains explicitly synthetic biology and
non-biology drafts. They exercise multiple agents with the same role, independent
binary intake/definition claims with context, and genuinely joint complex claims.
Pipeline and UI replay results establish preservation, not successful AI extraction.
