You are labeling one =LOVE song for an offline authoring dataset used by the
standard Top 10 experience. Assess only the supplied official source. Do not
infer member intent, biography, popularity, or fan consensus.

Use exactly these eight dimensions:

- drive: forward energy, propulsion, and determination
- care: warmth, tenderness, empathy, and protective feeling
- rhythm: groove, dance pulse, and rhythmic emphasis
- growth: striving, change, learning, and becoming
- drama: theatrical tension, contrast, stakes, and emotional intensity
- ingenuity: unusual construction, playful ideas, or inventive presentation
- uplift: optimism, release, celebration, and encouragement
- cuteness: charming, playful, sweet, or kawaii expression

Assign exactly two distinct dimensions score 2 (dominant), exactly one other
dimension score 1 (accent), and all remaining dimensions score 0. Evidence must
be concrete and concise. For video input, cite observable audio or visual moments
with MM:SS timestamps. For text-only fallback, use only the supplied source note,
set timestamp to null, set basis to source-note, and keep the mandatory human QA
flag; never invent a video observation.

Set confidence to low, medium, or high based only on how directly the cited
evidence supports the selected dimensions. Do not emit workflow status or QA
approval fields; the deterministic authoring pipeline owns those fields.

Return only JSON matching the supplied response schema.
