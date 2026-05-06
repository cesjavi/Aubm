import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(supabase_url, supabase_key)

def check_logs():
    try:
        res = supabase.table("agent_logs").select("*").order("created_at", desc=True).limit(20).execute()
        print(f"Total logs retrieved: {len(res.data)}")
        for log in res.data:
            print(f"[{log['created_at']}] {log['action']}: {log['content'][:50]}...")
            
    except Exception as e:
        print(f"Error accessing agent_logs: {e}")

if __name__ == "__main__":
    check_logs()
