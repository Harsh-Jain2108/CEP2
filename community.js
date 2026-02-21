const requests = [
  {
    text: "Looking for someone to teach Python basics.",
    name: "Riya Kulkarni",
    contact: "riya.k@skillup.edu"
  },
  {
    text: "Need help with UI/UX portfolio review.",
    name: "Samar Joshi",
    contact: "samar.j@skillup.edu"
  },
  {
    text: "Searching for a peer to learn DSA in Java.",
    name: "Akash Rao",
    contact: "akash.r@skillup.edu"
  }
];

const requestList = document.getElementById("requestList");
const requestForm = document.getElementById("requestForm");
const requestAlert = document.getElementById("requestAlert");

function showFormAlert(message, type = "success") {
  requestAlert.textContent = message;
  requestAlert.className = `form-alert ${type}`;
}

function renderRequests() {
  requestList.innerHTML = "";

  requests.forEach((request, index) => {
    const card = document.createElement("article");
    card.className = "card request-item";
    card.innerHTML = `
      <p class="request-text">${request.text}</p>
      <div class="request-meta">
        <span>Posted by ${request.name}</span>
        <span>Community</span>
      </div>
      <button class="btn btn-outline connect-btn" type="button" data-index="${index}">
        Connect
      </button>
      <div class="connect-info" hidden>
        Connect via WhatsApp or Meet · ${request.contact}
      </div>
    `;

    requestList.appendChild(card);
  });
}

requestList.addEventListener("click", (event) => {
  const button = event.target.closest(".connect-btn");
  if (!button) return;

  const card = button.closest(".request-item");
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

requestForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const nameInput = document.getElementById("requestName");
  const textInput = document.getElementById("requestText");

  const name = nameInput.value.trim();
  const text = textInput.value.trim();

  if (!name || !text) {
    showFormAlert("Please add your name and a request.", "error");
    return;
  }

  requests.unshift({
    text,
    name,
    contact: `${name.toLowerCase().replace(/\s+/g, ".")}@skillup.edu`
  });

  nameInput.value = "";
  textInput.value = "";
  showFormAlert("Request posted. Check the community list.");
  renderRequests();
});

renderRequests();