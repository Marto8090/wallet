import request from "supertest";
import app from "../src/app";
import { pool } from "../src/db";

type AuthContext = {
  token: string;
};

let emailSequence = 0;

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
  currencyCode = "USD"
): Promise<number> => {
  const response = await request(app)
    .post("/wallets")
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: `${currencyCode} wallet`,
      currencyCode,
      walletType: "personal",
      initialBalance: "0.00",
    });

  expect(response.status).toBe(201);

  return response.body.wallet.id;
};

const deposit = async (
  token: string,
  walletId: number,
  amount: string
): Promise<void> => {
  const response = await request(app)
    .post(`/wallets/${walletId}/deposits`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      amount,
      description: "Test deposit",
    });

  expect(response.status).toBe(201);
};

const getBalance = async (
  token: string,
  walletId: number
): Promise<string> => {
  const response = await request(app)
    .get(`/wallets/${walletId}/balance`)
    .set("Authorization", `Bearer ${token}`);

  expect(response.status).toBe(200);

  return response.body.balance.amount;
};

const createTransferSetup = async (
  receiverCurrencyCode = "USD"
): Promise<{
  sender: AuthContext;
  receiver: AuthContext;
  senderWalletId: number;
  receiverWalletId: number;
}> => {
  const sender = await registerUser("Sender");
  const receiver = await registerUser("Receiver");
  const senderWalletId = await createWallet(sender.token, "USD");
  const receiverWalletId = await createWallet(
    receiver.token,
    receiverCurrencyCode
  );

  return {
    sender,
    receiver,
    senderWalletId,
    receiverWalletId,
  };
};

const archiveWallet = async (walletId: number): Promise<void> => {
  await pool.query("UPDATE wallets SET is_archived = TRUE WHERE id = $1", [
    walletId,
  ]);
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

describe("POST /transfers", () => {
  it("creates paired ledger entries and updates calculated balances", async () => {
    const { sender, receiver, senderWalletId, receiverWalletId } =
      await createTransferSetup();
    await deposit(sender.token, senderWalletId, "100.00");

    const response = await request(app)
      .post("/transfers")
      .set("Authorization", `Bearer ${sender.token}`)
      .send({
        fromWalletId: senderWalletId,
        toWalletId: receiverWalletId,
        amount: "25.00",
        description: "Dinner split",
      });

    expect(response.status).toBe(201);
    expect(response.body.transfer).toEqual(
      expect.objectContaining({
        transferReference: expect.any(String),
        fromWalletId: senderWalletId,
        toWalletId: receiverWalletId,
        amount: "25.00",
        description: "Dinner split",
        transferOutTransactionId: expect.any(Number),
        transferInTransactionId: expect.any(Number),
        occurredAt: expect.any(String),
      })
    );

    await expect(getBalance(sender.token, senderWalletId)).resolves.toBe(
      "75.00"
    );
    await expect(getBalance(receiver.token, receiverWalletId)).resolves.toBe(
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
      fromWalletId: 1,
      toWalletId: 2,
      amount: "25.00",
    });

    expect(missingAuthResponse.status).toBe(401);

    const invalidAuthResponse = await request(app)
      .post("/transfers")
      .set("Authorization", "Bearer invalid-token")
      .send({
        fromWalletId: 1,
        toWalletId: 2,
        amount: "25.00",
      });

    expect(invalidAuthResponse.status).toBe(401);
  });

  it("returns 400 when source and destination wallets are the same", async () => {
    const sender = await registerUser("Sender");
    const walletId = await createWallet(sender.token);

    const response = await request(app)
      .post("/transfers")
      .set("Authorization", `Bearer ${sender.token}`)
      .send({
        fromWalletId: walletId,
        toWalletId: walletId,
        amount: "25.00",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "fromWalletId and toWalletId must be different"
    );
  });

  it("returns 400 when the sender has insufficient balance", async () => {
    const { sender, senderWalletId, receiverWalletId } =
      await createTransferSetup();

    const response = await request(app)
      .post("/transfers")
      .set("Authorization", `Bearer ${sender.token}`)
      .send({
        fromWalletId: senderWalletId,
        toWalletId: receiverWalletId,
        amount: "25.00",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Insufficient balance");

    const transactionCount = await pool.query(
      "SELECT COUNT(*) AS count FROM transactions WHERE transaction_type IN ('transfer_in', 'transfer_out')"
    );
    expect(transactionCount.rows[0].count).toBe("0");
  });

  it("returns 404 when the sender wallet is not owned by the authenticated user", async () => {
    const { sender, receiver, senderWalletId, receiverWalletId } =
      await createTransferSetup();
    await deposit(sender.token, senderWalletId, "100.00");

    const response = await request(app)
      .post("/transfers")
      .set("Authorization", `Bearer ${receiver.token}`)
      .send({
        fromWalletId: senderWalletId,
        toWalletId: receiverWalletId,
        amount: "25.00",
      });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Sender wallet not found");
  });

  it("returns 404 when the receiver wallet does not exist", async () => {
    const sender = await registerUser("Sender");
    const senderWalletId = await createWallet(sender.token);
    await deposit(sender.token, senderWalletId, "100.00");

    const response = await request(app)
      .post("/transfers")
      .set("Authorization", `Bearer ${sender.token}`)
      .send({
        fromWalletId: senderWalletId,
        toWalletId: 999999,
        amount: "25.00",
      });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Receiver wallet not found");
  });

  it("returns 400 when wallet currencies do not match", async () => {
    const { sender, senderWalletId, receiverWalletId } =
      await createTransferSetup("EUR");
    await deposit(sender.token, senderWalletId, "100.00");

    const response = await request(app)
      .post("/transfers")
      .set("Authorization", `Bearer ${sender.token}`)
      .send({
        fromWalletId: senderWalletId,
        toWalletId: receiverWalletId,
        amount: "25.00",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Wallet currency codes must match");
  });

  it("prevents concurrent transfers from overspending the sender wallet", async () => {
    const { sender, receiver, senderWalletId, receiverWalletId } =
      await createTransferSetup();
    await deposit(sender.token, senderWalletId, "100.00");

    const transferBody = {
      fromWalletId: senderWalletId,
      toWalletId: receiverWalletId,
      amount: "80.00",
      description: "Concurrent transfer",
    };

    const transferResponses = await Promise.all([
      request(app)
        .post("/transfers")
        .set("Authorization", `Bearer ${sender.token}`)
        .send(transferBody),
      request(app)
        .post("/transfers")
        .set("Authorization", `Bearer ${sender.token}`)
        .send(transferBody),
    ]);

    const statuses = transferResponses
      .map((response) => response.status)
      .sort((firstStatus, secondStatus) => firstStatus - secondStatus);
    const failedResponse = transferResponses.find(
      (response) => response.status === 400
    );

    expect(statuses).toEqual([201, 400]);
    expect(failedResponse?.body.error).toBe("Insufficient balance");
    await expect(getBalance(sender.token, senderWalletId)).resolves.toBe(
      "20.00"
    );
    await expect(getBalance(receiver.token, receiverWalletId)).resolves.toBe(
      "80.00"
    );
    await expect(getTransferLedgerCounts()).resolves.toEqual({
      transferIn: 1,
      transferOut: 1,
      total: 2,
    });
  });

  it("returns 404 when the sender wallet is archived", async () => {
    const { sender, senderWalletId, receiverWalletId } =
      await createTransferSetup();
    await deposit(sender.token, senderWalletId, "100.00");
    await archiveWallet(senderWalletId);

    const response = await request(app)
      .post("/transfers")
      .set("Authorization", `Bearer ${sender.token}`)
      .send({
        fromWalletId: senderWalletId,
        toWalletId: receiverWalletId,
        amount: "25.00",
      });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Sender wallet not found");
    await expect(getTransferLedgerCounts()).resolves.toEqual({
      transferIn: 0,
      transferOut: 0,
      total: 0,
    });
  });

  it("returns 404 when the receiver wallet is archived", async () => {
    const { sender, senderWalletId, receiverWalletId } =
      await createTransferSetup();
    await deposit(sender.token, senderWalletId, "100.00");
    await archiveWallet(receiverWalletId);

    const response = await request(app)
      .post("/transfers")
      .set("Authorization", `Bearer ${sender.token}`)
      .send({
        fromWalletId: senderWalletId,
        toWalletId: receiverWalletId,
        amount: "25.00",
      });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Receiver wallet not found");
    await expect(getTransferLedgerCounts()).resolves.toEqual({
      transferIn: 0,
      transferOut: 0,
      total: 0,
    });
  });
});
