# Wayfinder AI - MVP

Functional prototype for the MBA ZG583 capstone (Team 011). It shows the full Wayfinder loop on a
**synthetic** SOP library for a fictional manufacturing plant:

1. **Ask Wayfinder** - worker chat that answers *only* from approved content, always with citations;
   refuses when no approved source exists; shows safety-critical procedures word for word.
2. **Content Health** - flags training that is superseded, conflicts with the current SOP (e.g. 25 Nm vs 30 Nm),
   near-duplicate, or missing.
3. **Review & Approve** - the AI drafts a training module from the SOP with line-level source links; an SME edits and
   approves (named approver required). Approval publishes it to the assistant and resolves related flags.
4. **Content Gaps** - unanswered and down-voted questions grouped into content tasks (feedback loop).
5. **Audit & Analytics** - governance trail (drafts, approvals, alerts) and pseudonymized answer log.

## Run

Needs Python 3.10+ only (standard library, no pip install).

```bash
python3 -m wayfinder.app            # http://localhost:8765
python3 -m wayfinder.evaluate       # golden-set evaluation -> eval_results.md / .json
python3 -m unittest discover -s tests -t .
```

Delete `data/wayfinder.db` to reset the demo.

### Optional: Claude mode
By default the MVP runs in **offline extractive mode** (answers quote approved sentences verbatim; drafts use a
template). Set `ANTHROPIC_API_KEY` to have Claude write the answers and drafts. Claude output is still restricted
to the retrieved passages, citations are validated, and any failure falls back to offline mode.
Optional env vars: `WAYFINDER_ANSWER_MODEL`, `WAYFINDER_DRAFT_MODEL` (default `claude-sonnet-5-5`), `PORT`.

## How it works

| Component | Implementation |
|---|---|
| Ingestion | Markdown with front matter, `.txt`, `.docx` (stdlib reader). Structure-aware chunking: one passage per procedure step. |
| Retrieval | BM25 with title/equipment field boost, light stemming and a domain synonym map. Only **approved** SOPs and modules are indexed; legacy training is never searchable. |
| Answerability | Top score and query-term coverage thresholds; below them the assistant refuses and logs a gap. |
| Safety router | Keyword rules + "top document is safety-critical" check -> verbatim procedure and EHS contact, no paraphrase. |
| Outdated detection | SOP version check, number+unit conflict check against the most similar SOP step, cosine near-duplicate check. |
| Drafting | Template (offline) or Claude (JSON schema); every item carries a source passage id. |
| Governance | SQLite: drafts, approvals, uploads (pending until approved), flag state, audit log, hashed worker ids. |

## Data
`data/sops` (11 approved SOPs), `data/training` (7 legacy modules with seeded problems), `data/golden_set.json`
(40 questions: 26 answerable, 6 safety, 8 should-refuse). All content is fictional.

## Limitations
Synthetic data; golden set written by the team alongside the system (results are optimistic); lexical retrieval
only (production would add dense embeddings + reranker); no SSO/multi-tenancy; no voice or multilingual yet.
