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

  async function createConnectionRequest(supabase, input, options = {}) {
    const user = await getCurrentUserOrRedirect(supabase, options.loginUrl);
    const receiverId = String(input?.receiverId || "").trim();

    if (!receiverId) {
      throw new Error("receiverId is required.");
    }

    if (receiverId === user.id) {
      throw new Error("You cannot connect with yourself.");
    }

    const pairFilter = `and(sender_id.eq.${user.id},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${user.id})`;
    const { data: existingRows, error: existingError } = await supabase
      .from("connections")
      .select("id, sender_id, receiver_id, status")
      .or(pairFilter)
      .limit(1);

    if (existingError) {
      throw existingError;
    }

    if (existingRows?.length) {
      return {
        created: false,
        row: existingRows[0]
      };
    }

    const { data: insertedRow, error: insertError } = await supabase
      .from("connections")
      .insert({
        sender_id: user.id,
        receiver_id: receiverId,
        status: "pending"
      })
      .select("id, sender_id, receiver_id, status")
      .single();

    if (insertError) {
      throw insertError;
    }

    return {
      created: true,
      row: insertedRow
    };
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
    createConnectionRequest,
    deleteSkill
  };
})(window);

document.addEventListener("DOMContentLoaded", async () => {
  const skillSearchBox = document.getElementById("skillSearchBox");
  const skillSearchToggle = document.getElementById("skillSearchToggle");
  const searchInput = document.getElementById("searchInput");
  const searchSuggestions = document.getElementById("searchSuggestions");
  const popularSkillsSection = document.getElementById("popularSkillsSection");
  const popularSkillsList = document.getElementById("popularSkillsList");
  const skillGrid = document.getElementById("skillGrid");
  const emptyState = document.getElementById("emptyState");

  if (
    !skillSearchBox ||
    !skillSearchToggle ||
    !searchInput ||
    !searchSuggestions ||
    !popularSkillsSection ||
    !popularSkillsList ||
    !skillGrid ||
    !emptyState
  ) {
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
    emptyState.innerHTML = `<p class="empty-state-main">${escapeHtml(message)}</p>`;
    emptyState.style.display = "block";
    emptyState.style.color = isError ? "#b42318" : "";
  };

  const clearStatus = () => {
    emptyState.textContent = "";
    emptyState.style.display = "none";
    emptyState.style.color = "";
  };

  const escapeHtml = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

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

  const updatePopularSkillsVisibility = () => {
    const hasSearchValue = Boolean(normalizeSearch(searchInput.value));
    popularSkillsSection.style.display = hasSearchValue ? "none" : "block";
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
      if (idx === activeIndex) {
        node.classList.add("active");
        node.scrollIntoView({ block: "nearest" });
      } else {
        node.classList.remove("active");
      }
    });
  };

  const renderTeacherCards = (rows) => {
    skillGrid.textContent = "";
    if (!rows.length) {
      setStatus("Skill unavailable");
      return;
    }

    clearStatus();
    for (const row of rows) {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const teacherName = profile?.full_name || "Unknown User";
      const location = profile?.location || "Not specified";
      const skillName = row?.skills?.name || "";

      const card = document.createElement("article");
      card.className = "card skill-card";
      card.innerHTML = `
        <h3>${escapeHtml(teacherName)}</h3>
        <div class="skill-meta">
          <span>Teaches: ${escapeHtml(skillName)}</span>
        </div>
        <p class="connect-info">Location: ${escapeHtml(location)}</p>
        <button type="button" class="connect-btn">Connect</button>
      `;

      const connectBtn = card.querySelector(".connect-btn");
      const receiverId = row?.user_id || "";
      if (!receiverId || receiverId === currentUser.id) {
        connectBtn.textContent = "Unavailable";
        connectBtn.disabled = true;
      } else {
        connectBtn.addEventListener("click", async () => {
          connectBtn.disabled = true;
          connectBtn.textContent = "Sending...";
          try {
            const result = await window.SkillBackend.createConnectionRequest(
              supabase,
              { receiverId },
              { loginUrl }
            );
            const finalStatus = result?.row?.status || "pending";
            if (finalStatus === "accepted") {
              connectBtn.textContent = "Connected";
            } else if (finalStatus === "rejected") {
              connectBtn.textContent = "Already Responded";
            } else {
              connectBtn.textContent = "Request Sent";
            }
          } catch (error) {
            console.error("Connect request failed:", error);
            connectBtn.disabled = false;
            connectBtn.textContent = "Connect";
            setStatus("Failed to send connection request. Try again.", true);
          }
        });
      }

      skillGrid.appendChild(card);
    }
  };

  const discoverTeachersForSkill = async (skill) => {
    const skillId = skill?.id || null;
    const skillName = normalizeSearch(skill?.name);

    if (!skillId || !skillName) {
      skillGrid.textContent = "";
      setStatus("Skill unavailable");
      return;
    }

    // Fast path: try embedded selects (works only if PostgREST detects relationships).
    const embeddedResult = await supabase
      .from("user_skills")
      .select(
        `
          user_id,
          skills(name),
          profiles(full_name, location)
        `
      )
      .eq("skill_id", skillId)
      .eq("type", "teach")
      .neq("user_id", currentUser.id);

    if (!embeddedResult.error) {
      renderTeacherCards(embeddedResult.data || []);
      return;
    }

    // Fallback: relationship to profiles may not exist; do it in two queries.
    console.warn("Embedded teacher discovery failed, falling back:", embeddedResult.error);

    const { data: links, error: linksError } = await supabase
      .from("user_skills")
      .select(
        `
          user_id,
          skills(name)
        `
      )
      .eq("skill_id", skillId)
      .eq("type", "teach")
      .neq("user_id", currentUser.id);

    if (linksError) {
      console.error("Teacher discovery failed (links):", linksError);
      setStatus("Search failed. Try again.", true);
      return;
    }

    const userIds = Array.from(
      new Set((links || []).map((row) => row?.user_id).filter(Boolean))
    );

    if (!userIds.length) {
      renderTeacherCards([]);
      return;
    }

    const { data: profileRows, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, location")
      .in("id", userIds);

    if (profileError) {
      console.error("Teacher discovery failed (profiles):", profileError);
      setStatus("Search failed. Try again.", true);
      return;
    }

    const profileById = new Map((profileRows || []).map((row) => [row.id, row]));
    const merged = (links || []).map((row) => ({
      ...row,
      profiles: profileById.get(row.user_id) || null,
      skills: row.skills || { name: skillName }
    }));

    renderTeacherCards(merged);
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
        searchInput.value = row.name;
        clearSuggestions();
        discoverTeachersForSkill(row).catch((error) => {
          console.error("Failed to discover selected skill:", error);
          setStatus("Search failed. Try again.", true);
        });
      });
      searchSuggestions.appendChild(button);
    });

    searchSuggestions.classList.add("show");
  };

  const runSearch = async () => {
    const term = normalizeSearch(searchInput.value);
    updatePopularSkillsVisibility();
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

  const renderPopularSkills = (rows) => {
    popularSkillsList.textContent = "";
    for (const row of rows) {
      const skillName = normalizeSearch(row?.name);
      if (!skillName) {
        continue;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "popular-skill-btn";
      button.textContent = skillName;
      button.addEventListener("click", async () => {
        searchInput.value = skillName;
        openSearch();
        clearSuggestions();
        updatePopularSkillsVisibility();
        try {
          const rowsFromSearch = await window.SkillBackend.searchSkills(
            supabase,
            { searchTerm: skillName, limit: 1 },
            { loginUrl }
          );

          const selected = rowsFromSearch?.[0] || null;
          if (!selected) {
            skillGrid.textContent = "";
            setStatus("Skill unavailable");
            return;
          }
          await discoverTeachersForSkill(selected);
        } catch (error) {
          console.error("Popular skill discovery failed:", error);
          setStatus("Search failed. Try again.", true);
        }
      });
      popularSkillsList.appendChild(button);
    }
  };

  const loadPopularSkills = async () => {
    const { data, error } = await supabase
      .from("skills")
      .select("name")
      .limit(6);

    if (error) {
      console.error("Popular skills load failed:", error);
      popularSkillsSection.style.display = "none";
      return;
    }

    renderPopularSkills(data || []);
    if (!(data || []).length) {
      popularSkillsSection.style.display = "none";
      return;
    }
    updatePopularSkillsVisibility();
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
    updatePopularSkillsVisibility();
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
          searchInput.value = row.name;
          clearSuggestions();
          discoverTeachersForSkill(row).catch((error) => {
            console.error("Keyboard discovery from suggestion failed:", error);
            setStatus("Search failed. Try again.", true);
          });
          return;
        }
      }

      const term = normalizeSearch(searchInput.value);
      if (!term) {
        return;
      }

      window.SkillBackend
        .searchSkills(supabase, { searchTerm: term, limit: 1 }, { loginUrl })
        .then((rows) => {
          const selected = rows?.[0] || null;
          if (!selected) {
            skillGrid.textContent = "";
            setStatus("Skill unavailable");
            return;
          }
          searchInput.value = selected.name;
          clearSuggestions();
          return discoverTeachersForSkill(selected);
        })
        .catch((error) => {
          console.error("Keyboard discovery from input failed:", error);
          setStatus("Search failed. Try again.", true);
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
    updatePopularSkillsVisibility();
  });

  skillGrid.textContent = "";
  setStatus("Search a skill to find teachers.");
  await loadPopularSkills();
});
