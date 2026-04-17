export const DEFAULT_EXPENSE_CATEGORIES = [
  ["Housing", "#9d6143"],
  ["Groceries", "#2c7a64"],
  ["Dining Out", "#b27b22"],
  ["Utilities", "#6b7a99"],
  ["Transport", "#875a85"],
  ["Insurance", "#5d7b8e"],
  ["Kids and Family", "#d16d66"],
  ["Shopping", "#8d6a55"],
  ["Subscriptions", "#7d6e55"],
  ["Medical", "#b24d48"],
  ["Travel", "#3d7fa3"],
  ["Other", "#6f6258"]
] as const;

export const DEFAULT_INCOME_CATEGORIES = [
  ["Helm Income", "#2c7a64"],
  ["June Income", "#4f9d84"],
  ["Side Income", "#5d7b8e"],
  ["Refunds", "#a35d3d"],
  ["Other Income", "#6f6258"]
] as const;

export const DATE_RANGES = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "365", label: "Last year", days: 365 },
  { key: "all", label: "All time", days: null }
] as const;
