import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(supabase_url, supabase_key)

def check_users():
    # Try different tables where users might be
    tables = ["profiles", "users", "team_members"]
    for table in tables:
        try:
            res = supabase.table(table).select("id").limit(1).execute()
            print(f"Table {table} count: {len(res.data)}")
            if res.data:
                print(f"Sample ID: {res.data[0]['id']}")
        except Exception as e:
            print(f"Error checking {table}: {e}")

if __name__ == "__main__":
    check_users()
