import { randomUUID } from "crypto";

type UploadInput = {
  bytes: Buffer;
  contentType: string;
  fileName: string;
};

type StoredFile = {
  bucket: string;
  path: string;
};

function getStorageConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_DOCUMENTS_BUCKET || "documents";

  if (!url || !serviceKey) return null;

  return {
    url: url.replace(/\/$/, ""),
    serviceKey,
    bucket,
  };
}

function storageHeaders(serviceKey: string, contentType?: string) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    ...(contentType ? { "Content-Type": contentType } : {}),
  };
}

function safeFileName(fileName: string) {
  return fileName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "document";
}

function bufferToArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

export function isDocumentStorageConfigured() {
  return Boolean(getStorageConfig());
}

export async function uploadDocumentFile({ bytes, contentType, fileName }: UploadInput): Promise<StoredFile | null> {
  const config = getStorageConfig();
  if (!config) return null;

  const path = `${new Date().getFullYear()}/${randomUUID()}-${safeFileName(fileName)}`;
  const response = await fetch(`${config.url}/storage/v1/object/${config.bucket}/${path}`, {
    method: "POST",
    headers: {
      ...storageHeaders(config.serviceKey, contentType || "application/octet-stream"),
      "x-upsert": "false",
    },
    body: new Blob([bufferToArrayBuffer(bytes)], { type: contentType || "application/octet-stream" }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`No se pudo subir el documento a Storage. ${details}`.trim());
  }

  return { bucket: config.bucket, path };
}

export async function downloadDocumentFile(file: StoredFile) {
  const config = getStorageConfig();
  if (!config) throw new Error("Storage no esta configurado.");

  const response = await fetch(`${config.url}/storage/v1/object/${file.bucket}/${file.path}`, {
    headers: storageHeaders(config.serviceKey),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`No se pudo descargar el documento desde Storage. ${details}`.trim());
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function deleteDocumentFile(file: StoredFile) {
  const config = getStorageConfig();
  if (!config) return;

  await fetch(`${config.url}/storage/v1/object/${file.bucket}/${file.path}`, {
    method: "DELETE",
    headers: storageHeaders(config.serviceKey, "application/json"),
  });
}
