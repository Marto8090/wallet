import request from "supertest";
import app from "../src/app";
import { pool } from "../src/db";

type AuthContext = {
  token: string;
  email: string;
};

let emailSequence = 0;

const registerUser = async (displayName: string): Promise<AuthContext> => {
  emailSequence += 1;
  const email = `admin-audit-${Date.now()}-${emailSequence}@example.com`;

  const response = await request(app).post("/auth/register").send({
    email,
    displayName,
    baseCurrencyCode: "USD",
    password: "password123",
  });

  expect(response.status).toBe(201);

  return {
    token: response.body.token,
    email,
  };
};

const promoteToAdmin = async (email: string): Promise<void> => {
  await pool.query("UPDATE users SET is_admin = TRUE WHERE email = $1", [
    email,
  ]);
};

const loginUser = async (email: string): Promise<AuthContext> => {
  const response = await request(app).post("/auth/login").send({
    email,
    password: "password123",
  });

  expect(response.status).toBe(200);
  expect(response.body.user.isAdmin).toBe(true);

  return {
    token: response.body.token,
    email,
  };
};

describe("GET /admin/audit-logs", () => {
  it("requires an admin user", async () => {
    const user = await registerUser("Regular User");

    const response = await request(app)
      .get("/admin/audit-logs")
      .set("Authorization", `Bearer ${user.token}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Admin access is required");
  });

  it("blocks admin users from wallet operations", async () => {
    const admin = await registerUser("Wallet Blocked Admin");
    await promoteToAdmin(admin.email);
    const adminLogin = await loginUser(admin.email);

    const response = await request(app)
      .get("/wallets")
      .set("Authorization", `Bearer ${adminLogin.token}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe(
      "Admin users cannot access wallet operations"
    );
  });

  it("returns filtered audit logs for an admin user", async () => {
    const admin = await registerUser("Admin User");
    await promoteToAdmin(admin.email);
    const adminLogin = await loginUser(admin.email);

    const failedLoginEmail = "missing-filter-user@example.com";
    await request(app).post("/auth/login").send({
      email: failedLoginEmail,
      password: "wrong-password",
    });

    const response = await request(app)
      .get("/admin/audit-logs")
      .query({
        eventType: "auth.login.failure",
        status: "failure",
        search: "missing-filter-user",
      })
      .set("Authorization", `Bearer ${adminLogin.token}`);

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual(
      expect.objectContaining({
        total: 1,
        limit: 50,
        offset: 0,
      })
    );
    expect(response.body.auditLogs).toHaveLength(1);
    expect(response.body.auditLogs[0]).toEqual(
      expect.objectContaining({
        eventType: "auth.login.failure",
        status: "failure",
        entityType: "user",
        metadata: expect.objectContaining({
          email: failedLoginEmail,
          errorMessage: "Invalid email or password",
        }),
      })
    );
  });

  it("validates audit log filters", async () => {
    const admin = await registerUser("Filter Admin");
    await promoteToAdmin(admin.email);
    const adminLogin = await loginUser(admin.email);

    const response = await request(app)
      .get("/admin/audit-logs")
      .query({
        status: "unknown",
      })
      .set("Authorization", `Bearer ${adminLogin.token}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("status must be success or failure");
  });
});

describe("DELETE /admin/audit-logs/expired", () => {
  it("deletes audit logs older than the retention window", async () => {
    const admin = await registerUser("Cleanup Admin");
    await promoteToAdmin(admin.email);
    const adminLogin = await loginUser(admin.email);

    await pool.query(
      `
        INSERT INTO audit_logs (event_type, status, metadata, created_at)
        VALUES
          ('audit.retention.old', 'success', '{}'::jsonb, NOW() - INTERVAL '91 days'),
          ('audit.retention.current', 'success', '{}'::jsonb, NOW())
      `
    );

    const response = await request(app)
      .delete("/admin/audit-logs/expired")
      .set("Authorization", `Bearer ${adminLogin.token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      retentionDays: 90,
      deletedCount: 1,
    });

    const countResult = await pool.query<{
      event_type: string;
      count: string;
    }>(
      `
        SELECT event_type, COUNT(*) AS count
        FROM audit_logs
        WHERE event_type IN ('audit.retention.old', 'audit.retention.current')
        GROUP BY event_type
      `
    );

    expect(countResult.rows).toEqual([
      {
        event_type: "audit.retention.current",
        count: "1",
      },
    ]);
  });
});
