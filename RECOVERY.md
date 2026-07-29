# Recovery record

## Source

- Recovered on: 2026-07-28
- Original package:
  `/home/inferno_daemon/Downloads/check_this_link-0.1.0.xpi`
- Package SHA-256:
  `cc2f33e59ec96da1a05dd010f9f193ac2905931182d2994c9a95989cab5344bd`
- Published extension version: `0.1.0`
- Firefox add-on ID: `check-this-link@example.com`

The original XPI remains unchanged in the Downloads folder.

The exact recovered runtime is preserved in Git commit `3cbfcfc`. Files on the
current development branch may differ as fixes and new versions are added.

## Recovery method

An XPI is a ZIP archive containing the files Firefox executes. The archive was
inspected for unsafe paths and non-regular entries before extraction. The ten
runtime files were copied into `extension/` without modification.

The following Mozilla-generated signing files were not copied into the editable
source tree:

```text
META-INF/cose.manifest
META-INF/cose.sig
META-INF/manifest.mf
META-INF/mozilla.sf
META-INF/mozilla.rsa
```

Those files authenticate the exact published archive. They are not source code,
and editing or repackaging the extension invalidates the original signature.

## Recovered runtime file hashes

```text
355802d3b838eb721bc684362538c243d7ab9b769b20cd7a1f8f2944b74b9652  extension/content.js
ee5a9b91d0c9c2c53a031fe7de7253456f37c2c7020ae2adc6adc1344aa7f429  extension/icons/icon128.png
a0a8c6425f6396298f2d3b46d17260bb57c9ded3233a2028b95cb420359e31f1  extension/icons/icon16.png
8d823e5426d778e31410d5ca36a46682afb8c11e25635f81553deb3982c19cbb  extension/icons/icon32.png
6a884ed8479fb59c79b657ebd2b54821c938488380a6405143584837dd191386  extension/icons/icon48.png
537da63bf81bfb5e83fa16ba43c1e3fa87d6329f82716ea069e46a7590c63a7f  extension/icons/icon96.png
0596399bdab3bf3df4ac8c7b2631b0056f06c001b64cda7673f23aa53bdf4bb1  extension/manifest.json
04d99c25033bb79d47e06033267d479917b5697a2a02bbe45545f868089fd401  extension/popup.html
8ff4c2e22fe55145e71f6e35b27a7d7d68f415c3e2c5e56afcab7a804bd12a8c  extension/popup.js
32836bc30ec4c52ca4ecd02b3ec25bb87ed10fe212709674d77db56390e5a744  extension/styles.css
```

## What could not be recovered

A published package cannot recreate information that was excluded or
transformed before release. The following were not present:

- Original Git history, branches, issues, and commit messages
- Original README, development notes, or build configuration
- Automated tests
- Any pre-build source different from the packaged JavaScript and CSS
- A license file

The current repository scaffolding was created after recovery. The public AMO
listing declared the extension under the MIT License, so the reconstructed
repository includes that license at its root.
