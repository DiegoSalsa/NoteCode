const CODE_PATTERN = /^RF-(\d+)$/i;

export function parseRequirementNumber(code: string | null | undefined) {
  const match = code?.trim().match(CODE_PATTERN);
  if (!match) return 0;
  return Number.parseInt(match[1], 10) || 0;
}

export function formatRequirementCode(n: number) {
  return `RF-${String(Math.max(1, n)).padStart(2, "0")}`;
}

export function nextRequirementCode(existingCodes: Array<string | null | undefined>) {
  const max = existingCodes.reduce((highest, code) => Math.max(highest, parseRequirementNumber(code)), 0);
  return formatRequirementCode(max + 1);
}

export function compareRequirementCode(a: string, b: string) {
  return parseRequirementNumber(a) - parseRequirementNumber(b);
}
