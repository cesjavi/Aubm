import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))

try:
    from backend.services.supabase_service import supabase
    res = supabase.table("agents").select("count").execute()
    print(f"Connection successful! Agents count: {res.data}")
except Exception as e:
    print(f"Error connecting to Supabase: {e}")
