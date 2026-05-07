# document-classifier

Cheap classifier that routes documents into a controlled vocabulary before deep extraction. Pairs naturally with `document-extractor` (the next step).

## When to use

- Mortgage origination: classify uploaded files (1003, paystubs, W-2, tax return, appraisal).
- Commercial loan: classify financial documents (10-K, 10-Q, board minutes, loan agreement).
- Complaint triage: classify intake documents (complaint letter, account statement, transaction history).
- KYC: classify identity documents (passport, driver's license, utility bill).

## Why Gemini 3.1 Flash

Classification is high-volume (every uploaded doc) and shape-bound (one of N labels). Flash is sub-second + cheap; Opus is reserved for the sub-second branch where confidence falls below `confidence_floor`.

## Instantiation example

```yaml
# usecases/<uc>/reasons.yaml — Structure section
agents:
  - role: classifier
    archetype_ref: document-classifier@1.0
    params:
      vocabulary: [10-K, 10-Q, board_minutes, loan_agreement]
      input_schema: usecases/credit-memo-commercial/schemas/document_bundle.py
      confidence_floor: 0.80
```
