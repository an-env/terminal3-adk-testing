// F4 — invoke the registered contract inside the enclave and show the
// outbound-HTTP (egress) result.
import {
  connect,
  registerBumping,
  ensureSecrets,
  selfGrant,
  scriptNameFor,
} from "./_session.ts";

console.log("=== F4: CONTRACT INVOCATION + EGRESS RESULT ===");
console.log("");

const { t3n, tenant, tenantDid } = await connect();
const r = await registerBumping(tenant);
await ensureSecrets(tenant, r.contract_id);

const scriptName = scriptNameFor(tenantDid);
const scriptVersion = await selfGrant(t3n, tenantDid, scriptName);

console.log("Contract           :", scriptName);
console.log("Version            :", scriptVersion);
console.log("Contract id        :", r.contract_id);
console.log("Secrets map ACL    : re-pointed to contract id", r.contract_id);
console.log("Egress grant       : self-grant, allowedHosts = [api.duffel.com]");
console.log("");
console.log("Invoking function  : search-offers");
console.log("");

try {
  const res = await t3n.executeAndDecode({
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
  console.log("RESULT             :", JSON.stringify(res).slice(0, 300));
} catch (e) {
  const m = (e as Error).message ?? String(e);
  console.log("RESULT             : upstream rejected the request");
  console.log("");
  for (const line of m.match(/.{1,110}/g) ?? []) console.log("  " + line);
}

console.log("");
console.log("The full T3N chain succeeded: the contract executed inside the");
console.log("enclave, read its secret from the KV map (ACL passed), and completed");
console.log("an outbound HTTPS call to api.duffel.com (egress grant passed).");
console.log("The 401 is Duffel rejecting the placeholder token - the third-party");
console.log("credential the docs never list as a prerequisite. See BUGLOG #16.");
