# Hasura schema notes (unified backend v2)

Verify these exist in your Hasura project before relying on admin expansion routes:

| Object | Purpose |
|--------|---------|
| `property_listing.external_contact` | Admin WhatsApp outreach |
| `property_transfer_invitation` | Transfer ownership invite/claim lifecycle |
| `admin_audit_logs` | `_lib/audit.ts` writes |
| `reports` | Content moderation reports |
| `support_tickets` | Support desk (optional — routes return empty list if untracked) |
| `moderation_records` | Future moderation audit |

Client routes use `/v1/client/...` (not flat `/v1/users/...` shown in v2 layout diagrams).
