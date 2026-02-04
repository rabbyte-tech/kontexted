import { jwtVerify } from "jose";
import { z } from "zod";

const tokenPayloadSchema = z.object({
  workspaceId: z.union([z.string(), z.number()]).transform((value) => String(value)),
  notePublicId: z.string(),
  noteId: z.union([z.string(), z.number()]).transform((value) => String(value)),
  userId: z.string().optional(),
  exp: z.number().optional(),
});

export type TokenPayload = z.infer<typeof tokenPayloadSchema>;

export const getToken = (request: Request) => {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    const [scheme, value] = authorization.split(" ");
    if (scheme?.toLowerCase() === "bearer" && value) {
      return value;
    }
  }

  const url = new URL(request.url);
  return url.searchParams.get("token");
};

export const verifyToken = async (token: string) => {
  const secret = new TextEncoder().encode(global.KONTEXTED_CONFIG.collab.tokenSecret);
  const { payload } = await jwtVerify(token, secret);
  return tokenPayloadSchema.parse(payload);
};
