from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import Response
from services.orchestrator_service import orchestrator_service
from services.supabase_service import supabase
from services.config import settings
from pydantic import BaseModel
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
from xml.sax.saxutils import escape
import re

router = APIRouter()

def _ensure_project_is_mutable(project_id: str):
    project = supabase.table("projects").select("id,status").eq("id", project_id).single().execute().data
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("status") == "completed":
        raise HTTPException(status_code=409, detail="Completed projects are locked and cannot be modified.")
    return project

def _safe_filename(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", value).strip("_").lower() or "report"

def _pdf_text(value: str) -> str:
    return escape(str(value))

def _report_body_without_execution_summary(content: str) -> list[str]:
    lines: list[str] = []
    skipping = False
    for raw_line in content.splitlines():
        if raw_line.startswith("## Execution Summary"):
            skipping = True
            continue
        if skipping and raw_line.startswith("## "):
            skipping = False
        if not skipping:
            lines.append(raw_line)
    return lines

def _report_pdf_bytes(title: str, content: str, charts: dict | None = None) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.7 * inch,
        leftMargin=0.7 * inch,
        topMargin=0.7 * inch,
        bottomMargin=0.7 * inch,
    )
    styles = getSampleStyleSheet()
    story = [Paragraph(_pdf_text(title), styles["Title"]), Spacer(1, 0.2 * inch)]
    if charts:
        story.append(Paragraph("Project Execution Summary", styles["Heading2"]))
        story.append(Spacer(1, 0.1 * inch))
        
        # Summary Table instead of charts
        table_data = [["Metric / Category", "Value"]]
        
        # Tasks Status
        status_counts = {row["label"]: row["value"] for row in charts.get("status", [])}
        for label, val in status_counts.items():
            table_data.append([f"Tasks: {label}", str(val)])
            
        # Categories
        for cat in charts.get("categories", []):
            table_data.append([f"Type: {cat['label']}", str(cat["value"])])

        # Priorities
        for priority in charts.get("priorities", []):
            table_data.append([priority["label"], str(priority["value"])])

        # Scores
        for score in charts.get("scores", []):
            table_data.append([f"Score: {score['label']}", str(score["value"])])

        table = Table(table_data, colWidths=[3.5*inch, 1.5*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#6e59ff")),
            ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0,0), (-1,0), 10),
            ('BACKGROUND', (0,1), (-1,-1), colors.HexColor("#f8fafc")),
            ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
            ('FONTSIZE', (0,0), (-1,-1), 9),
        ]))
        story.append(table)
        story.append(Spacer(1, 0.3 * inch))

    for raw_line in _report_body_without_execution_summary(content):
        line = raw_line.strip()
        if not line:
            story.append(Spacer(1, 0.1 * inch))
            continue
        if line.startswith("# "):
            story.append(Paragraph(_pdf_text(line[2:]), styles["Title"]))
        elif line.startswith("## "):
            story.append(Paragraph(_pdf_text(line[3:]), styles["Heading2"]))
        elif line.startswith("### "):
            story.append(Paragraph(_pdf_text(line[4:]), styles["Heading3"]))
        elif line.startswith("- "):
            story.append(Paragraph(f"&bull; {_pdf_text(line[2:])}", styles["BodyText"]))
        else:
            story.append(Paragraph(_pdf_text(line), styles["BodyText"]))

    doc.build(story)
    return buffer.getvalue()

class DebateRequest(BaseModel):

    task_id: str
    agent_a_id: str
    agent_b_id: str

@router.post("/debate")
async def start_debate(request: DebateRequest, background_tasks: BackgroundTasks):
    """
    Starts a debate between two agents for a specific task.
    """
    background_tasks.add_task(
        orchestrator_service.run_debate, 
        request.task_id, 
        request.agent_a_id, 
        request.agent_b_id
    )
    return {"message": "Debate started in background"}


@router.post("/projects/{project_id}/run")
async def run_project_orchestrator(project_id: str, background_tasks: BackgroundTasks, use_queue: bool | None = None):
    """
    Runs all queued tasks for a project in priority order.
    """
    _ensure_project_is_mutable(project_id)
    should_queue = use_queue if use_queue is not None else settings.TASK_EXECUTION_MODE == "queue"
    if should_queue:
        try:
            result = await orchestrator_service.queue_project(project_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"message": "Project tasks queued for worker execution", **result}

    background_tasks.add_task(orchestrator_service.run_project, project_id)
    return {"message": "Project orchestrator started", "project_id": project_id, "mode": "direct"}

@router.get("/projects/{project_id}/final-report")
async def get_project_final_report(project_id: str, variant: str = "full"):
    """
    Builds a consolidated report from all approved task outputs.
    """
    try:
        return await orchestrator_service.build_final_report(project_id, variant)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.get("/projects/{project_id}/final-report.pdf")
async def download_project_final_report_pdf(project_id: str, variant: str = "full"):
    """
    Downloads the selected report variant as a PDF.
    """
    try:
        result = await orchestrator_service.build_final_report(project_id, variant)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    title = f"{result['project_name']} - {result['variant']} report"
    pdf = _report_pdf_bytes(title, result["report"], result.get("charts"))
    filename = f"{_safe_filename(result['project_name'])}_{_safe_filename(result['variant'])}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
