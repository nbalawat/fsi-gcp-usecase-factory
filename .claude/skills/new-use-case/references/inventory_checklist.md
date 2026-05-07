## Step 4 — Inventory reusable assets

Before generating anything, search the existing platform for reuse:

```
For each atomic service candidate (e.g., "OFAC screen", "DTI calc", "ISO 20022 normalize"):
  - Glob services/atomic/*/manifest.json
  - Read each manifest's description
  - Identify matches
```

Output a table to the user:

```
Atomic services to reuse:
  - services/atomic/ofac-screen     (matches OFAC requirement)
  - services/atomic/velocity-check  (matches structuring detection)

Atomic services to create:
  - structuring-pattern-scorer
  - beneficial-owner-resolver

JDM rules to reuse:
  - rules/regulatory_thresholds.json (CTR threshold)

JDM rules to create:
  - rules/structuring_detection.json

Sinks to reuse:
  - services/sinks/email
  - services/sinks/case-management

Sinks to create:
  - services/sinks/fincen-efiling
```

Confirm with user before creating new ones.

