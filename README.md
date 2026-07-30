# Check This Link

[![Validate extension](https://github.com/Kahler2315/check-this-link/actions/workflows/validate.yml/badge.svg)](https://github.com/Kahler2315/check-this-link/actions/workflows/validate.yml)

Check This Link is a privacy-first Firefox extension that scans links on the
current webpage and visually flags patterns that deserve a closer look.

Version 0.1.6 checks locally for:

- Known URL-shortener domains
- Direct IP-address links
- A visible domain that differs from the destination domain
- Domain names that may be impersonating a well-known brand

These are warning signals, not proof that a link is malicious. The extension
does not send browsing data to a server or make remote requests.

## Source recovery

This repository was reconstructed from the publicly distributed, Mozilla-signed
`check_this_link-0.1.0.xpi` package. The initial recovery commit (`3cbfcfc`)
preserves the exact runtime files from that release. Later commits contain
clearly documented development changes.

Mozilla's generated signature files under `META-INF/` are intentionally not
included as editable source. See [RECOVERY.md](RECOVERY.md) for provenance,
version 0.1.0 checksums, and the limits of what can be recovered from a
published package.

## Test temporarily in Firefox

Firefox can load the recovered source directly:

1. Open `about:debugging`.
2. Select **This Firefox**.
3. Click **Load Temporary Add-on**.
4. Select `extension/manifest.json`.
5. Open a normal webpage containing links.
6. Click the Check This Link toolbar icon to see the scan summary.

Firefox internal pages such as `about:addons` cannot be scanned by ordinary
content scripts.

## Development commands

Install the current Node.js LTS release, then run:

```sh
npm ci
npm test
npm run lint
npm start
```

Refresh the bundled Public Suffix List snapshot with:

```sh
node tools/generate-psl.mjs
```

Create an unsigned development package with:

```sh
npm run build
```

To manually exercise the webpage-CSS isolation regression test:

```sh
python3 -m http.server 8000 --directory tests/fixtures
```

Then open
`http://127.0.0.1:8000/css-collision.html` with the temporary extension loaded.
The test page deliberately tries to rotate the injected warning label; version
0.1.1 and later should keep it horizontal and upright.

The broader `http://localhost:8000/link-classification.html` fixture checks
Reddit short/deep links, Microsoft Teams government-cloud and Safe Links URLs,
rich-card labels, misleading destination claims, accessibility labels,
shared-hosting boundaries, dynamic insertion, and badge state.

The archived regression test bundle, if you have a copy, holds a larger
interactive fixture. Extract it to a temporary directory, serve that directory,
and open the exact `localhost` URL named in its validation instructions.

Do not upload an unsigned build as an update without first confirming the
add-on ID in `extension/manifest.json` and following Mozilla's normal signing
process.

## Recovered project layout

```text
extension/
  content.js       Local link analysis and page annotations
  psl-data.js      Generated Public Suffix List tables
  popup.html       Toolbar popup
  popup.js         Active-tab summary request
  styles.css       Page markers and popup styling
  icons/           Published extension icons
tests/
  test_extension.py
tools/
  generate-psl.mjs Regenerates extension/psl-data.js
RECOVERY.md        Recovery provenance and file hashes
```

## Known boundaries

- The scanner uses deterministic heuristics and can produce false positives or
  miss malicious links.
- A URL shortener can be legitimate.
- Brand lookalike detection uses a limited local confusable-character map, not a
  complete Unicode security profile.
- Registrable-domain comparison uses a Public Suffix List snapshot bundled in
  `extension/psl-data.js`, so it is only as current as that snapshot. A handful
  of multi-tenant hosts the list does not carry are supplemented in
  `content.js`; a provider covered by neither can still collapse two tenants
  into one apparent site.
- Open Shadow DOM roots are scanned, but browser isolation prevents access to
  closed Shadow DOM owned by webpages.
- Link scanning requires access to webpages through the declared
  `<all_urls>` host permission.

## License

[MIT](LICENSE)
