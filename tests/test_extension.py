import json
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
EXTENSION = ROOT / "extension"


class RecoveredExtensionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads(
            (EXTENSION / "manifest.json").read_text(encoding="utf-8")
        )

    def test_manifest_identity_is_preserved(self):
        self.assertEqual(self.manifest["name"], "Check This Link")
        self.assertEqual(self.manifest["version"], "0.1.1")
        self.assertEqual(
            self.manifest["browser_specific_settings"]["gecko"]["id"],
            "check-this-link@example.com",
        )

    def test_manifest_references_existing_files(self):
        referenced_paths = {
            self.manifest["action"]["default_popup"],
            *self.manifest["icons"].values(),
        }

        for content_script in self.manifest["content_scripts"]:
            referenced_paths.update(content_script.get("js", []))
            referenced_paths.update(content_script.get("css", []))

        for relative_path in referenced_paths:
            with self.subTest(path=relative_path):
                self.assertTrue((EXTENSION / relative_path).is_file())

    def test_declared_data_collection_is_none(self):
        gecko = self.manifest["browser_specific_settings"]["gecko"]
        self.assertEqual(
            gecko["data_collection_permissions"]["required"],
            ["none"],
        )
        self.assertEqual(gecko["strict_min_version"], "140.0")
        self.assertEqual(
            self.manifest["browser_specific_settings"]["gecko_android"][
                "strict_min_version"
            ],
            "142.0",
        )

    def test_runtime_has_no_remote_request_primitives(self):
        runtime_source = "\n".join(
            path.read_text(encoding="utf-8")
            for path in (EXTENSION / "content.js", EXTENSION / "popup.js")
        )

        for primitive in (
            "fetch(",
            "XMLHttpRequest",
            "WebSocket",
            "sendBeacon",
        ):
            with self.subTest(primitive=primitive):
                self.assertNotIn(primitive, runtime_source)

    def test_no_mozilla_signature_metadata_is_treated_as_source(self):
        self.assertFalse((EXTENSION / "META-INF").exists())

    def test_injected_badge_is_isolated_from_page_css(self):
        content_source = (EXTENSION / "content.js").read_text(encoding="utf-8")

        self.assertIn('attachShadow({ mode: "closed" })', content_source)
        self.assertIn('"writing-mode": "horizontal-tb"', content_source)
        self.assertIn('"text-orientation": "mixed"', content_source)
        self.assertIn('transform: "none"', content_source)
        self.assertNotIn('badge.className = "linkguard-badge"', content_source)


if __name__ == "__main__":
    unittest.main()
