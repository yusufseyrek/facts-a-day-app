#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

const keyPath = process.env.GOOGLE_PLAY_JSON_KEY;

if (!keyPath) {
    console.error('Error: GOOGLE_PLAY_JSON_KEY environment variable must be set.');
    process.exit(1);
}

let credentials;
try {
    credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
} catch (e) {
    console.error(`Error: Could not read service account JSON from ${keyPath}`);
    process.exit(1);
}

const { client_email, private_key } = credentials;

if (!client_email || !private_key) {
    console.error('Error: Service account JSON missing client_email or private_key');
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
const exp = now + 3600; // 1 hour

// JWT Header
const header = {
    alg: 'RS256',
    typ: 'JWT'
};

// JWT Payload
const payload = {
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: exp
};

// Encode header and payload
const headerB64 = base64url(JSON.stringify(header));
const payloadB64 = base64url(JSON.stringify(payload));
const signingInput = `${headerB64}.${payloadB64}`;

// Sign with RS256
const sign = crypto.createSign('RSA-SHA256');
sign.update(signingInput);
sign.end();

const signature = sign.sign(private_key);
const signatureB64 = signature.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

const jwt = `${signingInput}.${signatureB64}`;

// Exchange JWT for access token
const postData = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`;

const options = {
    hostname: 'oauth2.googleapis.com',
    port: 443,
    path: '/token',
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
    }
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const response = JSON.parse(data);
            if (response.access_token) {
                console.log(response.access_token);
            } else {
                console.error('Error:', response.error_description || response.error || 'Unknown error');
                process.exit(1);
            }
        } catch (e) {
            console.error('Error parsing response:', data);
            process.exit(1);
        }
    });
});

req.on('error', (e) => {
    console.error('Request error:', e.message);
    process.exit(1);
});

req.write(postData);
req.end();

