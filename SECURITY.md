# Security Policy

## Supported Versions

Security fixes are provided for the current `main` branch and the latest
version published through Firefox Add-ons. Older releases are unsupported;
users should update before reporting behavior that may already be fixed.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| Latest Firefox Add-ons release | Yes |
| Older releases | No |

## Security Model

Link Hound is a local, advisory Firefox extension. It reads link-related
DOM data in visited pages and annotates suspicious links. It does not block
navigation, make remote reputation requests, or promise to detect every
deceptive page.

Webpage DOM, URLs, text, accessibility labels, frames, and mutation timing are
untrusted. The extension must preserve these security properties:

- Browsing data remains local and is not sent to a remote service.
- A clear, single-domain destination claim reaches comparison with the actual
  destination.
- Independently controlled shared-hosting tenants remain distinct security
  identities.
- Page-level popup results come from the top frame.
- Hostile input is processed with bounded work and cannot indefinitely starve
  automatic rescanning.
- Firefox Add-ons credentials and signing authority are available only to
  trusted release refs.

## Reporting a Vulnerability

Use [GitHub private vulnerability reporting](https://github.com/Kahler2315/check-this-link/security/advisories/new).
Do not open a public issue for an undisclosed vulnerability.

Include the affected version or commit, impact, prerequisites, a minimal
reproduction, and any suggested mitigation. Remove secrets, credentials,
personal browsing data, and third-party data from the report.

The maintainer targets acknowledgment within 3 business days, an initial
assessment within 7 business days, and a status update at least every 14 days
until resolution. These are response targets, not guarantees.

## In Scope

- Unauthorized access to extension privileges or page data.
- New remote requests, data disclosure, or privacy-boundary violations.
- Systematic, attacker-controlled bypasses that provide a repeatable advantage
  over the extension's documented advisory behavior.
- Cross-frame confusion that misrepresents the active page.
- Unbounded or persistent resource effects that cross a protected browser,
  extension, user, or service availability boundary.
- CI, dependency, packaging, signing, or release paths that can compromise the
  distributed extension or publishing credentials.

## Out of Scope

- A single heuristic miss without a repeatable attacker-controlled bypass
  pattern.
- Social engineering that does not exploit an implementation flaw.
- A page hiding, imitating, or restyling content it already controls.
- Pages where Firefox does not permit the extension to run, and DOM hidden in
  closed shadow roots.
- Transient performance impact confined to the hostile page's own tab or
  session, without cross-tab, persistent, or protected-service impact.
- Browser vulnerabilities and third-party vulnerabilities with no demonstrated
  path through this repository.
- Automated scanner output without a source-to-sink explanation or
  reproduction.

## Safe Testing

Test only against systems and accounts you own or are authorized to assess.
Use local fixtures and non-sensitive data whenever possible. Do not access,
modify, retain, or disclose other people's data; degrade services; publish an
unfixed issue; or submit test packages to Firefox Add-ons without explicit
authorization.

Good-faith research that follows this policy will not be met with legal action
from this project. If a test could affect other users or external services,
request permission before proceeding.
