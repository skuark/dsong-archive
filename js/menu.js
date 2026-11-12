// Header menu on phones: the button (hidden without JS, so the menu then stays open) folds and unfolds it.
// CSS shows the button and folds the menu only on narrow screens; Escape closes it.
(() => {
  const button = document.querySelector(".header__burger");
  const header = button?.closest(".header");
  if (!header) return;
  const set = (open) => {
    header.classList.toggle("header--open", open);
    button.setAttribute("aria-expanded", String(open));
  };
  button.hidden = false;
  button.addEventListener("click", () => set(!header.classList.contains("header--open")));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && header.classList.contains("header--open")) {
      set(false);
      button.focus();
    }
  });
})();
