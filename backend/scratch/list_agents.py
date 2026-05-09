from services.supabase_service import supabase
res = supabase.table('agents').select('name,api_provider,model').execute()
for a in res.data:
    print(f"{a['name']}: {a['api_provider']} / {a['model']}")
