# Reading helper: teachers' feedback on the prototype (Sam, 23 Nov 2026)

Teachers saw a clickable mock-up of the pupil reading helper (`reading-helper-mockup.html` beside this file: an article, a highlighter bar, and a chat column on the right with placeholder replies). Responses were almost all positive, and this has the most straightforward path to building. Nobody questioned the core approach.

## Ideas for later features

1. **Highlighter categories set by the teacher**, plus one unlabelled highlighter. The mock-up had five fixed ones: Don't understand, May be inaccurate, Possibly biased, Missing sources, Poor quality.
2. **A summary area**: sentences a pupil highlights as key points are brought together, and the pupil practises writing a summary from them.
3. **A glossary** that collects the words a pupil marks as difficult, across all the texts they read.
4. **Fact-checking prompts**: the assistant asks pupils to check what it says against other, outside sources.

## What teachers want from the replies

The mock-up's replies were placeholders, but the critique showed what teachers expect:

- clear detail;
- no sycophancy;
- follow-up questions back to the pupil;
- prompting pupils to consider alternatives to using the assistant.

## Web search

Arguments were made both ways, but most were against letting the model search the web, or did not think it necessary.

## What this means for the planned items (issue #152)

- **R1 (highlights)**: build highlight categories as data (the mock-up's five as the default set, plus one unlabelled), so teacher-defined categories (idea 1) are a small later item rather than a rebuild.
- **R2 (the reader's replies) and S2 (#195, the class safety instruction)**: the default instruction should ask for clear detail, no flattery, a follow-up question, and a nudge to think without the assistant. Changing the default reader instruction is a prompt change: say so to Sam before it merges.
- **E (reader evals)**: judges for the four reply qualities above.
- **No web search** for the reader.
- Ideas 2, 3 and 4 are not planned or sized; they wait for Sam to ask for them.
