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
        self.assertEqual(self.manifest["version"], "0.1.5")
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
        # Globs rather than naming files, so a newly packaged script such as
        # psl-data.js cannot skip this check by being forgotten here.
        scripts = sorted(EXTENSION.rglob("*.js"))
        self.assertIn(EXTENSION / "psl-data.js", scripts)

        runtime_source = "\n".join(
            path.read_text(encoding="utf-8") for path in scripts
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

// The manifest loads psl-data.js ahead of content.js in the same content-script
// scope, so the harness has to provide the suffix tables the same way.
const pslPath = require("path").join(require("path").dirname(contentPath), "psl-data.js");

vm.runInNewContext(
  fs.readFileSync(pslPath, "utf8") + "\n" + fs.readFileSync(contentPath, "utf8"),
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

    def run_popup(self, api_name):
        script = r"""
const fs = require("fs");
const vm = require("vm");

class FakeElement {
  constructor() {
    this.textContent = "";
    this.children = [];
    this._innerHTML = "";
  }
  get innerHTML() {
    return this._innerHTML;
  }
  set innerHTML(value) {
    this._innerHTML = value;
    if (value === "") {
      this.children = [];
    }
  }
  appendChild(child) {
    this.children.push(child);
  }
}

const elements = new Map([
  ["total-links", new FakeElement()],
  ["suspicious-links", new FakeElement()],
  ["reason-list", new FakeElement()]
]);
const summary = { totalLinks: 7, suspiciousLinks: 2, reasons: { test: 2 } };
let observed;
const tabs = {
  query(queryInfo, callback) {
    if (callback) {
      callback([{ id: 123 }]);
      return;
    }
    return Promise.resolve([{ id: 123 }]);
  },
  sendMessage(tabId, message, options, callback) {
    observed = { tabId, message, options };
    if (callback) {
      callback(summary);
      return;
    }
    return Promise.resolve(summary);
  }
};
const context = {
  document: {
    getElementById(id) {
      return elements.get(id);
    },
    createElement() {
      return new FakeElement();
    }
  },
  Promise,
  setTimeout,
  clearTimeout
};
if (process.argv[2] === "browser") {
  context.browser = { runtime: { onMessage: {} }, tabs };
} else {
  context.chrome = { runtime: { lastError: null }, tabs };
}
vm.runInNewContext(fs.readFileSync(process.argv[1], "utf8"), context);
setImmediate(() => {
  process.stdout.write(JSON.stringify({
    observed,
    rendered: {
      totalLinks: elements.get("total-links").textContent,
      suspiciousLinks: elements.get("suspicious-links").textContent
    }
  }));
});
"""
        result = subprocess.run(
            [
                "node",
                "-e",
                script,
                str(EXTENSION / "popup.js"),
                api_name,
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(result.stdout)

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
            "s3.amazonaws.com",
            "s3.us-east-1.amazonaws.com",
            "s3-us-west-2.amazonaws.com",
            "s3-website-us-east-2.amazonaws.com",
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

        self.assertEqual(
            self.scan_link(
                "https://attacker.team.s3.us-east-1.amazonaws.com/",
                "victim.team.s3.us-east-1.amazonaws.com",
            ),
            ["visible domain mismatch"],
        )
        self.assertEqual(
            self.scan_link(
                "https://s3.us-east-1.amazonaws.com/attacker-bucket/login",
                "https://s3.us-east-1.amazonaws.com/victim-bucket/login",
            ),
            ["visible domain mismatch"],
        )
        self.assertEqual(
            self.scan_link(
                "https://s3.us-east-1.amazonaws.com/victim-bucket/login",
                "https://s3.us-east-1.amazonaws.com/victim-bucket/account",
            ),
            [],
        )

    def test_public_suffix_tenants_are_separate_sites(self):
        """Providers that were never in the old curated list. Each pair is two
        independently controlled tenants that previously collapsed to the shared
        provider domain and suppressed the mismatch warning."""
        suffixes = (
            "blogspot.com",
            "wixsite.com",
            "repl.co",
            "glitch.me",
            "surge.sh",
            "neocities.org",
            "gitlab.io",
            "azurewebsites.net",
            "cloudapp.net",
            "fastly-terrarium.com",
            "wordpress.com",
            "tumblr.com",
            "weebly.com",
            "app.link",
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

    def test_private_suffix_tenant_matches_itself(self):
        """The separation above must not turn every tenant link into a warning."""
        for host in ("victim.blogspot.com", "victim.wixsite.com", "victim.github.io"):
            with self.subTest(host=host):
                self.assertEqual(
                    self.scan_link(f"https://{host}/account", host),
                    [],
                )

    def test_multi_label_public_suffixes_are_respected(self):
        """Registry boundaries the old last-two-labels fallback got wrong."""
        distinct = (
            ("attacker.act.edu.au", "victim.act.edu.au"),
            ("attacker.co.uk", "victim.co.uk"),
            ("attacker.police.uk", "victim.police.uk"),
            ("attacker.k12.ak.us", "victim.k12.ak.us"),
            ("attacker.com.br", "victim.com.br"),
        )

        for destination, visible in distinct:
            with self.subTest(destination=destination):
                self.assertEqual(
                    self.scan_link(f"https://{destination}/", visible),
                    ["visible domain mismatch"],
                )

    def test_ordinary_subdomains_remain_one_site(self):
        """Same-site subdomains must not be split apart by the suffix rules."""
        same_site = (
            ("https://mail.google.com/inbox", "drive.google.com"),
            ("https://a.b.example.com/x", "c.example.com"),
            ("https://shop.example.co.uk/x", "www.example.co.uk"),
            ("https://deep.sub.example.act.edu.au/x", "example.act.edu.au"),
        )

        for destination, visible in same_site:
            with self.subTest(destination=destination):
                self.assertEqual(self.scan_link(destination, visible), [])

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

    def test_shared_hosting_brand_checks_inspect_tenant_not_provider(self):
        self.assertEqual(
            self.scan_link("https://user.github.io/", "Open project"),
            [],
        )
        self.assertEqual(
            self.scan_link("https://github-login.github.io/", "Sign in"),
            ["possible brand impersonation"],
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

    def test_expanded_link_classification_regressions(self):
        cases = json.loads(
            (ROOT / "tests" / "fixtures" / "link-classification-cases.json")
            .read_text(encoding="utf-8")
        )

        self.assertGreaterEqual(len(cases), 30)
        for case in cases:
            with self.subTest(case=case["name"]):
                self.assertEqual(
                    self.scan_link(
                        case["href"],
                        case["text"],
                        inner_text=case.get("inner_text"),
                        aria_label=case.get("aria_label"),
                        title=case.get("title"),
                        image_alts=case.get("image_alts", ()),
                    ),
                    case["expected"],
                )

    def test_reddit_site_identity_matrix(self):
        destination_hosts = (
            "reddit.com",
            "www.reddit.com",
            "old.reddit.com",
            "redd.it",
            "i.redd.it",
            "v.redd.it",
            "reddit.app.link",
            "click.reddit.app.link",
        )
        visible_hosts = (
            "reddit.com",
            "old.reddit.com",
            "redd.it",
            "i.redd.it",
            "reddit.app.link",
            "click.reddit.app.link",
        )

        for destination_host in destination_hosts:
            for visible_host in visible_hosts:
                with self.subTest(
                    destination=destination_host,
                    visible=visible_host,
                ):
                    self.assertEqual(
                        self.scan_link(
                            f"https://{destination_host}/abc123",
                            visible_host,
                        ),
                        [],
                    )

        for attacker_host in (
            "attacker.app.link",
            "redd.it.destination.test",
            "reddit.app.link.destination.test",
            "reddit-login.test",
        ):
            with self.subTest(attacker=attacker_host):
                self.assertEqual(
                    self.scan_link(f"https://{attacker_host}/", "reddit.com"),
                    ["visible domain mismatch"],
                )

    def test_microsoft_site_identity_matrix(self):
        destination_hosts = (
            "microsoft.com",
            "teams.microsoft.com",
            "gov.teams.microsoft.us",
            "dialin.cpc.gov.teams.microsoft.us",
            "portal.usgovcloud.microsoft",
            "office.com",
            "live.com",
            "aka.ms",
        )
        visible_hosts = (
            "microsoft.com",
            "teams.microsoft.com",
            "teams.microsoft.us",
            "usgovcloud.microsoft",
            "office.com",
            "live.com",
            "aka.ms",
        )

        for destination_host in destination_hosts:
            for visible_host in visible_hosts:
                with self.subTest(
                    destination=destination_host,
                    visible=visible_host,
                ):
                    self.assertEqual(
                        self.scan_link(
                            f"https://{destination_host}/meeting",
                            visible_host,
                        ),
                        [],
                    )

        attacker_cases = (
            (
                "gov.teams.microsoft.us.destination.test",
                ["visible domain mismatch", "possible brand impersonation"],
            ),
            (
                "usgovcloud.microsoft.destination.test",
                ["visible domain mismatch", "possible brand impersonation"],
            ),
            ("microsoft-login.test", ["possible brand impersonation"]),
            ("teams-microsoft-us.test", ["possible brand impersonation"]),
        )
        for attacker_host, expected in attacker_cases:
            with self.subTest(attacker=attacker_host):
                self.assertEqual(
                    self.scan_link(
                        f"https://{attacker_host}/",
                        "microsoft.us"
                        if "destination.test" in attacker_host
                        else "Open meeting",
                    ),
                    expected,
                )

    def test_dynamic_links_and_subframes_are_covered(self):
        content_script = self.manifest["content_scripts"][0]
        content_source = (EXTENSION / "content.js").read_text(encoding="utf-8")

        self.assertTrue(content_script["all_frames"])
        self.assertTrue(content_script["match_about_blank"])
        self.assertIn("new MutationObserver", content_source)
        self.assertIn('attributeFilter: ["href", "title", "aria-label", "alt"]', content_source)

        for api_name in ("browser", "chrome"):
            with self.subTest(api=api_name):
                popup_result = self.run_popup(api_name)
                self.assertEqual(popup_result["observed"]["tabId"], 123)
                self.assertEqual(
                    popup_result["observed"]["message"],
                    {"type": "LINKGUARD_GET_SUMMARY"},
                )
                self.assertEqual(
                    popup_result["observed"]["options"],
                    {"frameId": 0},
                )
                self.assertEqual(
                    popup_result["rendered"],
                    {"totalLinks": "7", "suspiciousLinks": "2"},
                )

    def test_visible_domain_work_and_mutation_rescans_are_bounded(self):
        content_source = (EXTENSION / "content.js").read_text(encoding="utf-8")

        self.assertIn("if (matches.length === 2)", content_source)
        self.assertIn(
            "if (rescanTimer !== null) {\n      return;",
            content_source,
        )
        self.assertNotIn("clearTimeout(rescanTimer)", content_source)


if __name__ == "__main__":
    unittest.main()
