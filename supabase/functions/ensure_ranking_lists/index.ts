import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  createAuthClient,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireUser,
  handleOptions,
  corsHeaders
} from "../_shared/supabaseClients.ts";

type RequestBody = {
  years: number[];
  custom?: string[];
};

serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const authClient = createAuthClient(authHeader);
    const user = await requireUser(authClient);
    const serviceClient = createServiceClient();

    const body = (await req.json()) as RequestBody;
    const years = body.years ?? [];
    const custom = body.custom ?? [];

    console.log("ensure_ranking_lists", { userId: user.id, years, custom });

    for (const year of years) {
      const { data: existing, error: selectError } = await serviceClient
        .from("ranking_lists")
        .select("id")
        .eq("user_id", user.id)
        .eq("kind", "year")
        .eq("year", year)
        .maybeSingle();

      if (selectError) throw selectError;

      if (!existing) {
        const { error: insertError } = await serviceClient
          .from("ranking_lists")
          .insert({ user_id: user.id, kind: "year", year, name: String(year) });
        if (insertError) throw insertError;
      }
    }

    for (const name of custom) {
      const { data: existing, error: selectError } = await serviceClient
        .from("ranking_lists")
        .select("id")
        .eq("user_id", user.id)
        .eq("kind", "custom")
        .eq("name", name)
        .maybeSingle();

      if (selectError) throw selectError;

      if (!existing) {
        const mode = name === "Needs listening" ? "collection" : "ranked";
        const description = name === "Needs listening" ? "Albums to listen to" : null;
        const { error: insertError } = await serviceClient
          .from("ranking_lists")
          .insert({ user_id: user.id, kind: "custom", name, mode, description });
        if (insertError) throw insertError;
      }
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("ensure_ranking_lists error", err);
    const status =
      err instanceof Error && (err.message === "Unauthorized" || err.message.includes("Authorization"))
        ? 401
        : 500;
    return errorResponse(err instanceof Error ? err.message : "Unexpected error", status);
  }
});
