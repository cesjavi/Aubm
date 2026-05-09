# Aubm Authentication Model

## Current Product State

Aubm uses Supabase Auth for user sessions. The current UI exposes email/password sign-in only.

Google and GitHub buttons are intentionally hidden in `frontend/src/components/Login.tsx`. Supabase may still support OAuth providers at the project level, but Aubm should not advertise Google/GitHub SSO as a product feature until provider setup, role mapping, and audit behavior are tested end to end.

## Roles

Application roles live in `public.profiles.role`:

- `user`: default account role.
- `manager`: operational role for managing workflows without full admin authority.
- `admin`: can manage profile roles and privileged settings.

The final profile RLS migration protects role changes with `public.protect_profile_role()`, so non-admin users cannot elevate themselves by updating their own profile row.

## Enterprise Auth Policy

For production or enterprise deployments:

- Email/password is the baseline supported sign-in flow.
- OAuth/SSO providers must be enabled deliberately per deployment.
- OAuth buttons should stay hidden unless provider configuration is documented and verified.
- New OAuth users should receive `role = 'user'` by default.
- Role elevation must happen through an admin-controlled flow, not through OAuth metadata alone.
- Team access should be handled through `teams` and `team_members`, not by making projects public.

## Provider Requirements Before Enabling OAuth UI

Before exposing a provider button in the frontend:

1. Configure the provider in Supabase Auth.
2. Verify allowed redirect URLs for local, staging, and production origins.
3. Verify profile creation through `handle_new_user_profile()` or equivalent trigger.
4. Verify the profile role defaults to `user`.
5. Verify role changes are blocked for non-admin users.
6. Verify sign-in, sign-out, refresh, and expired session behavior.
7. Verify audit events for profile creation and role changes.
8. Document who owns provider credentials and rotation.

## Recommended OAuth UI Gate

If OAuth is reintroduced, gate it behind explicit frontend config:

```env
VITE_ENABLE_GOOGLE_AUTH=false
VITE_ENABLE_GITHUB_AUTH=false
```

The UI should default to hidden buttons unless these values are explicitly enabled.

## Operational Notes

- Do not store provider secrets in frontend `.env`.
- Keep Supabase service role keys only in backend/server environments.
- Do not trust provider profile metadata for authorization.
- Use profile roles and team memberships as the authorization source of truth.
