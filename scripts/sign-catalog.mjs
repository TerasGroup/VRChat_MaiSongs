import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT_DIR = process.cwd();
const SONGS_JSON_PATH = path.join(ROOT_DIR, "songs.json");
const SONGS_SIG_PATH = path.join(ROOT_DIR, "songs.sig");

function handleGenerateKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  console.log("=== Generated Ed25519 Key Pair ===");
  console.log("Public Key (can be shared/committed if client needs it):\n" + publicKey);
  console.log("Private Key (set as secret VMC_CATALOG_PRIVATE_KEY_PEM in GitHub Actions; NEVER commit!):\n" + privateKey);
}

function handleVerify(publicKeyPemOrPath) {
  if (!fs.existsSync(SONGS_JSON_PATH)) {
    console.error("ERROR: songs.json not found.");
    process.exit(1);
  }
  if (!fs.existsSync(SONGS_SIG_PATH)) {
    console.error("ERROR: songs.sig not found.");
    process.exit(1);
  }

  let publicKeyPem = publicKeyPemOrPath;
  if (fs.existsSync(publicKeyPemOrPath)) {
    publicKeyPem = fs.readFileSync(publicKeyPemOrPath, "utf8");
  }

  const data = fs.readFileSync(SONGS_JSON_PATH);
  const sig = fs.readFileSync(SONGS_SIG_PATH);

  const verified = crypto.verify(null, data, publicKeyPem, sig);
  if (verified) {
    console.log("Signature verification PASSED: songs.sig matches songs.json.");
    process.exit(0);
  } else {
    console.error("Signature verification FAILED: songs.sig does not match songs.json.");
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--generate-keypair")) {
    handleGenerateKey();
    return;
  }
  const verifyIdx = args.indexOf("--verify");
  if (verifyIdx !== -1) {
    const keyArg = args[verifyIdx + 1];
    if (!keyArg) {
      console.error("ERROR: Missing public key path or PEM string for --verify.");
      process.exit(1);
    }
    handleVerify(keyArg);
    return;
  }

  const privateKeyPem = process.env.VMC_CATALOG_PRIVATE_KEY_PEM;
  if (!privateKeyPem) {
    console.log("INFO: VMC_CATALOG_PRIVATE_KEY_PEM secret is not configured. Skipping catalog signing.");
    process.exit(0);
  }

  if (!fs.existsSync(SONGS_JSON_PATH)) {
    console.error("ERROR: songs.json does not exist. Run 'npm run catalog' first.");
    process.exit(1);
  }

  try {
    const songsBytes = fs.readFileSync(SONGS_JSON_PATH);
    const signature = crypto.sign(null, songsBytes, privateKeyPem);
    fs.writeFileSync(SONGS_SIG_PATH, signature);
    console.log(`SUCCESS: songs.sig created successfully (${signature.length} bytes).`);
  } catch (err) {
    console.error("ERROR: Failed to sign songs.json:", err.message);
    process.exit(1);
  }
}

main();
