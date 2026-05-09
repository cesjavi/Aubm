from services.supabase_service import supabase

# Rename agents to avoid confusion
res = supabase.table('agents').select('*').execute()
for a in res.data:
    if a['api_provider'] == 'amd' and 'GPT' in a['name']:
        new_name = a['name'].replace('GPT-4o', 'AMD-70B').replace('GPT', 'AMD')
        print(f"Renaming agent '{a['name']}' to '{new_name}'")
        supabase.table('agents').update({'name': new_name}).eq('id', a['id']).execute()

print("Agent names updated.")
