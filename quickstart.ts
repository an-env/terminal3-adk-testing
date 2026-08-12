import {
  T3nClient,
  setEnvironment,
  loadWasmComponent,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
  fetchTrustedManifest,
} from "@terminal3/t3n-sdk";

setEnvironment("testnet"); // the SDK defaults to production — set this explicitly while building

const T3N_API_KEY = process.env.T3N_API_KEY!;
const wasmComponent = await loadWasmComponent(); // all crypto runs inside this component
const address = eth_get_address(T3N_API_KEY);

// NOT IN THE DOCS: SDK >=4.x requires `trustAnchor` on T3nClient. The docs'
// quickstart snippet omits it entirely and throws T3nConfigError. This is the
// SAFE way to satisfy it — fetches the operator-signed trust manifest and
// verifies it against the operator public key pinned inside the SDK, so
// attestation verification stays ON. See BUGLOG.md #5.
const trustAnchor = await fetchTrustedManifest("testnet");
console.log("Trust anchor pinned:", {
  peer_ids: trustAnchor.expected_peer_ids.length,
  rtmr3_allowlist: trustAnchor.rtmr3_allowlist.length,
});

const t3n = new T3nClient({
  wasmComponent,
  trustAnchor,
  handlers: {
    EthSign: metamask_sign(address, undefined, T3N_API_KEY),
  },
});

await t3n.handshake();
const did = await t3n.authenticate(createEthAuthInput(address));
const tenantDid = did.value; // did:t3n:... — you'll reuse this exact variable in every later step

console.log("Connected as:", tenantDid);

// --- Set Up Dev Env, Step 3: build a TenantClient from the session ---
// Docs say to append this (import included) to the bottom of this same file.
import { TenantClient, getNodeUrl } from "@terminal3/t3n-sdk";

const tenant = new TenantClient({
  t3n,                    // the T3nClient you already authenticated in Quickstart
  baseUrl: getNodeUrl(),  // the active node from setEnvironment()
  tenantDid,              // did.value from Quickstart — never hardcode
});

// DOCS SAY `tenant.me()` — that method does not exist on TenantClient in SDK
// 4.35.1. `me()` lives on the `tenant` namespace. See BUGLOG.md #7.
await tenant.tenant.me(); // throws if something's wrong; confirms the client actually works
console.log("TenantClient ready.");

// --- Walkthrough Step 3: register the TEE contract ---
import { readFile } from "fs/promises";

// Docs use "../z-tenant-flight/..." (sibling folder). We cloned the crate INSIDE
// this project instead, so the path is adjusted accordingly.
const WASM_PATH = "./contract/z-tenant-flight/target/wasm32-wasip2/release/z_tenant_flight.wasm";
const CONTRACT_TAIL = "travel-contracts";
const CONTRACT_VERSION = "0.1.0";

const wasmBytes = await readFile(WASM_PATH);

// Re-running this script re-registers the same tail, which the node rejects
// unless `version` strictly increases. Bump the patch until it takes, so the
// walkthrough is repeatable. See BUGLOG.md #14.
async function registerBumping(startVersion: string) {
  const [maj, min, patch] = startVersion.split(".").map(Number);
  for (let p = patch; p < patch + 50; p++) {
    const version = `${maj}.${min}.${p}`;
    try {
      const r = await tenant.contracts.register({ tail: CONTRACT_TAIL, version, wasm: wasmBytes });
      console.log(`registered version ${version}`);
      return r;
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (!/not higher than current version|already/i.test(msg)) throw e;
    }
  }
  throw new Error("could not find a free contract version");
}

const result = await registerBumping(CONTRACT_VERSION);

// This numeric ID is required in the next setup step when you create map ACLs.
const contractId = result.contract_id;
const tenantId = tenantDid.slice("did:t3n:".length);
const scriptName = `z:${tenantId}:${CONTRACT_TAIL}`;

console.log(`registered ${scriptName} as contract id ${contractId}`);

// --- Walkthrough Step 4: invoke the contract ---
// Docs' main path needs AGENT_KEY + USER_KEY (two extra credentials the claim
// page never issues). We take the "direct (self) call" path the same page
// describes: the tenant session stands in for both user and agent, and the
// grant names our own DID. See BUGLOG.md #13.
import { getScriptVersion } from "@terminal3/t3n-sdk";

// 4a. Create the `secrets` KV map the contract reads at runtime.
try {
  await tenant.maps.create({
    tail: "secrets",
    visibility: "private",
    writers: { only: [contractId] },
    readers: { only: [contractId] }, // REQUIRED — kv-governor denies reads when omitted
  });
  console.log("secrets map created.");
} catch (e) {
  // MapAlreadyExists is documented as idempotent — but the ACL it was created
  // with still names the PREVIOUS contractId, and re-registering allocated a new
  // one. Without this update the contract gets `access denied` reading its own
  // secret. See BUGLOG.md #14.
  console.log("secrets map:", (e as Error).message);
  await tenant.maps.update("secrets", {
    writers: { only: [contractId] },
    readers: { only: [contractId] },
  });
  console.log(`secrets map ACL re-pointed to contract id ${contractId}`);
}

// 4b. Seed the Duffel API key. No real Duffel credential is available in this
// test run, so a clearly-fake placeholder is used unless DUFFEL_API_KEY is set.
// This still exercises the KV read + egress path inside the enclave.
await tenant.executeControl("map-entry-set", {
  map_name: tenant.canonicalName("secrets"),
  key: "duffel_api_key",
  value: process.env.DUFFEL_API_KEY ?? "duffel_test_PLACEHOLDER_not_a_real_key",
});
console.log("API key sealed in z:<tid>:secrets");

// 4c. Authorize egress. In a self-call the data owner IS us, so agentDid is our
// own tenantDid rather than a separate agent's DID.
const scriptVersion = await getScriptVersion(getNodeUrl(), scriptName);
const userContractVersion = await getScriptVersion(getNodeUrl(), "tee:user/contracts");

await t3n.execute({
  script_name: "tee:user/contracts",
  script_version: userContractVersion,
  function_name: "agent-auth-update",
  input: {
    agents: [{
      agentDid: tenantDid, // self-grant
      scripts: [{
        scriptName,
        versionReq: scriptVersion,
        functions: ["search-offers", "book-offer"],
        allowedHosts: ["api.duffel.com"],
      }],
    }],
  },
});
console.log(`self-grant signed for ${scriptName}@${scriptVersion}`);

// 4d. Invoke search-offers.
try {
  const search = await t3n.executeAndDecode({
    script_name: scriptName,
    script_version: scriptVersion,
    function_name: "search-offers",
    input: {
      origin: "LHR",
      destination: "JFK",
      departure_date: "2026-09-15",
      cabin_class: "economy",
      adult_count: 1,
    },
  });
  console.log("search-offers returned:", JSON.stringify(search).slice(0, 400));
} catch (e) {
  console.log("search-offers FAILED:", (e as Error).message);
}
