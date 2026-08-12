// F3 — register the compiled TEE contract and print the allocated contract id.
import { connect, registerBumping, WASM_PATH } from "./_session.ts";

console.log("=== F3: TEE CONTRACT REGISTRATION ===");
console.log("");

const { tenant, tenantDid } = await connect();
console.log("Authenticated DID  :", tenantDid);
console.log("WASM artifact      :", WASM_PATH);
console.log("");

const r = await registerBumping(tenant);

console.log("Artifact size      :", r.size, "bytes");
console.log("Registered version :", r.version);
console.log("Canonical name     :", r.name);
console.log("Contract id        :", r.contract_id);
console.log("");
console.log("Note: every re-registration allocates a NEW contract id, while the");
console.log("      secrets map ACL keeps the old one. Observed across this test");
console.log("      run: 598 -> 599 -> 600 -> 601 -> 602 -> ... See BUGLOG #14.");
