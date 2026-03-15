const THEME_STORAGE_KEY = "theme";
const DARK_THEME_CLASS = "dark-theme";

function applyTheme(theme) {
  const enableDark = theme === "dark";
  document.documentElement.classList.toggle(DARK_THEME_CLASS, enableDark);

  if (document.body) {
    document.body.classList.toggle(DARK_THEME_CLASS, enableDark);
  }
}

function updateToggleLabel(button, theme) {
  if (!button) {
    return;
  }

  const isDark = theme === "dark";
  button.textContent = "\uD83C\uDF19";
  button.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  button.setAttribute("aria-pressed", isDark ? "true" : "false");
  button.setAttribute("title", isDark ? "Switch to light mode" : "Switch to dark mode");
}

const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
applyTheme(savedTheme === "dark" ? "dark" : "light");

document.addEventListener("DOMContentLoaded", () => {
  applyTheme(savedTheme === "dark" ? "dark" : "light");

  const toggle = document.getElementById("themeToggle");
  if (!toggle) {
    return;
  }

  updateToggleLabel(toggle, document.documentElement.classList.contains(DARK_THEME_CLASS) ? "dark" : "light");

  toggle.addEventListener("click", () => {
    const nextTheme = document.documentElement.classList.contains(DARK_THEME_CLASS) ? "light" : "dark";
    applyTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    updateToggleLabel(toggle, nextTheme);
  });
});
