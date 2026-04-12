# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 0.3.x (alpha) | Yes — active development |
| < 0.3.0 | No |

---

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

To report a vulnerability, please contact the maintainers privately. You can do this by:

1. Emailing the repository owner directly (check the GitHub profile for contact info), or
2. Using [GitHub's private vulnerability reporting](https://github.com/ImmaBawzz/Prompt_Compiler_V3/security/advisories/new) if enabled for this repository.

Please include:
- A clear description of the vulnerability
- Steps to reproduce or a proof-of-concept
- The potential impact
- Any suggested mitigations you have identified

We will acknowledge receipt within 72 hours and aim to release a fix or mitigation within 14 days for critical issues.

---

## Security posture

**Local-first by default**

The compiler core, CLI, and VS Code extension operate entirely locally. No data is transmitted to external services during local compilation or export.

**Hosted features**

When using hosted sync routes (`/libraries/profile-assets`, `/automation/jobs`) against an externally hosted API:
- Profile and brief data is transmitted to the configured API endpoint
- API keys should never be committed to version control
- Use the `.env.example` template to understand required environment variables and keep secrets out of source control

**Input handling**

- Brief and profile JSON inputs are parsed with standard `JSON.parse` — do not load untrusted JSON from unknown sources into automated pipelines without validation
- The API's `POST /compile` and sync routes accept arbitrary JSON payloads; operators running a hosted instance should add rate limiting and auth middleware appropriate to their deployment

**No telemetry**

Prompt Compiler does not include any telemetry, analytics, or usage reporting. No data is sent home.

---

## Known limitations (alpha)

- The default API server ships with `bypassAuth: true` for local development. This is intentional for local use but must be changed before any public deployment.
- Input validation at API boundaries uses domain-level checks only. JSON schema validation at route boundaries is planned for a future phase.
