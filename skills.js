console.log("skills.js loaded");

document.addEventListener("DOMContentLoaded", () => {
  const skillGrid = document.getElementById("skillGrid");
  const emptyState = document.getElementById("emptyState");
  const searchInput = document.getElementById("searchInput");
  const typeSelect = document.getElementById("skillFilter");
  const addSkillButton =
    document.getElementById("addSkill") ||
    document.getElementById("addSkillBtn") ||
    document.querySelector("[data-action='add-skill']");

  if (!searchInput) {
    console.error("searchInput not found");
    return;
  }
  if (!typeSelect) {
    console.error("skillFilter not found");
    return;
  }
  if (!skillGrid || !emptyState) {
    console.error("skills page containers missing");
    return;
  }

  console.log("skills DOM refs found", {
    searchInputId: searchInput.id,
    typeSelectId: typeSelect.id
  });

  let supabase = null;
  let activeUserId = null;
  let cachedRows = [];
  let initPromise = null;

  function extractErrorDetails(error) {
    return {
      message: error?.message || "Unknown error",
      code: error?.code || null,
      details: error?.details || null,
      hint: error?.hint || null
    };
  }

  function normalizeSkillName(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function safeRedirect(url) {
    try {
      const current = new URL(window.location.href);
      const target = new URL(url, window.location.origin);
      if (target.origin !== window.location.origin || current.href === target.href) {
        return false;
      }
      window.location.replace(target.href);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function setStatus(message, isError = false) {
    emptyState.textContent = message;
    emptyState.style.color = isError ? "#b42318" : "";
    emptyState.style.display = "block";
  }

  function clearStatus() {
    emptyState.textContent = "";
    emptyState.style.color = "";
  }

  function setLoadingState(isLoading) {
    searchInput.disabled = isLoading;
    typeSelect.disabled = isLoading;
    if (addSkillButton) {
      addSkillButton.disabled = isLoading;
    }
  }

  function renderSkills(rows, onDelete) {
    skillGrid.innerHTML = "";

    rows.forEach((row) => {
      const skillName = row.skills?.name || "Unnamed skill";
      const skillType = row.type === "learn" ? "Learn" : "Teach";

      const card = document.createElement("article");
      card.className = "card skill-card";
      card.innerHTML = `
        <h3>${skillName}</h3>
        <div class="skill-meta">
          <span>Type</span>
          <span>${skillType}</span>
        </div>
        <div class="skill-actions">
          <button class="btn btn-outline delete-skill-btn" type="button">Delete</button>
        </div>
      `;

      card.querySelector(".delete-skill-btn")?.addEventListener("click", () => onDelete(row.id));
      skillGrid.appendChild(card);
    });

    if (rows.length === 0) {
      setStatus("No skills added yet. Enter a skill name and press Enter.");
    } else {
      clearStatus();
      emptyState.style.display = "none";
    }
  }

  async function fetchSkills() {
    if (!supabase || !activeUserId) {
      return;
    }

    const { data, error } = await supabase
      .from("user_skills")
      .select("id, user_id, type, skill_id, skills:skill_id(id, name)")
      .eq("user_id", activeUserId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    cachedRows = data || [];
    renderSkills(cachedRows, deleteSkill);
  }

  async function getOrCreateSkill(skillName) {
    const { data: existingSkill, error: existingError } = await supabase
      .from("skills")
      .select("id, name")
      .ilike("name", skillName)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }
    if (existingSkill?.id) {
      return existingSkill;
    }

    const { data: insertedSkill, error: insertError } = await supabase
      .from("skills")
      .insert({ name: skillName })
      .select("id, name")
      .maybeSingle();

    if (!insertError && insertedSkill?.id) {
      return insertedSkill;
    }

    const { data: fallbackSkill, error: fallbackError } = await supabase
      .from("skills")
      .select("id, name")
      .ilike("name", skillName)
      .limit(1)
      .maybeSingle();

    if (fallbackError) {
      throw fallbackError;
    }
    if (!fallbackSkill?.id && insertError) {
      throw insertError;
    }
    return fallbackSkill;
  }

  async function initializeIfNeeded() {
    if (initPromise) {
      return initPromise;
    }

    initPromise = (async () => {
      const { getSupabaseClient, waitForSessionRestore, buildRedirectUrl } = await import("./supabase.js");
      supabase = await getSupabaseClient();
      const loginUrl = buildRedirectUrl("login.html");

      typeSelect.innerHTML = `
        <option value="teach">Teach</option>
        <option value="learn">Learn</option>
      `;

      setLoadingState(true);
      setStatus("Loading your skills...");

      const session = await waitForSessionRestore(supabase);
      const user = session?.user || null;
      if (!user) {
        safeRedirect(loginUrl);
        return;
      }

      activeUserId = user.id;
      await fetchSkills();

      supabase.auth.onAuthStateChange(async (_event, nextSession) => {
        const nextUser = nextSession?.user || null;
        if (!nextUser) {
          safeRedirect(loginUrl);
          return;
        }
        if (nextUser.id !== activeUserId) {
          activeUserId = nextUser.id;
          try {
            await fetchSkills();
          } catch (error) {
            console.error("Failed to reload skills after auth change:", extractErrorDetails(error));
          }
        }
      });
    })()
      .catch((error) => {
        console.error("Skills initialization failed:", extractErrorDetails(error));
        setStatus("Skills initialization failed.", true);
      })
      .finally(() => {
        setLoadingState(false);
      });

    return initPromise;
  }

  async function addSkill() {
    console.log("addSkill triggered");
    await initializeIfNeeded();

    if (!supabase || !activeUserId) {
      setStatus("Session unavailable. Please login again.", true);
      return;
    }

    const skillName = normalizeSkillName(searchInput.value);
    const type = typeSelect.value === "learn" ? "learn" : "teach";

    if (!skillName) {
      setStatus("Enter a skill name first.", true);
      return;
    }

    setLoadingState(true);
    setStatus("Adding skill...");

    try {
      const skill = await getOrCreateSkill(skillName);
      if (!skill?.id) {
        throw new Error("Unable to resolve skill ID.");
      }

      const alreadyExists = cachedRows.some(
        (row) => row.skill_id === skill.id && row.type === type
      );
      if (alreadyExists) {
        setStatus("Skill already exists for this type.");
        return;
      }

      const payload = { user_id: activeUserId, skill_id: skill.id, type };
      const { error: upsertError } = await supabase
        .from("user_skills")
        .upsert(payload, { onConflict: "user_id,skill_id,type" });

      if (upsertError) {
        if (upsertError.code === "42P10") {
          const { error: insertError } = await supabase.from("user_skills").insert(payload);
          if (insertError && insertError.code !== "23505") {
            throw insertError;
          }
        } else if (upsertError.code !== "23505") {
          throw upsertError;
        }
      }

      searchInput.value = "";
      await fetchSkills();
    } catch (error) {
      console.error("Failed to add skill:", extractErrorDetails(error));
      setStatus("Could not add skill. Check RLS and unique index.", true);
    } finally {
      setLoadingState(false);
    }
  }

  async function deleteSkill(entryId) {
    await initializeIfNeeded();
    if (!supabase || !activeUserId) {
      return;
    }

    setLoadingState(true);
    setStatus("Deleting skill...");

    try {
      const { error } = await supabase
        .from("user_skills")
        .delete()
        .eq("id", entryId)
        .eq("user_id", activeUserId);

      if (error) {
        throw error;
      }

      await fetchSkills();
    } catch (error) {
      console.error("Failed to delete skill:", extractErrorDetails(error));
      setStatus("Could not delete skill. Check RLS and retry.", true);
    } finally {
      setLoadingState(false);
    }
  }

  searchInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      console.log("Enter pressed");
      await addSkill();
    }
  });
  console.log("Event listener attached: #searchInput keydown");

  if (addSkillButton) {
    addSkillButton.addEventListener("click", async (e) => {
      e.preventDefault();
      console.log("Add button clicked");
      await addSkill();
    });
    console.log("Event listener attached: add button click");
  }

  if (skillsForm) {
    skillsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      console.log("Skills form submit");
      await addSkill();
    });
    console.log("Event listener attached: skills form submit");
  }

  initializeIfNeeded().catch((error) => {
    console.error("Initial skills bootstrap failed:", extractErrorDetails(error));
  });
});
