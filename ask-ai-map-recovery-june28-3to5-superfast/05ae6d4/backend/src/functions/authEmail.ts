import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { validateJwt } from "../utils/auth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function getAccountUserIdsByEmail(email: string) {
  const supabase = await getSupabaseAdminClient();

  const { data, error } = await (supabase.from("users") as any)
    .select("id")
    .eq("email", email);

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<{ id: string }>).map((user) => user.id);
}

async function getAuthUserIdsByEmail(email: string) {
  const supabase = await getSupabaseAdminClient();
  const matchingUserIds = new Set<string>();

  const perPage = 1000;

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    const users = data?.users ?? [];

    users.forEach((user) => {
      const identityEmails = (user.identities ?? [])
        .map((identity) => normalizeEmail((identity.identity_data as Record<string, unknown> | null | undefined)?.email))
        .filter(Boolean);

      if (normalizeEmail(user.email) === email || identityEmails.includes(email)) {
        matchingUserIds.add(user.id);
      }
    });

    if (users.length < perPage) {
      break;
    }
  }

  return [...matchingUserIds];
}

async function getUserIdsByEmail(email: string) {
  const userIds = new Set<string>();
  const [accountUserIds, authUserIds] = await Promise.all([
    getAccountUserIdsByEmail(email),
    getAuthUserIdsByEmail(email),
  ]);

  accountUserIds.forEach((userId) => userIds.add(userId));
  authUserIds.forEach((userId) => userIds.add(userId));

  return [...userIds];
}

async function emailExistsInAuth(email: string) {
  return (await getUserIdsByEmail(email)).length > 0;
}

async function emailBelongsToAnotherAccount(email: string, currentUserId: string) {
  const userIds = await getUserIdsByEmail(email);
  return userIds.some((userId) => userId !== currentUserId);
}

export async function authEmailConflict(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const authUser = await validateJwt(request);
    const email = normalizeEmail(authUser.email);

    if (!email) {
      return {
        status: 400,
        jsonBody: {
          message: "Signed-in account has no email address.",
        },
      };
  }

    return {
      status: 200,
      jsonBody: {
        email,
        conflict: await emailBelongsToAnotherAccount(email, authUser.id),
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("authorization")) {
      return {
        status: 401,
        jsonBody: {
          message: "Missing or invalid Authorization header.",
        },
      };
    }

    context.error("GET /api/auth/email-conflict failed:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Could not check account email.",
      },
    };
  }
}

export async function authEmailExists(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const email = normalizeEmail(request.query.get("email"));

    if (!email || !EMAIL_PATTERN.test(email)) {
      return {
        status: 400,
        jsonBody: {
          message: "Enter a valid email address.",
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        email,
        exists: await emailExistsInAuth(email),
      },
    };
  } catch (error) {
    context.error("GET /api/auth/email-exists failed:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Could not check email.",
      },
    };
  }
}

app.http("authEmailExists", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "auth/email-exists",
  handler: authEmailExists,
});

app.http("authEmailConflict", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "auth/email-conflict",
  handler: authEmailConflict,
});
