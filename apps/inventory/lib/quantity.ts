/** Format a decimal string without converting it to a floating-point number. */
export function formatQuantity(value: string): string {
  return value.includes(".")
    ? value.replace(/0+$/, "").replace(/\.$/, "")
    : value;
}
