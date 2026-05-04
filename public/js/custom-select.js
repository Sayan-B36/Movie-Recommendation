/**
 * Custom premium dropdown that wraps native <select> elements without
 * replacing them - the original select stays in the DOM (visually hidden
 * but functional) so every existing change-event listener keeps working.
 *
 * On mousedown / Space / Enter we prevent the OS-native menu from
 * opening and show a styled popover listbox instead. Picking an option
 * sets select.value and dispatches a "change" event, so the rest of
 * the app reacts exactly the same way it always has.
 */

const HOST_SELECTORS = [".select-field", ".discover-industry", ".sort-field"];

function findHost(select) {
  for (const sel of HOST_SELECTORS) {
    const h = select.closest(sel);
    if (h) return h;
  }
  return select.parentElement;
}

export function enhanceSelect(select) {
  if (!select || select.dataset.csEnhanced === "1") return;
  select.dataset.csEnhanced = "1";

  const host = findHost(select);
  host.classList.add("cs-host");

  const panel = document.createElement("div");
  panel.className = "cs-panel";
  panel.setAttribute("role", "listbox");
  panel.hidden = true;
  host.appendChild(panel);

  let isOpen = false;

  function buildPanel() {
    panel.innerHTML = "";
    Array.from(select.options).forEach((opt) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "cs-option" + (opt.value === select.value ? " selected" : "");
      item.setAttribute("role", "option");
      item.dataset.value = opt.value;
      item.textContent = opt.textContent;
      item.addEventListener("click", () => {
        if (select.value !== opt.value) {
          select.value = opt.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        close();
      });
      panel.appendChild(item);
    });
  }

  // Flip direction is decided once at open time (not on every scroll
  // event) so the panel doesn't jitter / re-animate mid-scroll.
  let flipUp = false;

  function decideFlipDirection() {
    const rect = host.getBoundingClientRect();
    const vpH = window.innerHeight;
    const spaceBelow = vpH - rect.bottom;
    const spaceAbove = rect.top;
    const desired = Math.min(320, panel.scrollHeight || 320);
    flipUp = spaceBelow < desired + 16 && spaceAbove > spaceBelow;
    panel.classList.toggle("cs-flip-up", flipUp);
  }

  function positionPanel() {
    // Pin the panel to the host's viewport coordinates so it floats above
    // every ancestor backdrop-filter / overflow / stacking context.
    const rect = host.getBoundingClientRect();
    const vpH = window.innerHeight;

    panel.style.position = "fixed";
    panel.style.left = `${rect.left}px`;
    panel.style.width = `${rect.width}px`;
    panel.style.right = "auto";

    if (flipUp) {
      panel.style.top = "auto";
      panel.style.bottom = `${vpH - rect.top + 8}px`;
    } else {
      panel.style.top = `${rect.bottom + 8}px`;
      panel.style.bottom = "auto";
    }
  }

  function open() {
    if (isOpen) return;
    // Close any other open dropdowns first - one at a time.
    document.querySelectorAll(".cs-host.cs-open").forEach((h) => {
      if (h !== host) {
        const ev = new CustomEvent("cs:force-close");
        h.dispatchEvent(ev);
      }
    });
    buildPanel();
    // Portal the panel onto <body> so no ancestor can clip or overlap it.
    document.body.appendChild(panel);
    panel.hidden = false;
    host.classList.add("cs-open");
    isOpen = true;
    decideFlipDirection();
    positionPanel();
    // Focus the currently selected option for keyboard users.
    setTimeout(() => {
      const sel = panel.querySelector(".selected") || panel.querySelector(".cs-option");
      if (sel) sel.focus();
    }, 0);
    document.addEventListener("mousedown", onDocMousedown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onWindowChange, true);
    window.addEventListener("resize", onWindowChange);
  }

  function close() {
    if (!isOpen) return;
    panel.hidden = true;
    host.classList.remove("cs-open");
    isOpen = false;
    // Return panel to host so it gets cleaned up alongside future re-renders.
    if (panel.parentElement === document.body) {
      host.appendChild(panel);
    }
    document.removeEventListener("mousedown", onDocMousedown, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", onWindowChange, true);
    window.removeEventListener("resize", onWindowChange);
  }

  // Allow other dropdowns to ask us to close (single-open enforcement).
  host.addEventListener("cs:force-close", close);

  function onWindowChange(e) {
    // Skip internal panel scrolling so the user can scroll through long
    // option lists without us recomputing position uselessly.
    if (e && e.target && panel.contains(e.target)) return;

    // If the host has scrolled completely out of the viewport, close.
    const rect = host.getBoundingClientRect();
    const vpH = window.innerHeight;
    if (rect.bottom < 0 || rect.top > vpH) {
      close();
      return;
    }
    // Otherwise stay open and follow the host.
    positionPanel();
  }

  function onDocMousedown(e) {
    if (!host.contains(e.target) && !panel.contains(e.target)) close();
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      select.focus();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const opts = Array.from(panel.querySelectorAll(".cs-option"));
      const cur = opts.indexOf(document.activeElement);
      const next = e.key === "ArrowDown"
        ? Math.min(opts.length - 1, cur < 0 ? 0 : cur + 1)
        : Math.max(0, cur < 0 ? 0 : cur - 1);
      if (opts[next]) opts[next].focus();
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const opts = panel.querySelectorAll(".cs-option");
      const target = e.key === "Home" ? opts[0] : opts[opts.length - 1];
      if (target) target.focus();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      const active = document.activeElement;
      if (active && active.classList.contains("cs-option")) {
        e.preventDefault();
        active.click();
      }
    }
  }

  // Block the OS-native dropdown and show ours instead.
  select.addEventListener("mousedown", (e) => {
    e.preventDefault();
    if (isOpen) close();
    else open();
  });
  // Keyboard activation also routes through our panel.
  select.addEventListener("keydown", (e) => {
    if (
      e.key === " " ||
      e.key === "Enter" ||
      e.key === "ArrowDown" ||
      e.key === "ArrowUp"
    ) {
      e.preventDefault();
      open();
    }
  });
}

export function enhanceAllSelects(root) {
  const scope = root || document;
  scope.querySelectorAll('select:not([data-cs-enhanced="1"])').forEach(enhanceSelect);
}
