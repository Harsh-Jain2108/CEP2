const navLinks = document.querySelectorAll(".site-nav a");

navLinks.forEach((link) => {
  const href = link.getAttribute("href");
  if (href && window.location.pathname.endsWith(href)) {
    link.classList.add("active");
  }
});

function safeRedirect(url) {
  try {
    const current = new URL(window.location.href);
    const target = new URL(url, window.location.origin);

    if (target.origin !== window.location.origin) {
      console.warn("[auth] Blocked cross-origin redirect from app route guard.", {
        currentOrigin: current.origin,
        targetOrigin: target.origin
      });
      return false;
    }

    if (current.href === target.href) {
      return false;
    }

    const key = `route-auth:redirect:${target.pathname}`;
    const now = Date.now();
    const payload = JSON.parse(window.sessionStorage.getItem(key) || "{}");
    const count = now - Number(payload.ts || 0) < 10000 ? Number(payload.count || 0) + 1 : 1;

    window.sessionStorage.setItem(key, JSON.stringify({ ts: now, count }));

    if (count > 3) {
      console.warn("[auth] Route redirect loop guard triggered.", {
        targetPath: target.pathname,
        count
      });
      return false;
    }

    window.location.replace(target.href);
    return true;
  } catch (error) {
    console.error("[auth] Failed route redirect:", error);
    return false;
  }
}

function updateAuthNavVisibility(isLoggedIn) {
  const authLinks = document.querySelectorAll("a.nav-auth");
  authLinks.forEach((link) => {
    link.style.display = isLoggedIn ? "none" : "";
  });
}

function ensureLogoutButton(profileHeader, onLogout) {
  if (!profileHeader || document.getElementById("logoutBtn")) {
    return;
  }

  const logoutButton = document.createElement("button");
  logoutButton.id = "logoutBtn";
  logoutButton.type = "button";
  logoutButton.className = "btn btn-outline";
  logoutButton.textContent = "Logout";

  logoutButton.addEventListener("click", onLogout);
  profileHeader.appendChild(logoutButton);
}

async function bootstrapRouteAuth() {
  const {
    getSupabaseClient,
    buildRedirectUrl,
    getCurrentPage,
    isAuthPage,
    isProtectedPage,
    waitForSessionRestore,
    upsertOwnProfile,
    authLog
  } = await import("./supabase.js");

  const supabase = await getSupabaseClient();
  const currentPage = getCurrentPage();
  const loginUrl = buildRedirectUrl("login.html");
  const profileUrl = buildRedirectUrl("profile.html");

  const session = await waitForSessionRestore(supabase);
  const user = session?.user || null;
  authLog("Route auth bootstrap", {
    page: currentPage,
    hasUser: Boolean(user)
  });

  updateAuthNavVisibility(Boolean(user));

  if (user) {
    const profileResult = await upsertOwnProfile(supabase, user);
    if (profileResult.error) {
      console.error("Profile upsert during session bootstrap failed:", profileResult.error.message);
    }
  }

  if (isAuthPage(currentPage) && user) {
    safeRedirect(profileUrl);
    return;
  }

  if (isProtectedPage(currentPage) && !user) {
    safeRedirect(loginUrl);
    return;
  }

  if (isProtectedPage(currentPage) && user) {
    const profileHeader = document.querySelector(".profile-header");

    ensureLogoutButton(profileHeader, async (event) => {
      const button = event.currentTarget;
      button.disabled = true;

      try {
        await supabase.auth.signOut();
        safeRedirect(loginUrl);
      } catch (error) {
        console.error("Logout failed:", error);
        button.disabled = false;
        alert("Logout failed. Please try again.");
      }
    });
  }

  let redirecting = false;
  supabase.auth.onAuthStateChange((event, nextSession) => {
    if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") {
      return;
    }

    const nextUser = nextSession?.user || null;
    updateAuthNavVisibility(Boolean(nextUser));
    authLog("Route auth state change", {
      event,
      page: currentPage,
      hasUser: Boolean(nextUser)
    });

    if (redirecting) {
      return;
    }

    if (event === "SIGNED_OUT" && isProtectedPage(currentPage)) {
      redirecting = safeRedirect(loginUrl);
      return;
    }

    if (event === "SIGNED_IN" && isAuthPage(currentPage) && nextUser) {
      redirecting = safeRedirect(profileUrl);
    }
  });
}

bootstrapRouteAuth().catch((error) => {
  console.error("Route auth bootstrap failed:", error);
});
