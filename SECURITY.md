# Security policy

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private reporting
(Security tab, "Report a vulnerability") and include the steps to reproduce.
You will get an answer within a few days.

Only the latest release is supported.

## What the project does about it

- Sign-in: passwords hashed with scrypt, rate limits per IP and per account, generic error messages (no account enumeration).
- Sessions and tokens: HttpOnly cookies, personal access tokens that can expire, a device list with remote sign-out.
- Bearer tokens (MCP, OAuth) can use the kitchen API but cannot manage the account.
- CI: lint, types, tests with coverage thresholds, `npm audit`, CodeQL, Trivy image scan.
- Releases: SBOM, build provenance, cosign signature (see the release notes for the verify command).
