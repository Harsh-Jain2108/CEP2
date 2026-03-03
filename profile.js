const fullNameInput = document.getElementById("fullName");
const bioInput = document.getElementById("location");
const saveButton = document.getElementById("saveProfile");
const saveStatus = document.getElementById("saveStatus");
const profileForm = saveButton?.closest("form") || null;

function setFormLoadingState(isLoading) {
  if (fullNameInput) {
    fullNameInput.disabled = isLoading;
  }
  if (bioInput) {
    bioInput.disabled = isLoading;
  }
  if (saveButton) {
    saveButton.disabled = isLoading;
  }
}

function setStatus(message, isError = false) {
  if (!saveStatus) {
    return;
  }
  saveStatus.textContent = message;
  saveStatus.classList.toggle("show", true);
  saveStatus.style.color = isError ? "#b42318" : "";
}

function clearStatus() {
  if (!saveStatus) {
    return;
  }
  saveStatus.classList.remove("show");
  saveStatus.style.color = "";
}

function extractErrorDetails(error) {
  return {
    message: error?.message || "Unknown error",
    code: error?.code || null,
    details: error?.details || null,
    hint: error?.hint || null
  };
}

function normalizeBio(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeFullName(value) {
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

function getFallbackFullName(user) {
  return (
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    ""
  );
}

async function bootstrapProfile() {
  if (!fullNameInput || !bioInput || !saveButton) {
    return;
  }

  const { getSupabaseClient, waitForSessionRestore, buildRedirectUrl } = await import("./supabase.js");
  const supabase = await getSupabaseClient();
  const loginUrl = buildRedirectUrl("login.html");

  setFormLoadingState(true);
  setStatus("Loading profile...");

  const session = await waitForSessionRestore(supabase);
  const user = session?.user || null;
  if (!user) {
    safeRedirect(loginUrl);
    return;
  }

  let activeUserId = user.id;

  const loadProfile = async () => {
    setFormLoadingState(true);

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, bio")
        .eq("id", activeUserId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      const profile = data || {};
      fullNameInput.value = profile.full_name || getFallbackFullName(user);
      bioInput.value = profile.bio || "";

      if (!data) {
        setStatus("No profile data yet. Add your bio and click Save profile.");
      } else {
        clearStatus();
      }
    } catch (error) {
      console.error("Failed to load profile:", error);
      setStatus("Unable to load profile. Please refresh and try again.", true);
    } finally {
      setFormLoadingState(false);
    }
  };

  await loadProfile();

  const saveProfile = async () => {
    const fullName = normalizeFullName(fullNameInput.value);
    const bio = normalizeBio(bioInput.value);

    if (!fullName) {
      setStatus("Full name is required.", true);
      return;
    }

    setFormLoadingState(true);
    setStatus("Saving profile...");

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ full_name: fullName, bio })
        .eq("id", activeUserId)
        .select("id, full_name, bio")
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        const { error: upsertError } = await supabase.from("profiles").upsert(
          {
            id: activeUserId,
            full_name: fullName,
            bio
          },
          { onConflict: "id" }
        );

        if (upsertError) {
          throw upsertError;
        }
      }

      setStatus("Profile saved.");
    } catch (error) {
      console.error("Failed to save profile:", extractErrorDetails(error));
      setStatus("Could not save profile. Please try again.", true);
    } finally {
      setFormLoadingState(false);
    }
  };

  saveButton.addEventListener("click", async (event) => {
    event.preventDefault();
    await saveProfile();
  });

  if (profileForm) {
    profileForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveProfile();
    });
  }

  supabase.auth.onAuthStateChange((_event, nextSession) => {
    const nextUser = nextSession?.user || null;
    if (!nextUser) {
      safeRedirect(loginUrl);
      return;
    }

    if (nextUser.id !== activeUserId) {
      activeUserId = nextUser.id;
      loadProfile().catch((error) => {
        console.error("Failed to reload profile after auth change:", error);
      });
    }
  });
}

bootstrapProfile().catch((error) => {
  console.error("Profile bootstrap failed:", extractErrorDetails(error));
  setStatus("Profile could not initialize. Please reload.", true);
  setFormLoadingState(false);
});
