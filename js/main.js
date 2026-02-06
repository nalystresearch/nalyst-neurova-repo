document.addEventListener("DOMContentLoaded", function () {
  // Mobile menu toggle
  const menuBtn = document.querySelector(".mobile-menu-btn");
  const nav = document.querySelector("nav");

  if (menuBtn && nav) {
    menuBtn.addEventListener("click", function () {
      nav.classList.toggle("open");
    });

    // Close menu on navigation selection (mobile)
    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("open");
      });
    });
  }

  // Copy button functionality
  const copyBtns = document.querySelectorAll(".copy-btn");

  copyBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      const codeBlock = this.parentElement.querySelector(".code-block");
      if (codeBlock) {
        navigator.clipboard.writeText(codeBlock.textContent).then(function () {
          btn.textContent = "Copied!";
          setTimeout(function () {
            btn.textContent = "Copy";
          }, 2000);
        });
      }
    });
  });
});
