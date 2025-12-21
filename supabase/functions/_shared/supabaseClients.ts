import { createClient, SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_FUNCTIONS_SERVICE_ROLE_KEY");

if (!serviceRoleKey) {
  throw new Error("Missing service role key for Supabase (SUPABASE_SERVICE_ROLE_KEY or SERVICE_ROLE_KEY)");
}

export const createServiceClient = () => createClient(supabaseUrl, serviceRoleKey);

export const createAuthClient = (authHeader: string | null) => {
  if (!authHeader) {
    throw new Error("Missing Authorization header");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } }
  });
};

export const requireUser = async (client: SupabaseClient): Promise<User> => {
  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    throw new Error("Unauthorized");
  }

  return data.user;
};

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
    status
  });

export const errorResponse = (message: string, status = 400) =>
  jsonResponse({ error: message }, status);

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

export const handleOptions = (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
};
