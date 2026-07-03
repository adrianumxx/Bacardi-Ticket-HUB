# Bacardi Ticket Hub

Operational dashboard for Bacardi-sponsored events and festivals. Managers create sponsored activations, control outlet ticket rules, review account-manager requests, and send ticket files by email attachment.

## Stack

- Next.js App Router + TypeScript
- MongoDB Atlas with Mongoose
- NextAuth credentials provider with manager-approved email access
- Resend for transactional email and ticket attachments
- Tailwind CSS + lucide-react

## Features

- Public account request form from the login screen
- Manager approval or rejection queue for new accounts
- Two roles: `super_admin` and `account_manager`
- Sponsored events and festivals with market, sponsorship role, and configurable `maxTicketsPerOutlet`
- Event and festival ticket types, for example Regular and VIP
- Approved outlets and account-manager-proposed outlets
- Ticket requests validated against sponsored event or festival rules
- Manager review, status updates, recipient edits, notes, and approval
- Ticket delivery by email attachment only
- Internal notification inbox for access, request, ticket, user, outlet, event, and report activity
- Optional Resend email delivery after internal notifications are recorded
- User blocking, role changes, access disabling, outlet editing, and outlet merge workflow
- Audit log records manager actions and report exports
- No ticket inventory storage and no persistent ticket file storage
- Request reporting with CSV and PDF export
- Brand styling inspired by the Liquid to Lips reference: Bacardi logo asset, off-white canvas, charcoal UI, gold accents, Lato body text, and Playfair Display headings

## Setup

1. Copy `.env.example` to `.env.local`.
2. Create a free MongoDB Atlas cluster and set `MONGODB_URI`.
3. Set `SUPER_ADMIN_EMAILS` to your admin email address.
4. Add `RESEND_API_KEY` and `MAIL_FROM` to send real emails. Without a key, internal notifications still work and email delivery is simulated.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## First Use

1. Sign in with an email listed in `SUPER_ADMIN_EMAILS`.
2. Invite account managers manually from `Users`, or approve access requests submitted from the login screen.
3. Create approved outlets and published sponsored events or festivals.
4. Account managers submit requests for published Bacardi-sponsored activations.
5. The manager reviews, edits, approves, partially approves, or rejects ticket requests.
6. The manager uploads ticket files at send time and enters the recipient emails.

## Verification

```bash
npm run lint
npm run test:unit
npm run test:e2e
npm run build
npm run check
```

All commands should complete without errors. `test:e2e` uses `QA`-prefixed temporary data and cleans it up automatically.

## Production Checklist

- Use a long random `NEXTAUTH_SECRET`.
- Verify `MAIL_FROM` in Resend before setting `RESEND_API_KEY`.
- Keep `SUPER_ADMIN_EMAILS` to at least one active manager.
- Confirm MongoDB Atlas backups are enabled.
- Run `npm run check` before deployment.
