# E-postloggningssystem med Embeddings

## Översikt
Central funktion för att logga all utgående (och framtida inkommande) e-post med embeddings för AI-sökning.

## Status
- [x] Design och specifikation
- [x] Fas 1: Prisma-schema (EmailLog, EmailAttachment, EmailChunk)
- [x] Fas 1: Prisma migration
- [x] Fas 2: Core-funktioner (email-log.ts, email-embeddings.ts)
- [x] Fas 3: Integration i send-email.ts
- [x] Fas 4: AI-verktyg (searchMyEmails, getMyRecentEmails)
- [ ] Fas 5: UI för e-posthistorik (kan göras senare)
- [ ] Fas 6: Resend webhooks (framtida)

## Databasmodeller

### EmailLog
- `direction`: INBOUND | OUTBOUND
- `status`: QUEUED | SENT | DELIVERED | BOUNCED | FAILED
- Metadata: from, to, cc, bcc, subject, body, htmlBody
- Resend: resendMessageId, resendError
- Relationer: tenant, user, project (optional)
- Timestamps: createdAt, sentAt, deliveredAt, bouncedAt, failedAt

### EmailAttachment
- filename, contentType, size
- S3-lagring: bucket, key
- Relation till EmailLog

### EmailChunk
- content, embedding (pgvector 1536)
- chunkIndex för ordning
- Relationer: emailLog, tenant, project, user

## Embedding-strategi
- Format: `{subject}\n\n{body}`
- Chunk-storlek: 1500 tecken
- Overlap: 200 tecken
- Modell: text-embedding-3-small (1536 dimensioner)

## Sökstrategi
- Hybrid: Vector similarity (pgvector) + Fulltext (ILIKE)
- Threshold: 0.3 för vector search
- Fallback till fulltext om embedding misslyckas

## AI-verktyg
- `searchMyEmails`: Söka i alla mina emails
- `searchProjectEmails`: Söka i projektrelaterade emails
- `getMyEmails`: Lista mina senaste emails
- `getProjectEmails`: Lista projektets emails

## UI-komponenter
- `/emails` - E-posthistorik med filter och sökning
- `/emails/[id]` - E-postdetaljvy med attachments

## Säkerhet
- Tenant-isolering via tenantId på alla queries
- Åtkomstkontroll via requirePermission
- Webhook-signaturverifiering (Resend HMAC)

## Framtida utbyggnad
- Inkommande emails (Resend Inbound)
- Email threads (In-Reply-To header parsing)
- Email templates
- Analytics (open/click tracking)
