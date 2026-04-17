import { Bill, Category, DashboardPayload, Debt, NetWorthAccount, SinkingFund, Subscription, TransactionRecord } from "@/lib/types";

export function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value || 0);
}

export function compactCurrency(value: number) {
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }
  return currency(value);
}

export function toDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(toDate(value));
}

export function weekStart(input: Date) {
  const value = new Date(input);
  const day = value.getDay();
  const diff = value.getDate() - day + (day === 0 ? -6 : 1);
  value.setDate(diff);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function monthKey(value: string) {
  const date = toDate(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function isWithinRange(dateValue: string, rangeDays: number | null, from?: string, to?: string) {
  const date = toDate(dateValue);
  if (from && date < toDate(from)) return false;
  if (to && date > toDate(to)) return false;
  if (rangeDays === null) return true;
  const floor = new Date();
  floor.setDate(floor.getDate() - rangeDays);
  floor.setHours(0, 0, 0, 0);
  return date >= floor;
}

export function summarizeDashboard(
  payload: DashboardPayload,
  options: {
    rangeDays: number | null;
    from?: string;
    to?: string;
    categoryId?: string;
  }
) {
  const transactions = payload.transactions.filter((row) => {
    if (options.categoryId && row.category_id !== options.categoryId) return false;
    return isWithinRange(row.transaction_date, options.rangeDays, options.from, options.to);
  });

  const income = transactions.filter((row) => row.type === "income").reduce((sum, row) => sum + row.amount, 0);
  const expenses = transactions.filter((row) => row.type === "expense").reduce((sum, row) => sum + row.amount, 0);
  const net = income - expenses;
  const monthlyTotals = getMonthlyTotals(payload.transactions);
  const weeklyTotals = getWeeklyTotals(payload.transactions);
  const spendingByCategory = getSpendingByCategory(transactions, payload.categories);
  const currentMonthCategoryBudget = getCurrentMonthBudgetBreakdown(payload.transactions, payload.categories);
  const unpaidBills = payload.bills.filter((bill) => bill.status === "unpaid");
  const upcomingBills = unpaidBills
    .filter((bill) => toDate(bill.due_date) >= weekStart(new Date()))
    .sort((a, b) => toDate(a.due_date).getTime() - toDate(b.due_date).getTime())
    .slice(0, 6);
  const savingsProgress = payload.savingsGoals.map((goal) => ({
    ...goal,
    ratio: goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0
  }));
  const activeSubscriptions = payload.subscriptions.filter((subscription) => subscription.active);
  const overspendingAlerts = currentMonthCategoryBudget.filter((item) => item.budget > 0 && item.actual > item.budget);
  const cashBalance = payload.cashAccounts.reduce((sum, account) => sum + account.current_balance, 0);
  const netWorth = getNetWorth(payload.netWorthAccounts, payload.debts);
  const sinkingProgress = payload.sinkingFunds.map((fund) => ({
    ...fund,
    ratio: fund.target_amount > 0 ? (fund.current_amount / fund.target_amount) * 100 : 0
  }));

  return {
    transactions,
    income,
    expenses,
    net,
    monthlyTotals,
    weeklyTotals,
    spendingByCategory,
    currentMonthCategoryBudget,
    unpaidBills,
    upcomingBills,
    savingsProgress,
    activeSubscriptions,
    overspendingAlerts,
    cashBalance,
    netWorth,
    sinkingProgress
  };
}

export function getMonthlyTotals(rows: TransactionRecord[]) {
  const buckets = new Map<string, { key: string; income: number; expense: number }>();
  rows.forEach((row) => {
    const key = monthKey(row.transaction_date);
    const existing = buckets.get(key) ?? { key, income: 0, expense: 0 };
    if (row.type === "income") existing.income += row.amount;
    if (row.type === "expense") existing.expense += row.amount;
    buckets.set(key, existing);
  });
  return Array.from(buckets.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-6);
}

export function getWeeklyTotals(rows: TransactionRecord[]) {
  const buckets = new Map<string, { key: string; income: number; expense: number }>();
  rows.forEach((row) => {
    const date = weekStart(toDate(row.transaction_date));
    const key = date.toISOString().slice(0, 10);
    const existing = buckets.get(key) ?? { key, income: 0, expense: 0 };
    if (row.type === "income") existing.income += row.amount;
    if (row.type === "expense") existing.expense += row.amount;
    buckets.set(key, existing);
  });
  return Array.from(buckets.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-6);
}

export function getSpendingByCategory(rows: TransactionRecord[], categories: Category[]) {
  const lookup = new Map(categories.map((item) => [item.id, item]));
  const grouped = new Map<string, { label: string; value: number; color: string }>();
  rows
    .filter((row) => row.type === "expense")
    .forEach((row) => {
      const category = row.category_id ? lookup.get(row.category_id) : null;
      const label = category?.name ?? "Uncategorized";
      const current = grouped.get(label) ?? { label, value: 0, color: category?.color ?? "#6f6258" };
      current.value += row.amount;
      grouped.set(label, current);
    });

  return Array.from(grouped.values()).sort((a, b) => b.value - a.value);
}

export function getCurrentMonthBudgetBreakdown(rows: TransactionRecord[], categories: Category[]) {
  const now = new Date();
  const totals = new Map<string, number>();
  rows
    .filter((row) => row.type === "expense")
    .forEach((row) => {
      const date = toDate(row.transaction_date);
      if (date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear()) return;
      totals.set(row.category_id ?? "uncategorized", (totals.get(row.category_id ?? "uncategorized") ?? 0) + row.amount);
    });

  return categories
    .filter((item) => item.kind === "expense")
    .map((category) => {
      const actual = totals.get(category.id) ?? 0;
      return {
        category,
        budget: category.monthly_budget,
        actual,
        ratio: category.monthly_budget > 0 ? (actual / category.monthly_budget) * 100 : 0
      };
    })
    .sort((a, b) => b.actual - a.actual);
}

export function getNetWorth(accounts: NetWorthAccount[], debts: Debt[]) {
  const assets = accounts.filter((account) => account.account_type === "asset").reduce((sum, account) => sum + account.current_balance, 0);
  const liabilities =
    accounts.filter((account) => account.account_type === "liability").reduce((sum, account) => sum + account.current_balance, 0) +
    debts.reduce((sum, debt) => sum + debt.current_balance, 0);
  return { assets, liabilities, net: assets - liabilities };
}

export function billStatusTone(bill: Bill) {
  if (bill.status === "paid") return "good";
  return toDate(bill.due_date) < new Date() ? "danger" : "warning";
}

export function debtProgress(debt: Debt) {
  if (debt.target_payment <= 0) return 0;
  return Math.min((debt.target_payment / Math.max(debt.minimum_payment, debt.target_payment)) * 100, 100);
}

export function sinkingFundProgress(fund: SinkingFund) {
  if (fund.target_amount <= 0) return 0;
  return Math.min((fund.current_amount / fund.target_amount) * 100, 100);
}

export function downloadCsv(rows: TransactionRecord[]) {
  const headers = ["date", "merchant", "type", "category", "amount", "notes", "entered_by"];
  const csvRows = rows.map((row) =>
    [
      row.transaction_date,
      row.merchant,
      row.type,
      row.categories?.name ?? "",
      row.amount.toFixed(2),
      row.notes ?? "",
      row.entered_by_profile?.full_name ?? row.entered_by
    ]
      .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
      .join(",")
  );
  const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "helm-june-finance-export.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
