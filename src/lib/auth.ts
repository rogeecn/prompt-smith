import { cookies } from "next/headers";
import {
  getSessionCookieName,
  getSessionMaxAge,
  signSession,
  verifySessionToken,
  type SessionPayload,
} from "./auth-core";
import { getPrisma } from "./prisma";

const buildCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: getSessionMaxAge(),
});

export const getSession = async (): Promise<SessionPayload | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) {
    await clearSessionCookie();
    return null;
  }
  return payload;
};

export const requireSession = async (): Promise<SessionPayload> => {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
};

export const setSessionCookie = async (payload: SessionPayload) => {
  const token = await signSession(payload);
  const cookieStore = await cookies();
  cookieStore.set(getSessionCookieName(), token, buildCookieOptions());
};

export const clearSessionCookie = async () => {
  const cookieStore = await cookies();
  cookieStore.set(getSessionCookieName(), "", {
    ...buildCookieOptions(),
    maxAge: 0,
  });
};
