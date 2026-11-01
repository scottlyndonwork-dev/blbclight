# Backup and recovery

LIGHT uses two independent layers of backup.

## 1. Supabase managed backups

- Paid plans include daily backups; enable **Point-in-Time Recovery** for minute-level restore if your plan allows it.
- Restore from *Database → Backups* in the Supabase dashboard. This replaces the project's database.

## 2. Nightly encrypted logical backup (GitHub Actions)

`.github/workflows/backup.yml` runs at 02:00 Asia/Manila. It dumps the `public`, `auth` and `storage` schemas with `pg_dump`, checks that the archive is readable, encrypts it with AES-256 (GPG), and stores it as a workflow artifact for 30 days.

**Setup:** add these repository secrets:

- `SUPABASE_DB_URL`: the *Session pooler* connection string (*Project Settings → Database → Connection string*), including the password
- `BACKUP_PASSPHRASE`: a long random passphrase. Store it offline (for example in a sealed envelope with the church secretary) as well as in GitHub.

For longer retention, download the monthly artifact and keep it on encrypted offline storage.

> Storage **files** (photos, receipts, logos, signatures) are not inside the database dump. Back them up periodically by downloading the buckets with the Supabase CLI (`supabase storage cp -r ss:///finance-attachments ./backup/finance-attachments --experimental`) or a scheduled script, and keep them encrypted.

## Restore procedure (test every quarter)

1. Create a **new, empty** Supabase project for the restore test. Never test a restore on production.
2. Download and decrypt the artifact:
   ```bash
   gpg --decrypt grace-YYYYMMDDTHHMMSSZ.dump.gpg > grace.dump
   sha256sum -c grace-YYYYMMDDTHHMMSSZ.dump.gpg.sha256   # run before decrypting
   ```
3. Apply the schema with the migrations (`pnpm dlx supabase link --project-ref <test-ref>` then `pnpm db:push`), then restore the data only:
   ```bash
   pg_restore --data-only --disable-triggers --no-owner --dbname "$TEST_DB_URL" grace.dump
   ```
   `--disable-triggers` stops the audit and immutability triggers from firing during the restore. It needs a superuser-capable connection; with Supabase use the `postgres` user connection string.
4. Point a local copy of LIGHT at the test project and check that member counts, the latest attendance session, the latest certificate and the fund balances match production reports.
5. Record the date, the backup used and the result in the church's operations log.

## Recovery objectives (suggested)

| Objective | Target |
|---|---|
| Recovery Point Objective | ≤ 24 hours (nightly backup), or minutes with PITR |
| Recovery Time Objective | ≤ 4 hours |
