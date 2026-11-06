export function formatLKR(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `Rs ${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}