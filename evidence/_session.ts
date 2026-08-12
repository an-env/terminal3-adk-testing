// Shared session helpers used by the evidence scripts (f2/f3/f4).
// Same flow as quickstart.ts, factored out so each figure can show one
// milestone on its own screen. The API key is read only from process.env
// and is never printed.
import {
  T3nClient,
  TenantClient,
  setEnvironment,
  loadWasmComponent,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
  fetchTrustedManifest,
  getNodeUrl,
  getScriptVersion,
} from "@terminal3/t3n-sdk";
import { readFile } from "fs/promises";

export const WASM_PATH =
  "./contract/z-tenant-flight/target/wasm32-wasip2/release/z_tenant_flight.wasm";
export const CONTRACT_TAIL = "travel-contracts";

export async function connect() {
  setEnvironment("testnet");
  const key = process.env.T3N_API_KEY!;
  const wasmComponent = await loadWasmComponent();
  const address = eth_get_address(key);

  // Undocumented but safe: verifies the operator-signed manifest against the
  // operator key pinned in the SDK, so attestation stays ON (BUGLOG #5).
  const trustAnchor = await fetchTrustedManifest("testnet");

  const t3n = new T3nClient({
    wasmComponent,
    trustAnchor,
    handlers: { EthSign: metamask_sign(address, undefined, key) },
  });

  await t3n.handshake();
  const did = await t3n.authenticate(createEthAuthInput(address));
  const tenantDid = did.value;

  const tenant = new TenantClient({ t3n, baseUrl: getNodeUrl(), tenantDid });
  return { t3n, tenant, tenantDid, trustAnchor };
}

export async function registerBumping(tenant: any, start = "0.1.0") {
  const wasm = await readFile(WASM_PATH);
  const [maj, min, patch] = start.split(".").map(Number);
  for (let p = patch; p < patch + 60; p++) {
    const version = `${maj}.${min}.${p}`;
    try {
      const r = await tenant.contracts.register({
        tail: CONTRACT_TAIL,
        version,
        wasm,
      });
      return { ...r, version, size: wasm.length };
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (!/not higher than current version|already/i.test(msg)) throw e;
    }
  }
  throw new Error("no free contract version");
}

// Re-point the map ACL at the current contract id. Required on every
// re-registration because a new contract id is allocated each time (BUGLOG #14).
export async function ensureSecrets(tenant: any, contractId: number) {
  try {
    await tenant.maps.create({
      tail: "secrets",
      visibility: "private",
      writers: { only: [contractId] },
      readers: { only: [contractId] },
    });
  } catch {
    await tenant.maps.update("secrets", {
      writers: { only: [contractId] },
      readers: { only: [contractId] },
    });
  }
  await tenant.executeControl("map-entry-set", {
    map_name: tenant.canonicalName("secrets"),
    key: "duffel_api_key",
    value: process.env.DUFFEL_API_KEY ?? "duffel_test_PLACEHOLDER_not_a_real_key",
  });
}

// Direct (self) call grant: the data owner is us, so agentDid is our own DID.
// The documented path needs AGENT_KEY/USER_KEY, which are never issued (BUGLOG #13).
export async function selfGrant(t3n: any, tenantDid: string, scriptName: string) {
  const scriptVersion = await getScriptVersion(getNodeUrl(), scriptName);
  const userContractVersion = await getScriptVersion(
    getNodeUrl(),
    "tee:user/contracts",
  );
  await t3n.execute({
    script_name: "tee:user/contracts",
    script_version: userContractVersion,
    function_name: "agent-auth-update",
    input: {
      agents: [
        {
          agentDid: tenantDid,
          scripts: [
            {
              scriptName,
              versionReq: scriptVersion,
              functions: ["search-offers", "book-offer"],
              allowedHosts: ["api.duffel.com"],
            },
          ],
        },
      ],
    },
  });
  return scriptVersion;
}

export function scriptNameFor(tenantDid: string) {
  return `z:${tenantDid.slice("did:t3n:".length)}:${CONTRACT_TAIL}`;
}
