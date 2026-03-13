const STORAGE_KEY = "solana-graph-explorer:address-labels";

export type AddressLabels = Record<string, string>;

export function loadAddressLabels(): AddressLabels {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AddressLabels;
  } catch {
    // ignore
  }
  return {};
}

export function saveAddressLabels(labels: AddressLabels): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(labels));
}
