"use server";

import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "crypto";
import { getPrisma } from "../../lib/prisma";
import {
  AuthCredentialsSchema,
  PasswordChangeSchema,
  PasswordResetConfirmSchema,
  PasswordResetRequestSchema,
} from "../../../lib/schemas";
import { clearSessionCookie, requireSession, setSessionCookie } from "../../lib/auth";

const RESET_TTL_MS = Number(process.env.PASSWORD_RESET_TTL_MS ?? "1800000");

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function register(email: string, password: string) {
  const prisma = getPrisma();
  const parsed = AuthCredentialsSchema.safeParse({ email, password });
  if (!parsed.success) {
    throw new Error("Invalid credentials");
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });

  if (existing) {
    throw new Error("Email already registered");
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      password_hash: passwordHash,
    },
    select: { id: true, email: true },
  });

  await setSessionCookie({ userId: user.id, email: user.email });
  return { userId: user.id };
}

export async function login(email: string, password: string) {
  const prisma = getPrisma();
  const parsed = AuthCredentialsSchema.safeParse({ email, password });
  if (!parsed.success) {
    throw new Error("Invalid credentials");
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true, password_hash: true },
  });

  if (!user) {
    throw new Error("Invalid credentials");
  }

  const isValid = await bcrypt.compare(parsed.data.password, user.password_hash);
  if (!isValid) {
    throw new Error("Invalid credentials");
  }

  await setSessionCookie({ userId: user.id, email: user.email });
  return { userId: user.id };
}

export async function logout() {
  await clearSessionCookie();
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const prisma = getPrisma();
  const session = await requireSession();
  const parsed = PasswordChangeSchema.safeParse({ currentPassword, newPassword });
  if (!parsed.success) {
    throw new Error("Invalid password");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, password_hash: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const isValid = await bcrypt.compare(parsed.data.currentPassword, user.password_hash);
  if (!isValid) {
    throw new Error("Current password incorrect");
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password_hash: passwordHash,
      password_reset_token_hash: null,
      password_reset_expires_at: null,
    },
  });

  return { ok: true };
}

export async function requestPasswordReset(email: string) {
  const prisma = getPrisma();
  const parsed = PasswordResetRequestSchema.safeParse({ email });
  if (!parsed.success) {
    throw new Error("Invalid email");
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });

  if (!user) {
    return { token: null, expiresAt: null };
  }

  const token = randomBytes(24).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password_reset_token_hash: tokenHash,
      password_reset_expires_at: expiresAt,
    },
  });

  return { token, expiresAt: expiresAt.toISOString() };
}

export async function resetPassword(token: string, newPassword: string) {
  const prisma = getPrisma();
  const parsed = PasswordResetConfirmSchema.safeParse({ token, newPassword });
  if (!parsed.success) {
    throw new Error("Invalid reset payload");
  }

  const tokenHash = hashToken(parsed.data.token);
  const user = await prisma.user.findFirst({
    where: {
      password_reset_token_hash: tokenHash,
      password_reset_expires_at: { gt: new Date() },
    },
    select: { id: true },
  });

  if (!user) {
    throw new Error("Invalid or expired token");
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password_hash: passwordHash,
      password_reset_token_hash: null,
      password_reset_expires_at: null,
    },
  });

  return { ok: true };
}
