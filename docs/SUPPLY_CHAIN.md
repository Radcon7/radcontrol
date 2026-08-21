# RadControl Supply Chain and Release Evidence

Status: Active implementation authority
Scope: source, GitHub controls, CI dependencies, non-deploying release candidates, provenance, and audit anchors
Owner: RadControl release path; O2 owns the compatibility pin and audit-chain verifier
Reviewed: 2026-08-16
Next review: before 5C publication or any 5D native acceptance

## Trust and release statement

An accepted release is traceable in this order:

`RadControl source SHA -> required CI -> exact compatible O2 SHA -> Linux artifact -> SHA-256 and dependency evidence -> externally retained GitHub Actions artifact -> 5D native acceptance -> installed matched pair`.

A successful build is not an install decision. Round 5C workflows do not deploy,
publish a GitHub Release, create a tag, launch RadControl, or replace an installed
binary. Only a separately authorized 5D native/install acceptance may advance
the installed O2/RadControl pair.

`scripts/install_production.sh` is retained only as a fail-closed compatibility
stub for old operator commands. It performs no filesystem mutation. The source
tree intentionally exposes no standalone binary installer because that would
create a parallel path around matched-pair acceptance. Each authorized native
acceptance must instead use one reviewed transaction fixed to the exact O2 tree,
RadControl artifact and support-file hashes; it must preflight the old and new
pairs, recover the old pair on failure, prove a real rollback, and prove the same
candidate can be reinstalled before the transaction is accepted.

## Reproducibility boundary

- Node is exactly `24.12.0`; Rust is exactly `1.93.0` through
  `rust-toolchain.toml` and the workflow command.
- `package-lock.json`, `Cargo.lock`, `npm ci`, and Cargo `--locked` are mandatory.
- Python remains the Ubuntu 24.04 platform Python and uses only the standard
  library. O2 CI separately selects Python 3.12.
- `ubuntu-24.04`, apt repository state, and the four Linux Tauri packages are
  platform-level moving inputs. Their resolved package versions are captured in
  release evidence. This is reproducible identification, not a bit-for-bit
  immutable builder claim.
- The Linux prerequisites are `libwebkit2gtk-4.1-dev`,
  `libayatana-appindicator3-dev`, `librsvg2-dev`, and `patchelf`.

## Reviewed GitHub Actions

This inventory covers both O2 and RadControl workflows.

| Action | Exact commit | Reviewed release | Purpose |
| --- | --- | --- | --- |
| `actions/checkout` | `d23441a48e516b6c34aea4fa41551a30e30af803` | v6 | Source checkout with credentials discarded |
| `actions/setup-node` | `820762786026740c76f36085b0efc47a31fe5020` | v7 | Exact Node runtime and npm cache |
| `actions/setup-python` | `ece7cb06caefa5fff74198d8649806c4678c61a1` | v6 | O2 CI Python 3.12 runtime |
| `actions/dependency-review-action` | `a1d282b36b6f3519aa1f3fc636f609c47dddb294` | v5.0.0 | Fail pull requests introducing moderate-or-higher known dependency risk |
| `actions/upload-artifact` | `ea165f8d65b6e75b540449e92b4886f43607fa02` | v4.6.2 | Retain release/anchor evidence for 90 days |
| `actions/download-artifact` | `634f93cb2916e3fdff6788551b99b062d0335ce0` | v5.0.0 | Retrieve exact evidence between isolated jobs |
| `github/codeql-action/init` and `analyze` | `ff2f1c621b7f889edc0d3c761ac2e6a3f8cdb0dd` | v4.37.7 | JavaScript/TypeScript static analysis |

Repository policy independently requires full-length Action SHAs. Contract
tests fail on a new action, changed SHA, floating ref, retained checkout
credential, or unexpected write permission. Verification and evidence jobs
have only `contents: read`; CodeQL alone receives `security-events: write`.
No workflow has repository-contents, identity-token, or attestation write access.

## Dependency evidence and RustSec classification

The locked npm graph contains 3 direct runtime, 7 direct development, and 133
locked package records. The Cargo manifest contains 9 direct build/runtime
entries; `Cargo.lock` contains 486 package records (429 distinct package names,
including target-specific packages). No external Python package is introduced.
The hosted dependency evidence records every Action identity and
reviewed-release comment from both the RadControl and O2 source checkouts.

The current npm production audit and GitHub Dependabot alerts report zero known
vulnerabilities. RustSec informational warnings are not mislabeled as
vulnerabilities. The 22 applicable warnings are grouped below; the Tauri
dependency path and reachability were confirmed with `cargo tree`.

| Packages / advisories | Path and reachability | Patched version | Decision and owner |
| --- | --- | --- | --- |
| `atk` 0413, `atk-sys` 0416, `gdk` 0412, `gdk-sys` 0418, `gdkwayland-sys` 0411, `gdkx11` 0417, `gdkx11-sys` 0414, `gtk` 0415, `gtk-sys` 0420, `gtk3-macros` 0419 | Tauri/Wry Linux GUI; runtime/build reachable | None; all unmaintained | Accepted upstream GTK3/Tauri risk; RadControl release owner monitors Tauri migration |
| `fxhash` 2025-0057, `proc-macro-error` 2024-0370 | Tauri HTML tooling and GTK macros | None; unmaintained | Accepted transitive risk; dependency review watches replacement through upstream Tauri |
| `unic-char-property` 2025-0081, `unic-char-range` 2025-0075, `unic-common` 2025-0080, `unic-ucd-ident` 2025-0100, `unic-ucd-version` 2025-0098 | `urlpattern -> tauri-utils`; build and runtime reachable | None; unmaintained | Accepted transitive risk; monitor `tauri-utils` |
| `anyhow` 1.0.100 / 2026-0190 | Tauri core/build/plugin stack | 1.0.103 | Informational unsoundness; take a reviewed compatible lock refresh, not an ad hoc local install |
| `event-listener` 5.4.1 / 2026-0221 | `zbus` through opener/single-instance on Linux | 5.4.2 | Same: update through reviewed lockfile maintenance and rerun full gates |
| `rand` 0.7.3 and 0.8.5 / 2026-0097 | PHF/code-generation paths through `tauri-utils` | 0.8.6 in the 0.8 line; none in the 0.7 line | Build-path warning; update through reviewed upstream-compatible lockfile maintenance |
| `glib` 0.18.5 / 2024-0429 | GTK/WebKit/Tauri Linux runtime | 0.20, incompatible with the retained GTK3 graph | Accepted upstream risk; do not force a partial major upgrade |

IDs above use the `RUSTSEC-` prefix. The monitoring owner is the RadControl
release/dependency review. A full formal SPDX/CycloneDX generator was deferred:
adding and trusting another generator solely for the label is disproportionate.
`scripts/release_candidate.py` instead emits deterministic
`dependency-manifest.json`, tied by SHA-256 and exact source identities to
`release-manifest.json`.

## Release-candidate workflow

The manual workflow is O2-owned because O2 is private while RadControl is
public. A RadControl-scoped workflow token cannot read private O2, and adding a
cross-repository PAT would weaken the credential boundary. The O2 workflow
checks out itself and the exact public RadControl commit from O2's canonical
compatibility manifest, without retained credentials, and refuses a source or
contract-digest mismatch. It runs contracts, audits, locked Rust gates, and snapshots; builds
with `--no-bundle`; then emits:

- `radcontrol-app`;
- `evidence/release-manifest.json`;
- `evidence/dependency-manifest.json`;
- `system-packages.txt`.

The manifest identifies both source SHAs, artifact filename and SHA-256, UTC
build time, workflow/run identity, Node/Rust versions, and both lockfile
digests. A second read-only job downloads and re-hashes the artifact and
evidence. The package is retained by GitHub Actions for 90 days.

GitHub artifact attestations are not available to this user-owned private O2
repository on the current GitHub Pro plan; GitHub requires Enterprise Cloud
for private-repository attestations. Moving the build to public RadControl
would lose authenticated access to the O2 pin, so 5C deliberately records this
gap instead of adding a PAT or claiming an unverifiable attestation. These
hosted artifacts do not exist until the candidates are separately published
and the O2 manual workflow succeeds.

## External audit anchor

O2 verifies the entire local audit JSONL chain before producing an anchor with
exactly: schema, audit schema, tip SHA-256, record count, timestamp, O2 source
SHA, and RadControl source SHA. No request, event, target, payload, output,
environment, credential, or secret field is permitted. The O2 manual workflow
validates both selected source identities, retains that small JSON as a 90-day
GitHub Actions artifact, and independently revalidates the download. The
desktop runtime receives no GitHub token and cannot trigger the workflow.

Trust statement:

- local audit hash chain = tamper-evident structure under the same Linux UID;
- externally retained tip = stronger retrospective tamper evidence unless the
  GitHub/account trust domain is also compromised or the 90-day evidence is
  allowed to expire;
- neither means impossible to compromise.

## Release and tag policy

No tag or GitHub Release is accepted merely because CI or a build succeeded.
After 5D proves the downloaded candidate natively and advances the installed
matched pair, a separately authorized release may point to the exact source,
workflow run, retained evidence, manifest, artifact hash, and acceptance record.
Historical unprotected tags remain history. Add a release/tag ruleset only
when tags become an active release control; creating a ceremonial rule before
that would not protect the installed product.

## Adversarial disposition

| Threat | Prevented | Detected/contained | Residual |
| --- | --- | --- | --- |
| Malicious dependency maintainer | Lockfiles and dependency review prevent silent moving input | New advisory/lock diff fails review gates | A reviewed malicious locked release can still pass |
| Compromised movable Action tag | Full-SHA policy and contract test | New Action/SHA is explicit review material | Compromise of the exact pinned commit or GitHub platform |
| Accidental direct push | Main protection binds administrators to PR and required CI | GitHub rejects force/deletion/direct bypass | Account/GitHub control-plane compromise |
| Compromised workflow step | Jobs are read-only and checkout credentials are discarded | Independent download/hash verification detects transfer corruption | A build step can produce a bad but internally consistent candidate; 5D must test it |
| Stale O2/RadControl pair | Single O2 pin and bidirectional source/digest validation | O2 CI and release workflow fail visibly | Pin update still requires correct human/agent review |
| Tampered downloaded artifact | No claim of prevention | SHA-256 and manifest verification fail | Compromise of source/build evidence together, or artifact expiry/deletion |
| Rewritten local audit history | Local same-UID rewrite is not prevented | Existing external anchor no longer matches | GitHub anchor compromise or never creating an anchor |
| Hostile renderer URL request | Frontend has no opener capability; Rust accepts finite providers or registry routes | Explicit `URL_DENIED`; OS errors remain distinct | Approved provider content/account compromise |
