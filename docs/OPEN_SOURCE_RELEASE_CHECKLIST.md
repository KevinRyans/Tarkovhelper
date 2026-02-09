# Open Source Release Checklist

Use this before making the repository public.

## 1. Secrets

- [ ] Rotate all sensitive secrets (DB URL, NextAuth secret, OpenAI key, companion tokens)
- [ ] Confirm `.env` and `.env.local` are not tracked
- [ ] Run `npm run security:scan`

## 2. History Hygiene

- [ ] Verify old commits do not contain secrets
- [ ] If secrets were committed, rewrite history and force push
- [ ] Rotate secrets again after history rewrite

## 3. Runtime Safety

- [ ] Admin route key is long and random
- [ ] `ADMIN_EMAIL` points to owner account only
- [ ] Invite-only mode set as intended for beta
- [ ] Companion token rotate/revoke tested

## 4. Documentation

- [ ] `README.md` setup and safety sections are current
- [ ] `SECURITY.md` exists and is accurate
- [ ] Companion docs clearly state log-only approach (no memory/process hooks)

## 5. Production Sanity

- [ ] `npm run build` passes
- [ ] DB schema applied to production DB
- [ ] Sync job (`npm run db:sync`) executed at least once
- [ ] Vercel env vars set for Production + Preview
