const SUPABASE_URL = "https://ivomdzongrguaaliljqh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_trINiPqOuXDGnjsbvO1JzA_m9YDL4Ry";

let supabaseClient;
let sessionRestorePromise = null;

const DEBUG_FLAG = "auth_debug";
const REDACT_KEYS = new Set([
  "password",
  "access_token",
  "refresh_token",
  "provider_token",
  "provider_refresh_token",
  "token"
]);

function isDebugEnabled() {
  try {
    if (window.location.search.includes(`${DEBUG_FLAG}=1`)) {
      return true;
    }
    return window.localStorage.getItem(DEBUG_FLAG) === "1";
  } catch (_error) {
    return false;
  }
}

function sanitizeLogData(input) {
  if (!input || typeof input !== "object") {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeLogData(item));
  }

  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (REDACT_KEYS.has(key.toLowerCase())) {
      output[key] = "[redacted]";
    } else if (typeof value === "object" && value !== null) {
      output[key] = sanitizeLogData(value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

export function authLog(message, details) {
  if (!isDebugEnabled()) {
    return;
  }
  if (typeof details === "undefined") {
    console.log(`[auth] ${message}`);
    return;
  }
  console.log(`[auth] ${message}`, sanitizeLogData(details));
}

export function authWarn(message, details) {
  if (typeof details === "undefined") {
    console.warn(`[auth] ${message}`);
    return;
  }
  console.warn(`[auth] ${message}`, sanitizeLogData(details));
}

function validateRuntimeConfig() {
  const pageIsHttps = window.location.protocol === "https:";
  const supabaseProtocol = new URL(SUPABASE_URL).protocol;
  const isProductionHost = !/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

  if (pageIsHttps && supabaseProtocol !== "https:") {
    throw new Error("Supabase URL must use HTTPS in production.");
  }

  if (isProductionHost && /localhost|127\.0\.0\.1/i.test(SUPABASE_URL)) {
    throw new Error("Supabase URL points to localhost in production.");
  }

  if (!pageIsHttps && isProductionHost) {
    authWarn("Page is not HTTPS in production-like host.", {
      origin: window.location.origin
    });
  }
}

function parseAuthCallbackParams() {
  const queryParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = queryParams.get("code");
  const accessToken = queryParams.get("access_token") || hashParams.get("access_token");
  const refreshToken = queryParams.get("refresh_token") || hashParams.get("refresh_token");
  const type = queryParams.get("type") || hashParams.get("type");
  const error = queryParams.get("error") || hashParams.get("error");
  const errorDescription =
    queryParams.get("error_description") || hashParams.get("error_description");

  const hasAuthCallbackParams =
    Boolean(code) ||
    Boolean(accessToken) ||
    Boolean(refreshToken) ||
    Boolean(type) ||
    Boolean(error) ||
    Boolean(errorDescription);

  return {
    queryParams,
    hashParams,
    code,
    accessToken,
    refreshToken,
    type,
    error,
    errorDescription,
    hasAuthCallbackParams
  };
}

function clearAuthCallbackFromUrl(queryParams, hashParams) {
  const removable = new Set([
    "code",
    "access_token",
    "refresh_token",
    "type",
    "expires_at",
    "expires_in",
    "token_type",
    "provider_token",
    "provider_refresh_token",
    "error",
    "error_code",
    "error_description"
  ]);

  for (const key of removable) {
    queryParams.delete(key);
    hashParams.delete(key);
  }

  const nextQuery = queryParams.toString();
  const nextHash = hashParams.toString();
  const cleanUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${nextHash ? `#${nextHash}` : ""}`;
  window.history.replaceState({}, document.title, cleanUrl);
}

async function waitForSessionAvailability(supabase, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      throw error;
    }
    if (data?.session) {
      return data.session;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

export async function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  validateRuntimeConfig();

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");

  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "implicit"
    }
  });

  authLog("Supabase client initialized", {
    origin: window.location.origin,
    supabaseOrigin: new URL(SUPABASE_URL).origin
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
      authLog("Session already available at restore start.");
      return existing.session;
    }

    const callback = parseAuthCallbackParams();
    authLog("Session restore callback params detected", {
      hasAuthCallbackParams: callback.hasAuthCallbackParams,
      hasCode: Boolean(callback.code),
      hasTokenPair: Boolean(callback.accessToken && callback.refreshToken),
      type: callback.type || null
    });

    if (callback.code) {
      const exchangeKey = `sb_code_exchanged:${callback.code}`;
      const alreadyExchanged = window.sessionStorage.getItem(exchangeKey) === "1";
      if (!alreadyExchanged) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(callback.code);
        if (exchangeError) {
          throw exchangeError;
        }
        window.sessionStorage.setItem(exchangeKey, "1");
      } else {
        authLog("Skipping duplicate code exchange.");
      }
    } else if (callback.accessToken && callback.refreshToken) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: callback.accessToken,
        refresh_token: callback.refreshToken
      });
      if (sessionError) {
        throw sessionError;
      }
    }

    if (callback.hasAuthCallbackParams) {
      clearAuthCallbackFromUrl(callback.queryParams, callback.hashParams);
    }

    if (!callback.hasAuthCallbackParams) {
      const { data: noCallbackData, error: noCallbackError } = await supabase.auth.getSession();
      if (noCallbackError) {
        throw noCallbackError;
      }
      return noCallbackData?.session || null;
    }

    const waitForSession = await waitForSessionAvailability(supabase, timeoutMs);
    if (waitForSession) {
      authLog("Session restored after callback.");
      return waitForSession;
    }

    const { data: finalData, error: finalError } = await supabase.auth.getSession();
    if (finalError) {
      throw finalError;
    }

    if (!finalData?.session && (callback.error || callback.errorDescription)) {
      authWarn("Auth callback returned error.", {
        error: callback.error,
        errorDescription: callback.errorDescription
      });
    }

    return finalData?.session || null;
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

