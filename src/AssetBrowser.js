// Presentation helpers shared by both catalogs. Original file/scene identities
// and loading callbacks stay in catalog.js; labels never change asset URLs.
export function mainViewList(gameName) {
  const section = document.createElement("section");
  section.className = "main-views";
  const title = document.createElement("h2");
  title.className = "main-views-title";
  title.textContent = `Explore ${gameName}`;
  const list = document.createElement("div");
  list.className = "main-views-list";
  section.append(title, list);
  return {section, list};
}

export function mainViewButton(label, code) {
  const button = document.createElement("button");
  button.className = "main-view-button";
  button.type = "button";
  button.textContent = label;
  button.title = code;
  button.dataset.assetSearch = `${label} ${code}`;
  return button;
}

export function browserSection(label, { open = false, detail = "" } = {}) {
  const section = document.createElement("details");
  section.className = "asset-browser-section";
  section.open = open;
  const summary = document.createElement("summary");
  summary.textContent = label;
  if (detail) summary.title = detail;
  const content = document.createElement("div");
  content.className = "asset-browser-content";
  section.append(summary, content);
  return { section, content };
}

export function assetLabel(element, label, code) {
  element.textContent = label;
  element.dataset.assetSearch = `${label} ${code || ""}`;
  if (code) {
    element.title = code;
    const technical = document.createElement("small");
    technical.className = "asset-technical-name";
    technical.textContent = code;
    element.append(technical);
  }
}

export function nestedBrowserSection(parent, key, label, options) {
  // A parent-local map prevents the same region appearing repeatedly as scene
  // variants are traversed. Disc and archive identities remain separate.
  parent._browserSections ||= new Map();
  if (!parent._browserSections.has(key)) {
    const group = browserSection(label, options);
    parent._browserSections.set(key, group.content);
    parent.append(group.section);
  }
  return parent._browserSections.get(key);
}

let restoreExpansion = null;

function setBranchOpen(element, open) {
  if (element.tagName === "DETAILS") { element.open = open; return; }
  element.classList.toggle("hidden", !open);
  const header = element.previousElementSibling;
  header?.classList.toggle("expanded", open);
  header?.setAttribute("aria-expanded", String(open));
}

export function refreshBrowserSearch(root) {
  const input = document.getElementById("asset-search");
  const status = document.getElementById("asset-search-status");
  if (!input || !status) return;
  root.querySelectorAll(".model-item, .category-header, .group-header").forEach(e => {
    e.tabIndex = 0;
    e.setAttribute("role", "button");
  });
  if (restoreExpansion) restoreExpansion();
  restoreExpansion = null;
  const leaves = [...root.querySelectorAll(".model-item, .main-view-button")];
  const branches = [...root.querySelectorAll("details, .category-group, .model-group, .main-views")];
  const query = input.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  root.querySelectorAll("[data-search-hidden]").forEach(e => delete e.dataset.searchHidden);
  if (!query.length) { status.textContent = ""; return; }
  const snapshots = [...root.querySelectorAll("details, .category-content, .group-items")]
    .map(e => ({ e, open: e.open, hidden: e.classList.contains("hidden") }));
  restoreExpansion = () => snapshots.forEach(({e, open, hidden}) => {
    setBranchOpen(e, e.tagName === "DETAILS" ? open : !hidden);
  });
  let count = 0;
  for (const leaf of leaves) {
    const labels = [leaf.dataset.assetSearch || leaf.textContent, leaf.title];
    for (let p = leaf.parentElement; p && p !== root; p = p.parentElement) {
      const heading = p.querySelector(":scope > summary, :scope > .category-header, :scope > .group-header");
      if (heading) labels.push(heading.textContent, heading.title);
    }
    const haystack = labels.join(" ").toLocaleLowerCase();
    const matches = query.every(word => haystack.includes(word));
    if (!matches) leaf.dataset.searchHidden = "true";
    else count++;
  }
  for (const branch of branches.reverse()) {
    if (!branch.querySelector('.model-item:not([data-search-hidden]), .main-view-button:not([data-search-hidden])')) {
      branch.dataset.searchHidden = "true";
    }
  }
  snapshots.forEach(({e}) => {
    setBranchOpen(e, true);
  });
  status.textContent = count ? `${count.toLocaleString()} matches` : "No matching assets";
}

export function installBrowserSearch(root) {
  root.addEventListener("keydown", event => {
    if (event.defaultPrevented || !["Enter", " "].includes(event.key)) return;
    if (event.target.matches(".model-item, .category-header, .group-header")) {
      event.preventDefault();
      event.target.click();
    }
  });
  const input = document.getElementById("asset-search");
  input?.addEventListener("input", () => refreshBrowserSearch(root));
  document.getElementById("asset-collapse-all")?.addEventListener("click", () => {
    input.value = "";
    refreshBrowserSearch(root);
    root.querySelectorAll("details").forEach(e => { e.open = false; });
    root.querySelectorAll(".category-content, .group-items").forEach(e => e.classList.add("hidden"));
    root.querySelectorAll(".expanded").forEach(e => e.classList.remove("expanded"));
    root.querySelectorAll('[aria-expanded="true"]').forEach(e => e.setAttribute("aria-expanded", "false"));
  });
}
