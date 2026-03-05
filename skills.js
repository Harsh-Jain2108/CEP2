(function attachSkillBackend(globalScope) {
  "use strict";

  const VALID_SKILL_TYPES = new Set(["teach", "learn"]);

  function normalizeSkillName(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function redirectToLoginIfNeeded(loginUrl) {
    if (!loginUrl) return;

    try {
      const target = new URL(loginUrl, window.location.origin);
      if (target.origin === window.location.origin) {
        window.location.replace(target.href);
      }
    } catch (_error) {}
  }

  async function getCurrentUserOrRedirect(supabase, loginUrl) {
    const {
      data: { user },
      error
    } = await supabase.auth.getUser();

    if (error) {
      console.log("Error:", error);
      throw error;
    }

    if (!user) {
      redirectToLoginIfNeeded(loginUrl);
      throw new Error("AUTH_REQUIRED");
    }

    return user;
  }

  async function searchSkills(supabase, input, options = {}) {
    await getCurrentUserOrRedirect(supabase, options.loginUrl);

    const searchTerm = normalizeSkillName(input?.searchTerm);
    const limit = Number.isInteger(input?.limit) ? input.limit : 8;

    if (!searchTerm) return [];

    const { data, error } = await supabase
      .from("skills")
      .select("id, name")
      .ilike("name", `%${searchTerm}%`)
      .limit(Math.max(1, Math.min(25, limit)));

    if (error) {
      console.log("Error:", error);
      throw error;
    }

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name
    }));
  }

  globalScope.SkillBackend = {
    searchSkills
  };
})(window);

document.addEventListener("DOMContentLoaded", async () => {

  const skillSearchBox = document.getElementById("skillSearchBox");
  const skillSearchToggle = document.getElementById("skillSearchToggle");
  const searchInput = document.getElementById("searchInput");
  const searchSuggestions = document.getElementById("searchSuggestions");
  const skillGrid = document.getElementById("skillGrid");
  const emptyState = document.getElementById("emptyState");

  if (!skillSearchBox || !skillSearchToggle || !searchInput || !searchSuggestions || !skillGrid || !emptyState) {
    return;
  }

  const { getSupabaseClient, waitForSessionRestore, buildRedirectUrl } = await import("./supabase.js");

  const supabase = await getSupabaseClient();
  const loginUrl = buildRedirectUrl("login.html");

  const session = await waitForSessionRestore(supabase);
  const currentUser = session?.user || null;

  if (!currentUser) {
    window.location.replace(loginUrl);
    return;
  }

  let suggestions = [];
  let activeIndex = -1;
  let debounceTimer = null;

  const setStatus = (message, isError = false) => {
    emptyState.textContent = message;
    emptyState.style.display = "block";
    emptyState.style.color = isError ? "#b42318" : "";
  };

  const clearStatus = () => {
    emptyState.textContent = "";
    emptyState.style.display = "none";
  };

  const normalizeSearch = (value) =>
    String(value || "").trim().replace(/\s+/g, " ");

  const escapeHtml = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const openSearch = () => {
    skillSearchBox.classList.add("is-open");
    searchInput.placeholder = "Search skills...";
    searchInput.focus();
  };

  const collapseIfEmpty = () => {
    if (normalizeSearch(searchInput.value)) return;
    skillSearchBox.classList.remove("is-open");
    searchInput.placeholder = "";
  };

  const clearSuggestions = () => {
    suggestions = [];
    activeIndex = -1;
    searchSuggestions.textContent = "";
    searchSuggestions.classList.remove("show");
  };

  const setActiveSuggestion = (index) => {
    if (!suggestions.length) {
      activeIndex = -1;
      return;
    }

    activeIndex = Math.max(0, Math.min(suggestions.length - 1, index));

    const nodes = searchSuggestions.querySelectorAll(".suggestion-item");

    nodes.forEach((node, idx) => {
      node.classList.toggle("active", idx === activeIndex);
    });
  };

  function renderTeacherCards(rows) {

    skillGrid.textContent = "";

    if (!rows.length) {
      setStatus("Skill unavailable");
      return;
    }

    clearStatus();

    rows.forEach((row) => {

      const profile = row.profiles;
      const teacherName = profile?.full_name || "Unknown";
      const location = profile?.location || "Not specified";
      const skillName = row.skills?.name || "";

      const card = document.createElement("article");

      card.className = "card skill-card";

      card.innerHTML = `
        <h3>${escapeHtml(teacherName)}</h3>
        <div class="skill-meta">
          <span>Teaches: ${escapeHtml(skillName)}</span>
        </div>
        <p class="connect-info">Location: ${escapeHtml(location)}</p>
      `;

      skillGrid.appendChild(card);

    });

  }

  async function discoverTeachersForSkill(skillName) {

    const normalizedSkillName = normalizeSearch(skillName);

    if (!normalizedSkillName) return;

    const { data: skillRow } = await supabase
      .from("skills")
      .select("id")
      .ilike("name", normalizedSkillName)
      .limit(1)
      .single();

    if (!skillRow?.id) {
      skillGrid.textContent = "";
      setStatus("Skill unavailable");
      return;
    }

    const skillId = skillRow.id;

    const { data, error } = await supabase
      .from("user_skills")
      .select(`
        user_id,
        skills!user_skills_skill_id_fkey(name),
        profiles!user_skills_user_id_fkey(full_name, location)
      `)
      .eq("skill_id", skillId)
      .eq("type", "teach");

    if (error) {
      console.error("Teacher discovery failed:", error);
      setStatus("Search failed. Try again.", true);
      return;
    }

    const filtered = (data || []).filter(
      (row) => row.user_id !== currentUser.id
    );

    renderTeacherCards(filtered);
  }

  function renderSuggestions(rows) {

    suggestions = rows;
    activeIndex = -1;

    searchSuggestions.textContent = "";

    if (!rows.length) {
      searchSuggestions.classList.remove("show");
      return;
    }

    rows.forEach((row, idx) => {

      const button = document.createElement("button");

      button.type = "button";
      button.className = "suggestion-item";
      button.textContent = row.name;

      button.addEventListener("mouseenter", () =>
        setActiveSuggestion(idx)
      );

      button.addEventListener("click", () => {
        searchInput.value = row.name;
        clearSuggestions();
        discoverTeachersForSkill(row.name);
      });

      searchSuggestions.appendChild(button);
    });

    searchSuggestions.classList.add("show");

  }

  async function runSearch() {

    const term = normalizeSearch(searchInput.value);

    if (!term) {
      clearSuggestions();
      return;
    }

    const rows = await window.SkillBackend.searchSkills(
      supabase,
      { searchTerm: term, limit: 8 },
      { loginUrl }
    );

    renderSuggestions(rows);

  }

  skillSearchToggle.addEventListener("click", () => {

    if (skillSearchBox.classList.contains("is-open") && !normalizeSearch(searchInput.value)) {
      clearSuggestions();
      collapseIfEmpty();
      return;
    }

    openSearch();

  });

  searchInput.addEventListener("input", () => {

    openSearch();

    clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      runSearch().catch((error) => {
        console.error("Skill search failed:", error);
        setStatus("Search failed. Try again.", true);
      });
    }, 300);

  });

  searchInput.addEventListener("keydown", (event) => {

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestion(activeIndex + 1);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestion(activeIndex - 1);
    }

    if (event.key === "Enter") {

      event.preventDefault();

      if (suggestions.length && activeIndex >= 0) {
        const selected = suggestions[activeIndex];
        searchInput.value = selected.name;
        clearSuggestions();
        discoverTeachersForSkill(selected.name);
      }

    }

  });

  document.addEventListener("click", (event) => {

    if (skillSearchBox.contains(event.target)) return;

    clearSuggestions();
    collapseIfEmpty();

  });

  skillGrid.textContent = "";
  setStatus("Search a skill to find teachers.");

});