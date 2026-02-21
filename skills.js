const skills = [
  {
    skill: "Python Basics",
    teacher: "Aarav Patel",
    location: "Pune",
    level: "Beginner",
    contact: "aarav.p@skillup.edu"
  },
  {
    skill: "UI Design",
    teacher: "Priya Nair",
    location: "Mumbai",
    level: "Intermediate",
    contact: "priya.n@skillup.edu"
  },
  {
    skill: "Public Speaking",
    teacher: "Neha Verma",
    location: "Nashik",
    level: "Beginner",
    contact: "neha.v@skillup.edu"
  },
  {
    skill: "Excel Analytics",
    teacher: "Rohit Das",
    location: "Delhi",
    level: "Intermediate",
    contact: "rohit.d@skillup.edu"
  },
  {
    skill: "Java DSA",
    teacher: "Kabir Singh",
    location: "Bengaluru",
    level: "Advanced",
    contact: "kabir.s@skillup.edu"
  },
  {
    skill: "Photography",
    teacher: "Ananya Rao",
    location: "Hyderabad",
    level: "Beginner",
    contact: "ananya.r@skillup.edu"
  },
  {
    skill: "Social Media Strategy",
    teacher: "Meera Joshi",
    location: "Ahmedabad",
    level: "Intermediate",
    contact: "meera.j@skillup.edu"
  },
  {
    skill: "Web Fundamentals",
    teacher: "Aditya Kulkarni",
    location: "Pune",
    level: "Beginner",
    contact: "aditya.k@skillup.edu"
  }
];

const skillGrid = document.getElementById("skillGrid");
const emptyState = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");
const skillFilter = document.getElementById("skillFilter");
const levelFilter = document.getElementById("levelFilter");
const locationFilter = document.getElementById("locationFilter");

function populateFilters() {
  const skillSet = new Set();
  const locationSet = new Set();

  skills.forEach((item) => {
    skillSet.add(item.skill);
    locationSet.add(item.location);
  });

  skillSet.forEach((skill) => {
    const option = document.createElement("option");
    option.value = skill;
    option.textContent = skill;
    skillFilter.appendChild(option);
  });

  locationSet.forEach((location) => {
    const option = document.createElement("option");
    option.value = location;
    option.textContent = location;
    locationFilter.appendChild(option);
  });
}

function getLevelClass(level) {
  if (level === "Beginner") return "level-beginner";
  if (level === "Intermediate") return "level-intermediate";
  return "level-advanced";
}

function renderSkills(list) {
  skillGrid.innerHTML = "";

  list.forEach((item) => {
    const card = document.createElement("article");
    card.className = "card skill-card";
    card.innerHTML = `
      <h3>${item.skill}</h3>
      <div class="skill-meta">
        <span>${item.teacher}</span>
        <span>${item.location}</span>
      </div>
      <div class="skill-actions">
        <span class="level-badge ${getLevelClass(item.level)}">${item.level}</span>
        <button class="btn btn-outline connect-btn" type="button">Connect</button>
      </div>
      <div class="connect-info" hidden>
        Connect via WhatsApp or Meet · ${item.contact}
      </div>
    `;
    skillGrid.appendChild(card);
  });

  emptyState.style.display = list.length ? "none" : "block";
}

skillGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".connect-btn");
  if (!button) return;

  const card = button.closest(".skill-card");
  const info = card.querySelector(".connect-info");
  const isHidden = info.hasAttribute("hidden");

  if (isHidden) {
    info.removeAttribute("hidden");
    button.textContent = "Contact shared";
  } else {
    info.setAttribute("hidden", "");
    button.textContent = "Connect";
  }
});

function filterSkills() {
  const searchValue = searchInput.value.trim().toLowerCase();
  const skillValue = skillFilter.value;
  const levelValue = levelFilter.value;
  const locationValue = locationFilter.value;

  const filtered = skills.filter((item) => {
    const matchesSearch =
      item.skill.toLowerCase().includes(searchValue) ||
      item.teacher.toLowerCase().includes(searchValue);
    const matchesSkill = skillValue ? item.skill === skillValue : true;
    const matchesLevel = levelValue ? item.level === levelValue : true;
    const matchesLocation = locationValue ? item.location === locationValue : true;

    return matchesSearch && matchesSkill && matchesLevel && matchesLocation;
  });

  renderSkills(filtered);
}

populateFilters();
renderSkills(skills);

[searchInput, skillFilter, levelFilter, locationFilter].forEach((control) => {
  control.addEventListener("input", filterSkills);
  control.addEventListener("change", filterSkills);
});