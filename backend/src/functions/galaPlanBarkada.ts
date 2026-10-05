import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { getCurrentUser, getOptionalCurrentUser } from "../utils/social";
import { getPlanById, getProfilesByUserIds, isActive, isUuid, mapOwner, type PlanRow } from "./galaPlans";

type Rsvp = "going" | "maybe" | "no";
type MemberRow = { user_id: string; rsvp: Rsvp; paid: boolean };
type PollRow = { id: string; question: string; created_at: string };
type OptionRow = { id: string; poll_id: string; place_id: string | null; label: string; sort_order: number };
type VoteRow = { poll_id: string; option_id: string; user_id: string };

const RSVP_VALUES = new Set<Rsvp>(["going", "maybe", "no"]);
const MAX_POLL_OPTIONS = 4;

// Thrown when the barkada migration has not been applied yet.
class BarkadaUnavailableError extends Error {}

function isMissingTable(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  return code === "42P01" || code === "PGRST205";
}

function check<T>(result: { data: T; error: unknown }): T {
  if (result.error) {
    if (isMissingTable(result.error)) throw new BarkadaUnavailableError();
    throw result.error;
  }
  return result.data;
}

function json(status: number, body: unknown): HttpResponseInit {
  return { status, jsonBody: body };
}

function isAuthError(error: unknown) {
  return error instanceof Error && error.message.toLowerCase().includes("authorization");
}

function handleError(context: InvocationContext, label: string, error: unknown): HttpResponseInit {
  if (error instanceof BarkadaUnavailableError) return json(200, { available: false });
  if (isAuthError(error)) return json(401, { message: "Sign in to join this gala." });
  context.error(`${label} failed:`, error);
  return json(500, { message: "Something went wrong. Try again." });
}

// Owners always see their plan; everyone else only while it is active and public.
async function loadViewablePlan(planId: string, viewerId: string | null): Promise<PlanRow | null> {
  if (!isUuid(planId)) return null;
  const plan = await getPlanById(planId);
  if (!plan || plan.status === "deleted") return null;
  if (plan.user_id === viewerId) return plan;
  // Link access: private plans are unlisted, but the id link is the invite, so invited friends can view and RSVP.
  return isActive(plan) ? plan : null;
}

async function buildBarkadaPayload(plan: PlanRow, viewerId: string | null) {
  const supabase = await getSupabaseAdminClient();
  const members = check(
    await (supabase.from("gala_plan_members") as any).select("user_id, rsvp, paid").eq("plan_id", plan.id)
  ) as MemberRow[];
  const polls = check(
    await (supabase.from("gala_plan_polls") as any).select("id, question, created_at").eq("plan_id", plan.id).order("created_at")
  ) as PollRow[];
  const pollIds = polls.map((poll) => poll.id);
  const options = pollIds.length
    ? (check(
        await (supabase.from("gala_plan_poll_options") as any)
          .select("id, poll_id, place_id, label, sort_order")
          .in("poll_id", pollIds)
          .order("sort_order")
      ) as OptionRow[])
    : [];
  const votes = pollIds.length
    ? (check(await (supabase.from("gala_plan_poll_votes") as any).select("poll_id, option_id, user_id").in("poll_id", pollIds)) as VoteRow[])
    : [];

  const ownerAsMember = members.some((member) => member.user_id === plan.user_id)
    ? []
    : [{ user_id: plan.user_id, rsvp: "going" as Rsvp, paid: false }];
  const allMembers = [...ownerAsMember, ...members];
  const profiles = await getProfilesByUserIds(allMembers.map((member) => member.user_id).concat(votes.map((vote) => vote.user_id)));

  return {
    available: true,
    viewer_rsvp: allMembers.find((member) => member.user_id === viewerId)?.rsvp ?? null,
    members: allMembers.map((member) => ({
      ...member,
      is_owner: member.user_id === plan.user_id,
      profile: mapOwner(profiles.get(member.user_id)),
    })),
    polls: polls.map((poll) => {
      const pollVotes = votes.filter((vote) => vote.poll_id === poll.id);
      return {
        id: poll.id,
        question: poll.question,
        viewer_option_id: pollVotes.find((vote) => vote.user_id === viewerId)?.option_id ?? null,
        total_votes: pollVotes.length,
        options: options
          .filter((option) => option.poll_id === poll.id)
          .map((option) => ({
            id: option.id,
            label: option.label,
            place_id: option.place_id,
            votes: pollVotes.filter((vote) => vote.option_id === option.id).length,
            voters: pollVotes
              .filter((vote) => vote.option_id === option.id)
              .map((vote) => mapOwner(profiles.get(vote.user_id)))
              .filter(Boolean),
          })),
      };
    }),
  };
}

async function readBody(request: HttpRequest): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function getGalaPlanBarkada(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const viewer = await getOptionalCurrentUser(request);
    const plan = await loadViewablePlan(String(request.params.id ?? ""), viewer?.id ?? null);
    if (!plan) return json(404, { message: "Gala plan not found." });
    return json(200, await buildBarkadaPayload(plan, viewer?.id ?? null));
  } catch (error) {
    return handleError(context, "GET barkada", error);
  }
}

export async function putGalaPlanRsvp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await getCurrentUser(request);
    const plan = await loadViewablePlan(String(request.params.id ?? ""), user.id);
    if (!plan) return json(404, { message: "Gala plan not found." });

    const rsvp = (await readBody(request)).rsvp as Rsvp;
    if (!RSVP_VALUES.has(rsvp)) return json(400, { message: "RSVP must be going, maybe, or no." });

    const supabase = await getSupabaseAdminClient();
    check(
      await (supabase.from("gala_plan_members") as any).upsert(
        { plan_id: plan.id, user_id: user.id, rsvp, updated_at: new Date().toISOString() },
        { onConflict: "plan_id,user_id" }
      )
    );
    return json(200, await buildBarkadaPayload(plan, user.id));
  } catch (error) {
    return handleError(context, "PUT rsvp", error);
  }
}

export async function patchGalaPlanMember(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await getCurrentUser(request);
    const plan = await loadViewablePlan(String(request.params.id ?? ""), user.id);
    if (!plan || plan.user_id !== user.id) return json(404, { message: "Gala plan not found." });

    const memberId = String(request.params.userId ?? "");
    const paid = (await readBody(request)).paid;
    if (!isUuid(memberId) || typeof paid !== "boolean") return json(400, { message: "A member and paid status are required." });

    const supabase = await getSupabaseAdminClient();
    check(
      await (supabase.from("gala_plan_members") as any).upsert(
        { plan_id: plan.id, user_id: memberId, paid, updated_at: new Date().toISOString() },
        { onConflict: "plan_id,user_id" }
      )
    );
    return json(200, await buildBarkadaPayload(plan, user.id));
  } catch (error) {
    return handleError(context, "PATCH member", error);
  }
}

export async function postGalaPlanPoll(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await getCurrentUser(request);
    const plan = await loadViewablePlan(String(request.params.id ?? ""), user.id);
    if (!plan || plan.user_id !== user.id) return json(404, { message: "Gala plan not found." });

    const body = await readBody(request);
    const question = typeof body.question === "string" ? body.question.trim().slice(0, 120) : "";
    const options = (Array.isArray(body.options) ? body.options : [])
      .map((option) => {
        const entry = (option ?? {}) as Record<string, unknown>;
        const label = typeof entry.label === "string" ? entry.label.trim().slice(0, 80) : "";
        const placeId = typeof entry.place_id === "string" && isUuid(entry.place_id) ? entry.place_id : null;
        return label ? { label, place_id: placeId } : null;
      })
      .filter((option): option is { label: string; place_id: string | null } => option !== null)
      .slice(0, MAX_POLL_OPTIONS);

    if (!question || options.length < 2) return json(400, { message: "Add a question and at least 2 options." });

    const supabase = await getSupabaseAdminClient();
    const poll = check(
      await (supabase.from("gala_plan_polls") as any).insert({ plan_id: plan.id, created_by: user.id, question }).select("id").single()
    ) as { id: string };
    check(
      await (supabase.from("gala_plan_poll_options") as any).insert(
        options.map((option, index) => ({ poll_id: poll.id, place_id: option.place_id, label: option.label, sort_order: index }))
      )
    );
    return json(201, await buildBarkadaPayload(plan, user.id));
  } catch (error) {
    return handleError(context, "POST poll", error);
  }
}

export async function deleteGalaPlanPoll(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await getCurrentUser(request);
    const plan = await loadViewablePlan(String(request.params.id ?? ""), user.id);
    const pollId = String(request.params.pollId ?? "");
    if (!plan || plan.user_id !== user.id || !isUuid(pollId)) return json(404, { message: "Poll not found." });

    const supabase = await getSupabaseAdminClient();
    check(await (supabase.from("gala_plan_polls") as any).delete().eq("id", pollId).eq("plan_id", plan.id));
    return json(200, await buildBarkadaPayload(plan, user.id));
  } catch (error) {
    return handleError(context, "DELETE poll", error);
  }
}

export async function putGalaPlanPollVote(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await getCurrentUser(request);
    const plan = await loadViewablePlan(String(request.params.id ?? ""), user.id);
    const pollId = String(request.params.pollId ?? "");
    const optionId = (await readBody(request)).option_id;
    if (!plan || !isUuid(pollId) || typeof optionId !== "string" || !isUuid(optionId)) {
      return json(400, { message: "Pick an option to vote." });
    }

    const supabase = await getSupabaseAdminClient();
    const option = check(
      await (supabase.from("gala_plan_poll_options") as any)
        .select("id, poll_id, gala_plan_polls!inner(plan_id)")
        .eq("id", optionId)
        .eq("poll_id", pollId)
        .eq("gala_plan_polls.plan_id", plan.id)
        .maybeSingle()
    );
    if (!option) return json(404, { message: "Poll option not found." });

    check(
      await (supabase.from("gala_plan_poll_votes") as any).upsert(
        { poll_id: pollId, option_id: optionId, user_id: user.id, created_at: new Date().toISOString() },
        { onConflict: "poll_id,user_id" }
      )
    );
    return json(200, await buildBarkadaPayload(plan, user.id));
  } catch (error) {
    return handleError(context, "PUT vote", error);
  }
}

app.http("galaPlanBarkada", { methods: ["GET"], authLevel: "anonymous", route: "gala-plans/{id:guid}/barkada", handler: getGalaPlanBarkada });
app.http("galaPlanRsvp", { methods: ["PUT"], authLevel: "anonymous", route: "gala-plans/{id:guid}/rsvp", handler: putGalaPlanRsvp });
app.http("galaPlanMember", { methods: ["PATCH"], authLevel: "anonymous", route: "gala-plans/{id:guid}/members/{userId:guid}", handler: patchGalaPlanMember });
app.http("galaPlanPollCreate", { methods: ["POST"], authLevel: "anonymous", route: "gala-plans/{id:guid}/polls", handler: postGalaPlanPoll });
app.http("galaPlanPollDelete", { methods: ["DELETE"], authLevel: "anonymous", route: "gala-plans/{id:guid}/polls/{pollId:guid}", handler: deleteGalaPlanPoll });
app.http("galaPlanPollVote", { methods: ["PUT"], authLevel: "anonymous", route: "gala-plans/{id:guid}/polls/{pollId:guid}/vote", handler: putGalaPlanPollVote });
