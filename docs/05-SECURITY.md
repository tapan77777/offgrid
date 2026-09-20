# OFFGRID — Security & Privacy Specification

**Document:** `05-SECURITY.md`  
**Version:** 0.1  
**Status:** Draft  
**Depends on:** `01-PRD.md`, `02-ARCHITECTURE.md`, `03-NETWORKING.md`, `04-DATABASE.md`

---

## 1. Purpose

This document defines the security and privacy requirements for OFFGRID.

OFFGRID handles potentially sensitive information, including:

- Private messages
- Group membership
- User/device identities
- GPS locations
- Safety check-ins
- SOS events
- Offline communication data
- Cloud synchronization data

Security must therefore be designed into the architecture rather than added after the application is built.

---

# 2. Security Principles

OFFGRID follows these principles:

1. Privacy by default
2. Least privilege
3. Explicit consent for location sharing
4. Private groups by default
5. Minimal data collection
6. Secure local storage
7. Authenticated group membership
8. Encrypted private communication
9. Secure key management
10. No custom cryptography
11. Clear distinction between current and historical data
12. Secure synchronization
13. Graceful failure
14. No false security guarantees

---

# 3. Threat Model

OFFGRID should consider at least these threats:

### Threat A — Unauthorized nearby device

A stranger runs OFFGRID nearby and attempts to access a private group.

Requirement:

```text
Nearby device
      ↓
Discovery
      ↓
NOT automatically authorized
```

---

### Threat B — Message interception

An attacker attempts to observe local wireless traffic.

Requirement:

Private message contents should be protected with authenticated encryption.

---

### Threat C — Location exposure

An unauthorized device attempts to obtain a member's location.

Requirement:

Location must only be shared according to explicit group/user authorization.

---

### Threat D — Device theft

Someone obtains physical access to a user's phone.

Requirement:

Sensitive local information should have appropriate protection and should not be unnecessarily exposed in plaintext.

---

### Threat E — Cloud compromise / unauthorized cloud access

An attacker attempts to access cloud-stored OFFGRID data.

Requirement:

Use strong authentication, authorization, database access policies, and minimum necessary data retention.

---

### Threat F — Malicious group member

A legitimate group member may intentionally misuse information.

Security cannot completely prevent a trusted member from photographing/copying information visible to them.

The product should therefore minimize unnecessary exposure and provide clear group/member controls.

---

# 4. Identity Model

OFFGRID must distinguish:

```text
User Identity
      +
Device Identity
      +
Cryptographic Identity
```

A user may eventually use multiple devices.

The application must not rely on hardware MAC addresses as permanent identities.

Application-generated identifiers should be used.

---

# 5. Device Identity

Each installation should have a unique device identity.

Conceptually:

```text
deviceId
+
public/private key pair
```

The private key must never be transmitted as plaintext.

The private key should be stored using the strongest secure storage mechanism available on the platform.

For Android, investigate Android Keystore.

For iOS, use the platform's secure key-storage mechanism when iOS support is implemented.

---

# 6. Group Privacy

OFFGRID groups are private by default.

A nearby device discovering another device does NOT gain:

- Group messages
- Group member list
- Group locations
- Group history
- Private group metadata

Authorization is required.

Conceptually:

```text
Device discovered
       ↓
Identity established
       ↓
Group authorization
       ↓
Access granted
```

---

# 7. Group Joining

Initial group joining should use an explicit mechanism such as:

- QR code
- Secure group code
- Invitation

The joining process must not allow an arbitrary nearby device to silently join.

---

# 8. QR Codes

QR codes may contain temporary or sensitive joining information.

Therefore:

- Do not put permanent private keys in QR codes.
- Do not expose unnecessary personal information.
- Prefer short-lived or revocable invitation information where practical.
- Treat screenshots/photos of invite QR codes as potentially shareable credentials.

Future versions may support expiring invitations.

---

# 9. Messaging Security

Private messages should use authenticated encryption.

Conceptually:

```text
Message
   ↓
Encryption
   ↓
Authenticated ciphertext
   ↓
Transport
   ↓
Recipient
   ↓
Verification
   ↓
Decryption
```

The application must never invent its own encryption algorithm.

Use well-established cryptographic libraries/protocols after the exact design is approved.

---

# 10. End-to-End Encryption Goal

For private group messaging, the long-term goal is:

> The transport and cloud infrastructure should not need access to plaintext private messages.

Conceptually:

```text
Sender
  ↓
Encrypt
  ↓
Local / Mesh / Internet transport
  ↓
Recipient
  ↓
Decrypt
```

This must be designed carefully before implementation.

The first networking proof-of-concept may initially use a controlled test payload, but production private messaging must follow the finalized security design.

---

# 11. Key Management

Key management is separate from message transport.

The system will eventually need to define:

- Device key generation
- Public key distribution
- Group key establishment
- Key rotation
- Member removal
- Lost device handling
- New device addition
- Key backup/recovery

Do not let Claude Code invent an ad-hoc key exchange protocol.

Record the final cryptographic design in `10-DECISIONS.md`.

---

# 12. Member Removal

When a member leaves or is removed:

```text
Member removed
      ↓
Old authorization revoked
```

Future group messages should not automatically become accessible to the removed member.

For strong forward privacy, group encryption keys may need to rotate.

This will be specified before production implementation.

---

# 13. Location Privacy

Location is highly sensitive within the product context.

OFFGRID should follow:

```text
Location OFF by default
        OR
Explicitly enabled by user
```

The exact default will be finalized as a product decision.

Users should be able to understand:

- Whether location sharing is active
- Which group can see it
- When it was last shared
- Whether the location is current or last-known

---

# 14. Location Precision

The application should avoid sharing more precision than necessary for the selected feature.

Potential future options:

```text
Exact
Approximate
Last known
Hidden
```

Do not implement location obfuscation without a defined product requirement.

---

# 15. Location Retention

Location data should not be retained indefinitely by default.

The product must eventually define:

- Local retention
- Cloud retention
- Group trip history
- Automatic deletion
- User deletion controls

Until these policies are finalized, do not implement indefinite cloud location history.

---

# 16. SOS Privacy

SOS data requires special treatment.

An SOS may contain:

```text
User
Group
Timestamp
Location
Emergency state
```

Only authorized recipients should receive it.

The application should clearly indicate what information will be broadcast before the user confirms an SOS where practical.

---

# 17. SOS Reliability Limitation

OFFGRID must never claim:

> "SOS will always reach emergency services."

The application can only transmit an SOS if a viable communication path exists.

Example:

```text
No Internet
      +
No nearby peer
      +
No LoRa
      ↓
SOS cannot be transmitted
```

The app may still preserve the SOS locally.

When communication becomes available:

```text
Stored SOS
    ↓
Transmission attempt
```

---

# 18. Local Storage Security

Sensitive local information may include:

- Messages
- Locations
- Group membership
- SOS data
- Cryptographic keys

The application should evaluate:

- Database encryption
- Secure key storage
- OS-level device protection
- Screenshot/privacy behavior where appropriate
- Secure deletion requirements

The exact database-encryption technology will be selected during implementation.

---

# 19. Secrets

Never store secrets in:

- Git
- Source code
- `CLAUDE.md`
- README files
- Public configuration
- Mobile application repositories

Use appropriate environment/configuration mechanisms.

Examples of secrets:

```text
Supabase service-role keys
Private signing keys
Server credentials
Third-party API secrets
```

A mobile application should never ship a backend service-role secret.

---

# 20. Supabase Security

Supabase access must use proper authorization.

Expected protections include:

- Row Level Security
- Authenticated user policies
- Group membership checks
- Least-privilege database access
- Server-side validation for sensitive operations

Example concept:

```text
User requests group data
        ↓
Authenticated?
        ↓
Is group member?
        ↓
YES → authorized data
NO  → reject
```

Do not rely only on frontend checks.

---

# 21. Local vs Cloud Authorization

Local networking must also enforce authorization.

This is insufficient:

```text
Cloud:
"User isn't a member."
```

if the local mesh already sends the user the private message.

Authorization must exist at the local communication/security layer too.

---

# 22. Data Minimization

OFFGRID should collect only information necessary for the feature.

Avoid collecting unnecessarily:

- Contacts
- Phone numbers
- Exact location when not needed
- Background location when not enabled
- Unrelated device information
- Advertising identifiers

Every sensitive permission should have a product reason.

---

# 23. Permissions

The application may eventually require permissions related to:

- Nearby devices
- Bluetooth
- Wi-Fi
- Location
- Notifications

Permissions must be requested only when needed.

The app should explain the purpose.

Example:

```text
OFFGRID needs Nearby Devices access
to communicate with your hiking group
without Internet.
```

Do not request permissions that are not required by the current feature.

---

# 24. Authentication

The application should separate:

```text
Offline identity
```

from:

```text
Online account authentication
```

A user should not lose access to the core local experience merely because the Internet is temporarily unavailable.

The exact account/onboarding model will be finalized as a product decision.

---

# 25. Authentication Recovery

The system must eventually define what happens when:

- User gets a new phone
- Phone is lost
- App is reinstalled
- User logs out
- User changes account
- Multiple devices are used

Do not assume a cloud login automatically recovers cryptographic identity.

---

# 26. Secure Synchronization

Offline data waiting for cloud synchronization must be protected.

Conceptually:

```text
SQLite
   ↓
Pending sync
   ↓
Authenticated connection
   ↓
Supabase
```

Retries must not create duplicate records.

Sensitive payloads should remain encrypted according to the finalized message security design.

---

# 27. Network Metadata

Even if message contents are encrypted, networking may expose metadata such as:

- Device presence
- Connection timing
- Packet size
- Approximate proximity
- Network participation

OFFGRID should not promise complete anonymity.

Privacy claims must accurately describe what is and is not protected.

---

# 28. Logging

Production logs must not contain sensitive information unnecessarily.

Do NOT log:

```text
Message plaintext
Private keys
Full location history
Authentication tokens
Secrets
```

Development logging should be removable or disabled for production builds.

---

# 29. Error Messages

Error messages should not reveal sensitive information.

Avoid:

```text
"User Tapan's private key is invalid..."
```

Prefer:

```text
"Secure connection could not be established."
```

Detailed diagnostics belong in protected development logs.

---

# 30. Dependency Security

Dependencies must be:

- Justified
- Maintained
- Reviewed
- Kept reasonably current

Do not install a library simply because an AI agent suggests it.

For networking and cryptography libraries, perform additional review before adoption.

---

# 31. Supply-Chain Security

Before production:

- Lock dependency versions where appropriate.
- Review native dependencies.
- Review transitive dependencies.
- Scan for known vulnerabilities.
- Protect CI/CD secrets.
- Restrict production deployment credentials.

---

# 32. Secure Development Rules for Claude Code

Claude Code must follow these rules:

1. Never invent cryptography.
2. Never hard-code secrets.
3. Never expose private keys.
4. Never bypass authorization for convenience.
5. Never disable security checks just to make a test pass.
6. Never log private message contents.
7. Never log private keys or tokens.
8. Never treat nearby discovery as authorization.
9. Never claim SOS delivery is guaranteed.
10. Never represent last-known location as current.
11. Never weaken security without documenting the reason.
12. Ask for approval before making major security architecture changes.

---

# 33. Security Testing

Security testing must eventually include:

### Authentication
- Invalid credentials
- Expired sessions
- Logout
- Account recovery

### Group access
- Non-member attempts access
- Removed member attempts access
- Expired invitation
- Reused invitation

### Messaging
- Duplicate messages
- Tampered messages
- Invalid signatures/authentication
- Replay attempts

### Location
- Unauthorized location request
- Location-sharing disabled
- Stale location
- Group removal

### Device
- Lost device
- Reinstall
- Multiple devices
- Key loss

### Cloud
- RLS policy tests
- Unauthorized API requests
- Token misuse

---

# 34. Security Acceptance Criteria

Before production release:

- Private group data is inaccessible to unauthorized users.
- Sensitive cloud operations enforce authorization server-side.
- Private messages use the approved encryption design.
- Cryptographic keys are stored securely.
- Secrets are not present in source code.
- Local sensitive data has an approved protection strategy.
- Location sharing is explicit and understandable.
- SOS limitations are clearly communicated.
- Production logs do not expose sensitive information.
- Security tests exist for major authorization boundaries.

---

# 35. Security Incident Strategy

A future production version should define procedures for:

- Compromised credentials
- Leaked secrets
- Vulnerable dependency
- Compromised device
- Unauthorized cloud access
- Data exposure
- Security bug reports

Do not claim the product is "100% secure."

---

# 36. Open Security Decisions

The following must be finalized before production:

1. Exact message encryption protocol
2. Device key storage
3. Group key model
4. Key rotation
5. Member-removal key rotation
6. Database encryption
7. Account/onboarding model
8. Location-sharing default
9. Location retention
10. Message retention
11. SOS retention
12. Device recovery
13. Secure invitation format
14. Cloud RLS policies
15. Security testing framework

These decisions must be documented in `10-DECISIONS.md`.

---

## Security Philosophy

OFFGRID should follow:

```text
Collect less
      ↓
Store less
      ↓
Share explicitly
      ↓
Encrypt sensitive data
      ↓
Authorize every private operation
      ↓
Fail safely
```

The goal is not to claim perfect security.

The goal is to make privacy and security deliberate, testable engineering requirements.
