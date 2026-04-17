"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DATE_RANGES } from "@/lib/constants";
import { Bill, CashAccount, Category, Debt, Household, Membership, NetWorthAccount, SavingsGoal, SinkingFund, Subscription, TransactionRecord } from "@/lib/types";
import { billStatusTone, compactCurrency, currency, dateLabel, debtProgress, downloadCsv, summarizeDashboard, sinkingFundProgress, todayIso } from "@/lib/utils";

type DashboardData = {
  household: Household;
  membership: Membership;
  members: Membership[];
  categories: Category[];
  transactions: TransactionRecord[];
  bills: Bill[];
  savingsGoals: SavingsGoal[];
  subscriptions: Subscription[];
  cashAccounts: CashAccount[];
  netWorthAccounts: NetWorthAccount[];
  debts: Debt[];
  sinkingFunds: SinkingFund[];
};

type Props = {
  initialData: DashboardData;
  userEmail: string;
};

type TransactionFormState = {
  id?: string;
  transaction_date: string;
  merchant: string;
  type: "income" | "expense";
  category_id: string;
  amount: string;
  notes: string;
  cash_account_id: string;
  receipt?: File | null;
};

const defaultTransactionState = (categories: Category[]): TransactionFormState => ({
  transaction_date: todayIso(),
  merchant: "",
  type: "expense",
  category_id: categories.find((item) => item.kind === "expense")?.id ?? "",
  amount: "",
  notes: "",
  cash_account_id: "",
  receipt: null
});

export function DashboardApp({ initialData, userEmail }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [data, setData] = useState(initialData);
  const [range, setRange] = useState<(typeof DATE_RANGES)[number]["key"]>("30");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [transactionForm, setTransactionForm] = useState<TransactionFormState>(defaultTransactionState(initialData.categories));
  const [billForm, setBillForm] = useState({ name: "", amount: "", due_date: todayIso(), cadence: "monthly", status: "unpaid", category_id: "", notes: "", autopay: false, id: "" });
  const [categoryForm, setCategoryForm] = useState({ name: "", kind: "expense", monthly_budget: "", color: "#a35d3d", id: "" });
  const [goalForm, setGoalForm] = useState({ name: "", current_amount: "", target_amount: "", due_date: "", id: "" });
  const [subscriptionForm, setSubscriptionForm] = useState({ name: "", amount: "", billing_cycle: "monthly", next_charge_date: "", active: true, id: "" });
  const [cashForm, setCashForm] = useState({ name: "", current_balance: "", id: "" });
  const [netWorthForm, setNetWorthForm] = useState({ name: "", account_type: "asset", current_balance: "", id: "" });
  const [debtForm, setDebtForm] = useState({ name: "", current_balance: "", interest_rate: "", minimum_payment: "", target_payment: "", id: "" });
  const [sinkingForm, setSinkingForm] = useState({ name: "", current_amount: "", target_amount: "", target_date: "", id: "" });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const rangeDays = DATE_RANGES.find((item) => item.key === range)?.days ?? 30;
    return summarizeDashboard(
      {
        household: data.household,
        membership: data.membership,
        categories: data.categories,
        transactions: data.transactions,
        bills: data.bills,
        savingsGoals: data.savingsGoals,
        subscriptions: data.subscriptions,
        cashAccounts: data.cashAccounts,
        netWorthAccounts: data.netWorthAccounts,
        debts: data.debts,
        sinkingFunds: data.sinkingFunds
      },
      { rangeDays, from: fromDate || undefined, to: toDate || undefined, categoryId: categoryId || undefined }
    );
  }, [categoryId, data, fromDate, range, toDate]);

  async function refreshAll() {
    const householdId = data.household.id;
    const [
      categoriesResult,
      membersResult,
      transactionsResult,
      billsResult,
      goalsResult,
      subscriptionsResult,
      cashResult,
      netWorthResult,
      debtsResult,
      sinkingResult,
      householdResult
    ] = await Promise.all([
      supabase.from("categories").select("*").eq("household_id", householdId).order("kind").order("name"),
      supabase.from("household_members").select("*").eq("household_id", householdId).order("created_at"),
      supabase
        .from("transactions")
        .select("*, categories(*), entered_by_profile:profiles!transactions_entered_by_fkey(user_id, full_name)")
        .eq("household_id", householdId)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("bills").select("*, categories(*)").eq("household_id", householdId).order("due_date"),
      supabase.from("savings_goals").select("*").eq("household_id", householdId).order("created_at"),
      supabase.from("subscriptions").select("*").eq("household_id", householdId).order("name"),
      supabase.from("cash_accounts").select("*").eq("household_id", householdId).order("name"),
      supabase.from("net_worth_accounts").select("*").eq("household_id", householdId).order("account_type"),
      supabase.from("debts").select("*").eq("household_id", householdId).order("name"),
      supabase.from("sinking_funds").select("*").eq("household_id", householdId).order("name"),
      supabase.from("households").select("*").eq("id", householdId).single()
    ]);

    setData((current) => ({
      ...current,
      household: householdResult.data ?? current.household,
      categories: categoriesResult.data ?? [],
      members: membersResult.data ?? [],
      transactions: transactionsResult.data ?? [],
      bills: billsResult.data ?? [],
      savingsGoals: goalsResult.data ?? [],
      subscriptions: subscriptionsResult.data ?? [],
      cashAccounts: cashResult.data ?? [],
      netWorthAccounts: netWorthResult.data ?? [],
      debts: debtsResult.data ?? [],
      sinkingFunds: sinkingResult.data ?? []
    }));
  }

  async function runAction(action: () => Promise<void>, success: string) {
    setStatusMessage(null);
    startTransition(async () => {
      try {
        await action();
        await refreshAll();
        setStatusMessage(success);
        router.refresh();
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "Something went wrong.");
      }
    });
  }

  async function handleTransactionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      let receiptUrl: string | null = data.transactions.find((item) => item.id === transactionForm.id)?.receipt_url ?? null;
      if (transactionForm.receipt) {
        const ext = transactionForm.receipt.name.split(".").pop() || "jpg";
        const path = `${data.household.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("receipts").upload(path, transactionForm.receipt, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: publicUrl } = supabase.storage.from("receipts").getPublicUrl(path);
        receiptUrl = publicUrl.publicUrl;
      }

      const payload = {
        household_id: data.household.id,
        entered_by: data.transactions.find((item) => item.id === transactionForm.id)?.entered_by ?? data.membership.user_id,
        transaction_date: transactionForm.transaction_date,
        merchant: transactionForm.merchant,
        type: transactionForm.type,
        category_id: transactionForm.category_id || null,
        amount: Number(transactionForm.amount),
        notes: transactionForm.notes || null,
        cash_account_id: transactionForm.cash_account_id || null,
        receipt_url: receiptUrl
      };

      if (transactionForm.id) {
        const { error } = await supabase.from("transactions").update(payload).eq("id", transactionForm.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("transactions").insert(payload);
        if (error) throw error;
      }

      setTransactionForm(defaultTransactionState(data.categories));
    }, transactionForm.id ? "Transaction updated." : "Transaction saved.");
  }

  async function deleteRow(table: string, id: string, label: string) {
    await runAction(async () => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    }, `${label} deleted.`);
  }

  async function handleBillSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      const payload = {
        household_id: data.household.id,
        entered_by: data.bills.find((item) => item.id === billForm.id)?.entered_by ?? data.membership.user_id,
        name: billForm.name,
        amount: Number(billForm.amount),
        due_date: billForm.due_date,
        cadence: billForm.cadence,
        status: billForm.status,
        category_id: billForm.category_id || null,
        notes: billForm.notes || null,
        autopay: billForm.autopay
      };

      const query = billForm.id ? supabase.from("bills").update(payload).eq("id", billForm.id) : supabase.from("bills").insert(payload);
      const { error } = await query;
      if (error) throw error;
      setBillForm({ name: "", amount: "", due_date: todayIso(), cadence: "monthly", status: "unpaid", category_id: "", notes: "", autopay: false, id: "" });
    }, billForm.id ? "Bill updated." : "Bill saved.");
  }

  async function handleCategorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      const payload = {
        household_id: data.household.id,
        name: categoryForm.name,
        kind: categoryForm.kind,
        monthly_budget: Number(categoryForm.monthly_budget || 0),
        color: categoryForm.color
      };
      const query = categoryForm.id ? supabase.from("categories").update(payload).eq("id", categoryForm.id) : supabase.from("categories").insert(payload);
      const { error } = await query;
      if (error) throw error;
      setCategoryForm({ name: "", kind: "expense", monthly_budget: "", color: "#a35d3d", id: "" });
      setTransactionForm(defaultTransactionState(data.categories));
    }, categoryForm.id ? "Category updated." : "Category saved.");
  }

  async function handleSimpleSubmit<T extends Record<string, unknown>>(
    event: FormEvent<HTMLFormElement>,
    table: string,
    form: T & { id?: string },
    setForm: (value: T) => void,
    empty: T,
    success: string,
    mapPayload: (value: Omit<T, "id">) => Record<string, unknown>
  ) {
    event.preventDefault();
    await runAction(async () => {
      const { id, ...rest } = form;
      const payload = { ...mapPayload(rest as Omit<T, "id">), household_id: data.household.id };
      const query = id ? supabase.from(table).update(payload).eq("id", id) : supabase.from(table).insert(payload);
      const { error } = await query;
      if (error) throw error;
      setForm(empty);
    }, success);
  }

  async function updateHousehold(details: Partial<Household>) {
    await runAction(async () => {
      const { error } = await supabase.from("households").update(details).eq("id", data.household.id);
      if (error) throw error;
    }, "Household settings updated.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/auth/login");
    router.refresh();
  }

  const expenseCategories = data.categories.filter((item) => item.kind === "expense");
  const incomeCategories = data.categories.filter((item) => item.kind === "income");
  const transactionCategories = transactionForm.type === "income" ? incomeCategories : expenseCategories;
  const maxCategorySpend = Math.max(1, ...filtered.spendingByCategory.map((item) => item.value));
  const maxMonthly = Math.max(1, ...filtered.monthlyTotals.flatMap((item) => [item.income, item.expense]));
  const emergencyGoal = data.savingsGoals.find((goal) => goal.name.toLowerCase().includes("emergency"));

  return (
    <main className="page">
      <div className="shell">
        <section className="hero">
          <div className="panel hero-main">
            <div className="eyebrow">Household money dashboard</div>
            <h1>{data.household.name}</h1>
            <p className="hero-sub">{data.household.tagline || "Shared finance tracking for the household."}</p>
            <div className="hero-actions">
              <button className="btn btn-primary" type="button" onClick={() => document.getElementById("transaction-form")?.scrollIntoView({ behavior: "smooth" })}>
                Add transaction
              </button>
              <button className="btn btn-soft" type="button" onClick={() => downloadCsv(filtered.transactions)}>
                Export CSV
              </button>
              <button className="btn btn-soft" type="button" onClick={signOut}>
                Sign out
              </button>
            </div>
            <div className="invite-banner">
              <strong>Invite code:</strong> <span>{data.household.invite_code}</span>
              <span className="helper">Use this when the second family member joins the shared account.</span>
            </div>
          </div>

          <aside className="panel hero-side">
            <div className="mini-stat">
              <div className="mini-stat-label">Monthly net</div>
              <div className="mini-stat-value">{currency(filtered.net)}</div>
              <div className="mini-stat-note">Auto recalculated from saved income and expenses.</div>
            </div>
            <div className="mini-stat">
              <div className="mini-stat-label">Emergency fund</div>
              <div className="mini-stat-value">
                {emergencyGoal ? `${Math.round((emergencyGoal.current_amount / Math.max(emergencyGoal.target_amount, 1)) * 100)}%` : "Set goal"}
              </div>
              <div className="mini-stat-note">
                {emergencyGoal ? `${currency(emergencyGoal.current_amount)} of ${currency(emergencyGoal.target_amount)}` : "Track savings progress here."}
              </div>
            </div>
            <div className="mini-stat">
              <div className="mini-stat-label">Manual cash balance</div>
              <div className="mini-stat-value">{currency(filtered.cashBalance)}</div>
              <div className="mini-stat-note">Combined across all cash trackers.</div>
            </div>
          </aside>
        </section>

        <section className="topbar panel card">
          <div>
            <h2 className="section-title">Live filters</h2>
            <p className="section-copy">Weekly totals, monthly totals, category breakdowns, bills, and dashboard cards update together.</p>
          </div>
          <div className="filters">
            <div className="pill-group">
              {DATE_RANGES.map((item) => (
                <button key={item.key} className={`pill ${range === item.key ? "active" : ""}`} type="button" onClick={() => setRange(item.key)}>
                  {item.label}
                </button>
              ))}
            </div>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">All categories</option>
              {data.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </div>
        </section>

        {statusMessage ? <p className="status-banner">{statusMessage}</p> : null}

        <section className="grid-cards">
          <StatCard label="Income in view" value={currency(filtered.income)} note={`${filtered.transactions.filter((row) => row.type === "income").length} income entries`} />
          <StatCard label="Expenses in view" value={currency(filtered.expenses)} note={`${filtered.transactions.filter((row) => row.type === "expense").length} expense entries`} />
          <StatCard label="Weekly net total" value={currency((filtered.weeklyTotals.at(-1)?.income ?? 0) - (filtered.weeklyTotals.at(-1)?.expense ?? 0))} note="Latest weekly bucket" />
          <StatCard label="Net worth" value={currency(filtered.netWorth.net)} note={`${currency(filtered.netWorth.assets)} assets minus ${currency(filtered.netWorth.liabilities)} liabilities`} />
        </section>

        <section className="layout">
          <div className="stack">
            <div className="panel card">
              <div className="section-head">
                <div>
                  <h2 className="section-title">Budget snapshot</h2>
                  <p className="section-copy">Category budgets vs actual spending for the current month.</p>
                </div>
              </div>
              <div className="budget-list">
                {filtered.currentMonthCategoryBudget.map((item) => (
                  <div key={item.category.id} className="budget-row">
                    <div className="budget-top">
                      <div>
                        <div className="budget-name">{item.category.name}</div>
                        <div className="budget-meta">
                          {currency(item.actual)} spent of {currency(item.budget)} planned
                        </div>
                      </div>
                      <div className="budget-name">{Math.round(item.ratio)}%</div>
                    </div>
                    <div className="track">
                      <div className={`fill ${item.actual > item.budget ? "danger" : item.actual > item.budget * 0.85 ? "warning" : "good"}`} style={{ width: `${Math.min(item.ratio, 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel card">
              <div className="section-head">
                <div>
                  <h2 className="section-title">Monthly trend</h2>
                  <p className="section-copy">Six recent month buckets grouped from household transaction history.</p>
                </div>
              </div>
              <div className="trend-chart">
                {filtered.monthlyTotals.map((bucket) => (
                  <div key={bucket.key} className="trend-bar-wrap">
                    <div className="trend-bar-stack">
                      <div className="trend-bar trend-income" style={{ height: `${Math.max((bucket.income / maxMonthly) * 180, 10)}px` }} />
                      <div className="trend-bar trend-expense" style={{ height: `${Math.max((bucket.expense / maxMonthly) * 180, 10)}px` }} />
                    </div>
                    <div className="trend-label">{bucket.key.slice(5)}</div>
                    <div className="trend-values">
                      In {compactCurrency(bucket.income)}
                      <br />
                      Out {compactCurrency(bucket.expense)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel card">
              <div className="section-head">
                <div>
                  <h2 className="section-title">Spending by category</h2>
                  <p className="section-copy">Category breakdown of filtered expense activity.</p>
                </div>
              </div>
              <div className="goal-list">
                {filtered.spendingByCategory.map((item) => (
                  <div key={item.label} className="goal-item">
                    <div className="goal-top">
                      <div>
                        <div className="goal-name">{item.label}</div>
                        <div className="goal-meta">{currency(item.value)}</div>
                      </div>
                      <div className="badge">{Math.round((item.value / maxCategorySpend) * 100)}%</div>
                    </div>
                    <div className="track">
                      <div className="fill" style={{ width: `${Math.max((item.value / maxCategorySpend) * 100, 4)}%`, background: `linear-gradient(90deg, ${item.color} 0%, rgba(255,255,255,0.9) 180%)` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="stack">
            <div className="panel card">
              <div className="section-head">
                <div>
                  <h2 className="section-title">Bills and alerts</h2>
                  <p className="section-copy">Recurring bills, upcoming due dates, and overspending warnings.</p>
                </div>
              </div>
              <div className="insight-list">
                {filtered.upcomingBills.map((bill) => (
                  <div key={bill.id} className="insight-item">
                    <strong>{bill.name}</strong>
                    <p>
                      {currency(bill.amount)} due {dateLabel(bill.due_date)} - {bill.status}
                    </p>
                  </div>
                ))}
                {filtered.overspendingAlerts.map((alert) => (
                  <div key={alert.category.id} className="insight-item">
                    <strong>{alert.category.name} is over budget</strong>
                    <p>
                      {currency(alert.actual)} spent vs {currency(alert.budget)} budgeted this month.
                    </p>
                  </div>
                ))}
                {!filtered.upcomingBills.length && !filtered.overspendingAlerts.length ? (
                  <div className="insight-item">
                    <strong>No urgent alerts</strong>
                    <p>Upcoming bills and overspending alerts will show up here automatically.</p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="panel card">
              <div className="section-head">
                <div>
                  <h2 className="section-title">Savings, subscriptions, and funds</h2>
                  <p className="section-copy">Track goals, subscriptions, and planned sinking funds together.</p>
                </div>
              </div>
              <div className="goal-list">
                {filtered.savingsProgress.map((goal) => (
                  <ProgressCard key={goal.id} title={goal.name} subtitle={`${currency(goal.current_amount)} of ${currency(goal.target_amount)}`} progress={goal.ratio} tone="good" />
                ))}
                {filtered.sinkingProgress.map((fund) => (
                  <ProgressCard key={fund.id} title={`Sinking fund: ${fund.name}`} subtitle={`${currency(fund.current_amount)} of ${currency(fund.target_amount)}`} progress={fund.ratio} tone="warning" />
                ))}
                {filtered.activeSubscriptions.map((subscription) => (
                  <div key={subscription.id} className="goal-item">
                    <div className="goal-top">
                      <div>
                        <div className="goal-name">{subscription.name}</div>
                        <div className="goal-meta">
                          {currency(subscription.amount)} / {subscription.billing_cycle}
                        </div>
                      </div>
                      <div className="badge">Active</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="columns-2">
          <div className="panel composer" id="transaction-form">
            <div className="section-head">
              <div>
                <h2 className="section-title">{transactionForm.id ? "Edit transaction" : "Add income or expense"}</h2>
                <p className="section-copy">Each transaction stores notes, who entered it, date, category, optional cash account, and optional receipt photo.</p>
              </div>
            </div>
            <form onSubmit={handleTransactionSubmit}>
              <div className="form-grid">
                <LabeledInput label="Date">
                  <input type="date" value={transactionForm.transaction_date} onChange={(event) => setTransactionForm((current) => ({ ...current, transaction_date: event.target.value }))} required />
                </LabeledInput>
                <LabeledInput label="Type">
                  <select
                    value={transactionForm.type}
                    onChange={(event) => {
                      const nextType = event.target.value as "income" | "expense";
                      setTransactionForm((current) => ({
                        ...current,
                        type: nextType,
                        category_id: data.categories.find((item) => item.kind === nextType)?.id ?? ""
                      }));
                    }}
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </LabeledInput>
                <LabeledInput label="Category">
                  <select value={transactionForm.category_id} onChange={(event) => setTransactionForm((current) => ({ ...current, category_id: event.target.value }))} required>
                    {transactionCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </LabeledInput>
                <LabeledInput label="Amount">
                  <input type="number" min="0" step="0.01" value={transactionForm.amount} onChange={(event) => setTransactionForm((current) => ({ ...current, amount: event.target.value }))} required />
                </LabeledInput>
                <LabeledInput label="Merchant / description" full>
                  <input value={transactionForm.merchant} onChange={(event) => setTransactionForm((current) => ({ ...current, merchant: event.target.value }))} required />
                </LabeledInput>
                <LabeledInput label="Notes" full>
                  <textarea value={transactionForm.notes} onChange={(event) => setTransactionForm((current) => ({ ...current, notes: event.target.value }))} />
                </LabeledInput>
                <LabeledInput label="Cash account">
                  <select value={transactionForm.cash_account_id} onChange={(event) => setTransactionForm((current) => ({ ...current, cash_account_id: event.target.value }))}>
                    <option value="">Not cash</option>
                    {data.cashAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </LabeledInput>
                <LabeledInput label="Receipt photo">
                  <input type="file" accept="image/*" onChange={(event) => setTransactionForm((current) => ({ ...current, receipt: event.target.files?.[0] ?? null }))} />
                </LabeledInput>
              </div>
              <div className="hero-actions">
                <button className="btn btn-accent" type="submit" disabled={isPending}>
                  {isPending ? "Saving..." : transactionForm.id ? "Update transaction" : "Save transaction"}
                </button>
                {transactionForm.id ? (
                  <button className="btn btn-soft" type="button" onClick={() => setTransactionForm(defaultTransactionState(data.categories))}>
                    Cancel edit
                  </button>
                ) : null}
              </div>
            </form>
          </div>

          <div className="stack">
            <HouseholdSettings household={data.household} userEmail={userEmail} onSave={updateHousehold} />
            <SimpleCard title="Cash tracker" copy="Track manual cash balances like wallet, envelopes, or petty cash.">
              <form
                onSubmit={(event) =>
                  handleSimpleSubmit(
                    event,
                    "cash_accounts",
                    cashForm,
                    setCashForm,
                    { name: "", current_balance: "", id: "" },
                    cashForm.id ? "Cash account updated." : "Cash account saved.",
                    (value) => ({
                      name: value.name,
                      current_balance: Number(value.current_balance)
                    })
                  )
                }
              >
                <div className="form-grid">
                  <LabeledInput label="Name">
                    <input value={cashForm.name} onChange={(event) => setCashForm((current) => ({ ...current, name: event.target.value }))} required />
                  </LabeledInput>
                  <LabeledInput label="Balance">
                    <input type="number" step="0.01" value={cashForm.current_balance} onChange={(event) => setCashForm((current) => ({ ...current, current_balance: event.target.value }))} required />
                  </LabeledInput>
                </div>
                <button className="btn btn-soft" type="submit">{cashForm.id ? "Update cash account" : "Add cash account"}</button>
              </form>
            </SimpleCard>
          </div>
        </section>

        <section className="panel card">
          <div className="transactions-head">
            <div>
              <h2 className="section-title">Transaction log</h2>
              <p className="section-copy">Filterable shared ledger with who entered each transaction and optional receipt links.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Entered by</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Notes</th>
                  <th>Receipt</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.transactions.map((row) => (
                  <tr key={row.id}>
                    <td>{dateLabel(row.transaction_date)}</td>
                    <td>{row.merchant}</td>
                    <td>{row.categories?.name ?? "Uncategorized"}</td>
                    <td>{row.entered_by_profile?.full_name ?? "Unknown"}</td>
                    <td>
                      <span className={`type-pill ${row.type === "income" ? "type-income" : "type-expense"}`}>{row.type}</span>
                    </td>
                    <td>{currency(row.amount)}</td>
                    <td>{row.notes || "-"}</td>
                    <td>{row.receipt_url ? <a href={row.receipt_url} target="_blank" rel="noreferrer">View</a> : "-"}</td>
                    <td>
                      <div className="action-row">
                        <button className="btn btn-soft btn-small" type="button" onClick={() => setTransactionForm({ id: row.id, transaction_date: row.transaction_date, merchant: row.merchant, type: row.type, category_id: row.category_id ?? "", amount: String(row.amount), notes: row.notes ?? "", cash_account_id: row.cash_account_id ?? "", receipt: null })}>
                          Edit
                        </button>
                        <button className="danger-link" type="button" onClick={() => deleteRow("transactions", row.id, "Transaction")}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="quad-grid">
          <SimpleCard title="Recurring bills" copy="Add, edit, delete, and mark bills paid or unpaid.">
            <form onSubmit={handleBillSubmit}>
              <div className="form-grid">
                <LabeledInput label="Bill name">
                  <input value={billForm.name} onChange={(event) => setBillForm((current) => ({ ...current, name: event.target.value }))} required />
                </LabeledInput>
                <LabeledInput label="Amount">
                  <input type="number" step="0.01" value={billForm.amount} onChange={(event) => setBillForm((current) => ({ ...current, amount: event.target.value }))} required />
                </LabeledInput>
                <LabeledInput label="Due date">
                  <input type="date" value={billForm.due_date} onChange={(event) => setBillForm((current) => ({ ...current, due_date: event.target.value }))} required />
                </LabeledInput>
                <LabeledInput label="Cadence">
                  <select value={billForm.cadence} onChange={(event) => setBillForm((current) => ({ ...current, cadence: event.target.value }))}>
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                    <option value="custom">Custom</option>
                  </select>
                </LabeledInput>
                <LabeledInput label="Status">
                  <select value={billForm.status} onChange={(event) => setBillForm((current) => ({ ...current, status: event.target.value }))}>
                    <option value="unpaid">Unpaid</option>
                    <option value="paid">Paid</option>
                  </select>
                </LabeledInput>
                <LabeledInput label="Category">
                  <select value={billForm.category_id} onChange={(event) => setBillForm((current) => ({ ...current, category_id: event.target.value }))}>
                    <option value="">None</option>
                    {expenseCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </LabeledInput>
                <LabeledInput label="Notes" full>
                  <textarea value={billForm.notes} onChange={(event) => setBillForm((current) => ({ ...current, notes: event.target.value }))} />
                </LabeledInput>
              </div>
              <label className="checkbox-row">
                <input type="checkbox" checked={billForm.autopay} onChange={(event) => setBillForm((current) => ({ ...current, autopay: event.target.checked }))} />
                Autopay enabled
              </label>
              <button className="btn btn-soft" type="submit">{billForm.id ? "Update bill" : "Add recurring bill"}</button>
            </form>

            <div className="mini-list">
              {data.bills.map((bill) => (
                <div key={bill.id} className="mini-list-item">
                  <div>
                    <strong>{bill.name}</strong>
                    <div className={`metric-note ${billStatusTone(bill)}`}>{currency(bill.amount)} - {dateLabel(bill.due_date)} - {bill.status}</div>
                  </div>
                  <div className="action-row">
                    <button className="btn btn-soft btn-small" type="button" onClick={() => setBillForm({ id: bill.id, name: bill.name, amount: String(bill.amount), due_date: bill.due_date, cadence: bill.cadence, status: bill.status, category_id: bill.category_id ?? "", notes: bill.notes ?? "", autopay: bill.autopay })}>
                      Edit
                    </button>
                    <button className="danger-link" type="button" onClick={() => deleteRow("bills", bill.id, "Bill")}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </SimpleCard>

          <SimpleCard title="Categories and budgets" copy="Customize income and expense categories with monthly budget targets.">
            <form onSubmit={handleCategorySubmit}>
              <div className="form-grid">
                <LabeledInput label="Category name">
                  <input value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} required />
                </LabeledInput>
                <LabeledInput label="Kind">
                  <select value={categoryForm.kind} onChange={(event) => setCategoryForm((current) => ({ ...current, kind: event.target.value }))}>
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </LabeledInput>
                <LabeledInput label="Monthly budget">
                  <input type="number" step="0.01" value={categoryForm.monthly_budget} onChange={(event) => setCategoryForm((current) => ({ ...current, monthly_budget: event.target.value }))} />
                </LabeledInput>
                <LabeledInput label="Color">
                  <input type="color" value={categoryForm.color} onChange={(event) => setCategoryForm((current) => ({ ...current, color: event.target.value }))} />
                </LabeledInput>
              </div>
              <button className="btn btn-soft" type="submit">{categoryForm.id ? "Update category" : "Add category"}</button>
            </form>
            <div className="mini-list">
              {data.categories.map((category) => (
                <div key={category.id} className="mini-list-item">
                  <div>
                    <strong>{category.name}</strong>
                    <div className="metric-note">{category.kind} - Budget {currency(category.monthly_budget)}</div>
                  </div>
                  <div className="action-row">
                    <button className="btn btn-soft btn-small" type="button" onClick={() => setCategoryForm({ id: category.id, name: category.name, kind: category.kind, monthly_budget: String(category.monthly_budget), color: category.color })}>
                      Edit
                    </button>
                    <button className="danger-link" type="button" onClick={() => deleteRow("categories", category.id, "Category")}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </SimpleCard>

          <SimpleCard title="Savings, subscriptions, and sinking funds" copy="Track short-term and long-term goals together.">
            <form
              onSubmit={(event) =>
                handleSimpleSubmit(
                  event,
                  "savings_goals",
                  goalForm,
                  setGoalForm,
                  { name: "", current_amount: "", target_amount: "", due_date: "", id: "" },
                  goalForm.id ? "Goal updated." : "Goal saved.",
                  (value) => ({
                    name: value.name,
                    current_amount: Number(value.current_amount),
                    target_amount: Number(value.target_amount),
                    due_date: value.due_date || null
                  })
                )
              }
            >
              <div className="form-grid">
                <LabeledInput label="Goal name">
                  <input value={goalForm.name} onChange={(event) => setGoalForm((current) => ({ ...current, name: event.target.value }))} required />
                </LabeledInput>
                <LabeledInput label="Current amount">
                  <input type="number" step="0.01" value={goalForm.current_amount} onChange={(event) => setGoalForm((current) => ({ ...current, current_amount: event.target.value }))} required />
                </LabeledInput>
                <LabeledInput label="Target amount">
                  <input type="number" step="0.01" value={goalForm.target_amount} onChange={(event) => setGoalForm((current) => ({ ...current, target_amount: event.target.value }))} required />
                </LabeledInput>
                <LabeledInput label="Target date">
                  <input type="date" value={goalForm.due_date} onChange={(event) => setGoalForm((current) => ({ ...current, due_date: event.target.value }))} />
                </LabeledInput>
              </div>
              <button className="btn btn-soft" type="submit">{goalForm.id ? "Update goal" : "Add savings goal"}</button>
            </form>

            <form
              onSubmit={(event) =>
                handleSimpleSubmit(
                  event,
                  "subscriptions",
                  subscriptionForm,
                  setSubscriptionForm,
                  { name: "", amount: "", billing_cycle: "monthly", next_charge_date: "", active: true, id: "" },
                  subscriptionForm.id ? "Subscription updated." : "Subscription saved.",
                  (value) => ({
                    name: value.name,
                    amount: Number(value.amount),
                    billing_cycle: value.billing_cycle,
                    next_charge_date: value.next_charge_date || null,
                    active: value.active
                  })
                )
              }
            >
              <div className="form-grid form-top-gap">
                <LabeledInput label="Subscription">
                  <input value={subscriptionForm.name} onChange={(event) => setSubscriptionForm((current) => ({ ...current, name: event.target.value }))} required />
                </LabeledInput>
                <LabeledInput label="Amount">
                  <input type="number" step="0.01" value={subscriptionForm.amount} onChange={(event) => setSubscriptionForm((current) => ({ ...current, amount: event.target.value }))} required />
                </LabeledInput>
                <LabeledInput label="Billing cycle">
                  <select value={subscriptionForm.billing_cycle} onChange={(event) => setSubscriptionForm((current) => ({ ...current, billing_cycle: event.target.value }))}>
                    <option value="monthly">Monthly</option>
                    <option value="annual">Annual</option>
                  </select>
                </LabeledInput>
                <LabeledInput label="Next charge">
                  <input type="date" value={subscriptionForm.next_charge_date} onChange={(event) => setSubscriptionForm((current) => ({ ...current, next_charge_date: event.target.value }))} />
                </LabeledInput>
              </div>
              <label className="checkbox-row">
                <input type="checkbox" checked={subscriptionForm.active} onChange={(event) => setSubscriptionForm((current) => ({ ...current, active: event.target.checked }))} />
                Active subscription
              </label>
              <button className="btn btn-soft" type="submit">{subscriptionForm.id ? "Update subscription" : "Add subscription"}</button>
            </form>

            <form
              onSubmit={(event) =>
                handleSimpleSubmit(
                  event,
                  "sinking_funds",
                  sinkingForm,
                  setSinkingForm,
                  { name: "", current_amount: "", target_amount: "", target_date: "", id: "" },
                  sinkingForm.id ? "Sinking fund updated." : "Sinking fund saved.",
                  (value) => ({
                    name: value.name,
                    current_amount: Number(value.current_amount),
                    target_amount: Number(value.target_amount),
                    target_date: value.target_date || null
                  })
                )
              }
            >
              <div className="form-grid form-top-gap">
                <LabeledInput label="Fund name">
                  <input value={sinkingForm.name} onChange={(event) => setSinkingForm((current) => ({ ...current, name: event.target.value }))} required />
                </LabeledInput>
                <LabeledInput label="Current amount">
                  <input type="number" step="0.01" value={sinkingForm.current_amount} onChange={(event) => setSinkingForm((current) => ({ ...current, current_amount: event.target.value }))} required />
                </LabeledInput>
                <LabeledInput label="Target amount">
                  <input type="number" step="0.01" value={sinkingForm.target_amount} onChange={(event) => setSinkingForm((current) => ({ ...current, target_amount: event.target.value }))} required />
                </LabeledInput>
                <LabeledInput label="Target date">
                  <input type="date" value={sinkingForm.target_date} onChange={(event) => setSinkingForm((current) => ({ ...current, target_date: event.target.value }))} />
                </LabeledInput>
              </div>
              <button className="btn btn-soft" type="submit">{sinkingForm.id ? "Update sinking fund" : "Add sinking fund"}</button>
            </form>
          </SimpleCard>

          <SimpleCard title="Net worth and debt payoff" copy="Track assets, liabilities, and debt payoff targets.">
            <form
              onSubmit={(event) =>
                handleSimpleSubmit(
                  event,
                  "net_worth_accounts",
                  netWorthForm,
                  setNetWorthForm,
                  { name: "", account_type: "asset", current_balance: "", id: "" },
                  netWorthForm.id ? "Net worth account updated." : "Net worth account saved.",
                  (value) => ({
                    name: value.name,
                    account_type: value.account_type,
                    current_balance: Number(value.current_balance)
                  })
                )
              }
            >
              <div className="form-grid">
                <LabeledInput label="Account name">
                  <input value={netWorthForm.name} onChange={(event) => setNetWorthForm((current) => ({ ...current, name: event.target.value }))} required />
                </LabeledInput>
                <LabeledInput label="Account type">
                  <select value={netWorthForm.account_type} onChange={(event) => setNetWorthForm((current) => ({ ...current, account_type: event.target.value }))}>
                    <option value="asset">Asset</option>
                    <option value="liability">Liability</option>
                  </select>
                </LabeledInput>
                <LabeledInput label="Balance" full={false}>
                  <input type="number" step="0.01" value={netWorthForm.current_balance} onChange={(event) => setNetWorthForm((current) => ({ ...current, current_balance: event.target.value }))} required />
                </LabeledInput>
              </div>
              <button className="btn btn-soft" type="submit">{netWorthForm.id ? "Update account" : "Add account"}</button>
            </form>

            <form
              onSubmit={(event) =>
                handleSimpleSubmit(
                  event,
                  "debts",
                  debtForm,
                  setDebtForm,
                  { name: "", current_balance: "", interest_rate: "", minimum_payment: "", target_payment: "", id: "" },
                  debtForm.id ? "Debt updated." : "Debt saved.",
                  (value) => ({
                    name: value.name,
                    current_balance: Number(value.current_balance),
                    interest_rate: Number(value.interest_rate),
                    minimum_payment: Number(value.minimum_payment),
                    target_payment: Number(value.target_payment)
                  })
                )
              }
            >
              <div className="form-grid form-top-gap">
                <LabeledInput label="Debt name">
                  <input value={debtForm.name} onChange={(event) => setDebtForm((current) => ({ ...current, name: event.target.value }))} required />
                </LabeledInput>
                <LabeledInput label="Current balance">
                  <input type="number" step="0.01" value={debtForm.current_balance} onChange={(event) => setDebtForm((current) => ({ ...current, current_balance: event.target.value }))} required />
                </LabeledInput>
                <LabeledInput label="Interest rate %">
                  <input type="number" step="0.01" value={debtForm.interest_rate} onChange={(event) => setDebtForm((current) => ({ ...current, interest_rate: event.target.value }))} required />
                </LabeledInput>
                <LabeledInput label="Minimum payment">
                  <input type="number" step="0.01" value={debtForm.minimum_payment} onChange={(event) => setDebtForm((current) => ({ ...current, minimum_payment: event.target.value }))} required />
                </LabeledInput>
                <LabeledInput label="Target payment">
                  <input type="number" step="0.01" value={debtForm.target_payment} onChange={(event) => setDebtForm((current) => ({ ...current, target_payment: event.target.value }))} required />
                </LabeledInput>
              </div>
              <button className="btn btn-soft" type="submit">{debtForm.id ? "Update debt" : "Add debt"}</button>
            </form>

            <div className="mini-list">
              {data.netWorthAccounts.map((account) => (
                <div key={account.id} className="mini-list-item">
                  <div>
                    <strong>{account.name}</strong>
                    <div className="metric-note">{account.account_type} - {currency(account.current_balance)}</div>
                  </div>
                  <div className="action-row">
                    <button className="btn btn-soft btn-small" type="button" onClick={() => setNetWorthForm({ id: account.id, name: account.name, account_type: account.account_type, current_balance: String(account.current_balance) })}>
                      Edit
                    </button>
                    <button className="danger-link" type="button" onClick={() => deleteRow("net_worth_accounts", account.id, "Account")}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {data.debts.map((debt) => (
                <div key={debt.id} className="mini-list-item">
                  <div>
                    <strong>{debt.name}</strong>
                    <div className="metric-note">{currency(debt.current_balance)} - {debt.interest_rate}% APR</div>
                    <div className="track">
                      <div className="fill warning" style={{ width: `${debtProgress(debt)}%` }} />
                    </div>
                  </div>
                  <div className="action-row">
                    <button className="btn btn-soft btn-small" type="button" onClick={() => setDebtForm({ id: debt.id, name: debt.name, current_balance: String(debt.current_balance), interest_rate: String(debt.interest_rate), minimum_payment: String(debt.minimum_payment), target_payment: String(debt.target_payment) })}>
                      Edit
                    </button>
                    <button className="danger-link" type="button" onClick={() => deleteRow("debts", debt.id, "Debt")}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {data.sinkingFunds.map((fund) => (
                <div key={fund.id} className="mini-list-item">
                  <div>
                    <strong>{fund.name}</strong>
                    <div className="metric-note">{currency(fund.current_amount)} of {currency(fund.target_amount)}</div>
                    <div className="track">
                      <div className="fill good" style={{ width: `${sinkingFundProgress(fund)}%` }} />
                    </div>
                  </div>
                  <div className="action-row">
                    <button className="btn btn-soft btn-small" type="button" onClick={() => setSinkingForm({ id: fund.id, name: fund.name, current_amount: String(fund.current_amount), target_amount: String(fund.target_amount), target_date: fund.target_date ?? "" })}>
                      Edit
                    </button>
                    <button className="danger-link" type="button" onClick={() => deleteRow("sinking_funds", fund.id, "Sinking fund")}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </SimpleCard>
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="panel card">
      <div className="metric">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">{note}</div>
    </div>
  );
}

function ProgressCard({ title, subtitle, progress, tone }: { title: string; subtitle: string; progress: number; tone: string }) {
  return (
    <div className="goal-item">
      <div className="goal-top">
        <div>
          <div className="goal-name">{title}</div>
          <div className="goal-meta">{subtitle}</div>
        </div>
        <div className="badge">{Math.round(progress)}%</div>
      </div>
      <div className="track">
        <div className={`fill ${tone}`} style={{ width: `${Math.min(progress, 100)}%` }} />
      </div>
    </div>
  );
}

function LabeledInput({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`field ${full ? "full" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function SimpleCard({ title, copy, children }: { title: string; copy: string; children: React.ReactNode }) {
  return (
    <div className="panel card">
      <div className="section-head">
        <div>
          <h2 className="section-title">{title}</h2>
          <p className="section-copy">{copy}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function HouseholdSettings({ household, userEmail, onSave }: { household: Household; userEmail: string; onSave: (details: Partial<Household>) => Promise<void> }) {
  const [name, setName] = useState(household.name);
  const [tagline, setTagline] = useState(household.tagline ?? "");
  const [target, setTarget] = useState(String(household.emergency_fund_target ?? 0));

  return (
    <SimpleCard title="Household settings" copy={`Signed in as ${userEmail}. Update the family title, tagline, and emergency fund target.`}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            name,
            tagline,
            emergency_fund_target: Number(target || 0)
          });
        }}
      >
        <div className="form-grid">
          <LabeledInput label="Household name">
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </LabeledInput>
          <LabeledInput label="Emergency fund target">
            <input type="number" step="0.01" value={target} onChange={(event) => setTarget(event.target.value)} />
          </LabeledInput>
          <LabeledInput label="Tagline" full>
            <textarea value={tagline} onChange={(event) => setTagline(event.target.value)} />
          </LabeledInput>
        </div>
        <button className="btn btn-soft" type="submit">
          Save household settings
        </button>
      </form>
    </SimpleCard>
  );
}
