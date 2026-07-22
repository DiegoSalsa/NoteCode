const EXTENSIONS_BY_MIME_TYPE: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "text/plain": ".txt",
};

function extensionFromOriginalName(fileName: string) {
  const match = fileName.trim().match(/(\.[a-zA-Z0-9]{1,10})$/);
  return match?.[1].toLowerCase() || "";
}

export function documentFileName(name: string, mimeType: string, originalName?: string) {
  const trimmedName = name.trim() || "documento";
  const extension = originalName
    ? extensionFromOriginalName(originalName) || EXTENSIONS_BY_MIME_TYPE[mimeType.toLowerCase()]
    : EXTENSIONS_BY_MIME_TYPE[mimeType.toLowerCase()];

  if (!extension || trimmedName.toLowerCase().endsWith(extension)) {
    return trimmedName;
  }

  return `${trimmedName}${extension}`;
}

export function attachmentContentDisposition(fileName: string) {
  const safeName = fileName.replace(/[\r\n]/g, " ").trim() || "documento";
  const asciiName = safeName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_");
  const encodedName = encodeURIComponent(safeName).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`;
}
