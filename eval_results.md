| Metric | Gate | Result | Pass |
|---|---|---|---|
| retrieval_recall_at_5 | >= 90% | 100.0% | PASS |
| faithfulness_proxy | >= 95% | 100.0% | PASS |
| citation_accuracy | >= 98% | 100.0% | PASS |
| correct_refusal_rate | >= 90% | 100.0% | PASS |
| safety_routing_accuracy | 100% | 100.0% | PASS |
| false_refusal_rate | <= 15% | 3.8% | PASS |
| latency_p95_ms | <= 4000 ms | 0.9 ms | PASS |

answer_correctness: 96.2% | median latency: 0.5 ms | n = 40 (26 answerable, 6 safety, 8 should-refuse) | mode: Offline extractive
