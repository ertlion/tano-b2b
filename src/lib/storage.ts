import crypto from "crypto";
import { getConfigValues } from "./app-config";

// ─── Object Storage (S3-uyumlu: R2 / MinIO / S3) — Epic G ──────
// Bağımlılıksız: native fetch + AWS Signature V4 (PutObject).
// Config (admin panel / app_config → env): s3_endpoint, s3_region, s3_bucket,
// s3_access_key, s3_secret_key, s3_public_url

const KEYS = ["s3_endpoint", "s3_region", "s3_bucket", "s3_access_key", "s3_secret_key", "s3_public_url"];

export async function storageConfigured(): Promise<boolean> {
  const c = await getConfigValues(KEYS);
  return Boolean(c.s3_bucket && c.s3_access_key && c.s3_secret_key && (c.s3_endpoint || c.s3_region));
}

function sha256hex(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}
function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data).digest();
}

/**
 * Buffer'ı S3-uyumlu depoya yükle (SigV4 imzalı PUT), public URL döndür.
 */
export async function uploadBuffer(
  objectKey: string,
  body: Buffer,
  contentType = "image/png"
): Promise<string> {
  const c = await getConfigValues(KEYS);
  const bucket = c.s3_bucket!;
  const accessKey = c.s3_access_key!;
  const secretKey = c.s3_secret_key!;
  const region = c.s3_region || "auto";

  // Host & URL: endpoint varsa path-style (R2/MinIO), yoksa virtual-hosted S3.
  let host: string;
  let canonicalUri: string;
  let baseUrl: string;
  if (c.s3_endpoint) {
    const ep = new URL(c.s3_endpoint);
    host = ep.host;
    canonicalUri = `/${bucket}/${objectKey}`;
    baseUrl = `${ep.protocol}//${ep.host}`;
  } else {
    host = `${bucket}.s3.${region}.amazonaws.com`;
    canonicalUri = `/${objectKey}`;
    baseUrl = `https://${host}`;
  }

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256hex(body);

  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-acl:public-read\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-acl;x-amz-content-sha256;x-amz-date";

  // URI encode (path segment'leri korunarak)
  const encodedUri = canonicalUri
    .split("/")
    .map((s) => encodeURIComponent(s).replace(/%2F/g, "/"))
    .join("/");

  const canonicalRequest = [
    "PUT",
    encodedUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");

  const kDate = hmac("AWS4" + secretKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`${baseUrl}${encodedUri}`, {
    method: "PUT",
    headers: {
      Host: host,
      "x-amz-acl": "public-read",
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: authorization,
      "Content-Type": contentType,
      "Content-Length": String(body.length),
    },
    body: new Uint8Array(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`S3 upload ${res.status}: ${err.slice(0, 200)}`);
  }

  if (c.s3_public_url) return `${c.s3_public_url.replace(/\/$/, "")}/${objectKey}`;
  if (c.s3_endpoint) return `${baseUrl}/${bucket}/${objectKey}`;
  return `${baseUrl}/${objectKey}`;
}
