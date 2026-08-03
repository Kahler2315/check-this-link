# Firefox Add-ons release process

Link Hound is listed at:

<https://addons.mozilla.org/firefox/addon/check-this-link/>

The permanent add-on ID is `check-this-link@example.com`. Do not change it;
Firefox and AMO use this ID to associate a package with the existing listing.

## Repository setup

The `firefox-addons` GitHub environment holds two environment secrets:

- `AMO_JWT_ISSUER`
- `AMO_JWT_SECRET`

The environment requires maintainer approval. Credentials must never be placed
in source, workflow logs, issues, or pull requests.

## Publish an update

1. Increase the version in `extension/manifest.json` and `package.json`.
2. Update the changelog, tests, and `amo-metadata.json` release notes.
3. Run `npm test`, `npm run lint`, and `npm run build`.
4. Push the validated commit to `main`.
5. Manually run **Publish to Firefox Add-ons** in GitHub Actions.
6. Review and approve the pending `firefox-addons` environment deployment.
7. Confirm the submitted version in the AMO Developer Hub.

The workflow uses `--approval-timeout 0`: it uploads and validates the listed
update, then exits without keeping a GitHub runner active during Mozilla's
approval process. A signed public XPI becomes available through AMO after
approval.

## Local development

Load `extension/manifest.json` temporarily from
`about:debugging#/runtime/this-firefox`, or run:

```sh
npm start
```

Unsigned ZIP files in `artifacts/` are development artifacts and cannot replace
Mozilla's signed public package.
