# Security Specification for Eastrand Engine & Turbo Job Card System

## 1. Data Invariants
- A JobCard must have a unique `jobCardNo` and `customerCode`.
- A JobCard's `customerCode` is required for customer access.
- Admins have full read/write access to all collections.
- Customers can ONLY read JobCards that match their specific `customerCode`.
- Chat messages are only accessible to authenticated workshop/office workers (Admins).
- Parts are linked to JobCards; access to Parts follows access to the parent JobCard.

## 2. The "Dirty Dozen" Payloads (Red Team Tests)
1. **P1 (Identity Spoofing)**: A customer trying to read a JobCard that is not theirs by guessing the `jobCardId`.
2. **P2 (Identity Spoofing)**: A customer trying to write/update a JobCard.
3. **P3 (Admin Escalation)**: A customer trying to create an `admin` document in the `/admins` collection.
4. **P4 (Resource Poisoning)**: Creating a JobCard with a 2MB string in the `workRequested` field.
5. **P5 (State Shortcutting)**: Directly updating a JobCard status to 'Completed' without passing through 'Quality Control'.
6. **P6 (Unauthorized Chat Access)**: A customer trying to read `/chatMessages`.
7. **P7 (Orphaned Write)**: Creating a `Part` without a valid `jobCardId`.
8. **P8 (Time Spoofing)**: Setting `createdAt` to a future date from the client.
9. **P9 (PII Leak)**: A customer listing all JobCards to find other customers' data.
10. **P10 (Immortal Field Mod)**: Trying to change `jobCardNo` after creation.
11. **P11 (Null Auth Injection)**: Trying to read any document without being signed in.
12. **P12 (Shadow Field Injection)**: Adding `isSuperAdmin: true` to a user profile.

## 3. The Test Runner (Mock Tests Logic)
- `testP1`: `get(jobCardWithDifferentCode)` -> Expected PERMISSION_DENIED.
- `testP2`: `update(anyJobCard)` -> Expected PERMISSION_DENIED.
- `testP3`: `set(admins/newAdmin)` -> Expected PERMISSION_DENIED.
- `testP6`: `list(chatMessages)` -> Expected PERMISSION_DENIED.
- `testP11`: `read(any)` with `auth: null` -> Expected PERMISSION_DENIED.
