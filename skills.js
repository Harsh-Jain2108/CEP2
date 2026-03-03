const skillGrid = document.getElementById("skillGrid");
const emptyState = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");
const typeSelect = document.getElementById("skillFilter");
const levelFilter = document.getElementById("levelFilter");
const locationFilter = document.getElementById("locationFilter");
const skillsForm = searchInput?.closest("form") || null;
const addSkillButton =
  document.getElementById("addSkill") ||
  document.getElementById("addSkillBtn") ||
  document.querySelector("[data-action='add-skill']");

function normalizeSkillName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function safeRedirect(url) {
  try {
    const current = new URL(window.location.href);
    const target = new URL(url, window.location.origin);

    if (target.origin !== window.location.origin) {
      return false;
    }
    if (current.href === target.href) {
      return false;
    }

    window.location.replace(target.href);
    return true;
  } catch (_error) {
    return false;
  }
}

function setStatus(message, isError = false) {
  if (!emptyState) {
    return;
  }
  emptyState.textContent = message;
  emptyState.style.color = isError ? "#b42318" : "";
  emptyState.style.display = "block";
}

function clearStatus() {
  if (!emptyState) {
    return;
  }
  emptyState.textContent = "";
  emptyState.style.color = "";
}

function setControlsDisabled(isDisabled) {
  if (searchInput) {
    searchInput.disabled = isDisabled;
  }
  if (typeSelect) {
    typeSelect.disabled = isDisabled;
  }
  if (levelFilter) {
    levelFilter.disabled = isDisabled;
  }
  if (locationFilter) {
    locationFilter.disabled = isDisabled;
  }
  if (addSkillButton) {
    addSkillButton.disabled = isDisabled;
  }
}

function extractErrorDetails(error) {
  return {
    message: error?.message || "Unknown error",
    code: error?.code || null,
    details: error?.details || null,
    hint: error?.hint || null
  };
}

function renderSkills(rows, onDelete) {
  if (!skillGrid || !emptyState) {
    return;
  }

  skillGrid.innerHTML = "";

  rows.forEach((row) => {
    const skillName = row.skills?.name || "Unnamed skill";
    const typeLabel = row.type === "learn" ? "Learn" : "Teach";

    const card = document.createElement("article");
    card.className = "card skill-card";
    card.innerHTML = `
      <h3>${skillName}</h3>
      <div class="skill-meta">
        <span>Your skill type</span>
        <span>${typeLabel}</span>
      </div>
      <div class="skill-actions">
        <button class="btn btn-outline delete-skill-btn" type="button">Delete</button>
      </div>
    `;

    card.querySelector(".delete-skill-btn")?.addEventListener("click", () => onDelete(row.id));
    skillGrid.appendChild(card);
  });

  if (rows.length === 0) {
    setStatus("No skills added yet. Enter a skill and press Enter.");
  } else {
    clearStatus();
    emptyState.style.display = "none";
  }
}

async function bootstrapSkills() {
  if (!skillGrid || !searchInput || !typeSelect) {
    return;
  }

  const { getSupabaseClient, waitForSessionRestore, buildRedirectUrl } = await import("./supabase.js");
  const supabase = await getSupabaseClient();
  const loginUrl = buildRedirectUrl("login.html");

  if (typeSelect.options.length === 0) {
    typeSelect.innerHTML = `
      <option value="teach">Teach</option>
      <option value="learn">Learn</option>
    `;
  }

  setControlsDisabled(true);
  setStatus("Loading your skills...");

  const session = await waitForSessionRestore(supabase);
  const user = session?.user || null;
  if (!user) {
    safeRedirect(loginUrl);
    return;
  }

  let activeUserId = user.id;
  let cachedRows = [];

  const fetchSkills = async () => {
    setControlsDisabled(true);

    try {
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
    } catch (error) {
      console.error("Failed to load skills:", extractErrorDetails(error));
      setStatus("Unable to load skills. Please refresh and retry.", true);
      renderSkills([], deleteSkill);
    } finally {
      setControlsDisabled(false);
    }
  };

  const getOrCreateSkill = async (skillName) => {
    const { data: existing, error: existingError } = await supabase
      .from("skills")
      .select("id, name")
      .ilike("name", skillName)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }
    if (existing?.id) {
      return existing;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("skills")
      .insert({ name: skillName })
      .select("id, name")
      .maybeSingle();

    if (!insertError && inserted?.id) {
      return inserted;
    }

    const { data: fallback, error: fallbackError } = await supabase
      .from("skills")
      .select("id, name")
      .ilike("name", skillName)
      .limit(1)
      .maybeSingle();

    if (fallbackError) {
      throw fallbackError;
    }
    if (!fallback?.id && insertError) {
      throw insertError;
    }
    return fallback;
  };

  const addSkillFromInput = async () => {
    const skillName = normalizeSkillName(searchInput.value);
    const type = typeSelect.value === "learn" ? "learn" : "teach";

    if (!skillName) {
      setStatus("Enter a skill name before pressing Enter.", true);
      return;
    }

    setControlsDisabled(true);
    setStatus("Adding skill...");

    try {
      const skill = await getOrCreateSkill(skillName);
      if (!skill?.id) {
        throw new Error("Skill could not be created.");
      }

      const duplicate = cachedRows.find(
        (row) => row.skill_id === skill.id && row.type === type
      );
      if (duplicate) {
        setStatus("This skill already exists for the selected type.");
        return;
      }

      const payload = {
        user_id: activeUserId,
        skill_id: skill.id,
        type
      };

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
      setStatus("Could not add skill. Check RLS policies and try again.", true);
    } finally {
      setControlsDisabled(false);
    }
  };

  const deleteSkill = async (entryId) => {
    setControlsDisabled(true);
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
      setStatus("Could not delete skill. Please try again.", true);
    } finally {
      setControlsDisabled(false);
    }
  };

  const onAddRequest = async (event) => {
    if (event) {
      event.preventDefault();
    }
    await addSkillFromInput();
  };

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      onAddRequest(event).catch((error) => {
        console.error("Add skill action failed:", extractErrorDetails(error));
        setStatus("Could not add skill. Please try again.", true);
        setControlsDisabled(false);
      });
    }
  });

  if (addSkillButton) {
    addSkillButton.addEventListener("click", (event) => {
      onAddRequest(event).catch((error) => {
        console.error("Add button action failed:", extractErrorDetails(error));
        setStatus("Could not add skill. Please try again.", true);
        setControlsDisabled(false);
      });
    });
  }

  if (skillsForm) {
    skillsForm.addEventListener("submit", (event) => {
      onAddRequest(event).catch((error) => {
        console.error("Skill form submit failed:", extractErrorDetails(error));
        setStatus("Could not add skill. Please try again.", true);
        setControlsDisabled(false);
      });
    });
  }

  await fetchSkills();

  supabase.auth.onAuthStateChange((_event, nextSession) => {
    const nextUser = nextSession?.user || null;
    if (!nextUser) {
      safeRedirect(loginUrl);
      return;
    }

    if (nextUser.id !== activeUserId) {
      activeUserId = nextUser.id;
      fetchSkills().catch((error) => {
        console.error("Failed to reload skills after auth change:", error);
      });
    }
  });
}

bootstrapSkills().catch((error) => {
  console.error("Skills bootstrap failed:", extractErrorDetails(error));
  setStatus("Skills page could not initialize.", true);
});
