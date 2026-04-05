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

async function bootstrapProfile() {
  if (!fullNameInput || !locationInput || !saveButton) {
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

  const getUserAfterSessionRestore = async () => {
    const nextSession = await waitForSessionRestore(supabase);
    return nextSession?.user || null;
  };

  const renderSkillTags = (container, skills, type) => {
    if (!container) {
      return;
    }
    container.textContent = "";

    for (const skill of skills) {
      const tag = document.createElement("span");
      tag.className = type === "learn" ? "tag learn" : "tag";
      tag.textContent = skill?.name || "";
      container.appendChild(tag);
    }
  };

  const fetchAndRenderSkills = async () => {
    const restoredUser = await getUserAfterSessionRestore();
    if (!restoredUser) {
      safeRedirect(loginUrl);
      return;
    }
    activeUserId = restoredUser.id;

    const { data, error } = await supabase
      .from("user_skills")
      .select("type, skills(name)")
      .eq("user_id", activeUserId);

    if (error) {
      throw error;
    }

    const teachSkillRows = [];
    const learnSkillRows = [];

    for (const row of data || []) {
      const name = row?.skills?.name;
      if (!name) {
        continue;
      }
      if (row.type === "teach") {
        teachSkillRows.push({ name });
      } else if (row.type === "learn") {
        learnSkillRows.push({ name });
      }
    }

    renderSkillTags(teachTags, teachSkillRows, "teach");
    renderSkillTags(learnTags, learnSkillRows, "learn");
  };

  const handleSkillAdd = async (type) => {
    const input = type === "teach" ? teachSkillInput : learnSkillInput;
    const skillName = normalizeText(input?.value || "");

    if (!skillName) {
      return;
    }

    const { data: { user }, error: getUserError } = await supabase.auth.getUser();
    if (getUserError) {
      throw getUserError;
    }
    if (!user) {
      safeRedirect(loginUrl);
      return;
    }
    activeUserId = user.id;
    const userId = user.id;
    console.log("User ID:", userId);

    const { data, error: existingSkillError } = await supabase
      .from("skills")
      .select("id")
      .ilike("name", skillName)
      .limit(1);

    if (existingSkillError) {
      throw existingSkillError;
    }

    let skillId = data?.[0]?.id || null;
    if (!skillId) {
      const { data: insertedSkillRows, error: insertSkillError } = await supabase
        .from("skills")
        .insert({ name: skillName })
        .select("id");
      if (insertSkillError) {
        throw insertSkillError;
      }
      skillId = insertedSkillRows?.[0]?.id || null;
    }

    if (!skillId) {
      throw new Error("Skill ID not found after lookup/insert.");
    }
    console.log("Skill ID:", skillId);

    const { data: result, error } = await supabase
      .from("user_skills")
      .insert({
        user_id: userId,
        skill_id: skillId,
        type: type
      })
      .select("*");

    console.log("Insert result:", result);
    console.log("Insert error:", error);
    if (error) {
      throw error;
    }

    if (input) {
      input.value = "";
    }
    await fetchAndRenderSkills();
  };

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
      await fetchAndRenderSkills();
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
    // Keep storing college in the existing profiles.location column.
    const bio = location; // existing UI has one field; keep bio/location synchronized

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
      console.log("Teach button clicked");
      handleSkillAdd("teach").catch((error) => {
        console.error("error", extractErrorDetails(error));
        setStatus("Could not add teach skill. Check RLS and try again.", true);
      });
    });
  }

  if (addLearnButton) {
    addLearnButton.addEventListener("click", (event) => {
      event.preventDefault();
      console.log("Learn button clicked");
      handleSkillAdd("learn").catch((error) => {
        console.error("error", extractErrorDetails(error));
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
