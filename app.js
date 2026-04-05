const nav = document.querySelector(".site-nav");
const headerInner = document.querySelector(".header-inner");
const navLinks = document.querySelectorAll(".site-nav a");
const themeToggle = document.getElementById("themeToggle");
const MEMBER_ROUTE_HREFS = new Set(["profile.html", "skills.html", "requests.html", "messages.html", "chat.html"]);
const PUBLIC_ROUTE_HREFS = new Set(["index.html"]);
const AUTH_ROUTE_HREFS = new Set(["login.html", "register.html"]);
const mobileNavMediaQuery = window.matchMedia("(max-width: 768px)");
let menuToggle = null;
let navActions = null;
let themeToggleOriginalNextSibling = themeToggle ? themeToggle.nextElementSibling : null;

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

function setupBackButtonRedirect() {
  const currentPath = window.location.pathname.toLowerCase();
  if (currentPath.endsWith("/index.html") || currentPath === "/" || currentPath.endsWith("\\")) {
    return;
  }

  window.history.pushState(null, "", window.location.href);
  const redirectToHome = (event) => {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    safeRedirect("index.html");
  };

  window.addEventListener("popstate", redirectToHome);
  document.addEventListener("backbutton", redirectToHome);
}

setupBackButtonRedirect();

function setNavigationPending(isPending) {
  if (!nav) {
    return;
  }
  nav.style.visibility = isPending ? "hidden" : "visible";
  nav.setAttribute("aria-busy", isPending ? "true" : "false");
  if (menuToggle) {
    menuToggle.style.visibility = isPending ? "hidden" : "visible";
    menuToggle.setAttribute("aria-busy", isPending ? "true" : "false");
  }
  if (themeToggle) {
    themeToggle.style.visibility = isPending ? "hidden" : "visible";
    themeToggle.setAttribute("aria-busy", isPending ? "true" : "false");
  }
}

function ensureHeaderActions() {
  if (!headerInner) {
    return null;
  }

  const existing = headerInner.querySelector(".nav-actions");
  if (existing) {
    return existing;
  }

  const container = document.createElement("div");
  container.className = "nav-actions";
  headerInner.insertBefore(container, nav);
  return container;
}

function ensureMobileMenuToggle() {
  if (!nav || !headerInner) {
    return null;
  }

  const existing = document.getElementById("menuToggle");
  if (existing) {
    existing.setAttribute("aria-controls", "siteNav");
    return existing;
  }

  nav.id = nav.id || "siteNav";

  const button = document.createElement("button");
  button.type = "button";
  button.id = "menuToggle";
  button.className = "menu-toggle";
  button.setAttribute("aria-controls", nav.id);
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", "Open navigation menu");
  button.innerHTML = '<span aria-hidden="true">&#9776;</span>';
  if (navActions) {
    navActions.appendChild(button);
  } else {
    headerInner.insertBefore(button, nav);
  }
  return button;
}

function moveThemeToggleIntoNav() {
  if (!nav || !themeToggle || themeToggle.parentElement === nav) {
    return;
  }

  if (themeToggleOriginalNextSibling && themeToggleOriginalNextSibling.parentElement === nav) {
    nav.insertBefore(themeToggle, themeToggleOriginalNextSibling);
  } else {
    nav.appendChild(themeToggle);
  }
}

function moveThemeToggleToHeaderActions() {
  if (!themeToggle || !navActions || themeToggle.parentElement === navActions) {
    return;
  }
  navActions.appendChild(themeToggle);
}

function closeMobileMenu() {
  if (!nav || !menuToggle) {
    return;
  }
  nav.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Open navigation menu");
}

function toggleMobileMenu() {
  if (!nav || !menuToggle || !mobileNavMediaQuery.matches) {
    return;
  }
  const isOpen = nav.classList.toggle("is-open");
  menuToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  menuToggle.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
}

navActions = ensureHeaderActions();
menuToggle = ensureMobileMenuToggle();

function applyResponsiveNavLayout() {
  if (mobileNavMediaQuery.matches) {
    moveThemeToggleToHeaderActions();
    return;
  }
  moveThemeToggleIntoNav();
  closeMobileMenu();
}

applyResponsiveNavLayout();

if (menuToggle) {
  menuToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMobileMenu();
  });
}

if (nav) {
  nav.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.closest("a") && mobileNavMediaQuery.matches) {
      closeMobileMenu();
    }
  });
}

document.addEventListener("click", (event) => {
  if (!nav || !menuToggle || !mobileNavMediaQuery.matches) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }
  if (nav.contains(target) || menuToggle.contains(target)) {
    return;
  }
  closeMobileMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMobileMenu();
  }
});

if (typeof mobileNavMediaQuery.addEventListener === "function") {
  mobileNavMediaQuery.addEventListener("change", (event) => {
    applyResponsiveNavLayout();
    if (!event.matches) {
      closeMobileMenu();
    }
  });
} else if (typeof mobileNavMediaQuery.addListener === "function") {
  mobileNavMediaQuery.addListener(() => {
    applyResponsiveNavLayout();
    if (!mobileNavMediaQuery.matches) {
      closeMobileMenu();
    }
  });
}

function ensureNavbarLogoutControl() {
  if (!nav) {
    return null;
  }

  const existing = nav.querySelector("#navLogoutBtn");
  if (existing) {
    existing.className = "nav-logout logout-btn";
    return existing;
  }

  const logoutLink = document.createElement("a");
  logoutLink.id = "navLogoutBtn";
  logoutLink.href = "#";
  logoutLink.textContent = "Logout";
  logoutLink.className = "nav-logout logout-btn";
  logoutLink.style.display = "none";
  if (themeToggle && themeToggle.parentElement === nav) {
    nav.insertBefore(logoutLink, themeToggle);
  } else {
    nav.appendChild(logoutLink);
  }
  return logoutLink;
}

function updateNavbar(user) {
  const isLoggedIn = Boolean(user);
  const allNavLinks = Array.from(document.querySelectorAll(".site-nav a"));

  allNavLinks.forEach((link) => {
    const href = (link.getAttribute("href") || "").trim().toLowerCase();
    const isLogout = link.id === "navLogoutBtn";

    if (isLogout) {
      link.style.display = isLoggedIn ? "" : "none";
      return;
    }

    if (PUBLIC_ROUTE_HREFS.has(href)) {
      link.style.display = "";
      return;
    }

    if (AUTH_ROUTE_HREFS.has(href)) {
      link.style.display = isLoggedIn ? "none" : "";
      return;
    }

    if (MEMBER_ROUTE_HREFS.has(href)) {
      link.style.display = isLoggedIn ? "" : "none";
      return;
    }

    // Hide extra nav entries that are not part of the required states.
    link.style.display = "none";
  });

  applyResponsiveNavLayout();
  closeMobileMenu();
}

function requireAuth({ user, loginUrl }) {
  if (Boolean(user)) {
    return false;
  }
  return safeRedirect(loginUrl);
}

setNavigationPending(true);

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
  const homeUrl = buildRedirectUrl("index.html");
  const logoutLink = ensureNavbarLogoutControl();

  if (logoutLink) {
    logoutLink.addEventListener("click", async (event) => {
      event.preventDefault();
      logoutLink.setAttribute("aria-disabled", "true");
      logoutLink.style.pointerEvents = "none";

      try {
        await supabase.auth.signOut();
        safeRedirect(homeUrl);
      } catch (error) {
        console.error("Logout failed:", error);
        logoutLink.removeAttribute("aria-disabled");
        logoutLink.style.pointerEvents = "";
        alert("Logout failed. Please try again.");
      }
    });
  }

  const session = await waitForSessionRestore(supabase);
  const user = session?.user || null;
  authLog("Route auth bootstrap", {
    page: currentPage,
    hasUser: Boolean(user)
  });

  updateNavbar(user);
  setNavigationPending(false);

  if (user) {
    const profileResult = await upsertOwnProfile(supabase, user);
    if (profileResult.error) {
      console.error("Profile upsert during session bootstrap failed:", profileResult.error.message);
    }
  }

  if (isAuthPage(currentPage) && user) {
    safeRedirect(homeUrl);
    return;
  }

  if (isProtectedPage(currentPage) && requireAuth({ user, loginUrl })) {
    return;
  }

  let redirecting = false;
  supabase.auth.onAuthStateChange((event, nextSession) => {
    if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") {
      return;
    }

    const nextUser = nextSession?.user || null;
    updateNavbar(nextUser);
    setNavigationPending(false);
    authLog("Route auth state change", {
      event,
      page: currentPage,
      hasUser: Boolean(nextUser)
    });

    if (redirecting) {
      return;
    }

    if (event === "SIGNED_OUT" && isProtectedPage(currentPage)) {
      redirecting = requireAuth({ user: nextUser, loginUrl });
      return;
    }

    if (event === "SIGNED_IN" && isAuthPage(currentPage) && nextUser) {
      redirecting = safeRedirect(homeUrl);
    }
  });
}

bootstrapRouteAuth().catch((error) => {
  console.error("Route auth bootstrap failed:", error);
  setNavigationPending(false);
});
