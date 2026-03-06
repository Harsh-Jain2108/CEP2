document.addEventListener("DOMContentLoaded", async () => {
  const requestsList = document.getElementById("requestsList");
  const requestsEmpty = document.getElementById("requestsEmpty");

  if (!requestsList || !requestsEmpty) {
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

  const escapeHtml = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const setEmptyState = (message) => {
    requestsEmpty.textContent = message;
    requestsEmpty.style.display = "block";
  };

  const clearEmptyState = () => {
    requestsEmpty.style.display = "none";
  };

  const fetchIncomingRequests = async () => {
    const { data: requests, error } = await supabase
      .from("connections")
      .select("id, sender_id, status, created_at")
      .eq("receiver_id", currentUser.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    if (!requests?.length) {
      return [];
    }

    const senderIds = Array.from(new Set(requests.map((row) => row.sender_id).filter(Boolean)));
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", senderIds);

    if (profilesError) {
      throw profilesError;
    }

    const profileById = new Map((profiles || []).map((row) => [row.id, row]));
    return requests.map((row) => ({
      ...row,
      senderName: profileById.get(row.sender_id)?.full_name || "Someone"
    }));
  };

  const updateRequestStatus = async (requestId, status) => {
    const { data, error } = await supabase
      .from("connections")
      .update({ status })
      .eq("id", requestId)
      .eq("receiver_id", currentUser.id)
      .select("id")
      .single();

    if (error) {
      throw error;
    }
    return data;
  };

  const handleRequestAction = async (requestId, status, card, buttons) => {
    buttons.forEach((button) => {
      button.disabled = true;
    });

    try {
      await updateRequestStatus(requestId, status);
      card.remove();
      if (!requestsList.children.length) {
        setEmptyState("No pending connection requests.");
      }
    } catch (error) {
      console.error("Failed to update request status:", error);
      buttons.forEach((button) => {
        button.disabled = false;
      });
      setEmptyState("Failed to update request. Please try again.");
    }
  };

  const renderRequests = (rows) => {
    requestsList.textContent = "";

    if (!rows.length) {
      setEmptyState("No pending connection requests.");
      return;
    }

    clearEmptyState();
    rows.forEach((row) => {
      const card = document.createElement("article");
      card.className = "card request-card";
      card.innerHTML = `
        <p class="request-text">${escapeHtml(row.senderName)} wants to connect with you.</p>
        <div class="request-actions">
          <button type="button" class="request-btn accept">Accept</button>
          <button type="button" class="request-btn decline">Decline</button>
        </div>
      `;

      const acceptBtn = card.querySelector(".request-btn.accept");
      const declineBtn = card.querySelector(".request-btn.decline");
      const buttons = [acceptBtn, declineBtn];

      acceptBtn.addEventListener("click", () =>
        handleRequestAction(row.id, "accepted", card, buttons)
      );
      declineBtn.addEventListener("click", () =>
        handleRequestAction(row.id, "rejected", card, buttons)
      );

      requestsList.appendChild(card);
    });
  };

  try {
    const rows = await fetchIncomingRequests();
    renderRequests(rows);
  } catch (error) {
    console.error("Failed to load incoming requests:", error);
    setEmptyState("Could not load requests. Please refresh.");
  }
});
