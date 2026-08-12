// F2 — handshake + authentication. Prints the tenant DID read back from the
// authenticated session (never derived).
import { connect } from "./_session.ts";

console.log("=== F2: HANDSHAKE + AUTHENTICATION (T3N testnet) ===");
console.log("");

const { tenantDid, trustAnchor } = await connect();

console.log("Environment        : testnet");
console.log("Attestation        : ENABLED (trust anchor pinned)");
console.log("  expected_peer_ids :", trustAnchor.expected_peer_ids.length);
console.log("  rtmr3_allowlist   :", trustAnchor.rtmr3_allowlist.length);
console.log("Handshake          : OK");
console.log("");
console.log("Authenticated DID  :", tenantDid);
console.log("");
console.log("Note: trustAnchor is required by SDK 4.35.1 but is absent from the");
console.log("      documentation. Satisfied here via fetchTrustedManifest(),");
console.log("      so attestation verification stays ON. See BUGLOG #5.");
