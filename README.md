# Santolan High School Library (Cloudflare Workers + D1)

Everyone can search the catalog. Students make accounts (email + password), keep a reading list, post in the community and send feedback. The administrator signs in with email + password.

## Deploy (needs Node.js on your computer)
Run these in this folder:

1. `npx wrangler login`
2. `npx wrangler d1 create santolan-library` -> copy the `database_id` it prints into `wrangler.toml`.
3. Edit `wrangler.toml`: set `ADMIN_EMAIL` (your admin login) and `MAIL_FROM` (a sender email verified in Brevo).
4. `npx wrangler d1 execute santolan-library --remote --file=schema.sql`
5. Secrets (each command asks you to type the value):
   - `npx wrangler secret put ADMIN_PASSWORD`  (long, unique)
   - `npx wrangler secret put SESSION_SECRET`  (any long random text)
   - `npx wrangler secret put BREVO_API_KEY`   (for reset emails)
   - `npx wrangler secret put ANTHROPIC_API_KEY`  (optional, turns on the cover scanner; billed to you)
6. `npx wrangler deploy` -> it prints your address, like `https://santolan-library.<you>.workers.dev`.

To change the admin password later, run step 5's ADMIN_PASSWORD command again.
If reset emails aren't set up, reset links appear in the Worker logs (`npx wrangler tail`).

## Safety notes (students are minors)
Other students only see name, grade/section, picture, bio and reading list. Emails are never shown to them, students can hide their profile, there is no private messaging, and admins can delete posts and suspend accounts. Get school approval and parental consent per your data-privacy policy.

## Known limits
Password hashing uses PBKDF2 (100,000 rounds). If sign-ins ever fail with a CPU-time error on the free plan, tell the developer so it can be tuned.
