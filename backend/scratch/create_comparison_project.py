import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(supabase_url, supabase_key)

EXAMPLE_PROJECTS = [
    {
        "project": {
            "name": "Aubm Competitor Analysis",
            "description": "Deep dive into the multi-agent orchestration market to identify Aubm's unique value proposition and feature gaps.",
            "status": "active",
            "context": "Focus on developer experience, visual observability, and the 'Agent Debate' mechanism as key differentiators."
        },
        "tasks": [
            {"title": "Identify Top 5 Competitors", "description": "Research and list 5 similar multi-agent orchestration platforms (e.g., CrewAI, AutoGen, LangGraph, PydanticAI).", "status": "todo"},
            {"title": "Feature Comparison Matrix", "description": "Create a detailed matrix comparing Aubm's core features (Project Decomposition, Agent Debate, Real-time Console) against identified competitors.", "status": "todo"},
            {"title": "Pricing Model Analysis", "description": "Analyze how competitors charge (SaaS, Open Source, API usage) and recommend a competitive strategy for Aubm.", "status": "todo"},
            {"title": "UI/UX Aesthetic Audit", "description": "Evaluate the visual aesthetics and ease of use of competitors compared to Aubm's premium dashboard. Look for glassmorphism and animations.", "status": "todo"},
            {"title": "Technical Architecture Deep-Dive", "description": "Investigate the underlying tech stacks (Python vs TS, Vector DBs used, Orchestration logic) of top competitors.", "status": "todo"},
            {"title": "SWOT Analysis & Strategy Report", "description": "Compile all findings into a comprehensive report with a SWOT analysis and strategic recommendations for the next 6 months.", "status": "todo"}
        ]
    },
    {
        "project": {
            "name": "AI Support Automation Pilot",
            "description": "Design a pilot that routes inbound support tickets through specialized AI agents while keeping human approval for risky replies.",
            "status": "active",
            "context": "Use this as a customer operations example. Emphasize ticket triage, escalation policies, response quality, and measurable SLA impact."
        },
        "tasks": [
            {"title": "Map Support Ticket Categories", "description": "Identify the main ticket categories, escalation triggers, and data needed by each support agent role.", "status": "todo", "priority": 5},
            {"title": "Define Human Approval Rules", "description": "Specify which replies can be automated and which require human review based on customer risk and account tier.", "status": "todo", "priority": 4},
            {"title": "Design Agent Workflow", "description": "Create a multi-agent workflow for triage, answer drafting, policy checking, and final approval.", "status": "todo", "priority": 4},
            {"title": "Create Pilot Success Metrics", "description": "Define SLA, CSAT, deflection, review time, and error-rate metrics for a 30-day pilot.", "status": "todo", "priority": 3},
            {"title": "Draft Rollout Plan", "description": "Prepare a phased rollout plan with risks, staffing requirements, and customer communication steps.", "status": "todo", "priority": 3}
        ]
    },
    {
        "project": {
            "name": "FinOps Cloud Cost Review",
            "description": "Analyze cloud infrastructure spend and propose agent-assisted monitoring workflows to reduce waste without hurting reliability.",
            "status": "active",
            "context": "Use this as an operations and finance example. Focus on anomaly detection, rightsizing, reserved capacity, and stakeholder reporting."
        },
        "tasks": [
            {"title": "Inventory Cost Drivers", "description": "Break down the main cloud cost drivers across compute, storage, networking, databases, and third-party services.", "status": "todo", "priority": 5},
            {"title": "Identify Waste Patterns", "description": "Find common waste patterns such as idle resources, oversized instances, orphaned volumes, and expensive data transfer paths.", "status": "todo", "priority": 5},
            {"title": "Design Alerting Workflow", "description": "Create an agent workflow that detects spend anomalies, explains likely causes, and proposes owner-specific actions.", "status": "todo", "priority": 4},
            {"title": "Build Savings Roadmap", "description": "Prioritize savings opportunities by expected impact, risk, engineering effort, and time to value.", "status": "todo", "priority": 4},
            {"title": "Prepare Executive Summary", "description": "Summarize recommended actions, estimated savings ranges, risks, and governance changes for leadership.", "status": "todo", "priority": 3}
        ]
    },
    {
        "project": {
            "name": "Healthcare Intake Risk Triage",
            "description": "Prototype an AI-assisted intake workflow that summarizes patient requests, flags urgency, and routes cases to the correct care team.",
            "status": "active",
            "context": "Use this as a regulated-industry example. Emphasize auditability, privacy, safety checks, and clear human-in-the-loop boundaries."
        },
        "tasks": [
            {"title": "Define Intake Data Requirements", "description": "List required patient request fields, optional context, privacy constraints, and data that must never be generated by the system.", "status": "todo", "priority": 5},
            {"title": "Specify Risk Triage Rules", "description": "Define urgency categories, red-flag symptoms, routing criteria, and cases that must bypass automation.", "status": "todo", "priority": 5},
            {"title": "Design Audit Trail", "description": "Create an auditable record structure for summaries, agent reasoning, routing decisions, reviewer overrides, and timestamps.", "status": "todo", "priority": 4},
            {"title": "Review Compliance Risks", "description": "Identify privacy, consent, medical safety, bias, and operational risks with mitigation recommendations.", "status": "todo", "priority": 4},
            {"title": "Create Pilot Validation Plan", "description": "Define how clinicians will evaluate accuracy, escalation safety, workload impact, and patient experience before rollout.", "status": "todo", "priority": 3}
        ]
    },
    {
        "project": {
            "name": "Legal Contract Review Automation",
            "description": "Create an agent-assisted workflow that reviews vendor contracts, flags risky clauses, and prepares negotiation notes for legal approval.",
            "status": "active",
            "context": "Use this as a legal operations example. Focus on contract risk, clause extraction, redlines, escalation thresholds, and attorney review."
        },
        "tasks": [
            {"title": "Define Contract Review Scope", "description": "Identify contract types, clause families, review boundaries, and documents that must always be escalated to counsel.", "status": "todo", "priority": 5},
            {"title": "Build Clause Risk Taxonomy", "description": "Classify indemnity, limitation of liability, termination, data protection, payment, jurisdiction, and renewal risks.", "status": "todo", "priority": 5},
            {"title": "Design Legal Review Workflow", "description": "Create a multi-agent workflow for clause extraction, risk scoring, fallback research, negotiation notes, and final attorney approval.", "status": "todo", "priority": 4},
            {"title": "Draft Approval Checklist", "description": "Prepare a checklist for legal reviewers covering unacceptable terms, missing clauses, confidence levels, and required evidence.", "status": "todo", "priority": 4},
            {"title": "Prepare Pilot Metrics", "description": "Define cycle time, review accuracy, escalation rate, reviewer override rate, and business stakeholder satisfaction metrics.", "status": "todo", "priority": 3}
        ]
    },
    {
        "project": {
            "name": "Regulatory Compliance Monitoring",
            "description": "Design a legal monitoring workflow that tracks regulatory changes, summarizes business impact, and routes obligations to owners.",
            "status": "active",
            "context": "Use this as a compliance example. Emphasize source traceability, jurisdiction filters, obligation mapping, audit logs, and risk-based prioritization."
        },
        "tasks": [
            {"title": "Map Regulatory Sources", "description": "List official regulators, legal update feeds, jurisdictions, business units, and source reliability rules.", "status": "todo", "priority": 5},
            {"title": "Define Obligation Categories", "description": "Create categories for reporting, privacy, security, employment, financial controls, retention, and customer disclosure obligations.", "status": "todo", "priority": 5},
            {"title": "Design Change Detection Workflow", "description": "Create an agent workflow that detects changes, summarizes impact, links evidence, and assigns obligations to owners.", "status": "todo", "priority": 4},
            {"title": "Create Audit Evidence Model", "description": "Specify how the system stores source URLs, timestamps, summaries, reviewer decisions, owner acknowledgements, and completion proof.", "status": "todo", "priority": 4},
            {"title": "Prioritize Compliance Rollout", "description": "Rank jurisdictions and obligation types by legal exposure, operational complexity, and implementation effort.", "status": "todo", "priority": 3}
        ]
    },
    {
        "project": {
            "name": "Litigation Discovery Triage",
            "description": "Prototype an AI-assisted discovery workflow that groups documents, identifies privilege risks, and prepares review batches for legal teams.",
            "status": "active",
            "context": "Use this as a litigation support example. Focus on defensibility, privilege review, chain of custody, reviewer queues, and evidence traceability."
        },
        "tasks": [
            {"title": "Define Discovery Data Inputs", "description": "Identify document sources, metadata fields, custodians, date ranges, file types, and chain-of-custody requirements.", "status": "todo", "priority": 5},
            {"title": "Specify Privilege Screening Rules", "description": "Define attorney-client, work product, confidentiality, and sensitive data indicators that require legal review.", "status": "todo", "priority": 5},
            {"title": "Design Review Batch Workflow", "description": "Create an agent workflow for deduplication, clustering, privilege flagging, relevance summaries, and reviewer queue assignment.", "status": "todo", "priority": 4},
            {"title": "Create Defensibility Controls", "description": "Specify audit logs, reviewer overrides, confidence thresholds, sampled quality checks, and exportable decision records.", "status": "todo", "priority": 4},
            {"title": "Prepare Discovery Summary Report", "description": "Draft the report structure for document volumes, risk categories, review progress, escalations, and unresolved issues.", "status": "todo", "priority": 3}
        ]
    }
]

def resolve_owner_id():
    existing_projects = supabase.table("projects").select("owner_id").limit(1).execute()
    if existing_projects.data and existing_projects.data[0].get("owner_id"):
        return existing_projects.data[0]["owner_id"]

    users = supabase.table("profiles").select("id").limit(1).execute()
    if users.data:
        return users.data[0]["id"]

    return None

def create_project(project_data, tasks, owner_id):
    existing = (
        supabase.table("projects")
        .select("id")
        .eq("name", project_data["name"])
        .limit(1)
        .execute()
    )
    if existing.data:
        print(f"Skipping existing project: {project_data['name']}")
        return

    payload = project_data.copy()
    if owner_id:
        payload["owner_id"] = owner_id

    project_res = supabase.table("projects").insert(payload).execute()
    project_id = project_res.data[0]["id"]
    task_rows = [{**task, "project_id": project_id} for task in tasks]
    supabase.table("tasks").insert(task_rows).execute()
    print(f"Created project: {project_data['name']} ({len(task_rows)} tasks)")

def create_projects():
    try:
        owner_id = resolve_owner_id()
        if not owner_id:
            print("No valid owner_id found in projects or profiles. The project will be created without owner and might not be visible.")
        else:
            print(f"Using owner_id: {owner_id}")

        for example in EXAMPLE_PROJECTS:
            create_project(example["project"], example["tasks"], owner_id)

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    create_projects()
