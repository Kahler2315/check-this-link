import json
import pathlib
import subprocess
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
        self.assertEqual(self.manifest["version"], "0.1.2")
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

    def scan_link(
        self,
        href,
        text,
        *,
        inner_text=None,
        aria_label=None,
        title=None,
        image_alts=(),
    ):
        script = r"""
const fs = require("fs");
const vm = require("vm");

const contentPath = process.argv[1];
const href = process.argv[2];
const textContent = process.argv[3];
const presentation = JSON.parse(process.argv[4]);
const attributes = new Map();

if (presentation.ariaLabel !== null) {
  attributes.set("aria-label", presentation.ariaLabel);
}
if (presentation.title !== null) {
  attributes.set("title", presentation.title);
}

const anchor = {
  href,
  textContent,
  title: presentation.title || "",
  classList: {
    add() {},
    remove() {}
  },
  setAttribute(name, value) {
    attributes.set(name, String(value));
  },
  removeAttribute(name) {
    attributes.delete(name);
  },
  hasAttribute(name) {
    return attributes.has(name);
  },
  getAttribute(name) {
    return attributes.has(name) ? attributes.get(name) : null;
  },
  querySelector() {
    return null;
  },
  querySelectorAll(selector) {
    if (selector !== "img[alt]") {
      return [];
    }

    return presentation.imageAlts.map((alt) => ({
      getAttribute(name) {
        return name === "alt" ? alt : null;
      }
    }));
  },
  appendChild() {}
};

if (presentation.innerText !== null) {
  anchor.innerText = presentation.innerText;
}

const document = {
  querySelectorAll(selector) {
    return selector === "a[href]" ? [anchor] : [];
  },
  createElement(tagName) {
    if (tagName === "style" || tagName === "span") {
      return { textContent: "" };
    }

    return {
      style: {
        setProperty() {}
      },
      setAttribute() {},
      attachShadow() {
        return {
          append() {}
        };
      }
    };
  }
};

const browser = {
  runtime: {
    onMessage: {
      addListener() {}
    }
  }
};

vm.runInNewContext(
  fs.readFileSync(contentPath, "utf8"),
  { browser, document, URL }
);

process.stdout.write(JSON.stringify({
  reasons: (attributes.get("data-linkguard-reasons") || "")
    .split(", ")
    .filter(Boolean)
}));
"""
        result = subprocess.run(
            [
                "node",
                "-e",
                script,
                str(EXTENSION / "content.js"),
                href,
                text,
                json.dumps(
                    {
                        "innerText": inner_text,
                        "ariaLabel": aria_label,
                        "title": title,
                        "imageAlts": list(image_alts),
                    }
                ),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(result.stdout)["reasons"]

    def test_official_dot_google_link_is_not_brand_impersonation(self):
        reasons = self.scan_link(
            "https://about.google/products/",
            "About Google: Our products, technology and company",
        )

        self.assertNotIn("possible brand impersonation", reasons)
        self.assertEqual(reasons, [])

    def test_google_lookalike_domain_is_still_brand_impersonation(self):
        reasons = self.scan_link(
            "https://google.security-check.example/sign-in",
            "Sign in",
        )

        self.assertIn("possible brand impersonation", reasons)

    def test_shortener_subdomains_and_root_dots_are_detected(self):
        for href in (
            "https://track.bit.ly/abc123",
            "https://bit.ly./abc123",
        ):
            with self.subTest(href=href):
                self.assertEqual(
                    self.scan_link(href, "Tracking shortcut"),
                    ["URL shortener"],
                )

    def test_visible_domain_parser_accepts_sentence_punctuation(self):
        for text in (
            "trusted.test,",
            "trusted.test.",
            "(trusted.test)",
            "trusted.test;",
            "trusted.test!",
        ):
            with self.subTest(text=text):
                self.assertEqual(
                    self.scan_link("https://destination.test/", text),
                    ["visible domain mismatch"],
                )

    def test_delegated_tld_that_resembles_a_file_extension_is_a_domain(self):
        self.assertEqual(
            self.scan_link(
                "https://destination.test/",
                "trusted.zip",
            ),
            ["visible domain mismatch"],
        )

    def test_dotted_prose_and_filenames_are_not_domains(self):
        for text in (
            "3.14",
            "1.2.3",
            "v1.2.3",
            "2026.07.29",
            "$19.99",
            "report.pdf",
            "config.json",
            "index.html",
            "backup.tar.gz",
            "Node.js",
            "U.S.Army",
            "CVE 2026.12345",
            "10.5 MB",
            "RFC 9110 section 7.1.2",
            "Release v0.1.1",
            "Build 1.0x",
        ):
            with self.subTest(text=text):
                self.assertEqual(
                    self.scan_link("https://example.com/docs", text),
                    [],
                )

    def test_common_country_code_site_boundaries_are_compared(self):
        suffixes = (
            "co.jp",
            "com.sg",
            "co.nz",
            "co.za",
            "com.mx",
            "com.tr",
            "com.cn",
            "com.tw",
            "com.hk",
            "co.in",
            "com.ar",
        )

        for suffix in suffixes:
            with self.subTest(suffix=suffix):
                self.assertEqual(
                    self.scan_link(
                        f"https://attacker.{suffix}/",
                        f"victim.{suffix}",
                    ),
                    ["visible domain mismatch"],
                )

    def test_shared_hosting_tenants_are_separate_sites(self):
        suffixes = (
            "github.io",
            "pages.dev",
            "vercel.app",
            "netlify.app",
            "appspot.com",
            "cloudfront.net",
        )

        for suffix in suffixes:
            with self.subTest(suffix=suffix):
                self.assertEqual(
                    self.scan_link(
                        f"https://attacker.{suffix}/",
                        f"victim.{suffix}",
                    ),
                    ["visible domain mismatch"],
                )

    def test_brand_matching_does_not_use_unbounded_substrings(self):
        legitimate_hosts = (
            "appleton.test",
            "pineapple.test",
            "amazonas.test",
            "github.io",
            "user.github.io",
            "raw.githubusercontent.com",
            "githubassets.com",
            "amazonaws.com",
            "bucket.s3.amazonaws.com",
            "googleapis.com",
            "storage.googleapis.com",
            "microsoftonline.com",
            "login.microsoftonline.com",
            "cdninstagram.com",
            "google.com.",
        )

        for host in legitimate_hosts:
            with self.subTest(host=host):
                self.assertEqual(
                    self.scan_link(f"https://{host}/", "Open resource"),
                    [],
                )

    def test_brand_tokens_and_unicode_confusables_are_detected(self):
        suspicious_hosts = (
            "google-login.test",
            "secure-google.test",
            "microsoft-login.test",
            "apple-login.test",
            "amazon-support.test",
            "paypal-security.test",
            "netflix-billing.test",
            "facebook-login.test",
            "instagram-verify.test",
            "linkedin-careers.test",
            "github-auth.test",
            "gооgle.test",
            "аррӏе.test",
        )

        for host in suspicious_hosts:
            with self.subTest(host=host):
                self.assertEqual(
                    self.scan_link(f"https://{host}/", "Account portal"),
                    ["possible brand impersonation"],
                )

    def test_rendered_and_accessible_link_labels_are_analyzed(self):
        href = "https://destination.test/"

        self.assertEqual(
            self.scan_link(
                href,
                "Click here trusted.test",
                inner_text="Click here",
            ),
            [],
        )
        self.assertEqual(
            self.scan_link(
                href,
                "Click here",
                aria_label="trusted.test",
            ),
            ["visible domain mismatch"],
        )
        self.assertEqual(
            self.scan_link(
                href,
                "Image link",
                image_alts=("trusted.test",),
            ),
            ["visible domain mismatch"],
        )
        self.assertEqual(
            self.scan_link(
                href,
                "Click here",
                title="trusted.test",
            ),
            ["visible domain mismatch"],
        )

    def test_dynamic_links_and_subframes_are_covered(self):
        content_script = self.manifest["content_scripts"][0]
        content_source = (EXTENSION / "content.js").read_text(encoding="utf-8")

        self.assertTrue(content_script["all_frames"])
        self.assertTrue(content_script["match_about_blank"])
        self.assertIn("new MutationObserver", content_source)
        self.assertIn('attributeFilter: ["href", "title", "aria-label", "alt"]', content_source)


if __name__ == "__main__":
    unittest.main()
