---
name: Security Hardening
about: Changes that address a security threat or harden agent behavior
title: "[SECURITY] "
labels: security
---

## Threat Advisory

<!-- Link to the IRCL advisory in docs/security/ that this PR addresses -->

**Advisory**: IRCL-NNNN

<!-- If no advisory exists yet, create one before opening this PR -->

## Summary

<!-- One-paragraph description of the security issue and how this PR addresses it -->

## Shogun Principle Alignment

<!-- How does this change enforce the principle that the agent operates honorably for the user?
     Focus on architectural enforcement, not just policy/prompt changes. -->

- [ ] External actions require explicit user approval
- [ ] Destructive operations are gated
- [ ] The enforcement is in code, not just in prompts
- [ ] Safe local operations remain unaffected

## Changes

<!-- List the files changed and what each change does -->

## Verification

- [ ] TypeScript compiles clean (`npx tsc --noEmit`)
- [ ] Existing tests pass
- [ ] New tests added for the security change
- [ ] Threat advisory updated with verification results
- [ ] Documentation updated (if user-facing behavior changed)

## Residual Risk

<!-- What risks remain even after this change? Be honest. -->
