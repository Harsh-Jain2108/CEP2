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