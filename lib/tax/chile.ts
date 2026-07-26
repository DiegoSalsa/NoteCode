export function cleanRut(value: string) {
  return value.replace(/[^0-9kK]/g, "").toUpperCase();
}

export function isValidChileanRut(value: string) {
  const rut = cleanRut(value);
  if (rut.length < 2) return false;

  const body = rut.slice(0, -1);
  const verifier = rut.slice(-1);
  if (!/^\d+$/.test(body)) return false;

  let sum = 0;
  let multiplier = 2;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  const expected = remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);
  return verifier === expected;
}

export function formatChileanRut(value: string) {
  const rut = cleanRut(value);
  if (rut.length < 2) return value.trim();

  const body = rut.slice(0, -1);
  const verifier = rut.slice(-1);
  const grouped = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped}-${verifier}`;
}
