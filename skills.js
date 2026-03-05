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
