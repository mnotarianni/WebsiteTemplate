// Mobile nav toggle, current-year, and a simple honeypot guard for the form.
(function () {
  var toggle = document.querySelector(".nav-toggle");
  var links = document.getElementById("nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.addEventListener("click", function (e) { if (e.target.tagName === "A") links.classList.remove("open"); });
  }

  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // Mark the current page's nav link
  var path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach(function (a) {
    if (a.getAttribute("href") === path) a.setAttribute("aria-current", "page");
  });

  // Contact form: block obvious bots via honeypot before submit.
  var form = document.getElementById("contact-form");
  if (form) form.addEventListener("submit", function (e) {
    if (form.querySelector(".hp") && form.querySelector(".hp").value) { e.preventDefault(); }
  });
})();
