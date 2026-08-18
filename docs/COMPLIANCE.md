# BoardCue AI — compliance launch pack

This folder is an operational baseline, not legal advice. Privacy Policy, Cookie Policy, B2B/B2C terms, DPA and every translation require professional review before commercial launch.

## Roles and scope

- Controller: account, billing, security, service communications and marketing data.
- Processor: workspace content handled on behalf of customer organizations.
- No employee scoring, performance ranking, behavioural assignment or employment decisions.
- AI operations are visible, attributable, logged and reversible.

## Records of processing

| Activity | Data | Purpose | Basis | Recipient | Retention |
|---|---|---|---|---|---|
| Account/auth | name, email, password hash, sessions | provide and secure service | contract / legitimate interest | hosting, SMTP | account lifetime; sessions 30 days |
| Workspace | board content, memberships, activity | customer instructions | DPA / contract | hosting, approved AI providers on request | active term + read-only window |
| AI planning | minimal prompt and board context | requested AI feature | contract | OpenRouter + approved ZDR endpoint | BoardCue audit per customer policy; provider ZDR |
| Dictation | temporary audio, transcript | requested transcription | contract | OpenRouter + Whisper endpoint | audio not stored by BoardCue |
| Billing | customer and transaction identifiers | payment, tax and accounting | contract / legal obligation | Stripe | statutory accounting period |
| Enterprise lead | contact and requirements | respond to sales request | pre-contractual measures | SMTP | 12 months unless relationship continues |

## Retention and deletion

- Trial expiry: organization read-only for 30 days, then operational data eligible for deletion.
- Paid cancellation: service until period end, then read-only for 30 days.
- Verification tokens: 24 hours. Password-reset tokens: 1 hour. Invites: 7 days.
- Sessions: 30 days or immediate revocation.
- Backups: encrypted daily; target rolling retention 30 days; deletion propagates as backups expire.
- Security/audit records: define a justified production retention (recommended 12 months) with counsel.

## Required launch evidence

- Signed DPAs and current subprocessors with transfer mechanisms.
- ZDR endpoint verification for every allowed model; no fallback.
- Daily encrypted backup plus documented restore exercise.
- Tenant-isolation, role-matrix, webhook replay and quota-idempotency test reports.
- Cookie scan showing technical storage only.
- WCAG 2.2 AA review covering keyboard, screen reader, focus, contrast, reduced motion and 44px touch targets.
- Breach register and 72-hour assessment/notification runbook.
- DPIA screening and international-transfer assessment.
