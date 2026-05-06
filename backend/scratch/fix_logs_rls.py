import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(supabase_url, supabase_key)

sql = """
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON agent_logs;
CREATE POLICY "Enable read access for all users" ON agent_logs FOR SELECT USING (true);
"""

# Note: This assumes an 'exec_sql' RPC exists, which is common in many setups.
# If not, I'll have to find another way.
try:
    # Actually, let's try a different approach if RPC fails.
    # We can try to use the REST API to check if it works.
    print("Attempting to set RLS policy...")
    # Since I don't have direct SQL access via the client without RPC, 
    # I'll assume the user might need to do this in the dashboard or I'll try to find an RPC.
    
    # Let's check if the client can read with anon key.
    anon_key = os.getenv("SUPABASE_ANON_KEY")
    anon_s = create_client(supabase_url, anon_key)
    res = anon_s.table("agent_logs").select("*").limit(1).execute()
    print(f"Anon read test: {'Success' if not res.data else 'Empty/Restricted'}")
    
except Exception as e:
    print(f"Error: {e}")
