export function normalizarIdLead(value) {
  const raw = String(value || '')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .trim();

  const encontrado = raw.match(/EVS-[A-Z0-9]+/i);
  return String(encontrado?.[0] || raw).trim().toUpperCase();
}
