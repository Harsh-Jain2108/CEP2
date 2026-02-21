const navLinks = document.querySelectorAll(".site-nav a");

navLinks.forEach((link) => {
  const href = link.getAttribute("href");
  if (href && window.location.pathname.endsWith(href)) {
    link.classList.add("active");
  }
});

function safeRedirect(url) {
  if (window.location.href !== url) {
    window.location.replace(url);
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
    upsertOwnProfile
  } = await import("./supabase.js");

  const supabase = await getSupabaseClient();
  const currentPage = getCurrentPage();
  const loginUrl = buildRedirectUrl("login.html");
  const profileUrl = buildRedirectUrl("profile.html");

  const session = await waitForSessionRestore(supabase);
  const user = session?.user || null;

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

  supabase.auth.onAuthStateChange((event, nextSession) => {
    const nextUser = nextSession?.user || null;
    updateAuthNavVisibility(Boolean(nextUser));

    if (event === "SIGNED_OUT" && isProtectedPage(currentPage)) {
      safeRedirect(loginUrl);
      return;
    }

    if (event === "SIGNED_IN" && isAuthPage(currentPage) && nextUser) {
      safeRedirect(profileUrl);
    }
  });
}

bootstrapRouteAuth().catch((error) => {
  console.error("Route auth bootstrap failed:", error);
});
