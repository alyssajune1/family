export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Household = {
  id: string;
  name: string;
  invite_code: string;
  tagline: string | null;
  emergency_fund_target: number;
  created_at: string;
};

export type Membership = {
  id: string;
  household_id: string;
  user_id: string;
  role: "owner" | "member";
  display_name: string;
  created_at: string;
};

export type Profile = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
};

export type Category = {
  id: string;
  household_id: string;
  name: string;
  kind: "expense" | "income";
  monthly_budget: number;
  color: string;
  created_at: string;
};

export type TransactionRecord = {
  id: string;
  household_id: string;
  category_id: string | null;
  entered_by: string;
  type: "income" | "expense";
  amount: number;
  transaction_date: string;
  merchant: string;
  notes: string | null;
  receipt_url: string | null;
  cash_account_id: string | null;
  created_at: string;
  categories?: Category | null;
  entered_by_profile?: Pick<Profile, "full_name" | "user_id"> | null;
};

export type Bill = {
  id: string;
  household_id: string;
  category_id: string | null;
  name: string;
  amount: number;
  due_date: string;
  cadence: "monthly" | "weekly" | "quarterly" | "annual" | "custom";
  status: "paid" | "unpaid";
  autopay: boolean;
  notes: string | null;
  entered_by: string;
  created_at: string;
  categories?: Category | null;
};

export type SavingsGoal = {
  id: string;
  household_id: string;
  name: string;
  current_amount: number;
  target_amount: number;
  due_date: string | null;
  created_at: string;
};

export type Subscription = {
  id: string;
  household_id: string;
  name: string;
  amount: number;
  billing_cycle: "monthly" | "annual";
  next_charge_date: string | null;
  active: boolean;
  created_at: string;
};

export type CashAccount = {
  id: string;
  household_id: string;
  name: string;
  current_balance: number;
  created_at: string;
};

export type NetWorthAccount = {
  id: string;
  household_id: string;
  name: string;
  account_type: "asset" | "liability";
  current_balance: number;
  created_at: string;
};

export type Debt = {
  id: string;
  household_id: string;
  name: string;
  current_balance: number;
  interest_rate: number;
  minimum_payment: number;
  target_payment: number;
  created_at: string;
};

export type SinkingFund = {
  id: string;
  household_id: string;
  name: string;
  current_amount: number;
  target_amount: number;
  target_date: string | null;
  created_at: string;
};

export type DashboardPayload = {
  household: Household;
  membership: Membership;
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
