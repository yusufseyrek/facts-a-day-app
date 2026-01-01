#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');

const keyId = process.env.ASC_KEY_ID;
const issuerId = process.env.ASC_ISSUER_ID;
const keyPath = process.env.ASC_KEY_PATH;

if (!keyId || !issuerId || !keyPath) {
    console.error('Error: ASC_KEY_ID, ASC_ISSUER_ID, and ASC_KEY_PATH environment variables must be set.');
    process.exit(1);
}

let privateKey;
try {
    privateKey = fs.readFileSync(keyPath, 'utf8');
} catch (e) {
    console.error(`Error: Private key file not found at ${keyPath}`);
    process.exit(1);
}

// Base64url encode
function base64url(data) {
    return Buffer.from(data)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

const now = Math.floor(Date.now() / 1000);
const exp = now + 1200; // 20 minutes

// JWT Header
const header = {
    alg: 'ES256',
    kid: keyId,
    typ: 'JWT'
};

// JWT Payload
const payload = {
    iss: issuerId,
    iat: now,
    exp: exp,
    aud: 'appstoreconnect-v1'
};

// Encode header and payload
const headerB64 = base64url(JSON.stringify(header));
const payloadB64 = base64url(JSON.stringify(payload));
const signingInput = `${headerB64}.${payloadB64}`;

// Sign with ES256
const sign = crypto.createSign('SHA256');
sign.update(signingInput);
sign.end();

const signature = sign.sign({
    key: privateKey,
    dsaEncoding: 'ieee-p1363' // This gives us the raw R||S format needed for JWT
});

const signatureB64 = signature.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

// Output the complete JWT
console.log(`${signingInput}.${signatureB64}`);

