// Locale-aware formatting helpers (pt-BR / BRL).

export function formatBRL(value: number, opts?: { compact?: boolean }): string {
  if (opts?.compact) {
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (abs >= 1_000_000_000)
      return `${sign}R$ ${(abs / 1_000_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} bi`;
    if (abs >= 1_000_000)
      return `${sign}R$ ${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
    if (abs >= 1_000)
      return `${sign}R$ ${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
    return `${sign}R$ ${abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
  }
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function formatPercent(fraction: number, digits = 1): string {
  return `${(fraction * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export function formatMonth(iso: string): string {
  // "2026-06" -> "jun/26"
  const [y, m] = iso.split("-");
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const idx = Number(m) - 1;
  return `${months[idx] ?? m}/${y.slice(2)}`;
}
