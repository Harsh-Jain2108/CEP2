const typedText = document.getElementById("typedText");
const words = [
  "Learn / Teach / Connect / Grow",
  "Mentor / Support / Collaborate / Build",
  "Explore / Share / Practice / Thrive"
];
let wordIndex = 0;

setInterval(() => {
  wordIndex = (wordIndex + 1) % words.length;
  typedText.textContent = words[wordIndex];
}, 2500);

const observers = document.querySelectorAll("[data-animate]");
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        io.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15 }
);

observers.forEach((item) => {
  item.classList.add("fade-up");
  io.observe(item);
});

async function loadHomepageStats() {
  const collegesCount = document.getElementById("homeCollegesCount");
  const connectionsCount = document.getElementById("homeConnectionsCount");
  const skillsCount = document.getElementById("homeSkillsCount");

  if (!collegesCount || !connectionsCount || !skillsCount) {
    return;
  }

  try {
    const { getSupabaseClient } = await import("./supabase.js");
    const supabase = await getSupabaseClient();

    const [
      { data: profileRows, error: profilesError },
      { count: acceptedConnectionsCount, error: connectionsError },
      { count: totalSkillsCount, error: skillsError }
    ] = await Promise.all([
      supabase.from("profiles").select("location"),
      supabase
        .from("connections")
        .select("*", { count: "exact", head: true })
        .eq("status", "accepted"),
      supabase.from("skills").select("*", { count: "exact", head: true })
    ]);

    if (profilesError) {
      throw profilesError;
    }
    if (connectionsError) {
      throw connectionsError;
    }
    if (skillsError) {
      throw skillsError;
    }

    const uniqueColleges = new Set(
      (profileRows || [])
        .map((row) => String(row?.location || "").trim())
        .filter(Boolean)
    );

    collegesCount.textContent = String(uniqueColleges.size);
    connectionsCount.textContent = String(acceptedConnectionsCount || 0);
    skillsCount.textContent = String(totalSkillsCount || 0);
  } catch (error) {
    console.error("Failed to load homepage stats:", error);
    collegesCount.textContent = "0";
    connectionsCount.textContent = "0";
    skillsCount.textContent = "0";
  }
}

loadHomepageStats();
