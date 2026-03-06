document.addEventListener("DOMContentLoaded", async () => {
  const chatTitle = document.getElementById("chatTitle");
  const chatSubtitle = document.getElementById("chatSubtitle");
  const chatMessages = document.getElementById("chatMessages");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const chatSendBtn = document.getElementById("chatSendBtn");
  const chatEmpty = document.getElementById("chatEmpty");

  if (!chatTitle || !chatSubtitle || !chatMessages || !chatForm || !chatInput || !chatSendBtn || !chatEmpty) {
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

  const params = new URLSearchParams(window.location.search);
  const otherUserId = String(params.get("user") || "").trim();
  if (!otherUserId || otherUserId === currentUser.id) {
    chatSubtitle.textContent = "Invalid chat target.";
    chatForm.style.display = "none";
    chatEmpty.style.display = "block";
    chatEmpty.textContent = "Open chat from a teacher card with an accepted connection.";
    return;
  }

  const escapeHtml = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const formatTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const setComposerEnabled = (enabled) => {
    chatInput.disabled = !enabled;
    chatSendBtn.disabled = !enabled;
  };

  const hasAcceptedConnection = async () => {
    const pairFilter =
      `and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherUserId}),` +
      `and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUser.id})`;

    const { data, error } = await supabase
      .from("connections")
      .select("id, status")
      .eq("status", "accepted")
      .or(pairFilter)
      .limit(1);

    if (error) {
      throw error;
    }

    return Boolean(data?.length);
  };

  const loadOtherUser = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", otherUserId)
      .single();

    if (error) {
      throw error;
    }

    return data;
  };

  const fetchConversation = async () => {
    const pairFilter =
      `and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherUserId}),` +
      `and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUser.id})`;

    const { data, error } = await supabase
      .from("messages")
      .select("id, sender_id, receiver_id, message, created_at")
      .or(pairFilter)
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    return data || [];
  };

  const renderMessages = (rows) => {
    chatMessages.textContent = "";
    if (!rows.length) {
      chatEmpty.style.display = "block";
      return;
    }

    chatEmpty.style.display = "none";
    rows.forEach((row) => {
      const isYou = row.sender_id === currentUser.id;
      const bubble = document.createElement("article");
      bubble.className = `chat-bubble ${isYou ? "you" : "other"}`;
      bubble.innerHTML = `
        <div>${escapeHtml(row.message)}</div>
        <span class="chat-meta">${isYou ? "You" : "Them"} - ${escapeHtml(formatTime(row.created_at))}</span>
      `;
      chatMessages.appendChild(bubble);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
  };

  const sendMessage = async (messageText) => {
    const { error } = await supabase
      .from("messages")
      .insert({
        sender_id: currentUser.id,
        receiver_id: otherUserId,
        message: messageText
      });

    if (error) {
      throw error;
    }
  };

  try {
    const [connected, otherUser] = await Promise.all([
      hasAcceptedConnection(),
      loadOtherUser()
    ]);

    chatTitle.textContent = `Chat with ${otherUser?.full_name || "User"}`;
    if (!connected) {
      chatSubtitle.textContent = "Chat is available only for accepted connections.";
      setComposerEnabled(false);
      chatForm.style.display = "none";
      chatEmpty.style.display = "block";
      chatEmpty.textContent = "No accepted connection found for this conversation.";
      return;
    }

    chatSubtitle.textContent = "Your messages stay inside the platform.";
    setComposerEnabled(true);
    const initialRows = await fetchConversation();
    renderMessages(initialRows);
  } catch (error) {
    console.error("Chat setup failed:", error);
    chatSubtitle.textContent = "Could not load this chat.";
    setComposerEnabled(false);
    chatForm.style.display = "none";
    chatEmpty.style.display = "block";
    chatEmpty.textContent = "Please try again.";
    return;
  }

  let refreshInFlight = false;
  const refreshMessages = async () => {
    if (refreshInFlight) {
      return;
    }
    refreshInFlight = true;
    try {
      const rows = await fetchConversation();
      renderMessages(rows);
    } catch (error) {
      console.error("Message refresh failed:", error);
    } finally {
      refreshInFlight = false;
    }
  };

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = String(chatInput.value || "").trim();
    if (!text) {
      return;
    }

    setComposerEnabled(false);
    try {
      await sendMessage(text);
      chatInput.value = "";
      await refreshMessages();
    } catch (error) {
      console.error("Send message failed:", error);
    } finally {
      setComposerEnabled(true);
      chatInput.focus();
    }
  });

  const pollingId = window.setInterval(() => {
    refreshMessages().catch((error) => {
      console.error("Polling refresh failed:", error);
    });
  }, 4000);

  window.addEventListener("beforeunload", () => {
    window.clearInterval(pollingId);
  });
});
