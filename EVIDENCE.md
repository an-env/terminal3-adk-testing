# Fresh Evidence — Terminal 3 ADK Test Run

Captured **2026-08-12 06:48:12 +07:00** on the same clean Windows 10 machine used throughout the test run.
Every line below is unedited console output from a live run against T3N testnet.

## Toolchain

```
node   v24.15.0
npm    11.12.1
rustc  1.97.1 (8bab26f4f 2026-07-14)

+-- @terminal3/t3n-sdk@4.35.1
`-- tsx@4.23.12
```

## 1. Contract build — `cargo build --target wasm32-wasip2 --release`

Built with the GNU host toolchain, the workaround for finding #10 (the MSVC linker prerequisite the docs
never state):

```
    Finished `release` profile [optimized] target(s) in 4.37s

Name                 SizeKB
----                 ------
z_tenant_flight.wasm  193.3
```

## 2. Component interface — `wasm-tools component wit`

Confirms the artifact is a genuine WASM component exporting the `contracts` interface, and shows the host
interfaces it imports:

```wit
package root:component;

world root {
  import host:tenant/tenant-context@1.0.0;
  import host:interfaces/logging@2.1.0;
  import host:interfaces/kv-store@2.1.0;
  import host:interfaces/http@2.1.0;
  import host:interfaces/http-with-placeholders@2.1.0;
  ...
  export z:tenant-flight/contracts@0.4.0;
}
```

Note the exported name is `z:tenant-flight/contracts@0.4.0`, not the bare `export contracts;` the docs
promise — that discrepancy is finding #12.

The same output also declares `tenant-did: func() -> list<u8>`, which is the direct evidence behind
finding #11: the docs instruct developers *not* to hex-encode that value, but `list<u8>` maps to
`Vec<u8>`, which has no `Display` impl, so the documented snippet cannot compile. The reference
implementation hex-encodes it in `search.rs:182` and `booking.rs:171`.

## 3. Full end-to-end run — `npx tsx quickstart.ts`

```
Trust anchor pinned: { peer_ids: 3, rtmr3_allowlist: 1 }
Connected as: did:t3n:e71542c100662afbe199b695aa3f643f5f7cb0d4
TenantClient ready.
registered version 0.1.4
registered z:e71542c100662afbe199b695aa3f643f5f7cb0d4:travel-contracts as contract id 602
secrets map: RPC Error: map already exists [9a3942fa-489f-4ea5-8e21-1f398911f17d]
secrets map ACL re-pointed to contract id 602
API key sealed in z:<tid>:secrets
self-grant signed for z:e71542c100662afbe199b695aa3f643f5f7cb0d4:travel-contracts@0.1.4
search-offers FAILED: RPC Error: contract error: Duffel offer-request failed: HTTP 401 —
{"errors":[{"documentation_url":"https://duffel.com/docs/api/overview/response-handling",
"title":"Access token not found","type":"authentication_error",
"message":"The access token you have used is not a valid API access token",
"code":"access_token_not_found"}],"meta":{"request_id":"GMrlHWYEFEtWiEQAujqB","status":401}}
```

Process exit code: `0`. Stderr: empty.

### What each line proves

| Output line | What it demonstrates |
|---|---|
| `Trust anchor pinned: { peer_ids: 3, rtmr3_allowlist: 1 }` | Attestation verification is **enabled**, satisfied via the undocumented `fetchTrustedManifest("testnet")`. The `unsafe_trust_server` opt-out was deliberately not used (finding #5). |
| `Connected as: did:t3n:...` | Handshake and Ethereum-signature authentication succeeded; the tenant DID was read back from the session, never derived. |
| `TenantClient ready.` | `tenant.tenant.me()` succeeded — the corrected call for finding #7, where the docs say `tenant.me()`. |
| `registered ... as contract id 602` | The WASM component was uploaded and registered under the tenant namespace. |
| `secrets map ACL re-pointed to contract id 602` | The workaround for finding #14. Re-registration allocated yet another id — the sequence across this test run is **598 → 599 → 600 → 601 → 602** — while the map ACL still named the previous one. |
| `API key sealed in z:<tid>:secrets` | Control-plane `map-entry-set` write succeeded, bypassing the map's writer ACL as documented. |
| `self-grant signed for ...@0.1.4` | The data-owner egress grant was signed via the direct self-call path, the workaround for finding #13 (`AGENT_KEY`/`USER_KEY` are never issued to users). |
| `Duffel offer-request failed: HTTP 401` | **The full T3N chain succeeded.** The contract executed inside the enclave, read its secret from the KV map (ACL passed), and completed an outbound HTTPS call to `api.duffel.com` (egress grant passed). The 401 is Duffel rejecting the placeholder token — finding #16, the third-party credential the docs never list as a prerequisite. |

## Reproducing this

```powershell
# Requires T3N_API_KEY in the environment. It is read only from process.env
# and is never printed or written to disk.
npm install
npx tsx quickstart.ts
```

Each run registers a new contract version and therefore allocates a new `contract_id`, so the ids above
will continue to increment on subsequent runs. That behaviour is itself finding #14.

## Security

No credential appears anywhere in this document or in the repository. The tenant DID shown above is a
public identifier. The Duffel value seeded into the `secrets` map is a deliberately fake placeholder
(`duffel_test_PLACEHOLDER_not_a_real_key`), which is why Duffel returns 401.
