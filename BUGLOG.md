# BUGLOG — Terminal 3 ADK Quickstart & Walkthrough

Bounty testing run — Superteam Earn / Terminal 3.
Test date: 2026-08-12.

## Environment

| Item | Version |
|---|---|
| OS | Microsoft Windows 10 Pro |
| OS build | 10.0.19045 |
| Shell | PowerShell 5.1 (Windows PowerShell) |
| Node.js | v24.15.0 |
| npm | 11.12.1 |
| `@terminal3/t3n-sdk` | 4.35.1 |
| `tsx` | 4.23.12 |

Docs entry point: `https://docs.terminal3.io/developers/adk/get-started/quickstart`

## Summary

16 findings. Every one was reproduced on a clean machine, and every workaround listed here was actually executed and verified — none are proposed on paper.

| # | Finding | Impact |
|---|---|---|
| 1 | "Skill file" link is not a download link | Low |
| 2 | Skill file renders with literal `\`\`\``, breaking copy-paste | Medium |
| 3 | Setup commands are bash-only, with no Windows equivalent | Medium |
| 4 | The documented `npm install` pulls in 1 critical vulnerability | Low |
| **5** | **`trustAnchor` is required but appears nowhere in the docs — Quickstart fails 100%** | **Blocker** |
| 6 | Any SDK error buries the terminal under 1.2M characters of source | Medium |
| 7 | `tenant.me()` does not exist; the real call is `tenant.tenant.me()` | High |
| 8 | Rust install instructions are Unix-only; Windows users hit a dead end | Medium |
| 9 | Docs navigation skips the page that installs the toolchain | Low |
| 10 | Build fails on a clean Windows machine; MSVC prerequisite unstated | High |
| **11** | **Docs forbid `hex::encode`; their own reference implementation uses it** | **High** |
| 12 | `wasm-tools` verification output differs from what the docs promise | Low |
| 13 | `AGENT_KEY`/`USER_KEY` can never actually be obtained by a user | High |
| **14** | **Re-registering allocates a new `contract_id`, silently killing map ACLs** | **High** |
| 15 | The Seed API Key page states the wrong map name | Low |
| 16 | The reference contract requires a Duffel API key the docs never mention | Medium |

The three worth prioritising: **#5** (nobody can complete the Quickstart today), **#11** (the docs are actively misleading, and the same error propagates through the official skill file into every AI coding assistant that uses it), and **#14** (a footgun the docs already acknowledge but have not fixed, whose official remedy is itself impossible to follow).

Worth stating plainly: once #5 is cleared, the platform path itself is solid — handshake, authentication, contract registration, KV map ACLs, egress grants, and in-enclave execution all behaved exactly as documented, first try.

---

## Findings

### #1 — The "skill file" link is not a download link
- **Docs section:** Quickstart → *Claude Code* tab → step 2 ("Save our [skill file] as `.claude/skills/t3n-adk-quickstart/SKILL.md`")
- **Expected:** clicking the link yields a `SKILL.md` file (direct download or raw link) that can be saved straight to that path.
- **What happened:** the link goes to the `/developers/adk/support/ai-coding-assistants` page. There is no download button and no raw URL there — the file's contents are embedded inside an `<Accordion>` component that must be expanded first, then copied by hand out of a code block. The instruction "save the file below" assumes the reader understands this is a copy-paste operation, whereas the Quickstart sentence reads like a downloadable file.
- **Fix/workaround:** expand the accordion, copy the code block contents, save manually. A much cleaner alternative (undocumented on the Quickstart page): fetch the raw page via `https://docs.terminal3.io/developers/adk/support/ai-coding-assistants.md`. Suggestion: provide a direct raw link to `SKILL.md`, or at minimum mention the `.md` trick in the Claude Code tab.

### #2 — The skill file renders with backslash escapes, so copy-paste produces broken markdown
- **Docs section:** Support → Using AI Coding Assistants → accordion "Full skill file — t3n-adk-quickstart/SKILL.md"
- **Expected:** the accordion contents can be copied verbatim into a valid `SKILL.md`.
- **What happened:** the entire skill file is wrapped in a single ```` ```markdown ```` code block, so every code fence inside it is escaped as `` \`\`\`bash ``, `` \`\`\`typescript ``, and so on. The backslashes **are rendered on the page itself** (verified against the rendered HTML, not just the `.md` source) — so anyone who copies and pastes ends up with literal `` \`\`\` `` sequences, which stops every code block inside the skill file from parsing as code.
- **Fix/workaround:** manually strip every backslash preceding a backtick after copying (`\`\`\`` → ` ``` `). Suggested fix: serve the file via an attachment or raw endpoint, or use a longer fence (````` ```` `````) in the MDX source so escaping is unnecessary.

### #3 — All setup commands are bash-only; no Windows/PowerShell equivalent
- **Docs section:** Quickstart → "Set up your project"; skill file Step 2
- **Expected:** setup commands that run on a supported environment, or a note that the examples are written for bash/macOS/Linux.
- **What happened:** two commands fail outright in Windows PowerShell:
  - `mkdir -p my-t3n-app` → PowerShell's `mkdir` does not accept a `-p` flag (parameter error).
  - `export T3N_API_KEY="<key>"` → `export` is not a PowerShell command; nothing explains the failure, and the consequence only surfaces much later at runtime as `Invalid Ethereum private key`.

  There is no Windows tab or callout on any page — even though the pitfalls table in the skill file lists `Invalid Ethereum private key` as a common symptom. Windows users reach that symptom precisely *because* they followed the docs as written.
- **Fix/workaround:** use `New-Item -ItemType Directory my-t3n-app` (or `mkdir my-t3n-app` without `-p`) and `$env:T3N_API_KEY = "<key>"`. Suggestion: add a PowerShell tab to the setup blocks, at minimum for the `export` line.

### #4 — The documented `npm install` produces 1 critical vulnerability
- **Docs section:** Quickstart → "Set up your project" → `npm install @terminal3/t3n-sdk tsx`
- **Expected:** a clean install in a new project.
- **What happened:** `4 vulnerabilities (3 moderate, 1 critical)` in a genuinely empty folder. The chain is transitive from the SDK: `@terminal3/t3n-sdk` → `@bytecodealliance/jco` → `@bytecodealliance/componentize-js` → `@bytecodealliance/weval` → `decompress` (**critical**). The docs do not mention this at all, so a user cannot tell whether it is safe to continue or whether they should run `npm audit fix` (which risks pulling a different SDK version).
- **Fix/workaround:** proceeded as-is for this test run — the vulnerability sits in a build-time dependency, not on the Quickstart runtime path. Suggestion: pin or bump the `@bytecodealliance/*` chain, or add a short note to the docs stating that this audit warning is known and non-blocking.

### #5 — 🔴 BLOCKER: the Quickstart code does not run at all — `trustAnchor` is required but absent from the docs
- **Docs section:** Quickstart → "Connect and authenticate" (and the same snippet duplicated in skill file Step 3)
- **Expected:** paste the `quickstart.ts` snippet verbatim, run `npx tsx quickstart.ts`, get a `did:t3n:...` value.
- **What happened:** it crashes inside `new T3nClient({...})`, before any network call:

  ```
  T3nConfigError: T3nClient: `trustAnchor` is required and must be either a
  TrustAnchor ({ expected_peer_ids, rtmr3_allowlist }) that pins the node's DKG
  attestation, or the explicit opt-out { unsafe_trust_server: true }.
    code: 'CONFIG_ERROR', field: 'trustAnchor'
  ```

  SDK 4.35.1 requires a `trustAnchor` field on `T3nClientConfig`; the documented snippet never mentions it. This is not merely a stale snippet — **the words `trustAnchor`, `unsafe_trust_server`, `expected_peer_ids`, and `rtmr3_allowlist` do not appear even once anywhere in the documentation.** Verified by downloading all 45 `.md` pages listed in `llms.txt` and grepping: zero hits, including on the *SDK & API Reference* page that claims to list "every confirmed ADK method". The *Common Errors* page does not cover it either.

  The effect: **the Quickstart fails 100% of the time on a fresh install** — no user can complete it by following the docs alone. That invalidates the "under 10 minutes" claim in the page's own subtitle.

  What makes it worse: the only guidance a user receives is the error message itself, and the most visible escape hatch in that message is `{ unsafe_trust_server: true }` — which **disables attestation verification**, the exact security property the entire TEE platform exists to provide. The docs are effectively steering users toward switching off their own security just to make the Quickstart run.
- **Fix/workaround:** do **not** use `unsafe_trust_server`. A safe path exists and is already exported by the SDK, but is undocumented: `fetchTrustedManifest(env)` fetches the operator-signed trust manifest from the node, verifies it against the operator public key pinned inside the SDK, and returns a ready-to-use `TrustAnchor`:

  ```typescript
  import { fetchTrustedManifest } from "@terminal3/t3n-sdk";

  const trustAnchor = await fetchTrustedManifest("testnet");
  const t3n = new T3nClient({ wasmComponent, trustAnchor, handlers: { ... } });
  ```

  Verified working against testnet: it returns 3 `expected_peer_ids` and 1 `rtmr3_allowlist` entry, attestation verification stays **enabled**, and `did:t3n:...` prints normally. Suggested fix: add these two lines to the Quickstart snippet, document `trustAnchor` and `fetchTrustedManifest` on the Reference page, and stop presenting `unsafe_trust_server` as a peer option in the error message without naming the safe alternative first.

### #6 — Any SDK error buries the terminal under ~1.2 million characters of obfuscated source
- **Docs section:** Quickstart → "Run it" (occurs on any error thrown by the SDK)
- **Expected:** a readable error message, like the examples in the *Common Errors* table.
- **What happened:** `dist/index.esm.js` ships as a **single line** of obfuscated code (1,233,058 characters). When an exception is thrown, Node prints that source line before the error message — so the terminal is flooded with `_0x119715(0x71d)` and friends, and the actual message (`T3nConfigError: ...`) is buried at the very end, beyond the scrollback limit of many terminals. On the first attempt the real message was not visible at all.
- **Fix/workaround:** redirect stderr to a file and read its tail, e.g. `npx tsx quickstart.ts 2> err.txt` then open `err.txt`. Suggestion: ship source maps (`.map`) or publish a non-obfuscated build so stack traces are readable. Without this, the *Common Errors* table is effectively unusable, because users never get to see their error message.

### #7 — `tenant.me()` does not exist; the real method is `tenant.tenant.me()`
- **Docs section:** Set Up Development Environment → Step 3 "Build a TenantClient from your session"
- **Expected:** the snippet runs and prints `TenantClient ready.`
- **What happened:** `TypeError: tenant.me is not a function`. In SDK 4.35.1, `TenantClient` exposes namespace properties (`tenant`, `maps`, `contracts`, `token`) plus a handful of methods (`requireConfig`, `admitForOrg`, `executeControl`, and so on). `me()` lives on the `TenantNamespace` class, so the correct call is `tenant.tenant.me()` — the variable `tenant` holds a `TenantClient`, and its namespace happens to also be named `tenant`, which makes the doubled `tenant.tenant` look like a typo when it is in fact correct.
- **Fix/workaround:** change `await tenant.me()` → `await tenant.tenant.me()`. Verified to print `TenantClient ready.` (exit code 0). Suggestion: fix the snippet, and consider naming the example variable `tenantClient` so that `tenantClient.tenant.me()` reads unambiguously. Note: the same incorrect call appears again in the troubleshooting table on the *Register your TEE contract* page ("Confirm with `tenant.me()`"), so the fix is needed in two places.

### #8 — Rust install instructions are Unix-only; Windows users hit a dead end here
- **Docs section:** Set Up Development Environment → Step 2 "Install Rust + WASM toolchain"; also Build your TEE contract
- **Expected:** a way to install the toolchain on the platform in use.
- **What happened:** the only instructions given are `curl --proto '=https' ... | sh` followed by `source "$HOME/.cargo/env"` — neither applies on Windows (`source` is not a PowerShell command, and the official Windows installer is `rustup-init.exe`, not a shell script). There is no Windows tab on this page. Also unstated: on Windows, `rustup` still requires the **MSVC C++ build tools** for its host toolchain (used by the `wit-bindgen` proc-macro at build time), which run to several GB — a far larger cost than the docs imply. The Build page also uses `ls -lh` for file verification, which fails in PowerShell.
- **Fix/workaround:** on Windows use `winget install Rustlang.Rustup` (or download `rustup-init.exe` from https://rustup.rs), then `rustup target add wasm32-wasip2`; replace `ls -lh ...` with `Get-ChildItem`. Suggestion: add a Windows tab to the install block and state the MSVC build tools prerequisite along with an approximate download size.

### #9 — Docs navigation skips the page that installs the toolchain
- **Docs section:** Quickstart → "What's next"; Set Up Development Environment
- **Expected:** following the "What's next" link leads to a next step that is ready to work on.
- **What happened:** the Quickstart's "What's next" points straight at [Write your first TEE contract](/developers/adk/get-started/walkthrough/write-contract), **skipping** the *Set Up Development Environment* page — which is precisely the page that installs `rustup` plus the `wasm32-wasip2` target and builds the `TenantClient`. The following walkthrough page (Build) then invokes `cargo build` without mentioning that the toolchain was installed on the page that was skipped. It is also confusing that this page sits in the **"prerequisites"** group even though its own opening note requires the Quickstart to be finished first ("This page picks up where Quickstart leaves off") — so it is named a prerequisite, positioned afterwards, and skipped by the flow links.
- **Fix/workaround:** do *Set Up Development Environment* after the Quickstart and before the walkthrough. Suggestion: point "What's next" at Set Up Dev Env, or move the toolchain install step into the Build walkthrough page.

### #10 — Build fails on a clean Windows machine: MSVC linker prerequisite is unstated
- **Docs section:** Build your TEE contract → `cargo build --target wasm32-wasip2 --release`
- **Expected:** after `rustup target add wasm32-wasip2`, the build command succeeds.
- **What happened:** the build fails outright on a fresh Rust install:

  ```
  error: linker `link.exe` not found
  note: the msvc targets depend on the msvc linker but `link.exe` was not found
  ```

  The cause: although the final target is WASM, `wit-bindgen` is a proc-macro and several dependencies have build scripts — all of which are compiled for the **host** (`x86_64-pc-windows-msvc`) and therefore still need the MSVC linker. So Windows requires Visual Studio C++ Build Tools (several GB), which the docs never mention. This extends finding #8 but is logged separately because it surfaces on a different page and kills the Build step entirely.
- **Fix/workaround:** rather than pulling in Visual Studio Build Tools, install the GNU toolchain, which ships its own linker, and use it for this build only (leaving the global default untouched):

  ```powershell
  rustup toolchain install stable-x86_64-pc-windows-gnu
  rustup target add wasm32-wasip2 --toolchain stable-x86_64-pc-windows-gnu
  cargo +stable-x86_64-pc-windows-gnu build --target wasm32-wasip2 --release
  ```

  Verified working: `z_tenant_flight.wasm`, 193.3 KB, completed in 1m02s. Follow-on note: with the GNU toolchain, `cargo install wasm-tools` **still fails** (`error calling dlltool 'dlltool.exe': program not found` while compiling `windows-sys`) — the way through is to use the prebuilt `wasm-tools` release binary from GitHub rather than `cargo install` as the docs instruct.

### #11 — 🔴 The docs contradict their own reference implementation on `tenant_did()`
- **Docs section:** Write your TEE contract → "Reading secrets from the `secrets` KV map"; repeated in the skill file's pitfalls table
- **Expected:** the `get_api_key()` snippet in the docs matches the code in `z-tenant-flight`, the repo the docs instruct you to clone.
- **What happened:** the docs state, with an emphatic in-code comment:

  ```rust
  // tenant_did() already returns the tid as a string — do not hex::encode it again.
  let tid = tenant_context::tenant_did();
  let map_name = format!("z:{}:secrets", tid);
  ```

  But the actual host interface — read back from the built component via `wasm-tools component wit` — declares:

  ```wit
  interface tenant-context {
    tenant-did: func() -> list<u8>;
  }
  ```

  `list<u8>` maps to `Vec<u8>` in the Rust bindings, which does **not** implement `Display`, so `format!("z:{}:secrets", tid)` would not even compile. And the reference implementation in that same repo does exactly what the docs forbid — in **two** files:

  ```rust
  // contract/z-tenant-flight/src/search.rs:182 and src/booking.rs:171
  let tid = tenant_context::tenant_did();
  let map_name = alloc::format!("z:{}:secrets", hex::encode(&tid));
  ```

  This is consistent with `Cargo.toml`, which does pull in the `hex` dependency — a dependency that would serve no purpose if the docs' advice were correct. So the docs are not merely stale but actively misleading: a developer writing their own contract by following this page will fail to compile, then "fix" it in the wrong direction (e.g. `String::from_utf8`) and end up with a map path that matches nothing — exactly the "map path looks right but reads/writes silently miss" symptom listed in the pitfalls table.
- **Fix/workaround:** follow the repo, not the docs page: `hex::encode(&tid)`. Suggestion: fix the snippet on the Write your TEE contract page **and** the corresponding pitfalls-table row in the skill file (`t3n-adk-quickstart/SKILL.md`), since both propagate the same inverted advice to every AI assistant that consumes that skill file.

### #12 — `wasm-tools` verification output does not match what the docs promise
- **Docs section:** Build your TEE contract → "Verify the component interface"
- **Expected:** the docs say the output "should include ... your exported interface: `export contracts;`"
- **What happened:** the actual output uses the fully-qualified package name and version: `export z:tenant-flight/contracts@0.4.0;`. The string `export contracts;` never appears. Minor, but enough to make a beginner think their build is wrong because the promised text is missing.
- **Fix/workaround:** treat `export z:<package>/contracts@<version>;` as correct. Suggestion: update the sample output in the docs to match what is actually printed.

### #13 — The Invoke step requires two credentials a user can never obtain
- **Docs section:** Invoke your TEE contract → steps 1 & 2; also Agent Auth
- **Expected:** the page's primary path can be followed to completion using the credentials a user actually has.
- **What happened:** the code on that page reads `process.env.AGENT_KEY` and `process.env.USER_KEY` — two credentials **in addition to** `T3N_API_KEY`. The claim page issues exactly one key, and no page anywhere explains how to obtain the other two. The only hint appears on the Agent Auth page: *"generate `AGENT_KEY` as its own separate credential (the same way you'd generate any Ethereum-style keypair)"* — with no command, no example, and no link. For a beginner (the Quickstart's stated audience) this is a dead end, and since the `T3N_API_KEY` the SDK consumes does function as an Ethereum private key, users are strongly tempted to reuse their tenant key — the exact thing the docs forbid in their own code comment.
- **Fix/workaround:** use the **direct (self) call** path, which the docs mention only as a single interstitial paragraph beneath the step 2 code block: instead of building separate `agentClient` and `userClient` sessions, reuse the existing tenant session and set `agentDid` to your own `tenantDid` (a self-grant). Verified fully working. Suggestion: promote the self-call path to a first-class tab on the Invoke page — it is the only path completable with credentials from the claim page — and include a snippet for generating a fresh Ethereum keypair for genuine agent scenarios.

### #14 — 🔴 Re-registering allocates a new `contract_id` and silently kills the map ACL (reproduced)
- **Docs section:** Register your TEE contract (Warning box); Create Tenant KV Maps
- **Expected:** repeating the walkthrough — an entirely normal thing to do while learning — either works, or fails with a message that points somewhere useful.
- **What happened:** two problems that compound each other.

  First, `register` rejects a version equal to or lower than the current one, so simply re-running the walkthrough script fails immediately — the user must hand-edit `CONTRACT_VERSION` on every attempt.

  Second, and far worse: **every registration allocates a new `contract_id`**, while the `secrets` map ACL still holds the old one. Observed directly over the course of this session: ids `598` → `599` → `600` → `601` for the same tail. On the run that landed id `600`, the contract was denied access to its own secret:

  ```
  search-offers FAILED: RPC Error: contract error: kv read:
  kv_store.get on 'z:<tid>:secrets' read denied: access denied:
  TenantContract(did:t3n:<tid>/600) cannot read map "z:<tid>:secrets"
  ```

  `maps.create` returns `map already exists`, which the docs describe as "idempotent — safe to re-run", so a user reasonably concludes the map is fine. The ACL, however, is stale. The docs acknowledge the underlying issue in a Warning box and advise "keep a record of each `contract_id`" — but in the same sentence state there is no API to read a tail's current `contract_id`, which makes that advice unactionable for anyone who has already lost their record. Describing `MapAlreadyExists` as "idempotent" without noting that the ACL is *not* refreshed is the most misleading part.
- **Fix/workaround:** explicitly re-point the map ACL at the current `contract_id` on every re-registration, rather than just swallowing the `map already exists` error:

  ```typescript
  await tenant.maps.update("secrets", {
    writers: { only: [contractId] },
    readers: { only: [contractId] },
  });
  ```

  Verified to restore the flow. Suggestion: make `contracts.register` return a stable per-tail `contract_id`, or expose an endpoint for reading the current one, and add this ACL-update step to the Create Tenant KV Maps page.

### #15 — The Seed API Key page states the wrong map name
- **Docs section:** Seed API key into secrets map → point 2 under "What happens"
- **Expected:** consistency with the Write your TEE contract page and with actual host behaviour.
- **What happened:** the page states that the contract reads the value back with `kv_store::get("secrets", "duffel_api_key")` — using the short name. The Write your TEE contract page asserts the opposite, that "kv-store calls take the **full** `z:<tid>:<map>` name", and the reference implementation does use the full name. The short name is rejected by the host.
- **Fix/workaround:** always use the fully-qualified canonical name `z:<tid>:secrets`. Suggestion: correct the sentence on the Seed API Key page.

### #16 — The reference contract requires a Duffel API key the docs never mention
- **Docs section:** the entire walkthrough chain (Write → Build → Register → Invoke)
- **Expected:** a list of third-party prerequisites at the start of the walkthrough, or a sample contract that runs without an external account.
- **What happened:** `z-tenant-flight` calls the real Duffel API, and `search-offers` can never succeed without a valid Duffel access token. Eight documentation pages mention "Duffel", but **not one** explains that the user needs to sign up with Duffel, let alone how to do so (confirmed by grepping all 45 pages). The prerequisites page covers only the T3N API key and test credits. As a result the walkthrough "completes" with an HTTP 401 from a third party, and a beginner is very likely to conclude that the T3N platform itself is broken.
- **Fix/workaround:** for this test run, an obviously-fake placeholder was seeded into the `secrets` map, so that the whole T3N chain is still proven (KV read, ACL, egress grant, in-enclave execution) and the only remaining failure originates from Duffel:

  ```
  contract error: Duffel offer-request failed: HTTP 401 —
  {"errors":[{"title":"Access token not found", ... }]}
  ```

  Suggestion: state Duffel as an explicit prerequisite at the top of the walkthrough along with a signup link (Duffel offers free test tokens), or ship a sample contract that requires no third party in order to finish onboarding.
