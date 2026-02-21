const SUPABASE_URL = "https://ivomdzongrguaaliljqh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_trINiPqOuXDGnjsbvO1JzA_m9YDL4Ry";

let supabaseClient;
let sessionRestorePromise = null;

export async function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");

  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce"
    }
  });

  return supabaseClient;
}

export function buildRedirectUrl(targetPage) {
  return new URL(targetPage, window.location.href).toString();
}

export function getCurrentPage() {
  const path = window.location.pathname;
  return path.split("/").pop() || "index.html";
}

export function isAuthPage(pageName = getCurrentPage()) {
  return pageName === "login.html" || pageName === "register.html";
}

export function isProtectedPage(pageName = getCurrentPage()) {
  return pageName === "profile.html";
}

export async function waitForSessionRestore(supabase, timeoutMs = 5000) {
  if (sessionRestorePromise) {
    return sessionRestorePromise;
  }

  sessionRestorePromise = (async () => {
    const { data: existing, error: existingError } = await supabase.auth.getSession();
    if (existingError) {
      throw existingError;
    }

    if (existing?.session) {
      return existing.session;
    }

    const queryParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const code = queryParams.get("code");
    const accessToken = queryParams.get("access_token") || hashParams.get("access_token");
    const refreshToken = queryParams.get("refresh_token") || hashParams.get("refresh_token");
    const type = queryParams.get("type") || hashParams.get("type");

    const hasAuthCallbackParams =
      Boolean(code) ||
      Boolean(accessToken) ||
      Boolean(refreshToken) ||
      Boolean(type) ||
      queryParams.has("error") ||
      queryParams.has("error_description");

    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        throw exchangeError;
      }
    } else if (accessToken && refreshToken) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      if (sessionError) {
        throw sessionError;
      }
    }

    const waitForSession = hasAuthCallbackParams
      ? await new Promise((resolve) => {
          let settled = false;
          let timerId;

          const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
            if (settled || !session) {
              return;
            }

            settled = true;
            clearTimeout(timerId);
            listener.subscription.unsubscribe();
            resolve(session);
          });

          timerId = setTimeout(async () => {
            if (settled) {
              return;
            }

            settled = true;
            listener.subscription.unsubscribe();
            const { data: finalData } = await supabase.auth.getSession();
            resolve(finalData?.session || null);
          }, timeoutMs);
        })
      : null;

    const { data: finalData, error: finalError } = await supabase.auth.getSession();
    if (finalError) {
      throw finalError;
    }

    const finalSession = finalData?.session || waitForSession || null;

    if (hasAuthCallbackParams) {
      const removable = new Set([
        "code",
        "access_token",
        "refresh_token",
        "type",
        "expires_at",
        "expires_in",
        "token_type",
        "provider_token",
        "provider_refresh_token"
      ]);

      const cleanQuery = new URLSearchParams(window.location.search);
      for (const key of removable) {
        cleanQuery.delete(key);
      }

      const nextQuery = cleanQuery.toString();
      const cleanUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    return finalSession;
  })();

  try {
    return await sessionRestorePromise;
  } finally {
    sessionRestorePromise = null;
  }
}

function normalizeFullName(value) {
  const sanitized = String(value || "").trim().replace(/\s+/g, " ");
  return sanitized.length > 0 ? sanitized : null;
}

export async function upsertOwnProfile(supabase, user, preferredFullName) {
  if (!user?.id) {
    return { error: new Error("User is required for profile upsert.") };
  }

  const fullName = normalizeFullName(
    preferredFullName || user.user_metadata?.full_name || user.user_metadata?.name
  );

  const payload = {
    id: user.id,
    full_name: fullName
  };

  const { error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id", ignoreDuplicates: true });

  return { error: error || null };
}

