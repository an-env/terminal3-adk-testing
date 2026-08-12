# terminal3-adk-testing

A documentation test run against the **Terminal 3 ADK**, produced while working through the official
Quickstart and Walkthrough at
`https://docs.terminal3.io/developers/adk/get-started/quickstart` — submitted as part of the Terminal 3
bounty on Superteam Earn.

The goal was not to ship a product. It was to **follow the documentation exactly as written on a clean
Windows machine and record every point of friction.**

## Result

All four milestones completed end to end: project scaffolded → authenticated connection with a live DID →
TEE contract built → contract registered and successfully invoked inside the enclave.

**16 findings — 1 blocker, 5 high, 5 medium, 5 low.** Full detail in [BUGLOG.md](./BUGLOG.md).

The three worth prioritising:

| # | Finding | Why it matters |
|---|---|---|
| **5** | `T3nClient` requires a `trustAnchor` field that appears **nowhere** in the documentation (verified by grepping all 45 pages listed in `llms.txt`) | The Quickstart fails 100% of the time on a fresh install. Worse, the only escape hatch visible in the error message is `unsafe_trust_server: true`, which disables attestation verification — the core security property of the platform. A safe, undocumented alternative exists: `fetchTrustedManifest()`. |
| **11** | The docs instruct developers *not* to `hex::encode` the tenant DID, while their own reference implementation does exactly that in `search.rs:182` and `booking.rs:171` | The documented snippet would not even compile, since `tenant-did` returns `list<u8>`. The same inverted advice also ships in the official skill file, propagating it to every AI coding assistant that consumes it. |
| **14** | Re-registering a contract allocates a new `contract_id` while the KV map ACL keeps the old one | Reproduced live across ids `598 → 599 → 600 → 601`. The contract is then denied access to its own secret, while `maps.create` reports `map already exists` — which the docs call "idempotent — safe to re-run". |

Worth stating plainly: once finding #5 is cleared, the platform itself performed well. Handshake,
authentication, contract registration, KV map ACLs, egress grants, and in-enclave execution all behaved
exactly as documented, first try.

## Methodology

Testing was carried out on a clean Windows 10 machine via the official "Claude Code" path that the
Terminal 3 documentation itself offers — including their published skill file — and every workaround
recorded in the BUGLOG was executed and verified on this machine rather than proposed on paper. This is
worth stating explicitly because one of the findings (#11) concerns an error carried by that skill file.

## What is in this repository

| Path | Contents |
|---|---|
| `quickstart.ts` | A single script covering the whole flow: connect → authenticate → `TenantClient` → register contract → create KV map → seed secret → grant egress → invoke. The docs deliberately recommend stacking every step into one file so the variables stay in scope. |
| `.claude/skills/t3n-adk-quickstart/SKILL.md` | Terminal 3's official skill file, copied from the *Using AI Coding Assistants* page (with its backslash escaping cleaned up — see finding #2). |
| `BUGLOG.md` | All 16 findings, with environment details, reproduction steps, and verified workarounds. |

The reference contract (`contract/z-tenant-flight/`) is **not** committed here — it is Terminal 3's own
repository, cloned during testing, and is excluded so this repo contains only original work. Reproduce it
with the clone command below.

## Running it

Requires Node.js 24+ and a T3N API key in the `T3N_API_KEY` environment variable.

```powershell
npm install
npx tsx quickstart.ts
```

Rebuilding the contract requires Rust plus the `wasm32-wasip2` target. On Windows the default MSVC
toolchain needs Visual Studio C++ Build Tools; the GNU toolchain avoids that requirement entirely
(see finding #10):

```powershell
git clone https://github.com/Terminal-3/z-tenant-flight.git contract/z-tenant-flight
rustup toolchain install stable-x86_64-pc-windows-gnu
rustup target add wasm32-wasip2 --toolchain stable-x86_64-pc-windows-gnu
cd contract\z-tenant-flight
cargo +stable-x86_64-pc-windows-gnu build --target wasm32-wasip2 --release
```

## Status

The run completes fully on the Terminal 3 side — the contract is registered, invoked inside the enclave,
reads its secret from the KV map, and successfully makes an outbound HTTP call. The only remaining failure
comes from a third party: Duffel returns `HTTP 401`, because this sample contract requires a genuine Duffel
access token that the documentation never lists as a prerequisite (finding #16). This test used an
obviously-fake placeholder value.

Two deliberate deviations from the documentation, both recorded in the BUGLOG:

- `T3nClient` requires `trustAnchor`, which is absent from the docs. It is satisfied here via
  `fetchTrustedManifest("testnet")`, so **attestation verification remains enabled**. The
  `unsafe_trust_server: true` option was deliberately not used — it switches off a core security property
  of the platform.
- The invoke step uses the *direct (self) call* path, because the documented primary path requires
  `AGENT_KEY` and `USER_KEY`, which the claim page never issues.

## Security note

No API key is stored anywhere in this repository. The key is read solely from `process.env.T3N_API_KEY` at
runtime, and is never printed to logs or written to disk. `.gitignore` excludes `node_modules`, `.env`
files, logs, and Rust build artefacts. The tenant DID visible in the output is a public identifier, not a
secret.
