import tempfile
import unittest
from pathlib import Path

from wayfinder.engine import Engine, docx_to_markdown, parse_markdown


def fresh():
    return Engine(db_path=Path(tempfile.mkdtemp()) / "t.db", use_llm=False)


class TestAnswering(unittest.TestCase):
    def setUp(self):
        self.e = fresh()

    def test_grounded_answer_cites_current_sop(self):
        r = self.e.ask("What torque for the conveyor guard bolts?")
        self.assertEqual(r["route"], "answered")
        self.assertIn("30 Nm", r["answer"])
        self.assertEqual(r["citations"][0]["doc_id"], "SOP-114")

    def test_legacy_training_is_never_cited(self):
        r = self.e.ask("What torque for the conveyor guard bolts?")
        self.assertNotIn("25 Nm", r["answer"])
        self.assertTrue(all(c["type"] in ("sop", "module") for c in r["citations"]))

    def test_out_of_scope_is_refused_and_logged(self):
        r = self.e.ask("What is on the cafeteria menu today?")
        self.assertEqual(r["route"], "refused")
        self.assertEqual(r["citations"], [])
        self.assertTrue(any("cafeteria" in ex["q"] for g in self.e.gaps() for ex in g["examples"]))

    def test_safety_question_returns_verbatim_procedure(self):
        r = self.e.ask("Who is allowed to remove a lock?")
        self.assertEqual(r["route"], "safety")
        self.assertIn("SOP-101", r["answer"])
        self.assertIn("Only the person who applied a lock may remove it", r["answer"])

    def test_worker_id_is_pseudonymized(self):
        self.e.ask("Which bin do oily rags go in?", worker="Jane Doe")
        row = self.e.db.execute("SELECT worker FROM queries").fetchone()
        self.assertNotIn("Jane", row["worker"])


class TestContentHealth(unittest.TestCase):
    def setUp(self):
        self.e = fresh()

    def test_detects_conflicts_superseded_and_duplicates(self):
        f = {x["id"]: x for x in self.e.flags()}
        self.assertIn("superseded:TRN-01", f)
        self.assertTrue(any(k.startswith("conflict:TRN-01") and "30 Nm" in v["reason"] for k, v in f.items()))
        self.assertTrue(any(k.startswith("conflict:TRN-05") and "90 days" in v["reason"] for k, v in f.items()))
        self.assertIn("duplicate:TRN-03:TRN-04", f)
        self.assertNotIn("superseded:TRN-06", f)  # up to date

    def test_draft_requires_named_approver_and_resolves_flags(self):
        d = self.e.create_draft("SOP-114", replaces="TRN-01")
        self.assertTrue(all(it["source"].startswith("SOP-114#") for s in d["content"]["sections"] for it in s["items"]))
        with self.assertRaises(ValueError):
            self.e.decide_draft(d["id"], "", "approve")
        self.e.decide_draft(d["id"], "R. Mehta", "approve", d["content"])
        open_trn01 = [x for x in self.e.flags() if x["doc"] == "TRN-01" and x["status"] == "open"]
        self.assertEqual(open_trn01, [])
        self.assertTrue(any(doc.type == "module" for doc in self.e.docs.values()))
        actions = [a["action"] for a in self.e.audit_log()]
        self.assertIn("draft_created", actions)
        self.assertIn("draft_approved", actions)

    def test_uploads_are_pending_until_approved(self):
        md = b"---\nid: SOP-900\ntitle: Paint Booth Oven Reset\nversion: 1\n---\n## Procedure\n1. Press and hold the oven controller reset key for 5 seconds.\n"
        self.e.upload("paint.md", md)
        self.assertEqual(self.e.ask("How do I reset the paint booth oven controller?")["route"], "refused")
        self.e.approve_upload("UPL-SOP-900", "Quality Lead")
        r = self.e.ask("How do I reset the paint booth oven controller?")
        self.assertEqual(r["route"], "answered")
        self.assertIn("5 seconds", r["answer"])


class TestParsing(unittest.TestCase):
    def test_frontmatter_and_sections(self):
        meta, secs = parse_markdown("---\nid: X\nsafety_critical: true\n---\n## A\n1. one\n## B\ntext\n", "f")
        self.assertEqual(meta["id"], "X")
        self.assertIs(meta["safety_critical"], True)
        self.assertEqual([h for h, _ in secs], ["A", "B"])

    def test_docx_reader(self):
        import io
        import zipfile
        xml = ('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
               '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Procedure</w:t></w:r></w:p>'
               '<w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>Do the thing</w:t></w:r></w:p></w:body></w:document>')
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("word/document.xml", xml)
        self.assertEqual(docx_to_markdown(buf.getvalue()), "## Procedure\n1. Do the thing")


if __name__ == "__main__":
    unittest.main()
