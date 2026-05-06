import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(supabase_url, supabase_key)

def create_project():
    try:
        # 1. Try to get owner_id from existing projects first
        existing_projects = supabase.table("projects").select("owner_id").limit(1).execute()
        user_id = None
        if existing_projects.data and existing_projects.data[0].get("owner_id"):
            user_id = existing_projects.data[0]["owner_id"]
        
        if not user_id:
            # Fallback to profiles
            users = supabase.table("profiles").select("id").limit(1).execute()
            if users.data:
                user_id = users.data[0]["id"]

        if not user_id:
            print("No valid owner_id found in projects or profiles. The project will be created without owner and might not be visible.")
        else:
            print(f"Using owner_id: {user_id}")

        # 2. Create Project
        project_data = {
            "name": "Aubm Competitor Analysis",
            "description": "Deep dive into the multi-agent orchestration market to identify Aubm's unique value proposition and feature gaps.",
            "status": "active",
            "context": "Focus on developer experience, visual observability, and the 'Agent Debate' mechanism as key differentiators."
        }
        if user_id:
            project_data["owner_id"] = user_id
            
        project_res = supabase.table("projects").insert(project_data).execute()
        project_id = project_res.data[0]["id"]
        print(f"Created Project: {project_id}")

        # 3. Create Tasks
        tasks = [
            {"title": "Identify Top 5 Competitors", "description": "Research and list 5 similar multi-agent orchestration platforms (e.g., CrewAI, AutoGen, LangGraph, PydanticAI).", "status": "todo", "project_id": project_id},
            {"title": "Feature Comparison Matrix", "description": "Create a detailed matrix comparing Aubm's core features (Project Decomposition, Agent Debate, Real-time Console) against identified competitors.", "status": "todo", "project_id": project_id},
            {"title": "Pricing Model Analysis", "description": "Analyze how competitors charge (SaaS, Open Source, API usage) and recommend a competitive strategy for Aubm.", "status": "todo", "project_id": project_id},
            {"title": "UI/UX Aesthetic Audit", "description": "Evaluate the visual aesthetics and ease of use of competitors compared to Aubm's premium dashboard. Look for glassmorphism and animations.", "status": "todo", "project_id": project_id},
            {"title": "Technical Architecture Deep-Dive", "description": "Investigate the underlying tech stacks (Python vs TS, Vector DBs used, Orchestration logic) of top competitors.", "status": "todo", "project_id": project_id},
            {"title": "SWOT Analysis & Strategy Report", "description": "Compile all findings into a comprehensive report with a SWOT analysis and strategic recommendations for the next 6 months.", "status": "todo", "project_id": project_id}
        ]
        
        supabase.table("tasks").insert(tasks).execute()
        print(f"Added {len(tasks)} tasks to the project.")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    create_project()
