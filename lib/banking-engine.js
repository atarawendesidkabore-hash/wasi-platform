/**
 * WASI core banking engine.
 *
 * Harvested from the WASI React app (src/banking/bankingEngine.ts).
 * Monetary amounts are bigint in XOF centimes — never floats, so no rounding
 * error can enter a balance. All operations are pure: they return a NEW state
 * rather than mutating, which is what makes them safe to test and to replay.
 *
 * @typedef {"XOF"} CurrencyCode
 * @typedef {"CHECKING"|"SAVINGS"|"BUSINESS"} AccountType
 * @typedef {"DEPOSIT"|"WITHDRAWAL"|"TRANSFER_IN"|"TRANSFER_OUT"} TransactionKind
 *
 * @typedef {Object} Account
 * @property {string} id
 * @property {string} holder
 * @property {AccountType} type
 * @property {CurrencyCode} currency
 * @property {bigint} balanceCentimes
 *
 * @typedef {Object} Transaction
 * @property {string} id
 * @property {string} accountId
 * @property {TransactionKind} kind
 * @property {bigint} amountCentimes
 * @property {string} createdAtUtc
 * @property {string} description
 *
 * @typedef {Object} BankingState
 * @property {Account[]} accounts
 * @property {Transaction[]} transactions
 */

export const MIN_MONETARY_AMOUNT_CENTIMES = 1n;
export const MAX_MONETARY_AMOUNT_CENTIMES = BigInt(Number.MAX_SAFE_INTEGER);

let transactionSequence = 0;

/**
 * Converts user input ("1250", "1250.50", "1250,5") to centimes.
 * Rejects anything with more than two decimals rather than silently rounding
 * a customer's money.
 * @param {string} amountInput
 * @returns {bigint}
 */
export const parseInputAmountToCentimes = (amountInput) => {
  const normalized = String(amountInput).trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Invalid amount format.");
  }

  const [wholePart, fractionalPart = ""] = normalized.split(".");
  const whole = BigInt(wholePart);
  const fractional = BigInt(fractionalPart.padEnd(2, "0"));
  const value = whole * 100n + fractional;

  validateMonetaryAmount(value);
  return value;
};

/**
 * Formats XOF centimes for display.
 * @param {bigint} amountCentimes
 * @returns {string}
 */
export const formatXofCentimes = (amountCentimes) => {
  const sign = amountCentimes < 0n ? "-" : "";
  const absValue = amountCentimes < 0n ? -amountCentimes : amountCentimes;
  const whole = absValue / 100n;
  const cents = absValue % 100n;
  const groupedWhole = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${groupedWhole}.${cents.toString().padStart(2, "0")} XOF`;
};

/**
 * Demo state used by the microfinance and banking screens.
 * @returns {BankingState}
 */
export const createInitialBankingState = () => ({
  accounts: [
    { id: "acc_main", holder: "Thomas Kabore", type: "CHECKING", currency: "XOF", balanceCentimes: 125000000n },
    { id: "acc_savings", holder: "Thomas Kabore", type: "SAVINGS", currency: "XOF", balanceCentimes: 345500000n },
    { id: "acc_business", holder: "WASI SARL", type: "BUSINESS", currency: "XOF", balanceCentimes: 789250000n },
  ],
  transactions: [],
});

/**
 * @param {BankingState} state
 * @param {string} accountId
 * @param {bigint} amountCentimes
 * @param {string} [description]
 * @returns {BankingState}
 */
export const deposit = (state, accountId, amountCentimes, description = "Deposit") => {
  validateMonetaryAmount(amountCentimes);
  const account = getAccountById(state, accountId);
  const updatedAccount = {
    ...account,
    balanceCentimes: account.balanceCentimes + amountCentimes,
  };
  return applyStateUpdate(state, updatedAccount, {
    accountId,
    kind: "DEPOSIT",
    amountCentimes,
    description,
  });
};

/**
 * @param {BankingState} state
 * @param {string} accountId
 * @param {bigint} amountCentimes
 * @param {string} [description]
 * @returns {BankingState}
 */
export const withdraw = (state, accountId, amountCentimes, description = "Withdrawal") => {
  validateMonetaryAmount(amountCentimes);
  const account = getAccountById(state, accountId);
  if (account.balanceCentimes < amountCentimes) {
    throw new Error("Insufficient funds.");
  }
  const updatedAccount = {
    ...account,
    balanceCentimes: account.balanceCentimes - amountCentimes,
  };
  return applyStateUpdate(state, updatedAccount, {
    accountId,
    kind: "WITHDRAWAL",
    amountCentimes,
    description,
  });
};

/**
 * Moves funds between two accounts, writing a matched OUT/IN pair so the
 * ledger stays double-entry.
 * @param {BankingState} state
 * @param {string} fromAccountId
 * @param {string} toAccountId
 * @param {bigint} amountCentimes
 * @param {string} [description]
 * @returns {BankingState}
 */
export const transfer = (state, fromAccountId, toAccountId, amountCentimes, description = "Internal transfer") => {
  if (fromAccountId === toAccountId) {
    throw new Error("Cannot transfer to the same account.");
  }
  validateMonetaryAmount(amountCentimes);

  const fromAccount = getAccountById(state, fromAccountId);
  const toAccount = getAccountById(state, toAccountId);

  if (fromAccount.balanceCentimes < amountCentimes) {
    throw new Error("Insufficient funds.");
  }

  const updatedAccounts = state.accounts.map((account) => {
    if (account.id === fromAccountId) {
      return { ...account, balanceCentimes: account.balanceCentimes - amountCentimes };
    }
    if (account.id === toAccountId) {
      return { ...account, balanceCentimes: account.balanceCentimes + amountCentimes };
    }
    return account;
  });

  const now = new Date().toISOString();
  const transferOut = {
    id: buildTransactionId(),
    accountId: fromAccountId,
    kind: "TRANSFER_OUT",
    amountCentimes,
    createdAtUtc: now,
    description: `${description} -> ${toAccount.holder}`,
  };
  const transferIn = {
    id: buildTransactionId(),
    accountId: toAccountId,
    kind: "TRANSFER_IN",
    amountCentimes,
    createdAtUtc: now,
    description: `${description} <- ${fromAccount.holder}`,
  };

  return {
    accounts: updatedAccounts,
    transactions: [transferOut, transferIn, ...state.transactions],
  };
};

const applyStateUpdate = (state, updatedAccount, transaction) => {
  const updatedAccounts = state.accounts.map((account) =>
    account.id === updatedAccount.id ? updatedAccount : account
  );
  const createdTransaction = {
    ...transaction,
    id: buildTransactionId(),
    createdAtUtc: new Date().toISOString(),
  };
  return {
    accounts: updatedAccounts,
    transactions: [createdTransaction, ...state.transactions],
  };
};

const getAccountById = (state, accountId) => {
  const account = state.accounts.find((candidate) => candidate.id === accountId);
  if (!account) {
    throw new Error("Account not found.");
  }
  return account;
};

const validateMonetaryAmount = (amountCentimes) => {
  if (
    amountCentimes < MIN_MONETARY_AMOUNT_CENTIMES ||
    amountCentimes > MAX_MONETARY_AMOUNT_CENTIMES
  ) {
    throw new Error("Amount is out of supported bounds.");
  }
};

const buildTransactionId = () => {
  transactionSequence += 1;
  return `txn_${Date.now()}_${transactionSequence}`;
};
