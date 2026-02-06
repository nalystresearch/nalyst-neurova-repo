document.addEventListener("DOMContentLoaded", function () {
  // Mobile menu toggle
  var menuBtn = document.querySelector(".mobile-menu-btn");
  var nav = document.querySelector("nav");

  if (menuBtn && nav) {
    menuBtn.addEventListener("click", function () {
      nav.classList.toggle("open");
    });
  }

  // Sidebar toggle
  var sidebarToggle = document.querySelector(".sidebar-toggle");
  var sidebar = document.querySelector(".sidebar");

  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener("click", function () {
      sidebar.classList.toggle("open");
    });
  }

  // Copy button functionality
  var copyBtns = document.querySelectorAll(".copy-btn");

  copyBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var codeBlock = this.parentElement;
      var code = codeBlock.textContent.replace("Copy", "").trim();

      navigator.clipboard.writeText(code).then(function () {
        btn.textContent = "Copied!";
        setTimeout(function () {
          btn.textContent = "Copy";
        }, 2000);
      });
    });
  });

  // Smooth scroll for anchor links
  var anchorLinks = document.querySelectorAll('a[href^="#"]');

  anchorLinks.forEach(function (link) {
    link.addEventListener("click", function (e) {
      var targetId = this.getAttribute("href");
      var targetEl = document.querySelector(targetId);

      if (targetEl) {
        e.preventDefault();
        targetEl.scrollIntoView({ behavior: "smooth" });

        // Close sidebar on mobile after clicking
        if (sidebar && window.innerWidth <= 900) {
          sidebar.classList.remove("open");
        }
      }
    });
  });
});
