# Known issues — toolkit v0.1.1

## Body-length exceptions (Sprint-1 audit findings; deferred to v0.1.2)

The following skills exceed the 250-line hard FAIL threshold defined in [AUTHORING.md](AUTHORING.md). The Sprint-0 audit identified each as a "mega-skill" candidate for splitting; doing the splits well requires careful test-coverage of the resulting pieces, which is v0.1.2 work.

Each affected `SKILL.md` carries an `EXCEPTION:` marker in its first body section, per the AUTHORING.md exception protocol. The architecture-auditor and `scripts/lint_toolkit.sh` respect the marker; reviewers do not.

| Skill | Lines | Planned split |
|---|---|---|
| [.claude/skills/author-rule/SKILL.md](.claude/skills/author-rule/SKILL.md) | 272 | Split JDM authoring vs golden-test authoring into siblings |
| [.claude/skills/compliance-pack/SKILL.md](.claude/skills/compliance-pack/SKILL.md) | 361 | Split into `gen-model-card` + `gen-sr11-7` siblings; externalize template text to `template/` files |
| [.claude/skills/new-agent/SKILL.md](.claude/skills/new-agent/SKILL.md) | 356 | Split single-agent vs supervisor into siblings; reference `fsi-adk-patterns` for API code |
| [.claude/skills/new-use-case/SKILL.md](.claude/skills/new-use-case/SKILL.md) | 270 | Split into `diagnose → reuse-audit → reasons-canvas → scaffold` chain |

## Description-length warnings (description > 30 words)

Most non-FAIL skills have descriptions in the 30–50-word range. These are WARNs, not FAILs. The pattern is "Knowledge for ... Auto-invoked when ... Covers ..." which has natural length. Sweep to tighten in v0.1.2 alongside the splits.

## Console skills duplicate component listings (audit batch 2 finding)

All six `console-*` skills enumerate the same shared component library inline (Header strip, Metric strip, Right-rail summary, etc.). v0.1.2 task: extract to `docs/methodology/_shared-components.md` and link from each console skill. Reduces ~60 lines of duplication and makes component additions atomic.

## ADK API code drift risk — mitigated

`adk-agent-design` previously embedded ADK SDK code that drifts with each ADK release. v0.1.1 moved the API code to [.claude/skills/fsi-adk-patterns/SKILL.md](.claude/skills/fsi-adk-patterns/SKILL.md) which carries a `last_verified` stamp and a 14-day refresh gate. **The current snapshot is from the existing toolkit, not a fresh WebFetch — refresh required before generating ADK code.**
