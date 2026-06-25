// Locale/currency defaults. Kept inline (no BRAND import) so this stays a
// zero-dependency util; callers can pass an explicit currency.
const LOCALE = "ro-RO";
const DEFAULT_CURRENCY = "RON";

export function formatCurrency(amount: number | null | undefined, currency: string = DEFAULT_CURRENCY): string {
    const value = Number(amount);
    if (!Number.isFinite(value)) return "";
    return new Intl.NumberFormat(LOCALE, {
        style: "currency",
        currency: currency || DEFAULT_CURRENCY,
        maximumFractionDigits: 2,
    }).format(value);
}
