const fs = require('fs');
const d = require('docx');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType,
  HeadingLevel, AlignmentType, LevelFormat, PageBreak, Footer, Header, PageNumber, TableOfContents, BorderStyle } = d;

const W = 9026; // A4 content width
const ACCENT = "1F4E79";
function runs(text, base = {}) {
  const out = [];
  const parts = String(text).split(/(\*\*[^*]+\*\*|\[\[[^\]]+\]\])/);
  for (const p of parts) {
    if (!p) continue;
    if (p.startsWith('**')) out.push(new TextRun({ ...base, text: p.slice(2, -2), bold: true }));
    else if (p.startsWith('[[')) out.push(new TextRun({ ...base, text: p.slice(2, -2), highlight: "yellow", bold: true }));
    else out.push(new TextRun({ ...base, text: p }));
  }
  return out;
}
const P = (t, o = {}) => new Paragraph({ children: runs(t, o.run || {}), spacing: { after: 120 }, ...o.para });
const I = (t) => new Paragraph({ children: runs(t, { italics: true, color: "555555" }), spacing: { after: 120 } });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)], pageBreakBefore: true });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });
const B = (t, lvl = 0) => new Paragraph({ numbering: { reference: "bul", level: lvl }, children: runs(t), spacing: { after: 60 } });
const N = (t, ref = "num") => new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs(t), spacing: { after: 60 } });
const border = { style: BorderStyle.SINGLE, size: 4, color: "A6A6A6" };
const borders = { top: border, bottom: border, left: border, right: border };
function T(headers, rows, widths) {
  const sum = widths.reduce((a, b) => a + b, 0);
  const w = widths.map(x => Math.round(x * W / sum));
  w[w.length - 1] += W - w.reduce((a, b) => a + b, 0);
  const cell = (txt, i, head) => new TableCell({
    width: { size: w[i], type: WidthType.DXA }, borders,
    shading: head ? { type: ShadingType.CLEAR, color: "auto", fill: ACCENT } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: String(txt).split('\n').map(line => new Paragraph({ children: runs(line, head ? { bold: true, color: "FFFFFF", size: 19 } : { size: 19 }) }))
  });
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: w,
    rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }),
      ...rows.map(r => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false)) }))]
  });
}
const SP = () => new Paragraph({ children: [], spacing: { after: 60 } });
const Callout = (t) => new Table({
  width: { size: W, type: WidthType.DXA }, columnWidths: [W],
  rows: [new TableRow({ cantSplit: true, children: [new TableCell({ width: { size: W, type: WidthType.DXA },
    borders: { top: border, bottom: border, right: border, left: { style: BorderStyle.SINGLE, size: 24, color: ACCENT } },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: "EAF1F8" }, margins: { top: 100, bottom: 100, left: 160, right: 160 },
    children: (Array.isArray(t) ? t : [t]).map(x => new Paragraph({ children: runs(x, { size: 20 }), spacing: { after: 60 } })) })] })]
});

const C = [];
// ---------- Cover ----------
C.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600, after: 120 }, children: [new TextRun({ text: "MBA ZG583 - Management of AI Products", bold: true, size: 26 })] }));
C.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: "Capstone Project - Final Submission", size: 24 })] }));
C.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: "Wayfinder AI", bold: true, size: 64, color: ACCENT })] }));
C.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: "AI-Powered Content Generation and Knowledge Assistance for Frontline Learning", italics: true, size: 26 })] }));
C.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: "Team 011", bold: true, size: 24 })] }));
C.push(T(["Team Member", "Student ID"], [
  ["Anirban", "2025MB26003"], ["Rugved Khanwalkar", "2025MB26040"], ["Shoaib Ahmed Sharief", "2025MB26144"],
  ["Shreya", "2025MB26176"], ["Sonali", "2025MB26173"], ["Srishti Shrivastava", "2025MB26194"]], [3, 2]));
C.push(SP());
C.push(I("Note: Wayfinder AI is a hypothetical product concept developed for academic purposes. The company, product, and all figures in this document are illustrative planning assumptions only, not derived from or representative of any specific real organization or client engagement."));
C.push(new Paragraph({ children: [new PageBreak()] }));
C.push(new Paragraph({ children: [new TextRun({ text: "Contents", bold: true, size: 32, color: ACCENT })], spacing: { after: 200 } }));
["1. Executive Summary","2. Product Strategy and Opportunity Framing","3. PM Artifact Pack","4. UX / Workflow / Trust Design","5. Data, Model, and Evaluation Strategy","6. Business, Economics, and Scaling View","7. Ethics, Governance, and Risk Note","8. Functional Prototype / MVP","9. AI Collaboration Log","10. Individual Contribution Disclosure"].forEach(t => C.push(new Paragraph({ children: [new TextRun({ text: t, size: 24 })], spacing: { after: 160 }, border: { bottom: { style: BorderStyle.DOTTED, size: 4, color: "BFBFBF", space: 4 } } })));

// ---------- 1. Executive Summary ----------
C.push(H1("1. Executive Summary"));
C.push(H2("1.1 The Problem"));
C.push(P("Frontline and operational workforces in large, multi-site organizations (manufacturing plants, distribution centers, energy facilities) depend on training content and standard operating procedures (SOPs) that are authored once and then drift out of date as processes change. This creates two connected pain points:"));
C.push(B("**Content decay:** training material becomes stale, duplicated and fragmented across versions. Rewriting it is slow, expert-intensive work for Learning & Development (L&D) teams and subject-matter experts (SMEs)."));
C.push(B("**Answer access:** when a worker needs an answer mid-task, the options are to dig through long manuals or interrupt a supervisor. Both slow work down and raise the chance of acting on a wrong assumption."));
C.push(P("Both problems share one root cause: a large, valuable body of procedural knowledge that is not structured or accessible in a way that keeps pace with real work."));
C.push(H2("1.2 The Product"));
C.push(P("**Wayfinder AI** is built on a single governed knowledge base, exposed through two connected capabilities:"));
C.push(B("**Content Studio (Training Content Generation & Optimization):** reads source SOPs and existing training, drafts and restructures training modules, flags outdated or duplicated content, and proposes updates when a source procedure changes. An SME reviews and approves every change before it goes live."));
C.push(B("**Ask Wayfinder (Knowledge Base Chatbot):** a conversational assistant grounded only in approved content. A worker asks a plain-language question (text or voice, on a shared kiosk or mobile device) and gets an instant answer with a citation to the exact approved source, or a clear \"I don't know - here is who to ask\"."));
C.push(P("The two capabilities form a flywheel: fresher content makes the chatbot more accurate, and the questions workers ask (especially unanswered ones) show the content team exactly where to invest next."));
C.push(H2("1.3 Key Outcomes Targeted (Illustrative)"));
C.push(T(["Metric", "Baseline (assumed)", "Pilot target", "Scale target"], [
  ["SME hours on content creation/maintenance", "~30% of SME time", "-30%", "-40%"],
  ["Time to update training after an SOP change", "4-6 weeks", "< 1 week", "< 3 days"],
  ["Worker questions resolved without escalation", "n/a (no tool)", "60%", "75%"],
  ["Answer faithfulness to cited source (offline eval)", "n/a", ">= 95%", ">= 97%"],
  ["Weekly active users / eligible workers", "n/a", "40%", "60%"],
  ["Customer ROI (benefit / annual cost)", "n/a", "> 1.5x", "~2.3x"]], [4, 2.2, 1.6, 1.6]));
C.push(SP());
C.push(H2("1.4 Why Now"));
C.push(B("Large language models can now read and restructure large volumes of unstructured procedural text well enough to produce a credible first draft for expert review."));
C.push(B("Retrieval-augmented generation (RAG) with hybrid search, reranking and mandatory citations has matured enough to be used in compliance-sensitive settings, provided answers stay traceable to approved sources."));
C.push(B("Inference costs have fallen sharply, making per-worker economics viable for frontline (not just knowledge-worker) populations."));
C.push(H2("1.5 The Ask and Recommendation"));
C.push(P("We recommend a **12-week single-site pilot** that starts with Content Studio on the most outdated content areas, followed by Ask Wayfinder on the refreshed content. Go/no-go to wave rollout is decided against pre-agreed evaluation gates (Section 5.6) and business KPIs (Section 3.5). This document covers strategy, PM artifacts, UX and trust design, the data/model/evaluation approach, economics, governance, the MVP, and our AI collaboration and contribution disclosures."));

// ---------- 2. Product Strategy ----------
C.push(H1("2. Product Strategy and Opportunity Framing"));
C.push(H2("2.1 Vision and Mission"));
C.push(P("**Vision:** Operational knowledge that is always current and always one question away."));
C.push(P("**Mission:** Keep training content accurate with less manual effort, and give every worker an instant, trustworthy answer at the moment of need."));
C.push(H2("2.2 Problem Framing and Jobs-to-be-Done"));
C.push(T(["Persona", "Job to be done", "Current workaround", "Pain"], [
  ["L&D Content Owner", "When an SOP changes, update every affected training module quickly", "Manual search across LMS, rewrite by hand", "Weeks of lag; inconsistent versions"],
  ["SME / Process Engineer", "Make sure training reflects how the work is actually done", "Review long documents line by line", "Expert time pulled from operations"],
  ["Frontline Worker", "Get the right answer for this task, now, without stopping work", "Ask a supervisor or flip through a binder", "Delay, guesswork, rework"],
  ["Shift Supervisor", "Keep the line running and the team self-sufficient", "Answer the same questions repeatedly", "Constant interruptions"],
  ["Quality & Compliance Lead", "Prove that guidance given to workers is approved and auditable", "Document control systems, manual audits", "No visibility into informal answers"]], [2, 3, 2.5, 2]));
C.push(SP());
C.push(H2("2.3 Target Market and Opportunity Sizing (Illustrative)"));
C.push(P("**Primary market:** large, multi-site operational enterprises (manufacturing, energy & utilities, logistics/warehousing, and similar asset-intensive industries) with established but static SOP libraries."));
C.push(T(["Layer", "Definition", "Assumption", "Annual value"], [
  ["TAM", "Enterprises globally with 1,000+ frontline workers in operational sectors", "~20,000 enterprises x ~$300K ACV", "~$6.0B"],
  ["SAM", "Same profile in North America, Europe and India, with digital SOP libraries", "~8,000 enterprises x ~$300K ACV", "~$2.4B"],
  ["SOM (Year 3)", "Land-and-expand wins reachable with a focused sales team", "~40 enterprises x ~$300K ACV", "~$12M ARR"]], [1.2, 3.5, 3, 1.5]));
C.push(I("All market figures are top-down planning assumptions for coursework and would need validation through primary research."));
C.push(H2("2.4 Buyer Personas and Decision Roles"));
C.push(T(["Persona", "Role in decision", "What they care about"], [
  ["Head of Learning & Development", "Champion / product owner", "Content maintenance burden, authoring time saved"],
  ["VP of Operations", "Economic buyer", "Fewer interruptions, faster resolution, uptime"],
  ["Quality & Compliance Lead", "Risk gatekeeper (veto)", "Traceability to approved content, review controls, audit trail"],
  ["IT / Security", "Technical gatekeeper", "SSO, data residency, integration effort"],
  ["Site / Shift Supervisor", "End-user manager", "Fewer escalations, self-sufficient workers"],
  ["Frontline Worker", "End user", "Fast, reliable answers without leaving the task"]], [2.5, 2, 4]));
C.push(SP());
C.push(P("**Beachhead segment:** one site within a multi-site manufacturer with a well-defined but aging SOP library. Both problems are visible there, so the before/after case is easy to demonstrate and replicate to sister sites."));
C.push(H2("2.5 Value Proposition"));
C.push(Callout("**\"Keep your training content current with less expert time, and give every worker an instant, trustworthy answer on the floor.\"**"));
C.push(SP());
C.push(H2("2.6 Competitive Landscape and Differentiation"));
C.push(T(["Alternative", "Strength", "Gap Wayfinder fills"], [
  ["Traditional LMS / LXP", "System of record for courses and completions", "No AI-assisted content maintenance; no in-the-flow answers"],
  ["Generic enterprise search / copilots", "Broad coverage, easy to deploy", "Not restricted to approved content; weak citations; not designed for frontline devices"],
  ["Connected-worker / digital SOP platforms", "Strong on-floor workflow execution", "Content authored manually; limited generative maintenance"],
  ["AI authoring tools", "Fast first drafts", "No link between content health and what workers actually ask"]], [2.5, 2.5, 4]));
C.push(SP());
C.push(P("**Defensibility** does not come from the AI model, which is increasingly a commodity. It comes from: (1) the governed, standardized task/topic taxonomy shared by both capabilities; (2) the question-to-content feedback loop, which compounds with usage; (3) the SME review workflow and audit trail, which become embedded in compliance processes; and (4) a repeatable site-onboarding playbook."));
C.push(H2("2.7 Why AI (and Why Not Only AI)"));
C.push(T(["Task", "AI fit", "Rationale"], [
  ["Drafting / restructuring training from SOPs", "High", "Language transformation task with expert review available"],
  ["Detecting outdated / duplicate content", "High", "Semantic similarity and change detection at scale"],
  ["Answering worker questions", "High, if grounded", "Retrieval + citation keeps answers verifiable"],
  ["Approving content for go-live", "Low - human only", "Accountability and compliance require a named approver"],
  ["Safety-critical lockout/tagout or emergency guidance", "Low - deflect", "Route to the official procedure and a human; no generated paraphrase"]], [3.5, 1.5, 4]));
C.push(SP());
C.push(H2("2.8 Go-to-Market Motion"));
C.push(P("Land-and-expand within one enterprise: prove value at one site by modernizing content first, add the chatbot to show combined value, then use the evidence to expand to sister sites. Sales is relationship-led and sponsored by L&D with Operations as economic buyer. Partnerships with LMS and connected-worker vendors provide distribution and integration credibility."));

// ---------- 3. PM Artifact Pack ----------
C.push(H1("3. PM Artifact Pack"));
C.push(H2("3.1 PRD Summary"));
C.push(T(["Section", "Content"], [
  ["Problem statement", "Frontline knowledge is stale and hard to reach in the moment; this costs SME time, worker time and quality."],
  ["Target users", "L&D content owners and SMEs (Content Studio); frontline workers and supervisors (Ask Wayfinder)."],
  ["Goals", "G1: Cut SME content maintenance effort by 30%+. G2: Resolve 60%+ of worker questions without escalation. G3: Zero unapproved content reaching workers."],
  ["Non-goals (v1)", "Replacing the LMS; auto-publishing content; answering questions outside the approved knowledge base; real-time machine telemetry; performance evaluation of individual workers."],
  ["Key assumptions", "Customer has digital SOPs (PDF/DOCX/LMS export); SMEs can commit ~2 hrs/week to review; workers have access to a shared kiosk or mobile device."],
  ["Constraints", "SSO required; data stays in customer's chosen region; every answer must cite an approved source."],
  ["Dependencies", "LMS export/API, document management system, identity provider, LLM provider with enterprise data terms."]], [2, 7]));
C.push(SP());
C.push(H2("3.2 User Stories and Acceptance Criteria"));
C.push(T(["ID", "User story", "Acceptance criteria", "Priority"], [
  ["US-01", "As an L&D owner, I want to upload SOPs and existing training so the system builds a single knowledge base.", "PDF/DOCX/PPTX ingested; each chunk tagged to a taxonomy topic; ingestion report shows failures.", "Must"],
  ["US-02", "As an SME, I want AI-drafted training modules from an SOP so I review instead of writing from scratch.", "Draft includes objectives, steps, checks; every statement links to source paragraph; editable before approval.", "Must"],
  ["US-03", "As an L&D owner, I want outdated or duplicate content flagged so I know what to fix first.", "Flags show reason (conflict, superseded SOP version, near-duplicate) and the evidence side by side.", "Must"],
  ["US-04", "As an SME, I want nothing to go live without my approval.", "No publish path without named approver; approval logged with timestamp and version.", "Must"],
  ["US-05", "As a worker, I want to ask a question in plain language and get a short answer with its source.", "Answer <= 120 words; citation opens exact section; p95 latency <= 4s.", "Must"],
  ["US-06", "As a worker, I want the assistant to say when it does not know.", "Below confidence threshold or no source: decline and show escalation contact.", "Must"],
  ["US-07", "As a worker, I want to give thumbs up/down on an answer.", "Feedback stored with query, answer and sources; visible in content dashboard.", "Should"],
  ["US-08", "As an L&D owner, I want to see unanswered and low-rated questions by topic.", "Dashboard ranks content gaps by frequency; one click creates a content task.", "Should"],
  ["US-09", "As a worker, I want to ask by voice and in my language.", "Speech-to-text in top 2 site languages; answers in same language with source in original.", "Could (Phase 2)"],
  ["US-10", "As a compliance lead, I want an audit export of answers and approvals.", "CSV/PDF export filtered by date, topic, site.", "Should"]], [0.9, 3.2, 3.5, 1.2]));
C.push(SP());
C.push(H2("3.3 Prioritization (RICE)"));
C.push(T(["Feature", "Reach (users/qtr)", "Impact (0.25-3)", "Confidence", "Effort (person-weeks)", "RICE score"], [
  ["Grounded Q&A with citations", "1,200", "3", "80%", "8", "360"],
  ["SOP-to-training draft generation", "40", "3", "80%", "6", "16"],
  ["Outdated / duplicate content flags", "40", "2", "70%", "4", "14"],
  ["Content-gap dashboard", "40", "2", "70%", "3", "18.7"],
  ["Voice + multilingual", "1,200", "1", "50%", "6", "100"],
  ["Audit export", "10", "1", "90%", "1", "9"]], [3, 1.5, 1.3, 1.3, 1.5, 1.2]));
C.push(I("RICE favours the chatbot because of its reach. We still sequence Content Studio first, because the chatbot depends on refreshed content (see roadmap). This is a deliberate strategic override of the raw score."));
C.push(H2("3.4 Roadmap"));
C.push(T(["Phase", "Timeline", "Scope", "Exit criteria"], [
  ["0. Discovery", "Weeks 0-2", "Content audit, taxonomy design, baseline measurement, golden-set creation", "Baseline KPIs captured; 300-question golden set signed off"],
  ["1. Pilot - Content Studio", "Weeks 3-8", "Ingestion, draft generation, flags, SME review workflow at one site", ">= 70% draft acceptance (minor edits); 50% of flagged items resolved"],
  ["2. Pilot - Ask Wayfinder", "Weeks 7-12", "Grounded chatbot on refreshed content; feedback loop; dashboard", "Eval gates in 5.6 met; 40% WAU; 60% resolution"],
  ["3. Wave rollout", "Months 4-9", "3-5 sister sites; voice; second language; onboarding playbook", "Site onboarding <= 4 weeks; consistent KPIs across sites"],
  ["4. Scale", "Months 10-24", "Enterprise-wide; more roles; LMS and connected-worker integrations", "Enterprise ROI >= 2x; named content owners per domain"]], [1.8, 1.3, 3.5, 3]));
C.push(SP());
C.push(H2("3.5 OKRs (Pilot)"));
C.push(P("**Objective 1: Make training content current with less expert effort.**"));
C.push(B("KR1: Reduce SME hours on content creation/maintenance by 30% vs. baseline."));
C.push(B("KR2: Cut median SOP-change-to-training-update time from ~5 weeks to under 1 week."));
C.push(B("KR3: Resolve 50% of flagged outdated/duplicate items within the pilot."));
C.push(P("**Objective 2: Give workers trustworthy answers in the flow of work.**"));
C.push(B("KR1: 60% of questions resolved without escalation (self-reported + no follow-up within 10 min)."));
C.push(B("KR2: 40% weekly active users among eligible workers by week 12."));
C.push(B("KR3: Zero confirmed incidents of an unapproved or uncited answer reaching a worker."));
C.push(H2("3.6 Stakeholder RACI"));
C.push(T(["Activity", "Product Mgr", "L&D Owner", "SME", "Compliance", "IT/Security", "Ops / Site Lead"], [
  ["Taxonomy & content scope", "A", "R", "C", "C", "I", "C"],
  ["Content review & approval", "I", "A", "R", "C", "-", "I"],
  ["Model / prompt changes", "A", "C", "C", "C", "C", "I"],
  ["Evaluation gates & go/no-go", "R", "C", "C", "A", "C", "C"],
  ["Access, SSO, data residency", "C", "I", "-", "C", "A/R", "I"],
  ["Worker rollout & adoption", "C", "C", "I", "I", "I", "A/R"]], [2.6, 1.1, 1.1, 0.9, 1.2, 1.2, 1.3]));
C.push(I("R = Responsible, A = Accountable, C = Consulted, I = Informed."));

// ---------- 4. UX / Workflow / Trust ----------
C.push(H1("4. UX / Workflow / Trust Design"));
C.push(H2("4.1 Design Principles"));
C.push(B("**Show your work:** every AI output carries its source. No citation, no answer."));
C.push(B("**Human decides:** AI drafts and suggests; named humans approve and publish."));
C.push(B("**Fast on the floor:** two taps or one voice prompt to an answer; works on shared kiosks, gloves-friendly large targets, and low connectivity."));
C.push(B("**Honest about limits:** when unsure, say so and route to a person, rather than guess."));
C.push(B("**Close the loop:** every unanswered or down-voted question becomes a visible content task."));
C.push(H2("4.2 Workflow A - Content Studio (SME / L&D)"));
C.push(N("**Ingest:** L&D uploads SOPs and training, or connects the LMS/document system. The system parses, chunks and tags content to the taxonomy, and produces an ingestion report.", "numA"));
C.push(N("**Detect:** Wayfinder compares training against current SOP versions and flags conflicts, superseded steps and near-duplicates, ranked by usage and risk.", "numA"));
C.push(N("**Draft:** for a flagged item or new SOP, the Content Agent produces a draft module (objectives, step list, checks, quiz items) with paragraph-level source links.", "numA"));
C.push(N("**Review:** the SME sees a side-by-side view (source on left, draft on right), with changed text highlighted. The SME edits, accepts or rejects each section.", "numA"));
C.push(N("**Approve & publish:** a named approver publishes. The version, approver and timestamp are logged. Only approved content enters the chatbot index.", "numA"));
C.push(N("**Learn:** the content-gap dashboard shows top unanswered questions and low-rated answers by topic, feeding the next round of updates.", "numA"));
C.push(H2("4.3 Workflow B - Ask Wayfinder (Frontline Worker)"));
C.push(N("Worker opens Wayfinder on a kiosk/mobile (SSO or badge tap) and types or speaks a question, e.g. \"What torque for the line 3 conveyor guard bolts?\"", "numB"));
C.push(N("The system classifies intent and safety sensitivity. Safety-critical topics (e.g. lockout/tagout, chemical exposure, emergencies) return the official procedure verbatim plus the supervisor/EHS contact.", "numB"));
C.push(N("Otherwise, hybrid retrieval finds approved passages. If confidence is above threshold, the assistant returns a short answer (<= 120 words) with numbered citations; tapping a citation opens the exact SOP section.", "numB"));
C.push(N("If confidence is low or no source exists, the assistant says it does not have an approved answer, shows who to ask, and logs the gap.", "numB"));
C.push(N("Worker gives one-tap feedback (helpful / not helpful / wrong). \"Wrong\" opens a short reason picker and alerts the content owner.", "numB"));
C.push(H2("4.4 Key Screens"));
C.push(T(["Screen", "Primary user", "Key elements"], [
  ["Content Health Dashboard", "L&D owner", "Freshness score by topic; flagged items queue; top content gaps from chatbot; SME review backlog"],
  ["Side-by-side Review", "SME", "Source vs. draft diff; per-section accept/edit/reject; source links; approve button with e-signature"],
  ["Ask Wayfinder chat", "Worker", "Large input + mic; short answer; citation chips; confidence cue; \"Ask a person\" button; feedback buttons"],
  ["Answer Detail / Source Viewer", "Worker", "Highlighted source passage; SOP version and approval date; related steps"],
  ["Audit & Analytics", "Compliance / Ops", "Answer log with sources; approval history; export; adoption and resolution trends per site"]], [2.5, 1.5, 5]));
C.push(SP());
C.push(H2("4.5 Trust Design Patterns"));
C.push(T(["Trust risk", "Design pattern", "How the user sees it"], [
  ["Hallucinated answer", "Strict grounding + mandatory citation; answer refused if no supporting passage", "Every answer shows source chips; no chips means no answer"],
  ["Over-trust of AI", "Confidence cue and \"verify in source\" link; safety topics never paraphrased", "\"Answer from SOP-114 v3, approved 12 Mar\"; safety banner on critical topics"],
  ["Under-trust / low adoption", "Fast, short answers; visible approval provenance; supervisor endorsement during rollout", "Supervisors demo it in shift huddles; \"approved by\" label"],
  ["Stale answers", "Index only current approved versions; expiry dates on content", "Version and approval date shown on every answer"],
  ["Silent AI edits", "No auto-publish; diff view; audit log", "SME sees exactly what changed and why"],
  ["Feeling monitored", "Query logs pseudonymized for analytics; no individual performance use", "Clear notice at first use explaining what is and is not tracked"]], [2, 3.5, 3.5]));
C.push(SP());
C.push(H2("4.6 Failure States and Escalation"));
C.push(B("**No source found:** \"I don't have an approved answer for that. Your supervisor on this shift is [name]; I have logged this so the content team can add it.\""));
C.push(B("**Conflicting sources:** show both sources, mark the conflict, and alert the content owner rather than picking one."));
C.push(B("**System unavailable:** fall back to offline cached top-50 procedures per area and a link to the document system."));
C.push(B("**Out of scope / unsafe request:** polite refusal with route to the right human channel."));
C.push(H2("4.7 Accessibility and Inclusion"));
C.push(P("Large touch targets and high-contrast mode for industrial environments; voice input/output for noisy or hands-busy settings (Phase 2); reading level targeted at grade 6-8; multilingual answers with the original-language source always available; WCAG 2.1 AA for web screens."));

// ---------- 5. Data, Model, Evaluation ----------
C.push(H1("5. Data, Model, and Evaluation Strategy"));
C.push(H2("5.1 Data Sources"));
C.push(T(["Source", "Format", "Use", "Sensitivity"], [
  ["SOPs / work instructions", "PDF, DOCX, document management system", "Ground truth for answers and drafts", "Internal / confidential"],
  ["Existing training modules", "LMS export (SCORM), PPTX, video transcripts", "Input for restructuring; duplicate detection", "Internal"],
  ["Taxonomy (sites, lines, equipment, tasks)", "CSV / asset register", "Tagging, filtering, routing", "Internal"],
  ["Chatbot query & feedback logs", "Event stream", "Content gaps, evaluation, improvement", "Pseudonymized; personal data minimized"],
  ["SME review decisions", "Workflow events", "Measure draft quality; improve prompts", "Internal"]], [2.5, 2.5, 2.5, 2]));
C.push(SP());
C.push(H2("5.2 Data Pipeline"));
C.push(N("**Ingest & parse:** extract text, tables and images (with OCR for scanned SOPs); preserve headings and step numbering.", "numC"));
C.push(N("**Clean & version:** de-duplicate, attach SOP version, owner, approval status and effective dates.", "numC"));
C.push(N("**Chunk:** structure-aware chunking by section/step (not fixed size) so citations map to real procedure steps.", "numC"));
C.push(N("**Tag:** classify each chunk to the taxonomy (site, area, equipment, task, safety-critical flag) using an LLM classifier with SME spot-checks.", "numC"));
C.push(N("**Embed & index:** dense + sparse embeddings stored in a vector index; only approved, current versions are searchable by the chatbot.", "numC"));
C.push(H2("5.3 Model Architecture"));
C.push(T(["Component", "Approach", "Rationale"], [
  ["Embeddings", "Multilingual hybrid model (dense + sparse, e.g. BGE-M3)", "Handles jargon/part numbers (sparse) and paraphrases (dense); multilingual"],
  ["Retrieval", "Hybrid BM25 + vector search, reciprocal rank fusion, metadata filters by site/area", "Strong recall on technical text; scoped to the worker's context"],
  ["Reranker", "Cross-encoder reranker on top-20 candidates", "Improves precision of passages passed to the LLM"],
  ["Answer generation", "Frontier LLM via enterprise API (e.g. Claude Sonnet class) with strict grounding prompt and citation format", "Quality and instruction-following; enterprise data terms"],
  ["Classification / routing", "Small fast LLM (e.g. Claude Haiku class)", "Low cost and latency for intent, safety and language detection"],
  ["Content drafting", "Frontier LLM with structured templates and paragraph-level source linking", "Long-context reasoning across SOP + old training"],
  ["Outdated / duplicate detection", "Embedding similarity + LLM contradiction check between training and current SOP", "Scales review to thousands of documents"],
  ["Guardrails", "Input filters, safety-topic router, output citation validator, PII redaction", "Enforces \"no citation, no answer\" and safety rules"]], [2, 4, 3.5]));
C.push(SP());
C.push(P("**Model-agnostic by design:** models sit behind an abstraction layer so the team can swap providers on cost, quality or data-residency grounds without changing the product. We do **not** fine-tune in v1; grounding, retrieval quality and prompt design deliver most of the value at lower risk. Fine-tuning a small model for classification is a Phase 3 option once enough labelled data exists."));
C.push(H2("5.4 Evaluation Framework"));
C.push(P("Evaluation runs at three levels: offline before every release, in a shadow/pilot stage, and continuously in production."));
C.push(T(["Level", "What we measure", "Method"], [
  ["Retrieval", "Recall@5, MRR, metadata-filter accuracy", "Golden set of 300+ question-passage pairs written by SMEs"],
  ["Answer quality", "Correctness, faithfulness (every claim supported), completeness, citation accuracy", "LLM-as-judge calibrated against SME labels on a 20% sample"],
  ["Refusal behaviour", "Correct refusal on out-of-scope / no-source questions; false refusal rate", "Adversarial and out-of-scope test set (100+ items)"],
  ["Safety", "Safety-critical routing accuracy; no paraphrase of critical procedures", "Red-team set built with EHS team"],
  ["Content drafts", "SME acceptance rate, edit distance, factual error rate", "SME review telemetry; blind comparison vs. human-written"],
  ["Flags", "Precision / recall of outdated & duplicate flags", "SME labelled sample per site"],
  ["Product / online", "Resolution rate, thumbs-up rate, escalation rate, WAU, latency, cost per query", "Product analytics; weekly review"]], [1.8, 3.8, 3.9]));
C.push(SP());
C.push(H2("5.5 Golden Set Construction"));
C.push(B("300+ real questions gathered from supervisors and shift logs during discovery, balanced across areas and difficulty."));
C.push(B("Each item has: question, expected answer, supporting passage(s), safety flag, and language."));
C.push(B("Includes 100+ \"should refuse\" questions (no approved source, off-topic, unsafe) and 50+ multilingual items."));
C.push(B("Refreshed monthly from real production queries; versioned so results are comparable over time."));
C.push(H2("5.6 Release Gates (Go / No-Go)"));
C.push(T(["Metric", "Pilot gate", "Scale gate"], [
  ["Retrieval Recall@5", ">= 90%", ">= 93%"],
  ["Answer faithfulness (claims supported by citation)", ">= 95%", ">= 97%"],
  ["Citation accuracy (citation points to supporting text)", ">= 98%", ">= 99%"],
  ["Correct refusal on no-source questions", ">= 90%", ">= 95%"],
  ["Safety-critical routing accuracy", "100% on red-team set", "100% on red-team set"],
  ["False refusal rate on answerable questions", "<= 15%", "<= 10%"],
  ["p95 response latency", "<= 4 s", "<= 3 s"],
  ["SME draft acceptance (minor edits only)", ">= 70%", ">= 80%"]], [5, 2, 2]));
C.push(SP());
C.push(H2("5.7 Monitoring, Drift and Continuous Improvement"));
C.push(B("Daily automated run of the golden set; alerts if any gate metric drops more than 2 points."));
C.push(B("Content drift: when an SOP is updated, dependent chunks are re-indexed and affected training is auto-flagged for review."));
C.push(B("Query drift: new clusters of unanswered questions surface on the content-gap dashboard weekly."));
C.push(B("Model change control: any model or prompt change goes through the offline suite and a 1-week shadow run before release."));
C.push(B("Human feedback: \"wrong\" ratings are triaged within 2 business days by the content owner."));

// ---------- 6. Business ----------
C.push(H1("6. Business, Economics, and Scaling View"));
C.push(H2("6.1 Business Model and Pricing"));
C.push(T(["Component", "Pricing (illustrative)", "Rationale"], [
  ["Content Studio", "$25,000 per site per year", "Priced to SME time saved; independent of headcount"],
  ["Ask Wayfinder", "$3 per eligible worker per month", "Scales with value (workers served); low barrier per head"],
  ["Onboarding & taxonomy setup", "$30,000 one-time per enterprise", "Covers discovery, content audit, golden-set creation"],
  ["Enterprise tier", "Volume discount, SSO/SCIM, data residency, audit export", "Supports compliance-heavy buyers"]], [2.3, 3, 4]));
C.push(SP());
C.push(H2("6.2 Customer ROI Model (Reference Customer)"));
C.push(P("Assumptions: 10 sites, 12,000 frontline workers, 40 SMEs/L&D authors. SME loaded cost $60/hr; worker loaded cost $30/hr; 48 working weeks."));
C.push(T(["Value driver", "Calculation", "Annual value"], [
  ["SME authoring & maintenance time saved", "40 SMEs x 1,800 hrs x 30% on content x 40% saved = 8,640 hrs x $60", "$518,400"],
  ["Worker search / waiting time saved", "12,000 workers x 50% adoption x 7.5 min/week saved x 48 weeks = 36,000 hrs x $30", "$1,080,000"],
  ["Total quantified benefit", "", "**$1,598,400**"],
  ["Annual subscription cost", "12,000 x $3 x 12 = $432,000 + 10 x $25,000 = $250,000", "**$682,000**"],
  ["ROI (benefit / cost)", "", "**~2.3x**"],
  ["Payback period", "$682,000 / ($1,598,400 / 12)", "**~5 months**"]], [3, 4.5, 1.7]));
C.push(I("Not quantified (upside): fewer errors and rework, faster time-to-competency for new hires, reduced compliance audit effort, lower supervisor interruption load."));
C.push(H2("6.3 Sensitivity Analysis (Adoption)"));
C.push(T(["Chatbot adoption", "Worker time value", "Total benefit", "ROI"], [
  ["25%", "$540,000", "$1,058,400", "1.6x"],
  ["50% (base)", "$1,080,000", "$1,598,400", "2.3x"],
  ["75%", "$1,620,000", "$2,138,400", "3.1x"]], [2, 2.3, 2.3, 1.5]));
C.push(SP());
C.push(P("Even at 25% adoption the customer recovers more than its cost, mainly through SME time saved. Adoption is therefore the key lever for upside, and the main reason UX friction and supervisor endorsement are treated as first-class priorities."));
C.push(H2("6.4 Unit Economics (Vendor View, Reference Customer)"));
C.push(T(["Cost line", "Assumption", "Annual cost"], [
  ["LLM inference - chatbot", "6,000 active users x 10 queries/week x 48 = 2.88M queries x ~$0.01", "$28,800"],
  ["LLM inference - content generation", "~20,000 document drafts/re-checks x ~$0.50", "$10,000"],
  ["Hosting, vector index, monitoring", "Managed cloud, per-tenant isolation", "$60,000"],
  ["Customer success & support", "~1 FTE share", "$120,000"],
  ["Total cost to serve", "", "**$218,800**"],
  ["Revenue (ACV)", "", "**$682,000**"],
  ["Gross margin", "", "**~68%**"]], [3, 4.5, 1.7]));
C.push(SP());
C.push(P("Cost levers: route simple questions to smaller models, cache frequent answers per site, cap context size with a reranker, and batch content re-checks off-peak. Each could move gross margin toward 75%+ at scale."));
C.push(H2("6.5 Scaling Strategy"));
C.push(T(["Dimension", "Scaling approach"], [
  ["Sites", "Repeatable onboarding playbook: taxonomy template, ingestion connectors, golden-set kit; target <= 4 weeks per new site"],
  ["Content volume", "Incremental indexing; change-triggered re-checks instead of full re-processing"],
  ["Languages", "Multilingual embeddings; translation at answer time with original source preserved; start with top 2 languages per site"],
  ["Roles", "Role-based content scoping (operator, maintenance, quality) via metadata filters"],
  ["Customers", "Multi-tenant platform with per-tenant data isolation and regional deployment"],
  ["Organization", "Federated content ownership: one named owner per domain, central governance board"]], [2, 7]));
C.push(SP());
C.push(H2("6.6 Three-Year Outlook (Illustrative)"));
C.push(T(["", "Year 1", "Year 2", "Year 3"], [
  ["Enterprise customers", "3", "15", "40"],
  ["Average ACV", "$250K", "$280K", "$300K"],
  ["ARR (end of year)", "$0.75M", "$4.2M", "$12M"],
  ["Gross margin", "60%", "68%", "73%"]], [3, 2, 2, 2]));

// ---------- 7. Ethics ----------
C.push(H1("7. Ethics, Governance, and Risk Note"));
C.push(H2("7.1 Responsible AI Principles"));
C.push(T(["Principle", "How Wayfinder applies it"], [
  ["Safety first", "Safety-critical procedures are never paraphrased; they are shown verbatim with a human contact. No auto-publish."],
  ["Transparency", "Every answer cites its approved source, version and approval date. Users are told they are using an AI assistant."],
  ["Human accountability", "A named SME approves every piece of content; the AI never has publish rights."],
  ["Fairness & inclusion", "Multilingual support; plain-language reading level; evaluation sliced by language and site to catch quality gaps."],
  ["Privacy & worker dignity", "Query logs are pseudonymized for analytics and never used for individual performance evaluation; data minimization by default."],
  ["Reliability", "Release gates, continuous evaluation and rollback for any model or prompt change."]], [2.3, 7]));
C.push(SP());
C.push(H2("7.2 Governance Model"));
C.push(B("**AI Content Governance Board** (L&D, Operations, Quality/Compliance, EHS, IT, Works Council/employee representative where applicable): approves taxonomy, safety-critical topic list, release gates and policy changes; meets monthly."));
C.push(B("**Domain content owners:** one named owner per content domain, responsible for review SLAs and freshness."));
C.push(B("**Change control:** model, prompt and retrieval changes are versioned, evaluated against gates, and logged with approver."));
C.push(B("**Audit trail:** all answers (with sources) and all content approvals are retained per the customer's records policy and exportable."));
C.push(B("**Incident process:** a \"wrong answer\" with safety or quality impact triggers a severity rating, content freeze for the topic, root-cause review and communication within defined SLAs."));
C.push(H2("7.3 Regulatory and Policy Considerations"));
C.push(T(["Area", "Consideration", "Response"], [
  ["Data protection (GDPR, India DPDP Act 2023)", "Worker identifiers in query logs", "Pseudonymize, minimize, regional hosting, data processing agreements, retention limits"],
  ["EU AI Act", "Workplace AI systems may face transparency and, in some uses, high-risk obligations", "No use for worker evaluation or management decisions; transparency notices; documentation and risk management maintained"],
  ["Occupational safety regulations", "Guidance on hazardous tasks", "Safety router; verbatim procedures; EHS sign-off on safety topic list"],
  ["Quality standards (e.g. ISO 9001 document control)", "Controlled documents must be approved and versioned", "Only approved current versions indexed; approval log aligns with document control"],
  ["Intellectual property & vendor terms", "Customer content sent to LLM providers", "Enterprise API terms with no training on customer data; encryption in transit and at rest"],
  ["Labour relations", "Perception of surveillance or job replacement", "Early engagement with employee representatives; positioning as support tool, not monitoring"]], [2.5, 3, 4]));
C.push(SP());
C.push(H2("7.4 Risk Register"));
C.push(T(["#", "Risk", "Likelihood", "Impact", "Mitigation", "Owner"], [
  ["R1", "Chatbot gives a confident but wrong answer", "Medium", "High", "Strict grounding, citation validator, refusal threshold, safety router, feedback triage", "Product Mgr"],
  ["R2", "AI drafts introduce subtle inaccuracies", "Medium", "High", "Mandatory SME review, diff view, paragraph-level source links, no auto-publish", "L&D Owner"],
  ["R3", "Low worker adoption", "Medium", "High", "Minimal friction, supervisor champions, kiosk placement, track per-site adoption weekly", "Site Lead"],
  ["R4", "SME review becomes a bottleneck", "Medium", "Medium", "Prioritized review queue by risk/usage; review SLAs; section-level approval", "L&D Owner"],
  ["R5", "No long-term content owner at scale", "Medium", "High", "Named domain owners before wave rollout; governance board", "Governance Board"],
  ["R6", "Data leakage / privacy breach", "Low", "High", "SSO, RBAC, tenant isolation, encryption, PII redaction, vendor DPAs, pen-testing", "IT/Security"],
  ["R7", "Bias: lower quality in some languages or sites", "Medium", "Medium", "Sliced evaluation by language/site; native-speaker review; gates per language", "Product Mgr"],
  ["R8", "LLM vendor price, quality or availability change", "Low", "Medium", "Model abstraction layer; multi-vendor fallback; cost monitoring", "Engineering"],
  ["R9", "Over-reliance reduces worker skill retention", "Low", "Medium", "Link answers to training modules; supervisors reinforce learning; monitor repeat questions", "L&D Owner"]], [0.5, 2.5, 1.1, 1, 3.6, 1.4]));

// ---------- 8. Prototype ----------
const SHOT = "/Users/shreya.a/GQS/wayfinder-ai-mvp/docs/screenshots/";
const Img = (f, cap) => [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, keepNext: true,
  children: [new d.ImageRun({ type: "jpg", data: fs.readFileSync(SHOT + f), transformation: { width: 600, height: 388 },
    altText: { title: cap, description: cap, name: f } })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: cap, italics: true, size: 18, color: "555555" })] })];
C.push(H1("8. Functional Prototype / MVP"));
C.push(P("We built a working MVP that runs the full Wayfinder loop end to end: ingest, detect, draft, review and approve, ask, feedback, audit. It uses a **synthetic** SOP library for a fictional manufacturing plant. It runs locally with Python 3 only (standard library, nothing to install) and has two modes: **offline extractive mode** (default, fully deterministic) and **Claude mode** (when an API key is configured)."));
C.push(H2("8.1 MVP Scope"));
C.push(T(["Capability", "What the MVP does", "Maps to"], [
  ["Knowledge base ingestion", "Loads 11 approved SOPs and 7 legacy training modules; accepts .md, .txt and .docx uploads; structure-aware chunking (one passage per procedure step, 81 indexed passages)", "US-01"],
  ["Content Health flags", "Detects superseded SOP versions, value conflicts (e.g. training says 25 Nm, SOP v3 says 30 Nm), near-duplicate modules (94% similar) and SOPs with no training", "US-03"],
  ["AI draft generation", "Drafts a training module from an SOP (objectives, steps, critical values, safety reminders, knowledge check); every line carries its source passage ID", "US-02"],
  ["SME review & approval", "Side-by-side source vs. draft with line highlighting; editable; named approver required; approval publishes to the assistant and auto-resolves related flags", "US-04"],
  ["Ask Wayfinder", "Answers only from approved content with citations, version and approver; refuses and logs when no source; safety-critical questions get the verbatim procedure + EHS contact", "US-05, US-06"],
  ["Feedback & content gaps", "Thumbs up / down / wrong (with reason); gaps grouped by topic with one-click content task", "US-07, US-08"],
  ["Governance", "Uploads stay pending until approved; audit trail of drafts, approvals and alerts; worker IDs hashed", "US-10, Section 7"]], [2, 5.5, 1.2]));
C.push(SP());
C.push(H2("8.2 Architecture and Tech Stack"));
C.push(T(["Layer", "MVP implementation", "Production path"], [
  ["UI", "Single-page web app (HTML + vanilla JavaScript), 5 screens, phone-style worker view", "React web + PWA for kiosks/mobile, SSO"],
  ["API / orchestration", "Python 3 standard-library HTTP server (wayfinder/app.py)", "Python service with queue workers, API gateway"],
  ["Retrieval", "BM25 with title/equipment boost, stemming, domain synonym map; approved content only; score + query-coverage answerability thresholds", "Hybrid dense + sparse (e.g. BGE-M3) with reciprocal rank fusion and cross-encoder reranker"],
  ["Generation", "Offline: verbatim extractive answers and template drafts. Claude mode: Claude Sonnet constrained to numbered passages, citations validated, automatic fallback", "Same, behind a model abstraction layer with multi-vendor fallback"],
  ["Safety router", "Keyword rules + safety-critical document check; verbatim procedure, no paraphrase", "Classifier model + EHS-maintained topic list"],
  ["Content health", "Version check, number+unit conflict check, cosine near-duplicate check", "Add LLM contradiction check and scheduled re-scans on SOP change"],
  ["Storage & governance", "SQLite: query log, drafts, approvals, uploads, flag state, audit log", "PostgreSQL + object storage, immutable audit log, retention policies"],
  ["Evaluation", "Golden-set runner (wayfinder/evaluate.py) + 10 unit tests", "Scheduled eval pipeline, LLM-as-judge calibrated to SME labels, dashboards"]], [1.8, 4, 3.5]));
C.push(SP());
C.push(H2("8.3 Demo Walkthrough"));
C.push(N("**Ask Wayfinder:** a worker asks \"What torque for the conveyor guard bolts?\" and gets \"Tighten the guard bolts to 30 Nm...\" cited to SOP-114 v3, approved 2026-03-12. The outdated 25 Nm value in legacy training is never shown.", "numD"));
C.push(N("**Refusal:** \"What is on the cafeteria menu today?\" gets a polite refusal with a supervisor route, and the question is logged as a content gap.", "numD"));
C.push(N("**Safety:** \"Who is allowed to remove a lock?\" returns the full SOP-101 lockout/tagout procedure word for word under a red safety banner, with the EHS contact.", "numD"));
C.push(N("**Content Health:** 11 open flags and 57% freshness at the start. TRN-01 is flagged three ways: superseded version, 25 vs 30 Nm, and 10 vs 8 mm. Both sides of the evidence are shown.", "numD"));
C.push(N("**Draft & approve:** \"Generate revised draft\" creates a module from SOP-114 v3. The SME reviews it side by side, edits and approves it as \"R. Mehta (SME)\". TRN-01's flags resolve automatically, and freshness rises from 57% to 71%.", "numD"));
C.push(N("**Feedback loop and audit:** an answer rated \"wrong\" raises an alert and appears in Content Gaps. The audit trail shows draft_created, draft_approved (with an edited_by_sme flag) and wrong_answer_alert events.", "numD"));
C.push(H2("8.4 MVP Evaluation Results"));
C.push(P("Golden set of 40 questions: 26 answerable, 6 safety-critical, 8 that should be refused. Offline extractive mode, measured with wayfinder/evaluate.py on 08-11-2026."));
C.push(T(["Metric (Section 5.6 gate)", "Pilot gate", "MVP result", "Status"], [
  ["Retrieval Recall@5", ">= 90%", "100%", "Pass"],
  ["Answer faithfulness (proxy: expected fact present in cited passage)", ">= 95%", "100%", "Pass"],
  ["Citation accuracy (cited document is the correct SOP)", ">= 98%", "100%", "Pass"],
  ["Correct refusal on no-source questions", ">= 90%", "100% (8/8)", "Pass"],
  ["Safety-critical routing accuracy", "100%", "100% (6/6)", "Pass"],
  ["False refusal rate on answerable questions", "<= 15%", "3.8% (1/26)", "Pass"],
  ["Answer correctness (expected fact in answer)", "-", "96.2% (25/26)", "-"],
  ["p95 latency (offline mode)", "<= 4 s", "< 1 ms", "Pass"],
  ["SME draft acceptance", ">= 70%", "Not measured - needs real SMEs", "Open"]], [4.5, 1.3, 2, 1]));
C.push(SP());
C.push(Callout(["**How to read these results:** the golden set was written by the team alongside the system on a small synthetic corpus, so the scores are optimistic and show feasibility rather than production accuracy. The one miss (\"How long is the shift handover meeting?\" was wrongly refused) was kept as is, not tuned away, so the test is not overfitted. A pilot would use a 300+ question set written by SMEs from real shift questions, with real-world variation (typos, slang, mixed language), and would measure Claude mode separately, including latency."]));
C.push(SP());
C.push(H2("8.5 Screenshots"));
Img("1_ask_wayfinder.jpg", "Figure 8.1 - Ask Wayfinder: cited answer, safety banner and the trust trail for each answer").forEach(x => C.push(x));
Img("2_content_health.jpg", "Figure 8.2 - Content Health: freshness KPIs and flagged conflicts with side-by-side evidence").forEach(x => C.push(x));
Img("3_review_approve.jpg", "Figure 8.3 - Review & Approve: AI draft with line-level source links, highlighted in the approved SOP").forEach(x => C.push(x));
Img("4_content_gaps.jpg", "Figure 8.4 - Content Gaps: unanswered and wrong-rated questions become content tasks").forEach(x => C.push(x));
Img("5_audit.jpg", "Figure 8.5 - Audit & Analytics: governance trail and pseudonymized answer log").forEach(x => C.push(x));
C.push(H2("8.6 How to Run"));
C.push(B("Code location: wayfinder-ai-mvp/ (README.md has full instructions). [[Add repository / demo video link]]"));
C.push(B("Start: python3 -m wayfinder.app, then open http://localhost:8765"));
C.push(B("Evaluate: python3 -m wayfinder.evaluate | Tests: python3 -m unittest discover -s tests -t ."));
C.push(B("Optional Claude mode: set ANTHROPIC_API_KEY before starting."));
C.push(H2("8.7 Known Limitations and Next Steps"));
C.push(B("Synthetic data only; real SOPs (scans, tables, diagrams) need OCR and stronger parsing."));
C.push(B("Lexical retrieval only; production adds dense multilingual embeddings and a reranker for paraphrased questions."));
C.push(B("Claude mode is implemented but was not evaluated here (no API key in the build environment); it must pass the same gates before pilot."));
C.push(B("No SSO, role-based access or multi-tenancy; no voice or multilingual input yet (Phase 2)."));
C.push(B("Draft quality and SME acceptance need real SME review in the pilot."));

// ---------- 9. AI Collaboration Log ----------
C.push(H1("9. AI Collaboration Log"));
C.push(P("This log records how generative AI tools were used in preparing this submission, what was accepted, and how the team verified it. All AI outputs were reviewed and edited by team members, who remain accountable for the content."));
C.push(T(["#", "Date", "Tool", "Purpose", "What AI produced", "Human verification / changes", "Team member"], [
  ["1", "[[dd-mm-2026]]", "[[e.g. ChatGPT / Claude]]", "Brainstorm capstone problem areas", "[[List of candidate ideas]]", "[[Team shortlisted and chose Wayfinder]]", "[[Name]]"],
  ["2", "[[dd-mm-2026]]", "[[Tool]]", "Draft initial pitch document", "[[Draft sections]]", "[[Edited for scope, removed real-company references]]", "[[Name]]"],
  ["3", "08-11-2026", "Claude Code (Claude Opus 5.5)", "Expand initial pitch into the 10-section final submission structure", "Draft of all sections, tables (RICE, ROI, risk register, eval gates) and Word formatting", "[[Team to review: validate figures, adapt to course frameworks, confirm prototype details]]", "Shreya"],
  ["4", "08-11-2026", "Claude Code (Claude Opus 5.5)", "Build the functional MVP (Section 8)", "Python/JS prototype code, synthetic SOP and training data, 40-question golden set, evaluation script, unit tests", "Ran 10 unit tests and the golden-set evaluation; tested all 5 screens in a browser; fixed a gap-grouping bug found during testing. [[Team to review code and data]]", "Shreya"],
  ["5", "[[dd-mm-2026]]", "[[Tool]]", "[[Other use]]", "[[ ]]", "[[ ]]", "[[Name]]"]], [0.4, 1.2, 1.4, 1.8, 1.8, 2, 1.1]));
C.push(SP());
C.push(H2("9.1 Reflection on AI Use"));
C.push(B("**Where AI helped most:** structuring the document, generating first drafts of tables, and stress-testing assumptions (e.g. sensitivity of ROI to adoption)."));
C.push(B("**Where human judgement was essential:** choosing the problem and beachhead, sequencing content-before-chatbot, setting release gates, and deciding ethical boundaries (e.g. no worker performance use)."));
C.push(B("**Verification approach:** every calculation is shown step by step so it can be re-checked; every market or financial figure is labelled as an illustrative assumption; no AI output is included without team review. [[Team to confirm once review is complete.]]"));
C.push(B("[[Add team-specific reflections, including any AI suggestions that were rejected and why.]]"));

// ---------- 10. Contributions ----------
C.push(H1("10. Individual Contribution Disclosure"));
C.push(P("Each member's primary responsibilities and contributions are listed below. [[Team to complete and confirm - each member should verify their own row.]]"));
C.push(T(["Team member", "Student ID", "Sections led", "Key contributions", "Share of effort"], [
  ["Anirban", "2025MB26003", "[[e.g. 2, 6]]", "[[ ]]", "[[__%]]"],
  ["Rugved Khanwalkar", "2025MB26040", "[[ ]]", "[[ ]]", "[[__%]]"],
  ["Shoaib Ahmed Sharief", "2025MB26144", "[[ ]]", "[[ ]]", "[[__%]]"],
  ["Shreya", "2025MB26176", "[[ ]]", "[[ ]]", "[[__%]]"],
  ["Sonali", "2025MB26173", "[[ ]]", "[[ ]]", "[[__%]]"],
  ["Srishti Shrivastava", "2025MB26194", "[[ ]]", "[[ ]]", "[[__%]]"]], [2.2, 1.6, 1.4, 3, 1.2]));
C.push(SP());
C.push(P("**Declaration:** We confirm that the contributions above are accurate, that all AI assistance is disclosed in Section 9, and that the final content reflects the team's own analysis and judgement."));
C.push(SP());
C.push(T(["Name", "Signature", "Date"], [["Anirban", "", ""], ["Rugved Khanwalkar", "", ""], ["Shoaib Ahmed Sharief", "", ""], ["Shreya", "", ""], ["Sonali", "", ""], ["Srishti Shrivastava", "", ""]], [3, 3, 2]));
C.push(SP());
C.push(I("Wayfinder AI is a hypothetical product concept created for academic coursework. All figures are illustrative and do not represent any real organization's data or roadmap."));

const numCfg = (ref) => ({ reference: ref, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] });
const doc = new Document({
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: "Calibri", size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Calibri", size: 34, bold: true, color: ACCENT }, paragraph: { spacing: { before: 240, after: 160 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Calibri", size: 26, bold: true, color: "2E75B6" }, paragraph: { spacing: { before: 240, after: 100 }, keepNext: true, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Calibri", size: 22, bold: true }, paragraph: { spacing: { before: 160, after: 80 }, keepNext: true, outlineLevel: 2 } },
    ]
  },
  numbering: { config: [
    { reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } },
      { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 300 } } } }] },
    numCfg("num"), numCfg("numA"), numCfg("numB"), numCfg("numC"), numCfg("numD")] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Wayfinder AI - Team 011 - Final Submission", size: 16, color: "808080" })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["Page ", PageNumber.CURRENT], size: 16, color: "808080" })] })] }) },
    children: C
  }]
});
Packer.toBuffer(doc).then(b => { fs.writeFileSync(process.argv[2], b); console.log("ok"); });
