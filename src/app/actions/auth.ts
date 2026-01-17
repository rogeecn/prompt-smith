"use server";

import bcrypt from "bcryptjs";
import { getPrisma } from "../../lib/prisma";
import { AuthCredentialsSchema } from "../../../lib/schemas";
import { clearSessionCookie, setSessionCookie } from "../../lib/auth";

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
