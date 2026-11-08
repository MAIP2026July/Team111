"""Golden-set evaluation for Wayfinder AI (Section 5.6 release gates).

Run: python -m wayfinder.evaluate   ->  prints a table and writes eval_results.json / eval_results.md
Uses a throwaway database so the app's query log is not polluted.
"""
from __future__ import annotations

import json
import statistics
import tempfile
import time
from pathlib import Path

from .engine import DATA, ROOT, Engine


def doc_matches(engine: Engine, cited_doc: str, expected: str) -> bool:
    d = engine.docs.get(cited_doc)
    return cited_doc == expected or bool(d and d.meta.get("source_sop") == expected)


def run(engine: Engine | None = None) -> dict:
    tmp = Path(tempfile.mkdtemp()) / "eval.db"
    e = engine or Engine(db_path=tmp)
    gold = json.loads((DATA / "golden_set.json").read_text())
    rows, lat = [], []
    for g in gold:
        hits, _ = e.retrieve(g["q"], k=5)
        t0 = time.time()
        r = e.ask(g["q"], worker="eval")
        lat.append((time.time() - t0) * 1000)
        cited_docs = [c["doc_id"] for c in r["citations"]]
        row = {"q": g["q"], "type": g["type"], "route": r["route"], "answered": r["answered"], "cited": cited_docs}
        if g["type"] == "answer":
            row["recall5"] = any(doc_matches(e, p.doc_id, g["doc"]) for _, p in hits)
            row["routed_ok"] = r["route"] == "answered"
            # faithfulness proxy: the answer contains the expected fact AND that fact appears in a cited passage
            cited_text = " ".join(c["text"] for c in r["citations"]).lower()
            row["correct"] = r["answered"] and g["must"].lower() in r["answer"].lower()
            row["faithful"] = r["answered"] and g["must"].lower() in cited_text
            row["citation_ok"] = r["answered"] and any(doc_matches(e, d, g["doc"]) for d in cited_docs)
        elif g["type"] == "safety":
            row["routed_ok"] = r["route"] == "safety"
        else:
            row["routed_ok"] = r["route"] == "refused"
        rows.append(row)

    ans = [r for r in rows if r["type"] == "answer"]
    saf = [r for r in rows if r["type"] == "safety"]
    ref = [r for r in rows if r["type"] == "refuse"]
    pct = lambda xs: round(100 * sum(1 for x in xs if x) / len(xs), 1) if xs else None
    lat_sorted = sorted(lat)
    metrics = {
        "n_total": len(rows), "n_answerable": len(ans), "n_safety": len(saf), "n_refuse": len(ref),
        "retrieval_recall_at_5": pct([r["recall5"] for r in ans]),
        "answer_correctness": pct([r["correct"] for r in ans]),
        "faithfulness_proxy": pct([r["faithful"] for r in ans if r["answered"]]),
        "citation_accuracy": pct([r["citation_ok"] for r in ans if r["answered"]]),
        "false_refusal_rate": pct([not r["answered"] for r in ans]),
        "correct_refusal_rate": pct([r["routed_ok"] for r in ref]),
        "safety_routing_accuracy": pct([r["routed_ok"] for r in saf]),
        "latency_median_ms": round(statistics.median(lat), 1),
        "latency_p95_ms": round(lat_sorted[max(0, int(0.95 * len(lat_sorted)) - 1)], 1),
        "mode": e.health()["mode"],
    }
    gates = {
        "retrieval_recall_at_5": (">=", 90), "faithfulness_proxy": (">=", 95), "citation_accuracy": (">=", 98),
        "correct_refusal_rate": (">=", 90), "safety_routing_accuracy": (">=", 100), "false_refusal_rate": ("<=", 15),
    }
    gate_res = {k: (metrics[k] >= v if op == ">=" else metrics[k] <= v) for k, (op, v) in gates.items()}
    gate_res["latency_p95_ms"] = metrics["latency_p95_ms"] <= 4000
    out = {"metrics": metrics, "gates": gate_res, "rows": rows}
    (ROOT / "eval_results.json").write_text(json.dumps(out, indent=2))
    md = ["| Metric | Gate | Result | Pass |", "|---|---|---|---|"]
    labels = [("retrieval_recall_at_5", ">= 90%", "%"), ("faithfulness_proxy", ">= 95%", "%"),
              ("citation_accuracy", ">= 98%", "%"), ("correct_refusal_rate", ">= 90%", "%"),
              ("safety_routing_accuracy", "100%", "%"), ("false_refusal_rate", "<= 15%", "%"),
              ("latency_p95_ms", "<= 4000 ms", " ms")]
    for k, gate, unit in labels:
        md.append(f"| {k} | {gate} | {metrics[k]}{unit} | {'PASS' if gate_res[k] else 'FAIL'} |")
    md.append(f"\nanswer_correctness: {metrics['answer_correctness']}% | median latency: {metrics['latency_median_ms']} ms | "
              f"n = {metrics['n_total']} ({metrics['n_answerable']} answerable, {metrics['n_safety']} safety, "
              f"{metrics['n_refuse']} should-refuse) | mode: {metrics['mode']}")
    (ROOT / "eval_results.md").write_text("\n".join(md) + "\n")
    return out


if __name__ == "__main__":
    res = run()
    print((ROOT / "eval_results.md").read_text())
    for r in res["rows"]:
        bad = not r["routed_ok"] or (r["type"] == "answer" and not (r["recall5"] and r["correct"]))
        if bad:
            print("MISS:", r)
