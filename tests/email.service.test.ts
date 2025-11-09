import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Make Next's `server-only` a no-op in test env
vi.mock("server-only", () => ({}));

// Simple helpers to mock fetch responses
const okJson = (obj: any) =>
  new Response(JSON.stringify(obj), { status: 200, headers: { "content-type": "application/json" } });

const jsonResp = (obj: any, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

describe("EmailService", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules(); // forces dynamic imports to re-read env each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sends using support From by default", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_SUPPORT ||= "Legendary Collectibles Support <support@legendary-collectibles.com>";

    const fetchSpy = vi.spyOn(global, "fetch" as any).mockResolvedValue(okJson({ id: "email_test_1" }));

    const { Email } = await import("../src/lib/email");
    const res = await Email.send({
      to: "someone@example.com",
      subject: "Hello",
      text: "World",
    });

    expect(res.id).toBe("email_test_1");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    });
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.from).toContain("support@legendary-collectibles.com");
  });

  it("sends using admin From when specified", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_ADMIN ||= "Legendary Collectibles Admin <admin@legendary-collectibles.com>";

    const fetchSpy = vi.spyOn(global, "fetch" as any).mockResolvedValue(okJson({ id: "email_test_2" }));

    const { Email } = await import("../src/lib/email");
    const res = await Email.admin({
      to: "admin-target@example.com",
      subject: "Admin test",
      text: "Admin body",
    });

    expect(res.id).toBe("email_test_2");
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.from).toContain("admin@legendary-collectibles.com");
    expect(body.to).toEqual(["admin-target@example.com"]);
  });

  it("includes Idempotency-Key when provided", async () => {
    process.env.RESEND_API_KEY = "re_test_key";

    const fetchSpy = vi.spyOn(global, "fetch" as any).mockResolvedValue(okJson({ id: "email_test_3" }));

    const { Email } = await import("../src/lib/email");
    const res = await Email.send({
      to: "x@y.z",
      subject: "Idem",
      text: "Body",
      idempotencyKey: "fixed-key-001",
    });

    expect(res.id).toBe("email_test_3");
    const [, init] = fetchSpy.mock.calls[0];
    // @ts-ignore – reading a header we set directly on the init object
    expect((init as RequestInit).headers["Idempotency-Key"]).toBe("fixed-key-001");
  });

  it("retries on 429 then succeeds", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.useFakeTimers();

    const fetchSpy = vi
      .spyOn(global, "fetch" as any)
      .mockResolvedValueOnce(jsonResp({ error: "rate" }, 429)) // first attempt
      .mockResolvedValueOnce(okJson({ id: "email_test_retry" })); // second attempt

    const { Email } = await import("../src/lib/email");

    const promise = Email.send({
      to: "a@b.c",
      subject: "Retry",
      text: "Once",
    });

    // first backoff expected to be ~1s
    await vi.advanceTimersByTimeAsync(1000);

    const res = await promise;
    expect(res.id).toBe("email_test_retry");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does dry-run (no fetch) when RESEND_API_KEY is not set", async () => {
    delete process.env.RESEND_API_KEY;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(global, "fetch" as any);

    const { Email } = await import("../src/lib/email");
    const res = await Email.support({
      to: "dry@run.test",
      subject: "Dry",
      text: "Run",
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("RESEND_API_KEY missing – dry-run email:"),
      expect.any(String)
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.id).toMatch(/^dry_/);
  });

  it("validates required fields", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const { Email } = await import("../src/lib/email");

    await expect(Email.send({ to: "", subject: "", text: "" } as any)).rejects.toThrow(/'to' is required/);
    await expect(Email.send({ to: "x@y.z", subject: "", text: "" })).rejects.toThrow(/'subject' is required/);
    await expect(Email.send({ to: "x@y.z", subject: "ok" } as any)).rejects.toThrow(/'html' or 'text' is required/);
  });
});
