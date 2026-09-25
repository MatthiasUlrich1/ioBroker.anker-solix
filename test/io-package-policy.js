/**
 * Guards ioBroker repository / adapter-check rules (E1032, E2004, E6006).
 * Run via: npm run test:package
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const assert = require("assert");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const ioPackage = JSON.parse(fs.readFileSync(path.join(__dirname, "../io-package.json"), "utf8"));
const workflow = fs.readFileSync(path.join(root, ".github/workflows/test-and-release.yml"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const jsonConfig = JSON.parse(fs.readFileSync(path.join(root, "admin/jsonConfig.json"), "utf8"));

const MAX_NEWS_ENTRIES = 7;
const version = ioPackage.common.version;
const newsKeys = Object.keys(ioPackage.common.news || {});

describe("io-package policy", () => {
	it(`has at most ${MAX_NEWS_ENTRIES} common.news entries (ioBroker repo builder)`, () => {
		assert.ok(
			newsKeys.length <= MAX_NEWS_ENTRIES,
			`Found ${newsKeys.length} news entries in io-package.json (max ${MAX_NEWS_ENTRIES}). ` +
				"Move older entries to CHANGELOG_OLD.md before release.",
		);
	});

	it("lists only npm-published versions in common.news (or the version about to be published)", function () {
		this.timeout(120_000);
		let published;
		try {
			published = JSON.parse(
				execSync("npm view iobroker.anker-solix versions --json", {
					encoding: "utf8",
					stdio: ["pipe", "pipe", "pipe"],
				}),
			);
		} catch (err) {
			this.skip(`npm registry unreachable: ${err.message}`);
		}
		for (const key of newsKeys) {
			if (key === version && !published.includes(key)) {
				// Allowed only for the current version during the npm publish window (E1036 vs E2004).
				continue;
			}
			assert.ok(
				published.includes(key),
				`common.news["${key}"] is not published on npm (E2004). ` +
					"GitHub-only interim versions belong in README changelog, not common.news.",
			);
		}
		assert.ok(
			newsKeys.includes(version),
			`common.news must include the current version ${version} (E1036)`,
		);
	});

	it("does not define a prepare script (E0094)", () => {
		assert.ok(!pkg.scripts?.prepare, 'package.json must not define scripts.prepare (E0094); use "setup:githooks" instead');
	});

	it("adapter-tests matrix includes Node.js 26", () => {
		assert.ok(
			/node-version:\s*\[[^\]]*26\.x[^\]]*\]/.test(workflow),
			"test-and-release.yml adapter-tests matrix must include 26.x (issue #10)",
		);
	});

	it("README.md mentions the current adapter version (E6006)", () => {
		assert.ok(readme.includes(version), `README.md must mention version ${version}`);
	});

	it("README.md does not suggest GitHub URL install (E6013)", () => {
		const installSection = readme.split("## Changelog")[0];
		assert.ok(
			!/iobroker\s+url\s+https?:\/\/github\.com/i.test(installSection),
			"README install sections must not contain iobroker url https://github.com/... (E6013)",
		);
	});

	it("admin jsonConfig header size is at most 5 (E5512)", () => {
		const walk = (items, pathPrefix = "") => {
			if (!items || typeof items !== "object") {
				return;
			}
			for (const [key, item] of Object.entries(items)) {
				const p = pathPrefix ? `${pathPrefix}.${key}` : key;
				if (item && item.type === "header" && typeof item.size === "number") {
					assert.ok(
						item.size <= 5,
						`${p}: header size ${item.size} exceeds schema max 5 (use size 5 for h6)`,
					);
				}
				if (item && item.items) {
					walk(item.items, p);
				}
			}
		};
		walk(jsonConfig.items);
	});

	it("package.json os matches CI adapter-tests matrix (E3027)", () => {
		const osField = pkg.os;
		assert.ok(osField, "package.json must declare os (E3027)");
		const declared = new Set(
			Array.isArray(osField) ? osField : typeof osField === "object" ? Object.keys(osField) : [],
		);
		assert.ok(declared.size > 0, "package.json os must list at least one platform");
		const matrixOs = [...workflow.matchAll(/os:\s*\[([^\]]+)\]/g)]
			.flatMap(m =>
				m[1]
					.split(",")
					.map(s => s.trim().replace(/^['"]|['"]$/g, ""))
					.filter(Boolean),
			);
		assert.ok(matrixOs.length > 0, "Could not parse os matrix from test-and-release.yml");
		const ghToNpm = {
			"ubuntu-latest": "linux",
			"windows-latest": "win32",
			"macos-latest": "darwin",
		};
		const tested = new Set(matrixOs.map(o => ghToNpm[o]).filter(Boolean));
		for (const npmOs of tested) {
			assert.ok(declared.has(npmOs), `package.json os must include "${npmOs}" (CI tests on ${npmOs})`);
		}
		for (const npmOs of declared) {
			if (!tested.has(npmOs)) {
				assert.fail(`package.json declares os "${npmOs}" but CI does not test it (E3027)`);
			}
		}
	});

	it("ships VIS widget set files", () => {
		assert.ok(fs.existsSync(path.join(root, "widgets/anker-solix.html")), "widgets/anker-solix.html missing");
		assert.ok(
			fs.existsSync(path.join(root, "widgets/anker-solix/js/energy-home.js")),
			"widgets/anker-solix/js/energy-home.js missing",
		);
		assert.ok(
			fs.existsSync(path.join(root, "widgets/anker-solix/js/html-dashboard.js")),
			"widgets/anker-solix/js/html-dashboard.js missing",
		);
	});

	it("npm pack excludes CHANGELOG_OLD.md (S9508)", function () {
		this.timeout(60_000);
		const packJson = JSON.parse(
			execSync("npm pack --dry-run --json", { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }),
		);
		const files = (packJson[0]?.files ?? []).map(f => f.path);
		assert.ok(
			!files.some(p => p === "CHANGELOG_OLD.md" || p.endsWith("/CHANGELOG_OLD.md")),
			`npm pack must not include CHANGELOG_OLD.md (S9508); got: ${files.filter(p => p.includes("CHANGELOG")).join(", ")}`,
		);
		assert.ok(
			pkg.files.some(f => f.includes("CHANGELOG_OLD")),
			'package.json files must negate CHANGELOG_OLD.md (e.g. "!CHANGELOG_OLD.md")',
		);
	});
});
