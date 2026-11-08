"""Wayfinder AI MVP - core engine.

Knowledge base ingestion, hybrid-lite retrieval (BM25 + query expansion), grounded answering,
safety routing, outdated/duplicate content detection, training draft generation, and the
governance store (approvals, audit log, query log, feedback).

Standard library only. If ANTHROPIC_API_KEY is set, answers and drafts are written by Claude
(see llm.py); otherwise the engine runs in a deterministic extractive mode.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import sqlite3
import threading
import time
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from xml.etree import ElementTree

from . import llm

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# ---------------------------------------------------------------- text utils
STOP = set("""a an the and or of to in on for with is are was be by at as it its this that these those
what which who whom how when where why do does did can could should would will i we you my our your me
there their them from into about than then so if not no any all each per use using used before after
have has had get got need much many tell please up out over under should must""".split())
# 'must', 'never', 'do not' are kept for safety-line detection separately.
SYN = {
    "torque": ["tighten"], "tighten": ["torque"], "loto": ["lockout", "tagout"],
    "lockout": ["loto"], "tagout": ["loto"], "pressure": ["bar"], "psi": ["pressure", "bar"],
    "truck": ["forklift"], "lift": ["forklift"], "spill": ["chemical"], "calibrate": ["calibration"],
    "calibration": ["calibrate"], "garbage": ["waste"], "trash": ["waste"], "rubbish": ["waste"],
    "bin": ["waste"], "label": ["printer"], "weld": ["welds"], "die": ["changeover"],
    "inspect": ["inspection", "check"], "check": ["inspect"], "air": ["compressed"],
    "handover": ["shift"], "gap": ["mm"], "often": ["frequency", "every"], "frequently": ["every"],
}
UNIT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(nm|bar|mm|percent|%|days|minutes|litres|liters|degrees)\b", re.I)
SAFETY_RE = re.compile(
    r"\b(lock\s*out|lockout|tag\s*out|tagout|loto|energy isolation|isolate (the )?energy|zero energy|"
    r"remove (a |my |the )?lock|chemical|spill|evacuat\w*|fire|injur\w*|emergency|arc flash|first aid|"
    r"gas leak|bleeding|burn(ed|t)?)\b", re.I)


_SUFFIX = (("ations", "at"), ("ation", "at"), ("ions", ""), ("ion", ""), ("ings", ""), ("ing", ""),
           ("ies", "y"), ("ed", ""), ("es", ""), ("s", ""), ("e", ""))


def stem(t: str) -> str:
    if t.isdigit():
        return t
    for suf, rep in _SUFFIX:
        if len(t) > 4 and t.endswith(suf):
            return t[: -len(suf)] + rep
    return t


def tokens(text: str, keep_stop: bool = False) -> list[str]:
    raw = re.findall(r"[a-z0-9]+(?:\.[0-9]+)?", text.lower())
    return [stem(t) for t in raw if keep_stop or t not in STOP]


def expand(toks: list[str]) -> list[str]:
    out = list(toks)
    for t in toks:
        out += [stem(s) for s in SYN.get(t, [])]
    return out


def jaccard(a, b) -> float:
    a, b = set(a), set(b)
    return len(a & b) / len(a | b) if a and b else 0.0


def cosine(a: Counter, b: Counter) -> float:
    num = sum(a[k] * b[k] for k in a.keys() & b.keys())
    den = math.sqrt(sum(v * v for v in a.values())) * math.sqrt(sum(v * v for v in b.values()))
    return num / den if den else 0.0


# ---------------------------------------------------------------- documents
@dataclass
class Passage:
    pid: str
    doc_id: str
    section: str
    text: str
    step: int | None = None
    toks: list[str] = field(default_factory=list)


@dataclass
class Doc:
    id: str
    title: str
    type: str  # sop | training | module
    meta: dict
    sections: list[tuple[str, str]]  # (heading, body)
    status: str = "approved"  # approved | pending
    passages: list[Passage] = field(default_factory=list)

    @property
    def version(self) -> int:
        return int(self.meta.get("version", self.meta.get("sop_version", 1)) or 1)

    def to_dict(self, full: bool = False) -> dict:
        d = {"id": self.id, "title": self.title, "type": self.type, "status": self.status,
             "version": self.version, "meta": self.meta}
        if full:
            d["sections"] = [{"heading": h, "body": b} for h, b in self.sections]
        return d


def parse_markdown(text: str, fallback_id: str, default_type: str = "sop") -> tuple[dict, list[tuple[str, str]]]:
    meta: dict = {}
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                v = v.strip()
                meta[k.strip()] = (v.lower() == "true") if v.lower() in ("true", "false") else v
        text = text[m.end():]
    meta.setdefault("id", fallback_id)
    meta.setdefault("type", default_type)
    sections, head, buf = [], "Overview", []
    for line in text.splitlines():
        if line.startswith("#"):
            if any(x.strip() for x in buf):
                sections.append((head, "\n".join(buf).strip()))
            head, buf = line.lstrip("#").strip(), []
        else:
            buf.append(line)
    if any(x.strip() for x in buf):
        sections.append((head, "\n".join(buf).strip()))
    if "title" not in meta:
        meta["title"] = fallback_id.replace("_", " ")
    return meta, sections


def docx_to_markdown(data: bytes) -> str:
    """Minimal .docx reader (stdlib): headings become '## ', numbered paragraphs become '1. '."""
    import io
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        root = ElementTree.fromstring(z.read("word/document.xml"))
    lines, n = [], 0
    for p in root.iter(f"{{{ns['w']}}}p"):
        txt = "".join(t.text or "" for t in p.iter(f"{{{ns['w']}}}t")).strip()
        if not txt:
            continue
        style = p.find("w:pPr/w:pStyle", ns)
        sval = style.get(f"{{{ns['w']}}}val", "") if style is not None else ""
        if sval.lower().startswith("heading") or sval.lower() == "title":
            lines.append(f"## {txt}")
            n = 0
        elif p.find("w:pPr/w:numPr", ns) is not None:
            n += 1
            lines.append(f"{n}. {txt}")
        else:
            lines.append(txt)
    return "\n".join(lines)


def make_passages(doc: Doc) -> list[Passage]:
    out = []
    for si, (head, body) in enumerate(doc.sections, 1):
        lines = [x.strip() for x in body.splitlines() if x.strip()]
        para = []
        for line in lines:
            m = re.match(r"^(\d+)[.)]\s+(.*)", line)
            if m:
                out.append(Passage(f"{doc.id}#{si}.{m.group(1)}", doc.id, head, m.group(2), int(m.group(1))))
            elif line.startswith(("- ", "* ")):
                out.append(Passage(f"{doc.id}#{si}.{len(out)}", doc.id, head, line[2:]))
            else:
                para.append(line)
        if para:
            out.append(Passage(f"{doc.id}#{si}", doc.id, head, " ".join(para)))
    title_t = tokens(doc.title + " " + str(doc.meta.get("equipment", "")))
    for p in out:
        p.toks = tokens(p.section + " " + p.text) + title_t
    return out


# ---------------------------------------------------------------- BM25
class BM25:
    def __init__(self, passages: list[Passage], k1: float = 1.4, b: float = 0.75):
        self.p, self.k1, self.b = passages, k1, b
        self.N = len(passages) or 1
        self.avg = sum(len(x.toks) for x in passages) / self.N
        self.df: Counter = Counter()
        for x in passages:
            self.df.update(set(x.toks))
        self.tf = [Counter(x.toks) for x in passages]

    def idf(self, t: str) -> float:
        n = self.df.get(t, 0)
        return math.log(1 + (self.N - n + 0.5) / (n + 0.5))

    def search(self, q: list[str], k: int = 8, where=None) -> list[tuple[float, Passage]]:
        res = []
        for i, x in enumerate(self.p):
            if where and not where(x):
                continue
            tf, L, s = self.tf[i], len(x.toks), 0.0
            for t in q:
                f = tf.get(t, 0)
                if f:
                    s += self.idf(t) * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * L / self.avg))
            if s > 0:
                res.append((s, x))
        res.sort(key=lambda r: -r[0])
        return res[:k]


# ---------------------------------------------------------------- store
SCHEMA = """
CREATE TABLE IF NOT EXISTS queries(id INTEGER PRIMARY KEY, ts REAL, worker TEXT, question TEXT, route TEXT,
  answered INTEGER, answer TEXT, citations TEXT, top_doc TEXT, latency_ms INTEGER, rating TEXT, reason TEXT,
  task_created INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS drafts(id INTEGER PRIMARY KEY, ts REAL, sop_id TEXT, replaces TEXT, title TEXT,
  content TEXT, status TEXT, approver TEXT, decided_ts REAL, generator TEXT);
CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY, ts REAL, filename TEXT, markdown TEXT, status TEXT,
  approver TEXT);
CREATE TABLE IF NOT EXISTS flag_state(flag_id TEXT PRIMARY KEY, status TEXT, ts REAL, actor TEXT);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, ts REAL, actor TEXT, action TEXT, detail TEXT);
"""


class Engine:
    ANSWER_MIN_SCORE = 3.0
    ANSWER_MIN_COVERAGE = 0.6

    def __init__(self, data_dir: Path = DATA, db_path: Path | None = None, use_llm: bool | None = None):
        self.data_dir = Path(data_dir)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(str(db_path or self.data_dir / "wayfinder.db"), check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)
        self.use_llm = llm.available() if use_llm is None else use_llm
        self.reload()

    # ---------------- ingestion
    def reload(self) -> None:
        with self.lock:
            docs: dict[str, Doc] = {}
            for sub, typ in (("sops", "sop"), ("training", "training")):
                for f in sorted((self.data_dir / sub).glob("*.md")):
                    meta, secs = parse_markdown(f.read_text(), f.stem, typ)
                    docs[meta["id"]] = Doc(meta["id"], meta["title"], meta.get("type", typ), meta, secs)
            for r in self.db.execute("SELECT * FROM uploads"):
                meta, secs = parse_markdown(r["markdown"], r["id"])
                meta["id"] = r["id"]
                docs[r["id"]] = Doc(r["id"], meta["title"], meta.get("type", "sop"), meta, secs, status=r["status"])
            for r in self.db.execute("SELECT * FROM drafts WHERE status='approved'"):
                c = json.loads(r["content"])
                mid = f"MOD-{r['id']:03d}"
                secs = [(s["heading"], "\n".join(f"{i}. {it['text']}" for i, it in enumerate(s["items"], 1)))
                        for s in c["sections"]]
                sop = docs.get(r["sop_id"])
                meta = {"id": mid, "type": "module", "source_sop": r["sop_id"],
                        "version": sop.version if sop else 1, "approved_on": time.strftime("%Y-%m-%d", time.localtime(r["decided_ts"])),
                        "owner": r["approver"], "area": sop.meta.get("area", "") if sop else "",
                        "safety_critical": bool(sop and sop.meta.get("safety_critical"))}
                docs[mid] = Doc(mid, r["title"], "module", meta, secs)
            for d in docs.values():
                d.passages = make_passages(d)
            self.docs = docs
            # Only approved SOPs and approved modules are answerable. Legacy training is never indexed.
            self.indexed = [p for d in docs.values() if d.status == "approved" and d.type in ("sop", "module")
                            for p in d.passages]
            self.bm25 = BM25(self.indexed)

    def audit(self, actor: str, action: str, detail: dict | str) -> None:
        self.db.execute("INSERT INTO audit(ts, actor, action, detail) VALUES (?,?,?,?)",
                        (time.time(), actor, action, json.dumps(detail) if not isinstance(detail, str) else detail))
        self.db.commit()

    def upload(self, filename: str, data: bytes, actor: str = "L&D Owner") -> dict:
        ext = filename.lower().rsplit(".", 1)[-1]
        if ext == "docx":
            md = docx_to_markdown(data)
        elif ext in ("md", "txt"):
            md = data.decode("utf-8", errors="replace")
        else:
            raise ValueError("Supported formats: .md, .txt, .docx")
        stem_ = re.sub(r"[^A-Za-z0-9_-]", "_", filename.rsplit(".", 1)[0])[:40]
        meta, secs = parse_markdown(md, stem_)
        uid = f"UPL-{meta.get('id', stem_)}"
        with self.lock:
            self.db.execute("INSERT OR REPLACE INTO uploads VALUES (?,?,?,?,?,?)",
                            (uid, time.time(), filename, md, "pending", None))
            self.audit(actor, "upload", {"doc": uid, "file": filename, "sections": len(secs)})
            self.reload()
        d = self.docs[uid]
        return {"id": uid, "title": d.title, "sections": len(d.sections), "passages": len(d.passages),
                "status": "pending", "note": "Pending approval - not searchable by the assistant until approved."}

    def approve_upload(self, uid: str, approver: str) -> dict:
        with self.lock:
            self.db.execute("UPDATE uploads SET status='approved', approver=? WHERE id=?", (approver, uid))
            self.audit(approver, "approve_document", {"doc": uid})
            self.reload()
        return {"ok": True}

    # ---------------- retrieval & answering
    def retrieve(self, question: str, k: int = 8, where=None):
        q = expand(tokens(question))
        return self.bm25.search(q, k, where), q

    def coverage(self, question: str, doc_id: str) -> float:
        qt = [t for t in tokens(question) if len(t) > 1]
        if not qt:
            return 0.0
        dt = set()
        for p in self.docs[doc_id].passages:
            dt.update(p.toks)
        hit = sum(1 for t in qt if t in dt or any(stem(s) in dt for s in SYN.get(t, [])))
        return hit / len(qt)

    def _cite(self, p: Passage) -> dict:
        d = self.docs[p.doc_id]
        return {"pid": p.pid, "doc_id": d.id, "title": d.title, "version": d.version, "section": p.section,
                "text": p.text, "approved_on": d.meta.get("approved_on", ""), "owner": d.meta.get("owner", ""),
                "type": d.type, "source_sop": d.meta.get("source_sop")}

    def ask(self, question: str, worker: str = "anonymous") -> dict:
        t0 = time.time()
        question = question.strip()[:500]
        with self.lock:
            hits, _ = self.retrieve(question)
            top_doc = hits[0][1].doc_id if hits else None
            safety_kw = bool(SAFETY_RE.search(question))
            safety_doc = top_doc and self.docs[top_doc].meta.get("safety_critical") and hits[0][0] >= self.ANSWER_MIN_SCORE
            if safety_kw or safety_doc:
                res = self._safety_answer(question)
            else:
                res = self._grounded_answer(question, hits)
            res["latency_ms"] = int((time.time() - t0) * 1000)
            wid = hashlib.sha256(worker.encode()).hexdigest()[:10]  # pseudonymized
            cur = self.db.execute(
                "INSERT INTO queries(ts, worker, question, route, answered, answer, citations, top_doc, latency_ms)"
                " VALUES (?,?,?,?,?,?,?,?,?)",
                (time.time(), wid, question, res["route"], int(res["answered"]), res["answer"],
                 json.dumps([c["pid"] for c in res["citations"]]), top_doc, res["latency_ms"]))
            self.db.commit()
            res["query_id"] = cur.lastrowid
            res["top_doc"] = top_doc
        return res

    def _safety_answer(self, question: str) -> dict:
        hits = self.bm25.search(expand(tokens(question)), 5,
                                where=lambda p: bool(self.docs[p.doc_id].meta.get("safety_critical"))
                                and self.docs[p.doc_id].type == "sop")
        if not hits:
            return {"route": "safety", "answered": False, "citations": [], "mode": "rule",
                    "answer": "This sounds safety-related. Stop and contact your supervisor or EHS on extension 2222 now."}
        doc = self.docs[hits[0][1].doc_id]
        proc = [p for p in doc.passages if p.step is not None]
        lines = [f"[{i}] {p.text}" for i, p in enumerate(proc, 1)]
        answer = (f"SAFETY-CRITICAL PROCEDURE - shown word for word from {doc.id} {doc.title} (v{doc.version}). "
                  f"Follow it exactly. If unsure, stop and contact {doc.meta.get('contact', 'your supervisor')}.\n"
                  + "\n".join(lines))
        return {"route": "safety", "answered": True, "answer": answer, "mode": "verbatim",
                "citations": [self._cite(p) for p in proc], "contact": doc.meta.get("contact")}

    def _grounded_answer(self, question: str, hits) -> dict:
        refuse = {"route": "refused", "answered": False, "citations": [], "mode": "rule",
                  "answer": "I don't have an approved answer for that. Please ask your shift supervisor. "
                            "I've logged your question so the content team can add it."}
        if not hits or hits[0][0] < self.ANSWER_MIN_SCORE:
            return refuse
        top = hits[0][1].doc_id
        if self.coverage(question, top) < self.ANSWER_MIN_COVERAGE:
            return refuse
        best = hits[0][0]
        chosen = [p for s, p in hits if p.doc_id == top and s >= 0.55 * best][:3]
        others = [p for s, p in hits if p.doc_id != top and s >= 0.8 * best][:1]
        passages = chosen + others
        if self.use_llm:
            out = llm.grounded_answer(question, [(i + 1, self._cite(p)) for i, p in enumerate(passages)])
            if out == "NO_ANSWER":
                return refuse
            if out:
                cited = sorted({int(n) for n in re.findall(r"\[(\d+)\]", out) if 0 < int(n) <= len(passages)})
                if cited:
                    return {"route": "answered", "answered": True, "answer": out, "mode": "llm",
                            "citations": [self._cite(p) for p in passages]}
        # extractive fallback: verbatim approved lines, best match first (max 2 lines)
        chosen = [p for s, p in hits if p.doc_id == top and s >= 0.75 * best][:2]
        d = self.docs[top]
        body = " ".join(f"{p.text.rstrip('.')}. [{i}]" for i, p in enumerate(chosen, 1))
        return {"route": "answered", "answered": True, "mode": "extractive",
                "answer": f"From {d.id} {d.title} (v{d.version}): {body}",
                "citations": [self._cite(p) for p in chosen]}

    def feedback(self, query_id: int, rating: str, reason: str = "") -> dict:
        with self.lock:
            self.db.execute("UPDATE queries SET rating=?, reason=? WHERE id=?", (rating, reason[:200], query_id))
            self.db.commit()
            if rating == "wrong":
                self.audit("system", "wrong_answer_alert", {"query_id": query_id, "reason": reason})
        return {"ok": True}

    # ---------------- content health
    def flags(self) -> list[dict]:
        with self.lock:
            state = {r["flag_id"]: dict(r) for r in self.db.execute("SELECT * FROM flag_state")}
            out = []
            sops = {d.id: d for d in self.docs.values() if d.type == "sop"}
            trains = [d for d in self.docs.values() if d.type == "training"]
            for t in trains:
                sop = sops.get(t.meta.get("sop"))
                if not sop:
                    continue
                tv = int(t.meta.get("sop_version", 0) or 0)
                if tv < sop.version:
                    out.append({"id": f"superseded:{t.id}", "type": "Superseded SOP version", "severity": "High",
                                "doc": t.id, "doc_title": t.title, "sop": sop.id,
                                "reason": f"Training is based on {sop.id} v{tv}; current approved version is v{sop.version}.",
                                "evidence": []})
                n = 0
                for tp in t.passages:
                    for val, unit in UNIT_RE.findall(tp.text):
                        unit_n = unit.lower()
                        best, bp = 0.0, None
                        for sp in sop.passages:
                            for sval, sunit in UNIT_RE.findall(sp.text):
                                if sunit.lower() == unit_n:
                                    sim = jaccard(tp.toks, sp.toks)
                                    if sim > best:
                                        best, bp, bval = sim, sp, sval
                        if bp is not None and best >= 0.15 and float(bval) != float(val):
                            n += 1
                            out.append({"id": f"conflict:{t.id}:{n}", "type": "Conflicts with current SOP",
                                        "severity": "High", "doc": t.id, "doc_title": t.title, "sop": sop.id,
                                        "reason": f"Training says {val} {unit}; {sop.id} v{sop.version} says {bval} {unit}.",
                                        "evidence": [{"label": f"{t.id} (training)", "text": tp.text},
                                                     {"label": f"{sop.id} v{sop.version} (approved)", "text": bp.text}]})
            vecs = {t.id: Counter(p_t for p in t.passages if p.step is not None for p_t in tokens(p.text)) for t in trains}
            for i, a in enumerate(trains):
                for b in trains[i + 1:]:
                    sim = cosine(vecs[a.id], vecs[b.id])
                    if sim >= 0.75:
                        out.append({"id": f"duplicate:{a.id}:{b.id}", "type": "Near-duplicate modules",
                                    "severity": "Medium", "doc": b.id, "doc_title": b.title, "sop": a.meta.get("sop"),
                                    "reason": f"{b.id} is {sim:.0%} similar to {a.id} ({a.title}). Consider merging.",
                                    "evidence": [{"label": a.id, "text": a.title}, {"label": b.id, "text": b.title}]})
            covered = {t.meta.get("sop") for t in trains} | {d.meta.get("source_sop") for d in self.docs.values()
                                                              if d.type == "module"}
            for s in sops.values():
                if s.id not in covered and not s.meta.get("safety_critical"):
                    out.append({"id": f"missing:{s.id}", "type": "No training module", "severity": "Low",
                                "doc": s.id, "doc_title": s.title, "sop": s.id,
                                "reason": f"{s.id} has no training module. Generate a draft for SME review.",
                                "evidence": []})
            for f in out:
                st = state.get(f["id"])
                f["status"] = st["status"] if st else "open"
            return out

    def resolve_flag(self, flag_id: str, actor: str, status: str = "resolved") -> dict:
        with self.lock:
            self.db.execute("INSERT OR REPLACE INTO flag_state VALUES (?,?,?,?)", (flag_id, status, time.time(), actor))
            self.audit(actor, f"flag_{status}", {"flag": flag_id})
        return {"ok": True}

    def health(self) -> dict:
        fl = self.flags()
        trains = [d for d in self.docs.values() if d.type == "training"]
        bad_docs = {f["doc"] for f in fl if f["status"] == "open" and f["severity"] == "High"}
        fresh = 1 - len([t for t in trains if t.id in bad_docs]) / (len(trains) or 1)
        q = self.db.execute("SELECT count(*) n, sum(answered) a, sum(rating='up') up, sum(rating IN ('down','wrong')) dn,"
                            " avg(latency_ms) lat FROM queries").fetchone()
        return {"sops": sum(1 for d in self.docs.values() if d.type == "sop" and d.status == "approved"),
                "training": len(trains), "modules": sum(1 for d in self.docs.values() if d.type == "module"),
                "pending_docs": sum(1 for d in self.docs.values() if d.status == "pending"),
                "indexed_passages": len(self.indexed), "open_flags": sum(1 for f in fl if f["status"] == "open"),
                "freshness": round(fresh * 100), "queries": q["n"] or 0,
                "resolution_rate": round(100 * (q["a"] or 0) / q["n"]) if q["n"] else None,
                "thumbs_up": q["up"] or 0, "thumbs_down": q["dn"] or 0,
                "avg_latency_ms": round(q["lat"]) if q["lat"] else None,
                "pending_drafts": self.db.execute("SELECT count(*) FROM drafts WHERE status='draft'").fetchone()[0],
                "mode": "Claude (LLM)" if self.use_llm else "Offline extractive"}

    # ---------------- drafts
    def create_draft(self, sop_id: str, replaces: str | None = None, actor: str = "L&D Owner") -> dict:
        with self.lock:
            sop = self.docs.get(sop_id)
            if not sop or sop.type != "sop":
                raise ValueError(f"Unknown SOP {sop_id}")
            content, gen = None, "template"
            if self.use_llm:
                content = llm.draft_module(sop.to_dict(full=True), [self._cite(p) for p in sop.passages])
                if content:
                    valid = {p.pid for p in sop.passages}
                    for s in content.get("sections", []):
                        s["items"] = [it for it in s.get("items", []) if it.get("source") in valid] or s.get("items", [])
                    gen = "llm"
            if not content:
                content = self._template_draft(sop)
            title = (f"Revised: {self.docs[replaces].title}" if replaces in self.docs
                     else f"Training: {sop.title}") + f" (SOP v{sop.version})"
            cur = self.db.execute("INSERT INTO drafts(ts, sop_id, replaces, title, content, status, generator)"
                                  " VALUES (?,?,?,?,?,?,?)",
                                  (time.time(), sop_id, replaces, title, json.dumps(content), "draft", gen))
            self.audit("AI Content Agent", "draft_created", {"draft": cur.lastrowid, "sop": sop_id, "replaces": replaces,
                                                             "requested_by": actor, "generator": gen})
            return self.get_draft(cur.lastrowid)

    def _template_draft(self, sop: Doc) -> dict:
        steps = [p for p in sop.passages if p.step is not None and re.search(r"procedure|step|calibration|handling|bins",
                                                                               p.section, re.I)]
        steps = steps or [p for p in sop.passages if p.step is not None]
        purpose = next((p for p in sop.passages if "purpose" in p.section.lower()), sop.passages[0])
        valued = [p for p in sop.passages if UNIT_RE.search(p.text)]
        safety = [p for p in sop.passages if re.search(r"\b(lockout|sop-101|never|do not|must|ppe|stop)\b", p.text, re.I)]
        quiz = []
        for p in valued[:3]:
            m = UNIT_RE.search(p.text)
            q = p.text[: m.start()] + "____ " + m.group(2) + p.text[m.end():]
            quiz.append({"text": f"Fill in the blank: {q} (Answer: {m.group(1)} {m.group(2)})", "source": p.pid})
        sec = [
            {"heading": "Learning objectives", "items": [
                {"text": f"Explain the purpose: {purpose.text}", "source": purpose.pid},
                {"text": f"Carry out the {sop.title.lower()} procedure in the correct order "
                         f"({len(steps)} steps).", "source": steps[0].pid if steps else purpose.pid}]},
            {"heading": "Step-by-step procedure", "items": [{"text": p.text, "source": p.pid} for p in steps]},
        ]
        if valued:
            sec.append({"heading": "Critical values to remember",
                        "items": [{"text": f"{UNIT_RE.search(p.text).group(0)} - {p.text}", "source": p.pid} for p in valued]})
        if safety:
            sec.append({"heading": "Safety reminders", "items": [{"text": p.text, "source": p.pid} for p in safety]})
        if quiz:
            sec.append({"heading": "Knowledge check", "items": quiz})
        return {"sections": sec}

    def get_draft(self, did: int) -> dict:
        r = self.db.execute("SELECT * FROM drafts WHERE id=?", (did,)).fetchone()
        if not r:
            raise ValueError("draft not found")
        d = dict(r)
        d["content"] = json.loads(d["content"])
        sop = self.docs.get(d["sop_id"])
        d["source"] = sop.to_dict(full=True) if sop else None
        d["source_passages"] = {p.pid: p.text for p in sop.passages} if sop else {}
        if d["replaces"] and d["replaces"] in self.docs:
            d["replaces_doc"] = self.docs[d["replaces"]].to_dict(full=True)
        return d

    def list_drafts(self) -> list[dict]:
        return [dict(r) for r in self.db.execute(
            "SELECT id, ts, sop_id, replaces, title, status, approver, generator FROM drafts ORDER BY id DESC")]

    def decide_draft(self, did: int, approver: str, decision: str, content: dict | None = None) -> dict:
        if not approver.strip():
            raise ValueError("A named approver is required.")
        with self.lock:
            r = self.db.execute("SELECT * FROM drafts WHERE id=?", (did,)).fetchone()
            if not r or r["status"] != "draft":
                raise ValueError("Draft is not awaiting review.")
            status = "approved" if decision == "approve" else "rejected"
            edited = content is not None and json.dumps(content, sort_keys=True) != json.dumps(json.loads(r["content"]), sort_keys=True)
            self.db.execute("UPDATE drafts SET status=?, approver=?, decided_ts=?, content=? WHERE id=?",
                            (status, approver, time.time(), json.dumps(content) if content else r["content"], did))
            self.audit(approver, f"draft_{status}", {"draft": did, "sop": r["sop_id"], "edited_by_sme": edited})
            if status == "approved" and r["replaces"]:
                for f in self.flags():
                    if f["doc"] == r["replaces"] and f["status"] == "open":
                        self.db.execute("INSERT OR REPLACE INTO flag_state VALUES (?,?,?,?)",
                                        (f["id"], "resolved", time.time(), approver))
            if status == "approved":
                for f in self.flags():
                    if f["id"] == f"missing:{r['sop_id']}":
                        self.db.execute("INSERT OR REPLACE INTO flag_state VALUES (?,?,?,?)",
                                        (f["id"], "resolved", time.time(), approver))
            self.db.commit()
            self.reload()
        return {"ok": True, "status": status}

    # ---------------- gaps & audit
    def gaps(self) -> list[dict]:
        rows = self.db.execute("SELECT * FROM queries WHERE (answered=0 AND route!='safety') OR rating IN ('down','wrong')"
                               " ORDER BY ts DESC").fetchall()
        groups: dict[str, dict] = defaultdict(lambda: {"count": 0, "examples": [], "ids": [], "reasons": Counter()})
        for r in rows:
            # Refused questions had no approved source, so their weak nearest match is not a meaningful topic.
            if not r["answered"]:
                key = "Not covered by approved content"
            else:
                key = self.docs[r["top_doc"]].title if r["top_doc"] in self.docs else "Unknown document"
            g = groups[key]
            g["count"] += 1
            g["ids"].append(r["id"])
            g["task_created"] = g.get("task_created", False) or bool(r["task_created"])
            if len(g["examples"]) < 4:
                g["examples"].append({"q": r["question"], "kind": "unanswered" if not r["answered"] else r["rating"]})
            if r["reason"]:
                g["reasons"][r["reason"]] += 1
        out = [{"topic": k, **{kk: (dict(vv) if isinstance(vv, Counter) else vv) for kk, vv in v.items()}}
               for k, v in groups.items()]
        return sorted(out, key=lambda g: -g["count"])

    def create_task(self, topic: str, ids: list[int], actor: str) -> dict:
        with self.lock:
            for i in ids:
                self.db.execute("UPDATE queries SET task_created=1 WHERE id=?", (int(i),))
            self.audit(actor, "content_task_created", {"topic": topic, "queries": len(ids)})
        return {"ok": True}

    def audit_log(self, limit: int = 200) -> list[dict]:
        return [dict(r) for r in self.db.execute("SELECT * FROM audit ORDER BY id DESC LIMIT ?", (limit,))]

    def recent_answers(self, limit: int = 100) -> list[dict]:
        return [dict(r) for r in self.db.execute(
            "SELECT id, ts, worker, question, route, answered, citations, rating, latency_ms FROM queries"
            " ORDER BY id DESC LIMIT ?", (limit,))]
