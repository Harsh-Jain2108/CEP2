(function attachSkillBackend(globalScope) {
  "use strict";

  const VALID_SKILL_TYPES = new Set(["teach", "learn"]);

  function normalizeSkillName(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function redirectToLoginIfNeeded(loginUrl) {
    if (!loginUrl) {
      return;
    }
    try {
      const target = new URL(loginUrl, window.location.origin);
      if (target.origin === window.location.origin) {
        window.location.replace(target.href);
      }
    } catch (_error) {
      // Ignore malformed redirect targets.
    }
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
      const authError = new Error("AUTH_REQUIRED");
      authError.code = "AUTH_REQUIRED";
      throw authError;
    }

    console.log("User ID:", user.id);
    return user;
  }

  async function getOrCreateSkillId(supabase, skillName) {
    const normalizedSkill = normalizeSkillName(skillName);
    if (!normalizedSkill) {
      throw new Error("Skill name is required.");
    }

    const { data: existingRows, error: existingError } = await supabase
      .from("skills")
      .select("id")
      .ilike("name", normalizedSkill)
      .limit(1);

    if (existingError) {
      console.log("Error:", existingError);
      throw existingError;
    }

    if (existingRows?.[0]?.id) {
      return existingRows[0].id;
    }

    const { data: insertedRows, error: insertError } = await supabase
      .from("skills")
      .insert({ name: normalizedSkill })
      .select("id");

    if (insertError) {
      if (insertError.code === "23505") {
        const { data: retryRows, error: retryError } = await supabase
          .from("skills")
          .select("id")
          .ilike("name", normalizedSkill)
          .limit(1);

        if (retryError) {
          console.log("Error:", retryError);
          throw retryError;
        }
        if (retryRows?.[0]?.id) {
          return retryRows[0].id;
        }
      }
      console.log("Error:", insertError);
      throw insertError;
    }

    const skillId = insertedRows?.[0]?.id || null;
    if (!skillId) {
      throw new Error("Skill insert succeeded but no id was returned.");
    }

    return skillId;
  }

  async function loadSkills(supabase, options = {}) {
    const user = await getCurrentUserOrRedirect(supabase, options.loginUrl);

    const { data, error } = await supabase
      .from("user_skills")
      .select(
        `
          id,
          type,
          skills(name)
        `
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.log("Error:", error);
      throw error;
    }

    const teachSkills = [];
    const learnSkills = [];

    for (const row of data || []) {
      const rowType = row?.type;
      const skillName = row?.skills?.name || "";
      if (!skillName || !VALID_SKILL_TYPES.has(rowType)) {
        continue;
      }

      const item = {
        id: row.id,
        name: skillName,
        type: rowType
      };

      if (rowType === "teach") {
        teachSkills.push(item);
      } else {
        learnSkills.push(item);
      }
    }

    return {
      user,
      teachSkills,
      learnSkills
    };
  }

  async function addSkill(supabase, input, options = {}) {
    const user = await getCurrentUserOrRedirect(supabase, options.loginUrl);
    const type = input?.type;
    const skillName = normalizeSkillName(input?.skillName);

    if (!VALID_SKILL_TYPES.has(type)) {
      throw new Error("Invalid skill type. Expected 'teach' or 'learn'.");
    }
    if (!skillName) {
      throw new Error("Skill name is required.");
    }

    const skillId = await getOrCreateSkillId(supabase, skillName);
    console.log("Skill ID:", skillId);

    const { data: existingLinks, error: duplicateCheckError } = await supabase
      .from("user_skills")
      .select("id")
      .eq("user_id", user.id)
      .eq("skill_id", skillId)
      .eq("type", type)
      .limit(1);

    if (duplicateCheckError) {
      console.log("Error:", duplicateCheckError);
      throw duplicateCheckError;
    }

    if (existingLinks?.[0]?.id) {
      return {
        inserted: false,
        duplicate: true,
        skillId,
        userSkillId: existingLinks[0].id
      };
    }

    const result = await supabase
      .from("user_skills")
      .insert({
        user_id: user.id,
        skill_id: skillId,
        type
      })
      .select("id, user_id, skill_id, type");

    console.log("Insert result:", result.data);
    console.log("Error:", result.error);

    if (result.error) {
      throw result.error;
    }

    return {
      inserted: true,
      duplicate: false,
      skillId,
      userSkillId: result.data?.[0]?.id || null
    };
  }

  async function searchSkills(supabase, input, options = {}) {
    await getCurrentUserOrRedirect(supabase, options.loginUrl);

    const searchTerm = normalizeSkillName(input?.searchTerm);
    const limit = Number.isInteger(input?.limit) ? input.limit : 8;

    if (!searchTerm) {
      return [];
    }

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

  async function deleteSkill(supabase, input, options = {}) {
    const user = await getCurrentUserOrRedirect(supabase, options.loginUrl);
    const skillRowId = input?.skillRowId;

    if (!skillRowId) {
      throw new Error("skillRowId is required.");
    }

    const result = await supabase
      .from("user_skills")
      .delete()
      .eq("id", skillRowId)
      .eq("user_id", user.id)
      .select("id");

    console.log("Insert result:", result.data);
    console.log("Error:", result.error);

    if (result.error) {
      throw result.error;
    }

    return {
      deleted: (result.data || []).length > 0
    };
  }

  globalScope.SkillBackend = {
    loadSkills,
    addSkill,
    searchSkills,
    deleteSkill
  };
})(window);

document.addEventListener("DOMContentLoaded", async () => {
  const skillSearchBox = document.getElementById("skillSearchBox");
  const skillSearchToggle = document.getElementById("skillSearchToggle");
  const searchInput = document.getElementById("searchInput");
  const searchSuggestions = document.getElementById("searchSuggestions");
  const typeSelect = document.getElementById("skillFilter");
  const skillGrid = document.getElementById("skillGrid");
  const emptyState = document.getElementById("emptyState");

  if (
    !skillSearchBox ||
    !skillSearchToggle ||
    !searchInput ||
    !searchSuggestions ||
    !typeSelect ||
    !skillGrid ||
    !emptyState
  ) {
    return;
  }

  const { getSupabaseClient, waitForSessionRestore, buildRedirectUrl } = await import("./supabase.js");
  const supabase = await getSupabaseClient();
  const loginUrl = buildRedirectUrl("login.html");

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
    emptyState.style.color = "";
  };

  const openSearch = () => {
    skillSearchBox.classList.add("is-open");
    searchInput.placeholder = "Search skills...";
    searchInput.focus();
  };

  const collapseIfEmpty = () => {
    if (normalizeSearch(searchInput.value)) {
      return;
    }
    skillSearchBox.classList.remove("is-open");
    searchInput.placeholder = "";
  };

  const normalizeSearch = (value) => String(value || "").trim().replace(/\s+/g, " ");

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
      if (idx === activeIndex) {
        node.classList.add("active");
        node.scrollIntoView({ block: "nearest" });
      } else {
        node.classList.remove("active");
      }
    });
  };

  const renderSkills = async () => {
    const loaded = await window.SkillBackend.loadSkills(supabase, { loginUrl });
    const rows = [...loaded.teachSkills, ...loaded.learnSkills];

    skillGrid.textContent = "";
    if (!rows.length) {
      setStatus("No skills added yet. Use search to add one.");
      return;
    }

    clearStatus();
    for (const row of rows) {
      const card = document.createElement("article");
      card.className = "card skill-card";
      card.innerHTML = `
        <h3>${row.name}</h3>
        <div class="skill-meta">
          <span>Type</span>
          <span>${row.type === "learn" ? "Learn" : "Teach"}</span>
        </div>
      `;
      skillGrid.appendChild(card);
    }
  };

  const addFromName = async (name) => {
    const skillName = normalizeSearch(name);
    if (!skillName) {
      return;
    }

    const type = typeSelect.value === "learn" ? "learn" : "teach";
    await window.SkillBackend.addSkill(
      supabase,
      { skillName, type },
      { loginUrl }
    );

    searchInput.value = "";
    clearSuggestions();
    collapseIfEmpty();
    await renderSkills();
  };

  const renderSuggestions = (rows) => {
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
      button.addEventListener("mouseenter", () => setActiveSuggestion(idx));
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        addFromName(row.name).catch((error) => {
          console.error("Failed to add selected suggestion:", error);
          setStatus("Could not add selected skill.", true);
        });
      });
      searchSuggestions.appendChild(button);
    });

    searchSuggestions.classList.add("show");
  };

  const runSearch = async () => {
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
  };

  skillSearchToggle.addEventListener("click", () => {
    if (skillSearchBox.classList.contains("is-open") && !normalizeSearch(searchInput.value)) {
      clearSuggestions();
      collapseIfEmpty();
      return;
    }
    openSearch();
  });

  searchInput.addEventListener("focus", openSearch);

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
      if (!suggestions.length) {
        return;
      }
      event.preventDefault();
      setActiveSuggestion(activeIndex + 1);
      return;
    }

    if (event.key === "ArrowUp") {
      if (!suggestions.length) {
        return;
      }
      event.preventDefault();
      setActiveSuggestion(activeIndex <= 0 ? 0 : activeIndex - 1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (suggestions.length && activeIndex >= 0) {
        const row = suggestions[activeIndex];
        if (row?.name) {
          addFromName(row.name).catch((error) => {
            console.error("Keyboard add from suggestion failed:", error);
            setStatus("Could not add skill.", true);
          });
          return;
        }
      }

      addFromName(searchInput.value).catch((error) => {
        console.error("Keyboard add from input failed:", error);
        setStatus("Could not add skill.", true);
      });
      return;
    }

    if (event.key === "Escape") {
      clearSuggestions();
      collapseIfEmpty();
    }
  });

  document.addEventListener("click", (event) => {
    if (skillSearchBox.contains(event.target)) {
      return;
    }
    clearSuggestions();
    collapseIfEmpty();
  });

  try {
    const session = await waitForSessionRestore(supabase);
    if (!session?.user) {
      window.location.replace(loginUrl);
      return;
    }
    await renderSkills();
  } catch (error) {
    console.error("Skills page bootstrap failed:", error);
    setStatus("Failed to load skills.", true);
  }
});
