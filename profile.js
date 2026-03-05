const fullNameInput = document.getElementById("fullName");
const locationInput = document.getElementById("location");
const saveButton = document.getElementById("saveProfile");
const saveStatus = document.getElementById("saveStatus");
const profileForm = saveButton?.closest("form") || null;
const teachSkillInput = document.getElementById("teachSkillInput");
const learnSkillInput = document.getElementById("learnSkillInput");
const addTeachButton = document.getElementById("addTeach");
const addLearnButton = document.getElementById("addLearn");
const teachTags = document.getElementById("teachTags");
const learnTags = document.getElementById("learnTags");
const teachSearchToggle = document.getElementById("teachSearchToggle");
const learnSearchToggle = document.getElementById("learnSearchToggle");

function extractErrorDetails(error) {
  return {
    message: error?.message || "Unknown error",
    code: error?.code || null,
    details: error?.details || null,
    hint: error?.hint || null
  };
}

function setStatus(message, isError = false) {
  if (!saveStatus) {
    return;
  }
  saveStatus.textContent = message;
  saveStatus.classList.add("show");
  saveStatus.style.color = isError ? "#b42318" : "";
}

function clearStatus() {
  if (!saveStatus) {
    return;
  }
  saveStatus.classList.remove("show");
  saveStatus.style.color = "";
}

function setLoadingState(isLoading) {
  if (fullNameInput) {
    fullNameInput.disabled = isLoading;
  }
  if (locationInput) {
    locationInput.disabled = isLoading;
  }
  if (saveButton) {
    saveButton.disabled = isLoading;
  }
  if (teachSkillInput) {
    teachSkillInput.disabled = isLoading;
  }
  if (learnSkillInput) {
    learnSkillInput.disabled = isLoading;
  }
  if (addTeachButton) {
    addTeachButton.disabled = isLoading;
  }
  if (addLearnButton) {
    addLearnButton.disabled = isLoading;
  }
  if (teachSearchToggle) {
    teachSearchToggle.disabled = isLoading;
  }
  if (learnSearchToggle) {
    learnSearchToggle.disabled = isLoading;
  }
}

function normalizeText(value) {
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

function getFallbackFullName(user) {
  return (
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    ""
  );
}

function createSuggestionsContainer(input) {
  const wrapper = input?.closest(".skill-search");
  if (!wrapper) {
    return null;
  }

  const list = document.createElement("div");
  list.className = "skill-suggestions";
  list.setAttribute("role", "listbox");
  wrapper.appendChild(list);
  return list;
}

async function bootstrapProfile() {
  if (!fullNameInput || !locationInput || !saveButton) {
    return;
  }
  if (!window.SkillBackend) {
    console.error("SkillBackend is missing. Ensure skills.js is loaded before profile.js.");
    return;
  }

  const { getSupabaseClient, waitForSessionRestore, buildRedirectUrl } = await import("./supabase.js");
  const supabase = await getSupabaseClient();
  const loginUrl = buildRedirectUrl("login.html");

  setLoadingState(true);
  setStatus("Loading profile...");

  const session = await waitForSessionRestore(supabase);
  const user = session?.user || null;
  if (!user) {
    safeRedirect(loginUrl);
    return;
  }

  let activeUserId = user.id;

  const teachSearchState = {
    type: "teach",
    input: teachSkillInput,
    toggle: teachSearchToggle,
    wrapper: teachSkillInput?.closest(".skill-search") || null,
    suggestions: createSuggestionsContainer(teachSkillInput),
    items: [],
    activeIndex: -1,
    debounceTimer: null
  };

  const learnSearchState = {
    type: "learn",
    input: learnSkillInput,
    toggle: learnSearchToggle,
    wrapper: learnSkillInput?.closest(".skill-search") || null,
    suggestions: createSuggestionsContainer(learnSkillInput),
    items: [],
    activeIndex: -1,
    debounceTimer: null
  };

  const searchStateByType = {
    teach: teachSearchState,
    learn: learnSearchState
  };

  const clearSuggestions = (state) => {
    if (!state?.suggestions) {
      return;
    }
    state.items = [];
    state.activeIndex = -1;
    state.suggestions.textContent = "";
    state.suggestions.classList.remove("show");
  };

  const setActiveSuggestion = (state, nextIndex) => {
    if (!state?.items?.length) {
      state.activeIndex = -1;
      return;
    }

    const bounded = Math.max(0, Math.min(state.items.length - 1, nextIndex));
    state.activeIndex = bounded;

    const nodes = state.suggestions?.querySelectorAll(".skill-suggestion-item") || [];
    nodes.forEach((node, idx) => {
      if (idx === bounded) {
        node.classList.add("active");
        node.scrollIntoView({ block: "nearest" });
      } else {
        node.classList.remove("active");
      }
    });
  };

  const openSearch = (state) => {
    if (!state?.wrapper || !state.input) {
      return;
    }
    state.wrapper.classList.add("is-open");
    state.input.placeholder = "Search skills...";
    state.input.focus();
  };

  const collapseIfEmpty = (state) => {
    if (!state?.wrapper || !state.input) {
      return;
    }
    if (normalizeText(state.input.value)) {
      return;
    }
    state.wrapper.classList.remove("is-open");
    state.input.placeholder = "";
  };

  const renderSuggestions = (state, skills, onSelect) => {
    if (!state?.suggestions) {
      return;
    }

    state.items = skills;
    state.activeIndex = -1;
    state.suggestions.textContent = "";

    if (!skills.length) {
      state.suggestions.classList.remove("show");
      return;
    }

    for (let idx = 0; idx < skills.length; idx += 1) {
      const skill = skills[idx];
      const item = document.createElement("button");
      item.type = "button";
      item.className = "skill-suggestion-item";
      item.textContent = skill.name;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", "false");

      item.addEventListener("mouseenter", () => setActiveSuggestion(state, idx));
      item.addEventListener("mousedown", (event) => event.preventDefault());
      item.addEventListener("click", () => {
        onSelect(skill).catch((error) => {
          console.error("Suggestion select failed:", extractErrorDetails(error));
        });
      });

      state.suggestions.appendChild(item);
    }

    state.suggestions.classList.add("show");
  };

  const renderSkillTags = (container, skills, type) => {
    if (!container) {
      return;
    }
    container.textContent = "";

    for (const skill of skills) {
      const tag = document.createElement("span");
      tag.className = type === "learn" ? "tag learn" : "tag";
      tag.appendChild(document.createTextNode(skill?.name || ""));

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.setAttribute("aria-label", `Delete ${skill?.name || "skill"}`);
      removeButton.textContent = "x";
      removeButton.addEventListener("click", () => {
        handleSkillDelete(skill.id).catch((error) => {
          console.error("Failed to delete skill:", extractErrorDetails(error));
          setStatus("Could not delete skill. Check RLS and try again.", true);
        });
      });

      tag.appendChild(removeButton);
      container.appendChild(tag);
    }
  };

  const loadSkills = async () => {
    const result = await window.SkillBackend.loadSkills(supabase, { loginUrl });
    activeUserId = result.user.id;
    renderSkillTags(teachTags, result.teachSkills, "teach");
    renderSkillTags(learnTags, result.learnSkills, "learn");
  };

  const handleSkillAdd = async (type, overrideName = "") => {
    const state = searchStateByType[type];
    const input = state?.input;
    if (!input) {
      return;
    }

    const skillName = normalizeText(overrideName || input.value);
    if (!skillName) {
      return;
    }

    const result = await window.SkillBackend.addSkill(
      supabase,
      { skillName, type },
      { loginUrl }
    );

    if (result.duplicate) {
      setStatus("Skill already exists for this list.");
      return;
    }

    input.value = "";
    clearSuggestions(state);
    collapseIfEmpty(state);
    await loadSkills();
    clearStatus();
  };

  const handleSkillDelete = async (skillRowId) => {
    await window.SkillBackend.deleteSkill(supabase, { skillRowId }, { loginUrl });
    await loadSkills();
  };

  const runSearch = async (state) => {
    if (!state?.input) {
      return;
    }
    const searchTerm = normalizeText(state.input.value);
    if (!searchTerm) {
      clearSuggestions(state);
      return;
    }

    try {
      const rows = await window.SkillBackend.searchSkills(
        supabase,
        { searchTerm, limit: 8 },
        { loginUrl }
      );
      renderSuggestions(state, rows, async (skill) => {
        await handleSkillAdd(state.type, skill.name);
      });
    } catch (error) {
      console.error("Skill search failed:", extractErrorDetails(error));
      clearSuggestions(state);
    }
  };

  const bindSearchInteractions = (state) => {
    if (!state?.input || !state?.toggle || !state?.wrapper) {
      return;
    }

    state.toggle.addEventListener("click", () => {
      if (state.wrapper.classList.contains("is-open") && !normalizeText(state.input.value)) {
        clearSuggestions(state);
        collapseIfEmpty(state);
        return;
      }
      openSearch(state);
    });

    state.input.addEventListener("focus", () => {
      openSearch(state);
    });

    state.input.addEventListener("input", () => {
      openSearch(state);
      clearTimeout(state.debounceTimer);
      state.debounceTimer = setTimeout(() => {
        runSearch(state).catch((error) => {
          console.error("Debounced search failed:", extractErrorDetails(error));
        });
      }, 300);
    });

    state.input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        if (!state.items.length) {
          return;
        }
        event.preventDefault();
        setActiveSuggestion(state, state.activeIndex + 1);
        return;
      }

      if (event.key === "ArrowUp") {
        if (!state.items.length) {
          return;
        }
        event.preventDefault();
        const nextIndex = state.activeIndex <= 0 ? 0 : state.activeIndex - 1;
        setActiveSuggestion(state, nextIndex);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (state.items.length > 0 && state.activeIndex >= 0) {
          const selected = state.items[state.activeIndex];
          if (selected?.name) {
            handleSkillAdd(state.type, selected.name).catch((error) => {
              console.error("Keyboard suggestion add failed:", extractErrorDetails(error));
              setStatus("Could not add skill.", true);
            });
            return;
          }
        }

        handleSkillAdd(state.type).catch((error) => {
          console.error("Enter add failed:", extractErrorDetails(error));
          setStatus("Could not add skill.", true);
        });
        return;
      }

      if (event.key === "Escape") {
        clearSuggestions(state);
        collapseIfEmpty(state);
      }
    });
  };

  bindSearchInteractions(teachSearchState);
  bindSearchInteractions(learnSearchState);

  document.addEventListener("click", (event) => {
    for (const state of [teachSearchState, learnSearchState]) {
      if (!state?.wrapper) {
        continue;
      }
      if (state.wrapper.contains(event.target)) {
        continue;
      }
      clearSuggestions(state);
      collapseIfEmpty(state);
    }
  });

  const ensureProfileRow = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", activeUserId)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (data) {
      return data;
    }

    const bootstrapRow = {
      id: activeUserId,
      full_name: getFallbackFullName(user),
      bio: "",
      location: ""
    };

    const { data: upserted, error: upsertError } = await supabase
      .from("profiles")
      .upsert(bootstrapRow, { onConflict: "id" })
      .select("*")
      .maybeSingle();

    if (upsertError) {
      throw upsertError;
    }
    return upserted || bootstrapRow;
  };

  const loadProfile = async () => {
    setLoadingState(true);
    try {
      const profile = await ensureProfileRow();
      fullNameInput.value = profile.full_name || getFallbackFullName(user);
      locationInput.value = profile.location || profile.bio || "";
      await loadSkills();
      clearStatus();
    } catch (error) {
      console.error("Failed to load profile:", extractErrorDetails(error));
      setStatus("Unable to load profile. Please refresh and try again.", true);
    } finally {
      setLoadingState(false);
    }
  };

  const saveProfile = async () => {
    const fullName = normalizeText(fullNameInput.value);
    const location = normalizeText(locationInput.value);
    const bio = location;

    if (!fullName) {
      setStatus("Full name is required.", true);
      return;
    }

    setLoadingState(true);
    setStatus("Saving profile...");

    try {
      const payload = { full_name: fullName, bio, location };
      const { data, error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", activeUserId)
        .select("*")
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        const { error: upsertError } = await supabase
          .from("profiles")
          .upsert({ id: activeUserId, ...payload }, { onConflict: "id" });
        if (upsertError) {
          throw upsertError;
        }
      }

      setStatus("Profile saved.");
    } catch (error) {
      console.error("Failed to save profile:", extractErrorDetails(error));
      setStatus("Could not save profile. Check RLS and try again.", true);
    } finally {
      setLoadingState(false);
    }
  };

  saveButton.addEventListener("click", (event) => {
    event.preventDefault();
    saveProfile().catch((error) => {
      console.error("Save profile action failed:", extractErrorDetails(error));
      setStatus("Could not save profile.", true);
      setLoadingState(false);
    });
  });

  if (profileForm) {
    profileForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveProfile().catch((error) => {
        console.error("Profile form submit failed:", extractErrorDetails(error));
        setStatus("Could not save profile.", true);
        setLoadingState(false);
      });
    });
  }

  if (addTeachButton) {
    addTeachButton.addEventListener("click", (event) => {
      event.preventDefault();
      handleSkillAdd("teach").catch((error) => {
        console.error("Failed to add teach skill:", extractErrorDetails(error));
        setStatus("Could not add teach skill. Check RLS and try again.", true);
      });
    });
  }

  if (addLearnButton) {
    addLearnButton.addEventListener("click", (event) => {
      event.preventDefault();
      handleSkillAdd("learn").catch((error) => {
        console.error("Failed to add learn skill:", extractErrorDetails(error));
        setStatus("Could not add learn skill. Check RLS and try again.", true);
      });
    });
  }

  await loadProfile();

  supabase.auth.onAuthStateChange((_event, nextSession) => {
    const nextUser = nextSession?.user || null;
    if (!nextUser) {
      safeRedirect(loginUrl);
      return;
    }
    if (nextUser.id !== activeUserId) {
      activeUserId = nextUser.id;
      loadProfile().catch((error) => {
        console.error("Failed to reload profile after auth change:", extractErrorDetails(error));
      });
    }
  });
}

bootstrapProfile().catch((error) => {
  console.error("Profile bootstrap failed:", extractErrorDetails(error));
  setStatus("Profile initialization failed.", true);
  setLoadingState(false);
});
