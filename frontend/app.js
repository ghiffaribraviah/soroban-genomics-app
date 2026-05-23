const STORAGE_KEY = "soroban-genomics-demo-state-v1";
const DEMO_OWNER = "GBLUEQ2VEPFZ7VEMO4E6R7WJRC3D4S65LTX5XGENOMICSOWNER";
const DEMO_RESEARCHER = "GDRNA2WSRHEUMK4Q4XSSZ52L4RESEARCHERDEMO000000";

const seedState = {
  nextDatasetId: 4,
  walletAddress: "",
  selectedAction: "check",
  datasets: [
    {
      id: 1,
      owner: DEMO_OWNER,
      title: "Rare disease cohort A",
      description: "De-identified whole genome sequencing metadata for a consented rare disease cohort.",
      dataType: "WGS",
      metadataUri: "ipfs://bafygenomicsa",
      contentHash: "sha256:a91f87c2d44b-genomics-a",
      price: 250,
      active: true,
      createdLedger: 488210,
      updatedLedger: 488210,
    },
    {
      id: 2,
      owner: DEMO_OWNER,
      title: "Oncology expression atlas",
      description: "RNA-seq sample annotations, phenotype summaries, and encrypted storage references.",
      dataType: "RNA-seq",
      metadataUri: "ipfs://bafyoncologyatlas",
      contentHash: "sha256:4db7ef0a1c6f-expression",
      price: 420,
      active: true,
      createdLedger: 488336,
      updatedLedger: 488336,
    },
    {
      id: 3,
      owner: "GCLINICALTRIALSOWNER7QKJ4C44MAPPEDWALLET000000",
      title: "Longitudinal methylation panel",
      description: "Time-series methylation metadata with controlled clinical covariates and audit hashes.",
      dataType: "Methylation",
      metadataUri: "ipfs://bafymethylationpanel",
      contentHash: "sha256:7bb23a0e8b11-methylation",
      price: 175,
      active: false,
      createdLedger: 487998,
      updatedLedger: 488411,
    },
  ],
  grants: [
    {
      datasetId: 1,
      grantee: DEMO_RESEARCHER,
      grantedBy: DEMO_OWNER,
      paidAmount: 250,
      grantedLedger: 488522,
    },
  ],
  events: [
    {
      kind: "access:grant",
      title: "Access recorded for Rare disease cohort A",
      detail: `${shortAddress(DEMO_RESEARCHER)} paid 250`,
      createdAt: new Date().toISOString(),
    },
  ],
};

const els = {
  title: document.querySelector("#view-title"),
  navTabs: Array.from(document.querySelectorAll(".nav-tab")),
  views: Array.from(document.querySelectorAll(".view")),
  walletAddress: document.querySelector("#wallet-address"),
  connectWallet: document.querySelector("#connect-wallet"),
  metrics: {
    total: document.querySelector("#metric-total"),
    active: document.querySelector("#metric-active"),
    access: document.querySelector("#metric-access"),
    volume: document.querySelector("#metric-volume"),
  },
  search: document.querySelector("#dataset-search"),
  dataFilter: document.querySelector("#data-filter"),
  datasetGrid: document.querySelector("#dataset-grid"),
  datasetTemplate: document.querySelector("#dataset-card-template"),
  datasetForm: document.querySelector("#dataset-form"),
  datasetId: document.querySelector("#dataset-id"),
  datasetFields: {
    title: document.querySelector("#title"),
    dataType: document.querySelector("#data-type"),
    description: document.querySelector("#description"),
    metadataUri: document.querySelector("#metadata-uri"),
    contentHash: document.querySelector("#content-hash"),
    price: document.querySelector("#price"),
    active: document.querySelector("#active"),
  },
  formSubmit: document.querySelector("#dataset-form button[type='submit']"),
  clearForm: document.querySelector("#clear-form"),
  resetDemo: document.querySelector("#reset-demo"),
  accessForm: document.querySelector("#access-form"),
  accessDataset: document.querySelector("#access-dataset"),
  researcher: document.querySelector("#researcher"),
  paidAmount: document.querySelector("#paid-amount"),
  accessButtons: Array.from(document.querySelectorAll(".segmented button")),
  activityList: document.querySelector("#activity-list"),
  toastRegion: document.querySelector("#toast-region"),
};

let state = loadState();

const provider = {
  listDatasets: () => state.datasets,
  publishDataset(owner, input) {
    if (input.price < 0) throw new Error("Price must be zero or greater.");
    const ledger = nextLedger();
    const dataset = {
      id: state.nextDatasetId,
      owner,
      ...input,
      active: true,
      createdLedger: ledger,
      updatedLedger: ledger,
    };
    state.nextDatasetId += 1;
    state.datasets.unshift(dataset);
    recordEvent("dataset:publish", `Published ${dataset.title}`, `Dataset #${dataset.id} by ${shortAddress(owner)}`);
    persist();
    return dataset.id;
  },
  updateDataset(owner, datasetId, input, active) {
    const dataset = getDataset(datasetId);
    if (dataset.owner !== owner) throw new Error("Only the dataset owner can update this listing.");
    if (input.price < 0) throw new Error("Price must be zero or greater.");
    Object.assign(dataset, input, { active, updatedLedger: nextLedger() });
    recordEvent("dataset:update", `Updated ${dataset.title}`, active ? "Listing is active" : "Listing is inactive");
    persist();
  },
  hasAccess(datasetId, user) {
    const dataset = getDataset(datasetId);
    return dataset.owner === user || state.grants.some((grant) => grant.datasetId === datasetId && grant.grantee === user);
  },
  grantAccess(owner, datasetId, grantee) {
    const dataset = getDataset(datasetId);
    if (dataset.owner !== owner) throw new Error("Only the dataset owner can grant access.");
    return writeGrant(datasetId, grantee, owner, 0, `Granted ${dataset.title}`, `${shortAddress(grantee)} received owner-granted access`);
  },
  purchaseAccess(buyer, datasetId, paidAmount) {
    const dataset = getDataset(datasetId);
    if (!dataset.active) throw new Error("Inactive datasets cannot be purchased.");
    if (paidAmount < dataset.price) throw new Error(`Payment must be at least ${dataset.price}.`);
    return writeGrant(datasetId, buyer, dataset.owner, paidAmount, `Purchased ${dataset.title}`, `${shortAddress(buyer)} paid ${paidAmount}`);
  },
  revokeAccess(owner, datasetId, grantee) {
    const dataset = getDataset(datasetId);
    if (dataset.owner !== owner) throw new Error("Only the dataset owner can revoke access.");
    state.grants = state.grants.filter((grant) => !(grant.datasetId === datasetId && grant.grantee === grantee));
    recordEvent("access:revoke", `Revoked ${dataset.title}`, `${shortAddress(grantee)} no longer has access`);
    persist();
  },
};

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(seedState);
  try {
    const parsed = { ...structuredClone(seedState), ...JSON.parse(raw) };
    if (!Array.isArray(parsed.datasets) || parsed.datasets.length === 0) return structuredClone(seedState);
    return parsed;
  } catch {
    return structuredClone(seedState);
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getDataset(datasetId) {
  const dataset = state.datasets.find((item) => item.id === Number(datasetId));
  if (!dataset) throw new Error("Dataset not found.");
  return dataset;
}

function nextLedger() {
  return Math.max(...state.datasets.map((dataset) => dataset.updatedLedger), 488000) + Math.floor(Math.random() * 24) + 1;
}

function writeGrant(datasetId, grantee, grantedBy, paidAmount, title, detail) {
  state.grants = state.grants.filter((grant) => !(grant.datasetId === datasetId && grant.grantee === grantee));
  const grant = { datasetId, grantee, grantedBy, paidAmount, grantedLedger: nextLedger() };
  state.grants.unshift(grant);
  recordEvent("access:grant", title, detail);
  persist();
  return grant;
}

function recordEvent(kind, title, detail) {
  state.events.unshift({ kind, title, detail, createdAt: new Date().toISOString() });
  state.events = state.events.slice(0, 8);
}

function render() {
  renderWallet();
  renderMetrics();
  renderFilters();
  renderDatasets();
  renderAccessOptions();
  renderActivity();
}

function renderWallet() {
  els.walletAddress.textContent = state.walletAddress ? shortAddress(state.walletAddress) : "No wallet connected";
  els.connectWallet.textContent = state.walletAddress ? "Switch" : "Connect";
}

function renderMetrics() {
  els.metrics.total.textContent = state.datasets.length;
  els.metrics.active.textContent = state.datasets.filter((dataset) => dataset.active).length;
  els.metrics.access.textContent = state.grants.length;
  els.metrics.volume.textContent = state.grants.reduce((sum, grant) => sum + Number(grant.paidAmount), 0);
}

function renderFilters() {
  const current = els.dataFilter.value || "all";
  const types = [...new Set(state.datasets.map((dataset) => dataset.dataType))].sort();
  els.dataFilter.replaceChildren(new Option("All data types", "all"), ...types.map((type) => new Option(type, type)));
  els.dataFilter.value = types.includes(current) ? current : "all";
}

function renderDatasets() {
  const query = els.search.value.trim().toLowerCase();
  const type = els.dataFilter.value;
  const datasets = provider.listDatasets().filter((dataset) => {
    const matchesType = type === "all" || dataset.dataType === type;
    const searchable = [dataset.title, dataset.description, dataset.dataType, dataset.owner, dataset.metadataUri, dataset.contentHash]
      .join(" ")
      .toLowerCase();
    return matchesType && searchable.includes(query);
  });

  els.datasetGrid.replaceChildren();
  if (!datasets.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No datasets match the current filters.";
    els.datasetGrid.append(empty);
    return;
  }

  datasets.forEach((dataset) => {
    const node = els.datasetTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".data-type").textContent = dataset.dataType;
    const status = node.querySelector(".status");
    status.textContent = dataset.active ? "Active" : "Inactive";
    status.classList.toggle("inactive", !dataset.active);
    node.querySelector("h3").textContent = dataset.title;
    node.querySelector(".description").textContent = dataset.description;
    node.querySelector(".owner").textContent = shortAddress(dataset.owner);
    node.querySelector(".owner").title = dataset.owner;
    node.querySelector(".price").textContent = dataset.price;
    node.querySelector(".metadata-uri").textContent = dataset.metadataUri;
    node.querySelector(".metadata-uri").title = dataset.metadataUri;
    node.querySelector(".content-hash").textContent = dataset.contentHash;
    node.querySelector(".content-hash").title = dataset.contentHash;
    node.querySelector(".edit-action").addEventListener("click", () => editDataset(dataset.id));
    node.querySelector(".access-action").addEventListener("click", () => openAccess(dataset.id));
    els.datasetGrid.append(node);
  });
}

function renderAccessOptions() {
  const selected = els.accessDataset.value;
  els.accessDataset.replaceChildren(...state.datasets.map((dataset) => new Option(`#${dataset.id} · ${dataset.title}`, dataset.id)));
  if (state.datasets.some((dataset) => String(dataset.id) === selected)) els.accessDataset.value = selected;
  if (!els.researcher.value) els.researcher.value = DEMO_RESEARCHER;
  setAccessAction(state.selectedAction);
}

function renderActivity() {
  els.activityList.replaceChildren();
  state.events.forEach((event) => {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    const detail = document.createElement("span");
    title.textContent = event.title;
    detail.textContent = `${event.detail} · ${timeAgo(event.createdAt)}`;
    item.append(title, detail);
    els.activityList.append(item);
  });
}

function switchView(view) {
  const labels = {
    catalog: "Dataset catalog",
    owner: "Owner console",
    access: "Access desk",
  };
  els.title.textContent = labels[view];
  els.navTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  els.views.forEach((section) => section.classList.toggle("active", section.id === `${view}-view`));
}

async function connectWallet() {
  const freighter = window.freighterApi || window.freighter;
  try {
    if (freighter?.isConnected && (await freighter.isConnected())) {
      if (freighter.setAllowed) await freighter.setAllowed();
      const address = freighter.getPublicKey ? await freighter.getPublicKey() : "";
      state.walletAddress = normalizeFreighterAddress(address);
    } else {
      const manual = prompt("Wallet public key", state.walletAddress || DEMO_OWNER);
      if (!manual) return;
      state.walletAddress = manual.trim();
    }
    persist();
    renderWallet();
    toast("Wallet ready.");
  } catch (error) {
    toast(error.message || "Could not connect wallet.");
  }
}

function normalizeFreighterAddress(value) {
  if (typeof value === "string") return value;
  return value?.address || value?.publicKey || "";
}

function currentWallet() {
  if (state.walletAddress) return state.walletAddress;
  state.walletAddress = DEMO_OWNER;
  persist();
  renderWallet();
  toast("Using the demo owner wallet.");
  return state.walletAddress;
}

function editDataset(datasetId) {
  const dataset = getDataset(datasetId);
  els.datasetId.value = dataset.id;
  els.datasetFields.title.value = dataset.title;
  els.datasetFields.dataType.value = dataset.dataType;
  els.datasetFields.description.value = dataset.description;
  els.datasetFields.metadataUri.value = dataset.metadataUri;
  els.datasetFields.contentHash.value = dataset.contentHash;
  els.datasetFields.price.value = dataset.price;
  els.datasetFields.active.checked = dataset.active;
  els.formSubmit.textContent = "Update dataset";
  switchView("owner");
}

function openAccess(datasetId) {
  els.accessDataset.value = String(datasetId);
  switchView("access");
}

function clearForm() {
  els.datasetForm.reset();
  els.datasetId.value = "";
  els.datasetFields.active.checked = true;
  els.formSubmit.textContent = "Publish dataset";
}

function submitDataset(event) {
  event.preventDefault();
  const owner = currentWallet();
  const input = {
    title: els.datasetFields.title.value.trim(),
    description: els.datasetFields.description.value.trim(),
    dataType: els.datasetFields.dataType.value.trim(),
    metadataUri: els.datasetFields.metadataUri.value.trim(),
    contentHash: els.datasetFields.contentHash.value.trim(),
    price: Number(els.datasetFields.price.value),
  };

  try {
    if (els.datasetId.value) {
      provider.updateDataset(owner, Number(els.datasetId.value), input, els.datasetFields.active.checked);
      toast("Dataset updated.");
    } else {
      provider.publishDataset(owner, input);
      toast("Dataset published.");
    }
    clearForm();
    render();
    switchView("catalog");
  } catch (error) {
    toast(error.message);
  }
}

function setAccessAction(action) {
  state.selectedAction = action;
  els.accessButtons.forEach((button) => button.classList.toggle("active", button.dataset.action === action));
}

function runAccessAction(event) {
  event.preventDefault();
  const datasetId = Number(els.accessDataset.value);
  const researcher = els.researcher.value.trim();
  const paidAmount = Number(els.paidAmount.value || 0);
  const actor = currentWallet();

  try {
    if (state.selectedAction === "check") {
      const allowed = provider.hasAccess(datasetId, researcher);
      toast(allowed ? "Researcher has access." : "Researcher does not have access.");
    }
    if (state.selectedAction === "grant") {
      provider.grantAccess(actor, datasetId, researcher);
      toast("Access granted.");
    }
    if (state.selectedAction === "purchase") {
      provider.purchaseAccess(researcher, datasetId, paidAmount);
      toast("Purchase access recorded.");
    }
    if (state.selectedAction === "revoke") {
      provider.revokeAccess(actor, datasetId, researcher);
      toast("Access revoked.");
    }
    render();
  } catch (error) {
    toast(error.message);
  }
}

function shortAddress(address) {
  if (!address || address.length <= 14) return address || "";
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

function timeAgo(value) {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  els.toastRegion.append(node);
  window.setTimeout(() => node.remove(), 3200);
}

function resetDemo() {
  state = structuredClone(seedState);
  persist();
  clearForm();
  render();
  toast("Demo data reset.");
}

els.navTabs.forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
els.connectWallet.addEventListener("click", connectWallet);
els.search.addEventListener("input", renderDatasets);
els.dataFilter.addEventListener("change", renderDatasets);
els.datasetForm.addEventListener("submit", submitDataset);
els.clearForm.addEventListener("click", clearForm);
els.resetDemo.addEventListener("click", resetDemo);
els.accessButtons.forEach((button) => button.addEventListener("click", () => setAccessAction(button.dataset.action)));
els.accessForm.addEventListener("submit", runAccessAction);

render();
