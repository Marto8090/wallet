import request from "supertest";
import app from "../src/app";
import { pool } from "../src/db";

type AuthContext = {
  token: string;
};

type WalletContext = {
  id: number;
  iban: string;
};

let emailSequence = 0;
let idempotencyKeySequence = 0;

const registerUser = async (
  displayName: string,
  baseCurrencyCode = "USD"
): Promise<AuthContext> => {
  emailSequence += 1;

  const response = await request(app)
    .post("/auth/register")
    .send({
      email: `test-user-${Date.now()}-${emailSequence}@example.com`,
      displayName,
      baseCurrencyCode,
      password: "password123",
    });

  expect(response.status).toBe(201);

  return {
    token: response.body.token,
  };
};

const createWallet = async (
  token: string,
  currencyCode = "USD",
  name = `${currencyCode} wallet`
): Promise<WalletContext> => {
  const response = await request(app)
    .post("/wallets")
    .set("Authorization", `Bearer ${token}`)
    .send({
      name,
      currencyCode,
      initialBalance: "0.00",
    });

  expect(response.status).toBe(201);
  expect(response.body.wallet.iban).toMatch(/^[A-Z0-9]{6}$/);

  return {
    id: response.body.wallet.id,
    iban: response.body.wallet.iban,
  };
};

const deposit = async (
  token: string,
  walletIban: string,
  amount: string
): Promise<void> => {
  const response = await request(app)
    .post(`/wallets/${walletIban}/deposits`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      amount,
      description: "Test deposit",
    });

  expect(response.status).toBe(201);
};

const postWithdraw = (
  token: string,
  walletIban: string,
  amount: string
): request.Test =>
  request(app)
    .post(`/wallets/${walletIban}/withdrawals`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      amount,
      description: "Test withdrawal",
    });

const getBalance = async (
  token: string,
  walletIban: string
): Promise<string> => {
  const response = await request(app)
    .get(`/wallets/${walletIban}/balance`)
    .set("Authorization", `Bearer ${token}`);

  expect(response.status).toBe(200);

  return response.body.balance.amount;
};

const createIdempotencyKey = (): string => {
  idempotencyKeySequence += 1;

  return `test-key-${Date.now()}-${idempotencyKeySequence}`;
};

const postTransfer = (
  token: string,
  body: Record<string, unknown>,
  idempotencyKey = createIdempotencyKey()
): request.Test =>
  request(app)
    .post("/transfers")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", idempotencyKey)
    .send(body);

const createTransferSetup = async (
  receiverCurrencyCode = "USD"
): Promise<{
  sender: AuthContext;
  receiver: AuthContext;
  senderWalletId: number;
  senderWalletIban: string;
  receiverWalletId: number;
  receiverWalletIban: string;
}> => {
  const sender = await registerUser("Sender");
  const receiver = await registerUser("Receiver");
  const senderWallet = await createWallet(sender.token, "USD");
  const receiverWallet = await createWallet(
    receiver.token,
    receiverCurrencyCode
  );

  return {
    sender,
    receiver,
    senderWalletId: senderWallet.id,
    senderWalletIban: senderWallet.iban,
    receiverWalletId: receiverWallet.id,
    receiverWalletIban: receiverWallet.iban,
  };
};

const getTransferLedgerCounts = async (): Promise<{
  transferIn: number;
  transferOut: number;
  total: number;
}> => {
  const result = await pool.query<{
    transaction_type: "transfer_in" | "transfer_out";
    count: string;
  }>(
    `
      SELECT transaction_type, COUNT(*) AS count
      FROM transactions
      WHERE transaction_type IN ('transfer_in', 'transfer_out')
      GROUP BY transaction_type
    `
  );

  const counts = {
    transferIn: 0,
    transferOut: 0,
    total: 0,
  };

  for (const row of result.rows) {
    const count = Number(row.count);

    if (row.transaction_type === "transfer_in") {
      counts.transferIn = count;
    }

    if (row.transaction_type === "transfer_out") {
      counts.transferOut = count;
    }

    counts.total += count;
  }

  return counts;
};

describe("POST /wallets", () => {
  it("returns 400 when the same user reuses a wallet name", async () => {
    const user = await registerUser("Wallet Owner");
    await createWallet(user.token, "USD", "Everyday wallet");

    const response = await request(app)
      .post("/wallets")
      .set("Authorization", `Bearer ${user.token}`)
      .send({
        name: "Everyday wallet",
        currencyCode: "EUR",
        initialBalance: "0.00",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "You already have a wallet with this name"
    );
  });

  it("allows different users to use the same wallet name", async () => {
    const firstUser = await registerUser("First Wallet Owner");
    const secondUser = await registerUser("Second Wallet Owner");

    const firstWallet = await createWallet(
      firstUser.token,
      "USD",
      "Shared wallet name"
    );
    const secondWallet = await createWallet(
      secondUser.token,
      "USD",
      "Shared wallet name"
    );

    expect(firstWallet.iban).toMatch(/^[A-Z0-9]{6}$/);
    expect(secondWallet.iban).toMatch(/^[A-Z0-9]{6}$/);
    expect(firstWallet.iban).not.toBe(secondWallet.iban);
  });
});

describe("POST /wallets/:walletIban/withdrawals", () => {
  it("prevents concurrent withdrawals from overspending a wallet", async () => {
    const user = await registerUser("Withdraw Owner");
    const wallet = await createWallet(user.token, "USD");
    await deposit(user.token, wallet.iban, "100.00");

    const withdrawResponses = await Promise.all([
      postWithdraw(user.token, wallet.iban, "80.00"),
      postWithdraw(user.token, wallet.iban, "80.00"),
    ]);

    const statuses = withdrawResponses
      .map((response) => response.status)
      .sort((firstStatus, secondStatus) => firstStatus - secondStatus);
    const failedResponse = withdrawResponses.find(
      (response) => response.status === 400
    );

    expect(statuses).toEqual([201, 400]);
    expect(failedResponse?.body.error).toBe("Insufficient balance");
    await expect(getBalance(user.token, wallet.iban)).resolves.toBe("20.00");
  });
});

describe("POST /transfers", () => {
  it("creates paired ledger entries and updates calculated balances", async () => {
    const { sender, receiver, senderWalletId, senderWalletIban, receiverWalletId, receiverWalletIban } =
      await createTransferSetup();
    await deposit(sender.token, senderWalletIban, "100.00");

    const response = await postTransfer(
      sender.token,
      {
        fromWalletIban: senderWalletIban,
        toWalletIban: receiverWalletIban,
        amount: "25.00",
        description: "Dinner split",
      }
    );

    expect(response.status).toBe(201);
    expect(response.body.transfer).toEqual(
      expect.objectContaining({
        transferReference: expect.any(String),
        fromWalletIban: senderWalletIban,
        toWalletIban: receiverWalletIban,
        amount: "25.00",
        description: "Dinner split",
        transferOutTransactionId: expect.any(Number),
        transferInTransactionId: expect.any(Number),
        occurredAt: expect.any(String),
      })
    );

    await expect(getBalance(sender.token, senderWalletIban)).resolves.toBe(
      "75.00"
    );
    await expect(getBalance(receiver.token, receiverWalletIban)).resolves.toBe(
      "25.00"
    );

    const transactionResult = await pool.query(
      `
        SELECT id, wallet_id, transaction_type, amount, transfer_reference, description
        FROM transactions
        WHERE transfer_reference = $1
        ORDER BY transaction_type
      `,
      [response.body.transfer.transferReference]
    );

    expect(transactionResult.rows).toHaveLength(2);
    expect(transactionResult.rows).toEqual([
      expect.objectContaining({
        id: response.body.transfer.transferInTransactionId.toString(),
        wallet_id: receiverWalletId.toString(),
        transaction_type: "transfer_in",
        amount: "25.00",
        transfer_reference: response.body.transfer.transferReference,
        description: "Dinner split",
      }),
      expect.objectContaining({
        id: response.body.transfer.transferOutTransactionId.toString(),
        wallet_id: senderWalletId.toString(),
        transaction_type: "transfer_out",
        amount: "25.00",
        transfer_reference: response.body.transfer.transferReference,
        description: "Dinner split",
      }),
    ]);
  });

  it("returns 401 when authorization is missing or invalid", async () => {
    const missingAuthResponse = await request(app).post("/transfers").send({
      fromWalletIban: 1,
      toWalletIban: 2,
      amount: "25.00",
    });

    expect(missingAuthResponse.status).toBe(401);

    const invalidAuthResponse = await request(app)
      .post("/transfers")
      .set("Authorization", "Bearer invalid-token")
      .send({
        fromWalletIban: 1,
        toWalletIban: 2,
        amount: "25.00",
      });

    expect(invalidAuthResponse.status).toBe(401);
  });

  it("returns 400 when the Idempotency-Key header is missing", async () => {
    const { sender, senderWalletId, senderWalletIban, receiverWalletId, receiverWalletIban } =
      await createTransferSetup();
    await deposit(sender.token, senderWalletIban, "100.00");

    const response = await request(app)
      .post("/transfers")
      .set("Authorization", `Bearer ${sender.token}`)
      .send({
        fromWalletIban: senderWalletIban,
        toWalletIban: receiverWalletIban,
        amount: "25.00",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Idempotency-Key header is required");
  });

  it("replays the original response when the same key is retried with the same body", async () => {
    const { sender, receiver, senderWalletId, senderWalletIban, receiverWalletId, receiverWalletIban } =
      await createTransferSetup();
    await deposit(sender.token, senderWalletIban, "100.00");

    const transferBody = {
      fromWalletIban: senderWalletIban,
      toWalletIban: receiverWalletIban,
      amount: "25.00",
      description: "Dinner split",
    };
    const idempotencyKey = createIdempotencyKey();

    const firstResponse = await postTransfer(
      sender.token,
      transferBody,
      idempotencyKey
    );
    const retryResponse = await postTransfer(
      sender.token,
      transferBody,
      idempotencyKey
    );

    expect(firstResponse.status).toBe(201);
    expect(retryResponse.status).toBe(201);
    expect(retryResponse.body).toEqual(firstResponse.body);
    await expect(getBalance(sender.token, senderWalletIban)).resolves.toBe(
      "75.00"
    );
    await expect(getBalance(receiver.token, receiverWalletIban)).resolves.toBe(
      "25.00"
    );
    await expect(getTransferLedgerCounts()).resolves.toEqual({
      transferIn: 1,
      transferOut: 1,
      total: 2,
    });
  });

  it("returns 409 when the same key is reused with a different request body", async () => {
    const { sender, receiver, senderWalletId, senderWalletIban, receiverWalletId, receiverWalletIban } =
      await createTransferSetup();
    await deposit(sender.token, senderWalletIban, "100.00");

    const idempotencyKey = createIdempotencyKey();
    const firstResponse = await postTransfer(
      sender.token,
      {
        fromWalletIban: senderWalletIban,
        toWalletIban: receiverWalletIban,
        amount: "25.00",
      },
      idempotencyKey
    );
    const conflictResponse = await postTransfer(
      sender.token,
      {
        fromWalletIban: senderWalletIban,
        toWalletIban: receiverWalletIban,
        amount: "30.00",
      },
      idempotencyKey
    );

    expect(firstResponse.status).toBe(201);
    expect(conflictResponse.status).toBe(409);
    expect(conflictResponse.body.error).toBe(
      "Idempotency-Key was already used with a different request"
    );
    await expect(getBalance(sender.token, senderWalletIban)).resolves.toBe(
      "75.00"
    );
    await expect(getBalance(receiver.token, receiverWalletIban)).resolves.toBe(
      "25.00"
    );
    await expect(getTransferLedgerCounts()).resolves.toEqual({
      transferIn: 1,
      transferOut: 1,
      total: 2,
    });
  });

  it("allows an expired idempotency key to be reused for a new request", async () => {
    const { sender, receiver, senderWalletIban, receiverWalletIban } =
      await createTransferSetup();
    await deposit(sender.token, senderWalletIban, "100.00");

    const idempotencyKey = createIdempotencyKey();
    const firstResponse = await postTransfer(
      sender.token,
      {
        fromWalletIban: senderWalletIban,
        toWalletIban: receiverWalletIban,
        amount: "25.00",
      },
      idempotencyKey
    );

    await pool.query(
      "UPDATE idempotency_keys SET expires_at = NOW() - INTERVAL '1 second' WHERE idempotency_key = $1",
      [idempotencyKey]
    );

    const secondResponse = await postTransfer(
      sender.token,
      {
        fromWalletIban: senderWalletIban,
        toWalletIban: receiverWalletIban,
        amount: "30.00",
      },
      idempotencyKey
    );

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(secondResponse.body.transfer.transferReference).not.toBe(
      firstResponse.body.transfer.transferReference
    );
    await expect(getBalance(sender.token, senderWalletIban)).resolves.toBe(
      "45.00"
    );
    await expect(getBalance(receiver.token, receiverWalletIban)).resolves.toBe(
      "55.00"
    );
    await expect(getTransferLedgerCounts()).resolves.toEqual({
      transferIn: 2,
      transferOut: 2,
      total: 4,
    });
  });

  it("returns 400 when source and destination wallets are the same", async () => {
    const sender = await registerUser("Sender");
    const wallet = await createWallet(sender.token);

    const response = await postTransfer(sender.token, {
      fromWalletIban: wallet.iban,
      toWalletIban: wallet.iban,
      amount: "25.00",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "fromWalletIban and toWalletIban must be different"
    );
  });

  it("returns 400 when the sender has insufficient balance", async () => {
    const { sender, senderWalletId, senderWalletIban, receiverWalletId, receiverWalletIban } =
      await createTransferSetup();

    const response = await postTransfer(sender.token, {
      fromWalletIban: senderWalletIban,
      toWalletIban: receiverWalletIban,
      amount: "25.00",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Insufficient balance");

    const transactionCount = await pool.query(
      "SELECT COUNT(*) AS count FROM transactions WHERE transaction_type IN ('transfer_in', 'transfer_out')"
    );
    expect(transactionCount.rows[0].count).toBe("0");
  });

  it("does not store the idempotency key when a transfer fails", async () => {
    const { sender, receiver, senderWalletId, senderWalletIban, receiverWalletId, receiverWalletIban } =
      await createTransferSetup();
    const idempotencyKey = createIdempotencyKey();
    const transferBody = {
      fromWalletIban: senderWalletIban,
      toWalletIban: receiverWalletIban,
      amount: "25.00",
    };

    const failedResponse = await postTransfer(
      sender.token,
      transferBody,
      idempotencyKey
    );
    await deposit(sender.token, senderWalletIban, "100.00");
    const retryResponse = await postTransfer(
      sender.token,
      transferBody,
      idempotencyKey
    );

    expect(failedResponse.status).toBe(400);
    expect(failedResponse.body.error).toBe("Insufficient balance");
    expect(retryResponse.status).toBe(201);
    await expect(getBalance(sender.token, senderWalletIban)).resolves.toBe(
      "75.00"
    );
    await expect(getBalance(receiver.token, receiverWalletIban)).resolves.toBe(
      "25.00"
    );
    await expect(getTransferLedgerCounts()).resolves.toEqual({
      transferIn: 1,
      transferOut: 1,
      total: 2,
    });
  });

  it("returns 404 when the sender wallet is not owned by the authenticated user", async () => {
    const { sender, receiver, senderWalletId, senderWalletIban, receiverWalletId, receiverWalletIban } =
      await createTransferSetup();
    await deposit(sender.token, senderWalletIban, "100.00");

    const response = await postTransfer(receiver.token, {
      fromWalletIban: senderWalletIban,
      toWalletIban: receiverWalletIban,
      amount: "25.00",
    });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Sender wallet not found");
  });

  it("returns 404 when the receiver wallet does not exist", async () => {
    const sender = await registerUser("Sender");
    const senderWallet = await createWallet(sender.token);
    await deposit(sender.token, senderWallet.iban, "100.00");

    const response = await postTransfer(sender.token, {
      fromWalletIban: senderWallet.iban,
      toWalletIban: "ZZZZZZ",
      amount: "25.00",
    });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Receiver wallet not found");
  });

  it("returns 400 when wallet currencies do not match", async () => {
    const { sender, senderWalletId, senderWalletIban, receiverWalletId, receiverWalletIban } =
      await createTransferSetup("EUR");
    await deposit(sender.token, senderWalletIban, "100.00");

    const response = await postTransfer(sender.token, {
      fromWalletIban: senderWalletIban,
      toWalletIban: receiverWalletIban,
      amount: "25.00",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Wallet currency codes must match");
  });

  it("prevents concurrent transfers from overspending the sender wallet", async () => {
    const { sender, receiver, senderWalletId, senderWalletIban, receiverWalletId, receiverWalletIban } =
      await createTransferSetup();
    await deposit(sender.token, senderWalletIban, "100.00");

    const transferBody = {
      fromWalletIban: senderWalletIban,
      toWalletIban: receiverWalletIban,
      amount: "80.00",
      description: "Concurrent transfer",
    };

    const transferResponses = await Promise.all([
      postTransfer(sender.token, transferBody),
      postTransfer(sender.token, transferBody),
    ]);

    const statuses = transferResponses
      .map((response) => response.status)
      .sort((firstStatus, secondStatus) => firstStatus - secondStatus);
    const failedResponse = transferResponses.find(
      (response) => response.status === 400
    );

    expect(statuses).toEqual([201, 400]);
    expect(failedResponse?.body.error).toBe("Insufficient balance");
    await expect(getBalance(sender.token, senderWalletIban)).resolves.toBe(
      "20.00"
    );
    await expect(getBalance(receiver.token, receiverWalletIban)).resolves.toBe(
      "80.00"
    );
    await expect(getTransferLedgerCounts()).resolves.toEqual({
      transferIn: 1,
      transferOut: 1,
      total: 2,
    });
  });

  it("replays concurrent duplicate requests with the same idempotency key", async () => {
    const { sender, receiver, senderWalletId, senderWalletIban, receiverWalletId, receiverWalletIban } =
      await createTransferSetup();
    await deposit(sender.token, senderWalletIban, "100.00");

    const transferBody = {
      fromWalletIban: senderWalletIban,
      toWalletIban: receiverWalletIban,
      amount: "80.00",
      description: "Concurrent duplicate",
    };
    const idempotencyKey = createIdempotencyKey();

    const [firstResponse, secondResponse] = await Promise.all([
      postTransfer(sender.token, transferBody, idempotencyKey),
      postTransfer(sender.token, transferBody, idempotencyKey),
    ]);

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(secondResponse.body).toEqual(firstResponse.body);
    await expect(getBalance(sender.token, senderWalletIban)).resolves.toBe(
      "20.00"
    );
    await expect(getBalance(receiver.token, receiverWalletIban)).resolves.toBe(
      "80.00"
    );
    await expect(getTransferLedgerCounts()).resolves.toEqual({
      transferIn: 1,
      transferOut: 1,
      total: 2,
    });
  });

});
