# Check This Link

Check This Link is a privacy-first Firefox extension that scans links on the
current webpage and visually flags patterns that deserve a closer look.

Version 0.1.0 checks locally for:

- Known URL-shortener domains
- Direct IP-address links
- A visible domain that differs from the destination domain
- Domain names that may be impersonating a well-known brand

These are warning signals, not proof that a link is malicious. The extension
does not send browsing data to a server or make remote requests.

## Source recovery

This repository was reconstructed from the publicly distributed, Mozilla-signed
`check_this_link-0.1.0.xpi` package. The files under `extension/` are the exact
runtime files recovered from that release; they have not been reformatted or
changed.

Mozilla's generated signature files under `META-INF/` are intentionally not
included as editable source. See [RECOVERY.md](RECOVERY.md) for provenance,
checksums, and the limits of what can be recovered from a published package.

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
npm install
npm test
npm run lint
npm start
```

Create an unsigned development package with:

```sh
npm run build
```

Do not upload an unsigned build as an update without first confirming the
add-on ID in `extension/manifest.json` and following Mozilla's normal signing
process.

## Recovered project layout

```text
extension/
  content.js       Local link analysis and page annotations
  popup.html       Toolbar popup
  popup.js         Active-tab summary request
  styles.css       Page markers and popup styling
  icons/           Published extension icons
tests/
  test_extension.py
RECOVERY.md        Recovery provenance and file hashes
```

## Known boundaries

- The scanner uses deterministic heuristics and can produce false positives or
  miss malicious links.
- A URL shortener can be legitimate.
- Brand-name matching is intentionally simple in version 0.1.0.
- The basic registrable-domain helper covers only a small set of multi-part
  public suffixes.
- Link scanning requires access to webpages through the declared
  `<all_urls>` host permission.

