document.addEventListener("DOMContentLoaded", async () => {
  const messagesList = document.getElementById("messagesList");
  const messagesEmpty = document.getElementById("messagesEmpty");

  if (!messagesList || !messagesEmpty) {
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

  const formatRelativeTime = (value) => {
    const timestamp = new Date(value).getTime();
    if (!timestamp) {
      return "";
    }

    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 60) {
      return "Just now";
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    }
    const days = Math.floor(hours / 24);
    if (days < 7) {
      return `${days} day${days === 1 ? "" : "s"} ago`;
    }

    return new Date(value).toLocaleDateString();
  };

  const setEmptyState = (message) => {
    messagesEmpty.textContent = message;
    messagesEmpty.style.display = "block";
  };

  const clearEmptyState = () => {
    messagesEmpty.style.display = "none";
  };

  const fetchConversations = async () => {
    const { data: rows, error } = await supabase
      .from("messages")
      .select("id, sender_id, receiver_id, message, created_at")
      .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const byOtherUserId = new Map();
    for (const row of rows || []) {
      const otherUserId =
        row.sender_id === currentUser.id ? row.receiver_id : row.sender_id;
      if (!otherUserId || byOtherUserId.has(otherUserId)) {
        continue;
      }
      byOtherUserId.set(otherUserId, row);
    }

    const userIds = Array.from(byOtherUserId.keys());
    if (!userIds.length) {
      return [];
    }

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, location")
      .in("id", userIds);

    if (profilesError) {
      throw profilesError;
    }

    const profileById = new Map((profiles || []).map((row) => [row.id, row]));
    return userIds.map((otherUserId) => {
      const messageRow = byOtherUserId.get(otherUserId);
      const profile = profileById.get(otherUserId) || {};
      return {
        otherUserId,
        fullName: profile.full_name || "Unknown User",
        location: profile.location || "",
        lastMessage: messageRow?.message || "",
        createdAt: messageRow?.created_at || ""
      };
    });
  };

  const renderConversations = (rows) => {
    messagesList.textContent = "";

    if (!rows.length) {
      setEmptyState("No conversations yet.");
      return;
    }

    clearEmptyState();
    rows.forEach((row) => {
      const link = document.createElement("a");
      const chatUrl = new URL("chat.html", window.location.href);
      chatUrl.searchParams.set("user", row.otherUserId);
      link.href = chatUrl.toString();
      link.className = "conversation-item";
      link.innerHTML = `
        <div class="conversation-top">
          <p class="conversation-name">${escapeHtml(row.fullName)}</p>
          <span class="conversation-time">${escapeHtml(formatRelativeTime(row.createdAt))}</span>
        </div>
        <p class="conversation-last">Last message: ${escapeHtml(row.lastMessage)}</p>
      `;
      messagesList.appendChild(link);
    });
  };

  try {
    const conversations = await fetchConversations();
    renderConversations(conversations);
  } catch (error) {
    console.error("Failed to load conversations:", error);
    setEmptyState("Could not load messages. Please refresh.");
  }
});
