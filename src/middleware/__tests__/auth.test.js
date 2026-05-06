const { validateToken, requireAuth, requireRole, invalidateToken, refreshToken } = require("../auth");
const redis = require("../../config/redis");
const jwt = require("jsonwebtoken");

jest.mock("../../config/redis");
jest.mock("../../services/logger");
jest.mock("jsonwebtoken");

describe("Auth Middleware", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("validateToken", () => {
    test("throws when no token provided", async () => {
      await expect(validateToken(null)).rejects.toThrow("No token provided");
    });
    test("returns cached result on cache hit", async () => {
      redis.get.mockResolvedValue(JSON.stringify({ id: 1, role: "user" }));
      const result = await validateToken("cached-token");
      expect(result).toEqual({ id: 1, role: "user" });
      expect(jwt.verify).not.toHaveBeenCalled();
    });
    test("verifies and caches new token", async () => {
      redis.get.mockResolvedValue(null);
      jwt.verify.mockReturnValue({ id: 2, role: "admin" });
      const result = await validateToken("new-token");
      expect(result).toEqual({ id: 2, role: "admin" });
      expect(redis.setex).toHaveBeenCalled();
    });
  });

  describe("requireAuth", () => {
    test("returns 401 when no auth header", async () => {
      const req = { headers: {}, ip: "127.0.0.1" };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      await requireAuth(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);
    });
    test("calls next on valid token", async () => {
      redis.get.mockResolvedValue(JSON.stringify({ id: 1, role: "user" }));
      const req = { headers: { authorization: "Bearer valid-token" }, ip: "127.0.0.1" };
      const res = {};
      const next = jest.fn();
      await requireAuth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
    });
  });

  describe("requireRole", () => {
    test("returns 403 when role does not match", () => {
      const req = { user: { id: 1, role: "user" } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      requireRole("admin")(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(403);
    });
    test("calls next when role matches", () => {
      const req = { user: { id: 1, role: "admin" } };
      const next = jest.fn();
      requireRole("admin")(req, {}, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("invalidateToken", () => {
    test("deletes token from cache", async () => {
      await invalidateToken("some-token");
      expect(redis.del).toHaveBeenCalledWith("auth:token:some-token");
    });
  });
});
