// Lightweight wrapper around the global lucide UMD bundle loaded in index.html.
// Replaces every <span data-icon="Name" data-size="16"></span> with an SVG.

export function renderIcons(root = document) {
  if (!window.lucide) return;
  const nodes = root.querySelectorAll('[data-icon]');
  nodes.forEach((node) => {
    const name = node.dataset.icon;
    if (!name) return;
    const size = Number(node.dataset.size || 16);
    const stroke = node.dataset.stroke || "currentColor";

    // Try several casing variants because lucide UMD exposes different shapes.
    const icons = window.lucide.icons || window.lucide;
    const candidates = [name, name.charAt(0).toLowerCase() + name.slice(1)];
    let icon = null;
    for (const c of candidates) {
      if (icons[c]) {
        icon = icons[c];
        break;
      }
    }
    if (!icon) return;

    const svg = window.lucide.createElement
      ? window.lucide.createElement(icon)
      : null;

    // Fallback: build SVG manually from the [tag, attrs, children] array.
    const svgEl = svg || buildSvg(icon, size, stroke);
    if (size && svgEl) {
      svgEl.setAttribute("width", size);
      svgEl.setAttribute("height", size);
    }
    node.replaceChildren(svgEl);
  });
}

function buildSvg(icon, size, stroke) {
  const data = Array.isArray(icon) ? icon : icon?.[2] || icon;
  if (!Array.isArray(data)) return null;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("xmlns", ns);
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", stroke);
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  data.forEach(([tag, attrs]) => {
    const child = document.createElementNS(ns, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => child.setAttribute(k, v));
    svg.appendChild(child);
  });
  return svg;
}

export function iconHtml(name, size = 16) {
  return `<span data-icon="${name}" data-size="${size}"></span>`;
}
