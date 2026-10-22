const reducedMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
const revealTargets = [...document.querySelectorAll("[data-reveal]")];
const header = document.querySelector(".site-header");

let revealObserver = null;

function showAllSections() {
  revealObserver?.disconnect();
  revealObserver = null;
  revealTargets.forEach((section) => section.classList.add("is-visible"));
}

function initSectionReveals() {
  if (!revealTargets.length) return;

  if (reducedMotionQuery?.matches || !("IntersectionObserver" in window)) {
    showAllSections();
    return;
  }

  try {
    revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, {
      rootMargin: "0px 0px -6% 0px",
      threshold: 0.08
    });

    revealTargets.forEach((section) => revealObserver.observe(section));
  } catch {
    showAllSections();
  }
}

function initHeaderScrollState() {
  if (!header) return;

  let updateQueued = false;

  function updateHeader() {
    header.classList.toggle("is-scrolled", window.scrollY > 24);
    updateQueued = false;
  }

  function queueHeaderUpdate() {
    if (updateQueued) return;
    updateQueued = true;
    window.requestAnimationFrame(updateHeader);
  }

  updateHeader();
  window.addEventListener("scroll", queueHeaderUpdate, { passive: true });
}

initSectionReveals();
initHeaderScrollState();

reducedMotionQuery?.addEventListener?.("change", (event) => {
  if (event.matches) showAllSections();
});
