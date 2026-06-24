/**
 * Generate the Expo Updates code-signing key pair + certificate.
 *
 * Uses @expo/code-signing-certificates (the same library expo-updates'
 * `codesigning:generate` and the native client validation use), so the cert has
 * the exact structure expo-updates accepts (self-signed, keyUsage:
 * digitalSignature, extKeyUsage: codeSigning, RSA-SHA256).
 *
 *   bun scripts/generate-codesigning.ts            # generate (refuses to clobber)
 *   bun scripts/generate-codesigning.ts --force    # rotate existing keys
 *
 * Writes to ./keys:
 *   codesigning-certificate.pem   PUBLIC — committed, embedded in the app build
 *                                 (app.json updates.codeSigningCertificate)
 *   codesigning-public-key.pem    PUBLIC — committed (reference)
 *   codesigning-private-key.pem   SECRET — gitignored; install on the BACKEND as
 *                                 OTA_CODE_SIGNING_PRIVATE_KEY (or a key file).
 *
 * After generating: keep the private key OFF the app servers; the update server
 * (facts-a-day-backend) signs each manifest with it.
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import {
  generateKeyPair,
  generateSelfSignedCodeSigningCertificate,
  convertKeyPairToPEM,
  convertCertificateToCertificatePEM,
  validateSelfSignedCertificate,
} from "@expo/code-signing-certificates";

const KEYS_DIR = join(import.meta.dir, "..", "keys");
const CERT_PATH = join(KEYS_DIR, "codesigning-certificate.pem");
const PUBKEY_PATH = join(KEYS_DIR, "codesigning-public-key.pem");
const PRIVKEY_PATH = join(KEYS_DIR, "codesigning-private-key.pem");

if (existsSync(CERT_PATH) && !process.argv.includes("--force")) {
  console.error(`Refusing to overwrite ${CERT_PATH}. Pass --force to rotate keys.`);
  console.error("Rotating invalidates every shipped build's embedded cert — only do this on a native release.");
  process.exit(1);
}

const keyPair = generateKeyPair();

// notBefore slightly in the past to tolerate device clock skew; 10-year validity.
const validityNotBefore = new Date();
validityNotBefore.setDate(validityNotBefore.getDate() - 1);
const validityNotAfter = new Date();
validityNotAfter.setFullYear(validityNotAfter.getFullYear() + 10);

const certificate = generateSelfSignedCodeSigningCertificate({
  keyPair,
  validityNotBefore,
  validityNotAfter,
  commonName: "Facts a Day OTA",
});

// Proves the cert + key are a usable expo-updates code-signing pair (self-signed,
// correct key/extKey usage, in validity). Throws otherwise.
validateSelfSignedCertificate(certificate, keyPair);

const { privateKeyPEM, publicKeyPEM } = convertKeyPairToPEM(keyPair);
const certificatePEM = convertCertificateToCertificatePEM(certificate);

mkdirSync(KEYS_DIR, { recursive: true });
writeFileSync(CERT_PATH, certificatePEM);
writeFileSync(PUBKEY_PATH, publicKeyPEM);
writeFileSync(PRIVKEY_PATH, privateKeyPEM, { mode: 0o600 });

console.log("✓ Code-signing material generated in ./keys");
console.log(`  - ${CERT_PATH}  (PUBLIC — commit; referenced by app.json)`);
console.log(`  - ${PUBKEY_PATH}  (PUBLIC — commit)`);
console.log(`  - ${PRIVKEY_PATH}  (SECRET — gitignored; install on the backend)`);
console.log("");
console.log("Backend: set OTA_CODE_SIGNING_PRIVATE_KEY to this PEM (or copy the");
console.log("file to facts-a-day-backend/keys/ota-codesigning-private-key.pem).");
