const teachSkills = [];
const learnSkills = [];

const teachInput = document.getElementById("teachSkillInput");
const teachLevel = document.getElementById("teachSkillLevel");
const teachTags = document.getElementById("teachTags");
const learnInput = document.getElementById("learnSkillInput");
const learnTags = document.getElementById("learnTags");
const saveStatus = document.getElementById("saveStatus");

function normalize(value) {
  return value.trim().toLowerCase();
}

function renderTags(list, container, isLearn) {
  container.innerHTML = "";
  list.forEach((skill, index) => {
    const tag = document.createElement("div");
    tag.className = `tag${isLearn ? " learn" : ""}`;
    tag.innerHTML = `
      <span>${skill.label}</span>
      <button type="button" aria-label="Remove skill">&times;</button>
    `;

    tag.querySelector("button").addEventListener("click", () => {
      list.splice(index, 1);
      renderTags(list, container, isLearn);
    });

    container.appendChild(tag);
  });
}

function addTeachSkill() {
  const name = teachInput.value.trim();
  if (!name) {
    return;
  }

  const key = normalize(name);
  if (teachSkills.some((skill) => skill.key === key)) {
    return;
  }

  teachSkills.push({
    key,
    label: `${name} (${teachLevel.value})`
  });

  teachInput.value = "";
  renderTags(teachSkills, teachTags, false);
}

function addLearnSkill() {
  const name = learnInput.value.trim();
  if (!name) {
    return;
  }

  const key = normalize(name);
  if (learnSkills.some((skill) => skill.key === key)) {
    return;
  }

  learnSkills.push({ key, label: name });
  learnInput.value = "";
  renderTags(learnSkills, learnTags, true);
}

document.getElementById("addTeach").addEventListener("click", addTeachSkill);
document.getElementById("addLearn").addEventListener("click", addLearnSkill);

document.getElementById("saveProfile").addEventListener("click", () => {
  const profileData = {
    name: document.getElementById("fullName").value.trim(),
    location: document.getElementById("location").value.trim(),
    teaches: teachSkills,
    learns: learnSkills
  };

  console.log("Profile data:", profileData);
  saveStatus.classList.add("show");
  setTimeout(() => saveStatus.classList.remove("show"), 2000);
});