const form = document.querySelector("form");
const alertBox = document.querySelector(".alert");
const googleButton = document.querySelector(".google-btn");
const formType = document.body.dataset.form;

const iconEyeOpen = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"></path>
  <circle cx="12" cy="12" r="3"></circle>
</svg>`;

const iconEyeClosed = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.86 21.86 0 0 1 5.06-5.94"></path>
  <path d="M1 1l22 22"></path>
  <path d="M9.53 9.53A3 3 0 0 0 12 15a3 3 0 0 0 2.47-5.47"></path>
  <path d="M14.47 14.47A3 3 0 0 1 9.53 9.53"></path>
  <path d="M21 12s-4-7-9-7a9.53 9.53 0 0 0-4.06.94"></path>
</svg>`;

function showAlert(type, message) {
  if (!alertBox) {
    return;
  }

  alertBox.textContent = message;
  alertBox.classList.remove("success", "error");
  alertBox.classList.add(type);
  alertBox.style.display = "block";
}

function clearAlert() {
  if (!alertBox) {
    return;
  }

  alertBox.textContent = "";
  alertBox.classList.remove("success", "error");
  alertBox.style.display = "none";
}

function mapAuthError(errorMessage) {
  const lower = String(errorMessage || "").toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }

  if (lower.includes("email not confirmed")) {
    return "Please verify your email before signing in.";
  }

  if (lower.includes("user already registered")) {
    return "An account with this email already exists.";
  }

  if (lower.includes("password should be at least")) {
    return "Password must be at least 6 characters.";
  }

  if (lower.includes("network") || lower.includes("fetch")) {
    return "Network error. Please check your connection.";
  }

  return "Authentication failed. Please try again.";
}

function initPasswordToggles() {
  const toggleButtons = document.querySelectorAll(".password-toggle");

  toggleButtons.forEach((btn) => {
    const targetId = btn.dataset.target;
    const input = document.getElementById(targetId);

    if (!input) {
      return;
    }

    btn.innerHTML = iconEyeOpen;
    btn.addEventListener("click", () => {
      const isHidden = input.type === "password";
      input.type = isHidden ? "text" : "password";
      btn.innerHTML = isHidden ? iconEyeClosed : iconEyeOpen;
    });
  });
}

function safeRedirect(url) {
  try {
    const current = new URL(window.location.href);
    const target = new URL(url, window.location.origin);

    if (target.origin !== window.location.origin) {
      console.warn("[auth] Blocked cross-origin redirect.", {
        currentOrigin: current.origin,
        targetOrigin: target.origin
      });
      return false;
    }

    if (current.href === target.href) {
      return false;
    }

    const key = `auth:redirect:${target.pathname}`;
    const now = Date.now();
    const payload = JSON.parse(window.sessionStorage.getItem(key) || "{}");
    const count = now - Number(payload.ts || 0) < 10000 ? Number(payload.count || 0) + 1 : 1;

    window.sessionStorage.setItem(key, JSON.stringify({ ts: now, count }));

    if (count > 3) {
      console.warn("[auth] Redirect loop guard triggered.", {
        targetPath: target.pathname,
        count
      });
      return false;
    }

    window.location.replace(target.href);
    return true;
  } catch (error) {
    console.error("[auth] Failed to redirect safely:", error);
    return false;
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function bootstrapAuth() {
  initPasswordToggles();

  const {
    getSupabaseClient,
    buildRedirectUrl,
    getSupabaseOrigin,
    waitForSessionRestore,
    upsertOwnProfile,
    authLog,
    authWarn
  } = await import("./supabase.js");

  const supabase = await getSupabaseClient();
  const supabaseOrigin = getSupabaseOrigin();
  const homeUrl = buildRedirectUrl("index.html");
  const loginUrl = buildRedirectUrl("login.html");

  let redirecting = false;
  const redirectToHome = () => {
    if (redirecting) {
      return;
    }

    redirecting = true;
    const redirected = safeRedirect(homeUrl);
    if (!redirected) {
      redirecting = false;
    }
  };

  const params = new URLSearchParams(window.location.search);
  const oauthError = params.get("error_description") || params.get("error");
  if (oauthError) {
    showAlert("error", decodeURIComponent(oauthError));
  }

  const restoredSession = await waitForSessionRestore(supabase);
  authLog("Auth page session restore complete", {
    page: window.location.pathname,
    hasSession: Boolean(restoredSession?.user)
  });

  if (restoredSession?.user) {
    redirectToHome();
    return;
  }

  const {
    data: { subscription }
  } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session?.user) {
      authLog("SIGNED_IN event on auth page; redirecting to home.");
      redirectToHome();
    }
  });

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAlert();

    const submitButton = form.querySelector("button[type='submit']");
    if (submitButton) {
      submitButton.disabled = true;
    }

    try {
      if (formType === "login") {
        const email = normalizeEmail(document.getElementById("loginEmail")?.value);
        const password = String(document.getElementById("loginPassword")?.value || "");

        if (!email || !password) {
          showAlert("error", "Please enter email and password.");
          return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
          showAlert("error", mapAuthError(error.message));
          return;
        }

        if (data?.user) {
          const profileResult = await upsertOwnProfile(supabase, data.user);
          if (profileResult.error) {
            console.error("Profile upsert failed after login:", profileResult.error.message);
          }
        }

        const restored = await waitForSessionRestore(supabase, 3000);
        authLog("Post-password login session check", {
          hasSession: Boolean(restored?.user)
        });

        if (!restored?.user) {
          authWarn("No session after password login on auth page.");
          showAlert("error", "Login is taking longer than expected. Please retry.");
          return;
        }

        redirectToHome();
        return;
      }

      const fullName = String(document.getElementById("fullName")?.value || "").trim();
      const email = normalizeEmail(document.getElementById("registerEmail")?.value);
      const password = String(document.getElementById("registerPassword")?.value || "");

      if (!fullName || !email || !password) {
        showAlert("error", "Please complete all required fields.");
        return;
      }

      if (password.length < 8) {
        showAlert("error", "Password must be at least 8 characters.");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: loginUrl
        }
      });

      if (error) {
        showAlert("error", mapAuthError(error.message));
        return;
      }

      if (data?.user && data?.session) {
        const profileResult = await upsertOwnProfile(supabase, data.user, fullName);
        if (profileResult.error) {
          console.error("Profile upsert failed after register:", profileResult.error.message);
        }

        redirectToHome();
        return;
      }

      showAlert("success", "Registration successful. Please verify your email, then sign in.");
    } catch (error) {
      console.error("Auth form submit error:", error);
      showAlert("error", "Unexpected error. Please try again.");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });

  if (googleButton) {
    googleButton.addEventListener("click", async () => {
      clearAlert();
      googleButton.disabled = true;

      try {
        let canReachAuthHost = true;
        try {
          await fetch(`${supabaseOrigin}/auth/v1/health`, {
            method: "GET",
            mode: "no-cors",
            cache: "no-store"
          });
        } catch (_error) {
          canReachAuthHost = false;
        }

        if (!canReachAuthHost) {
          showAlert(
            "error",
            "Your phone cannot reach Supabase auth server. Disable Brave Shields/Private DNS or try another network/browser."
          );
          googleButton.disabled = false;
          return;
        }

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: homeUrl,
            skipBrowserRedirect: true,
            queryParams: {
              access_type: "offline",
              prompt: "consent"
            }
          }
        });

        if (error) {
          showAlert("error", mapAuthError(error.message));
          googleButton.disabled = false;
          return;
        }

        if (!data?.url) {
          showAlert("error", "Unable to start Google sign-in. Please try again.");
          googleButton.disabled = false;
          return;
        }

        authLog("Redirecting to OAuth authorize URL", {
          provider: "google",
          redirectOrigin: new URL(loginUrl).origin
        });
        window.location.assign(data.url);
      } catch (error) {
        console.error("Google OAuth error:", error);
        showAlert("error", "Google sign-in failed. Please try again.");
        googleButton.disabled = false;
      }
    });
  }

  window.addEventListener("beforeunload", () => {
    subscription.unsubscribe();
  });
}

bootstrapAuth().catch((error) => {
  console.error("Auth bootstrap error:", error);
  showAlert("error", "Unable to initialize authentication.");
});
