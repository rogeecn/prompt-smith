import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

const getAuthSecret = () => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("Missing AUTH_SECRET");
  }
  return secret;
};

const SESSION_COOKIE_NAME = "prompt_smith_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

const SessionPayloadSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
});

export type SessionPayload = z.infer<typeof SessionPayloadSchema>;

const getSecret = () => new TextEncoder().encode(getAuthSecret());

export const getSessionCookieName = () => SESSION_COOKIE_NAME;
export const getSessionMaxAge = () => SESSION_MAX_AGE;

export const signSession = async (payload: SessionPayload) =>
  new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());

export const verifySessionToken = async (
  token: string
): Promise<SessionPayload | null> => {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const parsed = SessionPayloadSchema.safeParse({
      userId: typeof payload.sub === "string" ? payload.sub : "",
      email: typeof payload.email === "string" ? payload.email : "",
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};
