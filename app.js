const starterPokemon = [
  { id: 1, name: "Charizard", dex: 6, game: "FireRed", level: 78, nickname: "Blaze", nature: "Adamant", shiny: true, notes: "Caught after a long reset hunt." },
  { id: 2, name: "Lucario", dex: 448, game: "Platinum", level: 65, nickname: "", nature: "Jolly", shiny: false, notes: "Part of my main story team." },
  { id: 3, name: "Gengar", dex: 94, game: "FireRed", level: 54, nickname: "Shade", nature: "Timid", shiny: true, notes: "Traded to complete the evolution." }
];

const storageKey = "pokemon-collection-tracker-v1";
const gameKey = game => String(game ?? "").replace(/\s+/g, "").toLocaleLowerCase();
let collection = loadCollection();
let pendingDeleteId = null;

const cardGrid = document.querySelector("#cardGrid");
const emptyState = document.querySelector("#emptyState");
const searchInput = document.querySelector("#searchInput");
const shinyFilter = document.querySelector("#shinyFilter");
const sortSelect = document.querySelector("#sortSelect");
const gameFilter = document.querySelector("#gameFilter");
const pokemonDialog = document.querySelector("#pokemonDialog");
const deleteDialog = document.querySelector("#deleteDialog");
const form = document.querySelector("#pokemonForm");
const toast = document.querySelector("#toast");

function loadCollection() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return Array.isArray(saved) ? saved : starterPokemon;
  } catch {
    return starterPokemon;
  }
}

function saveCollection() {
  localStorage.setItem(storageKey, JSON.stringify(collection));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function gameNames() {
  const games = new Map(starterPokemon.map(pokemon => [gameKey(pokemon.game), pokemon.game]));
  collection.forEach(pokemon => {
    const name = String(pokemon.game ?? "").trim().replace(/\s+/g, " ");
    if (name && !games.has(gameKey(name))) games.set(gameKey(name), name);
  });
  return games;
}

function updateGameOptions() {
  const selectedGame = gameFilter.value;
  const names = gameNames();
  const games = [...new Set(collection.map(pokemon => gameKey(pokemon.game)).filter(Boolean))]
    .map(key => names.get(key)).sort((a, b) => a.localeCompare(b));
  gameFilter.innerHTML = '<option value="">All games</option>' + games
    .map(game => `<option value="${escapeHtml(gameKey(game))}">${escapeHtml(game)}</option>`)
    .join("");
  if (games.some(game => gameKey(game) === selectedGame)) gameFilter.value = selectedGame;
}

function updateInsights() {
  const levels = collection.map(pokemon => Number(pokemon.level) || 0);
  const names = gameNames();
  const gameTotals = collection.reduce((totals, pokemon) => {
    const game = gameKey(pokemon.game);
    totals.set(game, (totals.get(game) || 0) + 1);
    return totals;
  }, new Map());
  const topKey = [...gameTotals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  const topGame = topKey ? names.get(topKey) || "Not listed" : "None";
  const average = levels.length ? Math.round(levels.reduce((sum, level) => sum + level, 0) / levels.length) : 0;

  document.querySelector("#averageLevel").textContent = average;
  document.querySelector("#highestLevel").textContent = levels.length ? Math.max(...levels) : 0;
  document.querySelector("#topGame").textContent = topGame;
}

function render() {
  updateGameOptions();
  const query = searchInput.value.trim().toLowerCase();
  const shinyOnly = shinyFilter.checked;
  const selectedGame = gameFilter.value;
  const results = collection.filter(pokemon => {
    const text = `${pokemon.name} ${pokemon.nickname}`.toLowerCase();
    const matchesGame = !selectedGame || gameKey(pokemon.game) === selectedGame;
    return text.includes(query) && matchesGame && (!shinyOnly || pokemon.shiny);
  });

  if (sortSelect.value === "name") results.sort((a, b) => a.name.localeCompare(b.name));
  if (sortSelect.value === "level-high") results.sort((a, b) => b.level - a.level);
  if (sortSelect.value === "dex") results.sort((a, b) => a.dex - b.dex);

  document.querySelector("#totalCount").textContent = collection.length;
  document.querySelector("#shinyCount").textContent = collection.filter(p => p.shiny).length;
  document.querySelector("#gameCount").textContent = new Set(collection.map(p => gameKey(p.game)).filter(Boolean)).size;
  document.querySelector("#exportButton").disabled = collection.length === 0;
  updateInsights();
  document.querySelector("#resultMessage").textContent = `${results.length} ${results.length === 1 ? "entry" : "entries"} shown`;

  cardGrid.innerHTML = results.map(pokemon => `
    <article class="pokemon-card">
      <div class="card-top">
        <div><h2>${escapeHtml(pokemon.name)}</h2><span class="dex-number">#${String(pokemon.dex).padStart(3, "0")}</span></div>
        ${pokemon.shiny ? '<span class="shiny-badge">★ SHINY</span>' : ""}
      </div>
      <dl class="detail-list">
        <div><dt>Game</dt><dd>${escapeHtml(pokemon.game)}</dd></div>
        <div><dt>Level</dt><dd>${pokemon.level}</dd></div>
        <div><dt>Nickname</dt><dd>${escapeHtml(pokemon.nickname || "None")}</dd></div>
        <div><dt>Nature</dt><dd>${escapeHtml(pokemon.nature || "Not listed")}</dd></div>
      </dl>
      ${pokemon.notes ? `<p class="card-note">${escapeHtml(pokemon.notes)}</p>` : ""}
      <div class="card-actions">
        <button class="edit-button" data-action="edit" data-id="${pokemon.id}" type="button">Edit</button>
        <button class="delete-button" data-action="delete" data-id="${pokemon.id}" type="button">Delete</button>
      </div>
    </article>`).join("");

  cardGrid.hidden = results.length === 0;
  emptyState.hidden = results.length !== 0;
}

function openForm(pokemon = null) {
  form.reset();
  document.querySelector("#formError").textContent = "";
  document.querySelector("#pokemonId").value = pokemon?.id ?? "";
  document.querySelector("#pokemonName").value = pokemon?.name ?? "";
  document.querySelector("#pokedexNumber").value = pokemon?.dex ?? "";
  document.querySelector("#game").value = pokemon?.game ?? "";
  document.querySelector("#level").value = pokemon?.level ?? "";
  document.querySelector("#nickname").value = pokemon?.nickname ?? "";
  document.querySelector("#nature").value = pokemon?.nature ?? "";
  document.querySelector("#notes").value = pokemon?.notes ?? "";
  document.querySelector("#isShiny").checked = pokemon?.shiny ?? false;
  document.querySelector("#formEyebrow").textContent = pokemon ? "EDIT ENTRY" : "NEW ENTRY";
  document.querySelector("#formTitle").textContent = pokemon ? `Edit ${pokemon.name}` : "Add Pokémon";
  pokemonDialog.showModal();
  document.querySelector("#pokemonName").focus();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}

function exportCollection() {
  const columns = ["Name", "Pokedex number", "Game", "Level", "Nickname", "Nature", "Shiny", "Notes"];
  const rows = collection.map(pokemon => [pokemon.name, pokemon.dex, pokemon.game, pokemon.level,
    pokemon.nickname, pokemon.nature, pokemon.shiny ? "Yes" : "No", pokemon.notes]);
  const csv = "\uFEFF" + [columns, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "pokemon-collection.csv";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Collection exported");
}

document.querySelectorAll("#openAddButton, #openAddButtonTop, #emptyAddButton").forEach(button => button.addEventListener("click", () => openForm()));
document.querySelector("#closeDialogButton").addEventListener("click", () => pokemonDialog.close());
document.querySelector("#cancelButton").addEventListener("click", () => pokemonDialog.close());
document.querySelector("#cancelDeleteButton").addEventListener("click", () => deleteDialog.close());
searchInput.addEventListener("input", render);
shinyFilter.addEventListener("change", render);
sortSelect.addEventListener("change", render);
gameFilter.addEventListener("change", render);
document.querySelector("#exportButton").addEventListener("click", exportCollection);
document.querySelector("#resetFiltersButton").addEventListener("click", () => {
  searchInput.value = "";
  shinyFilter.checked = false;
  sortSelect.value = "added";
  gameFilter.value = "";
  render();
  searchInput.focus();
});

cardGrid.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = Number(button.dataset.id);
  const pokemon = collection.find(item => item.id === id);
  if (!pokemon) return;
  if (button.dataset.action === "edit") openForm(pokemon);
  if (button.dataset.action === "delete") {
    pendingDeleteId = id;
    document.querySelector("#deleteMessage").textContent = `${pokemon.name} will be removed from your collection.`;
    deleteDialog.showModal();
  }
});

form.addEventListener("submit", event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const id = Number(document.querySelector("#pokemonId").value);
  const level = Number(document.querySelector("#level").value);
  if (level < 1 || level > 100) {
    document.querySelector("#formError").textContent = "Level must be between 1 and 100.";
    return;
  }
  const entry = {
    id: id || Date.now(),
    name: document.querySelector("#pokemonName").value.trim(),
    dex: Number(document.querySelector("#pokedexNumber").value),
    game: gameNames().get(gameKey(document.querySelector("#game").value)) || document.querySelector("#game").value.trim().replace(/\s+/g, " "),
    level,
    nickname: document.querySelector("#nickname").value.trim(),
    nature: document.querySelector("#nature").value.trim(),
    shiny: document.querySelector("#isShiny").checked,
    notes: document.querySelector("#notes").value.trim()
  };
  if (id) collection = collection.map(item => item.id === id ? entry : item);
  else collection = [entry, ...collection];
  saveCollection();
  pokemonDialog.close();
  render();
  showToast(id ? "Pokémon updated" : "Pokémon added");
});

document.querySelector("#confirmDeleteButton").addEventListener("click", () => {
  collection = collection.filter(item => item.id !== pendingDeleteId);
  pendingDeleteId = null;
  saveCollection();
  deleteDialog.close();
  render();
  showToast("Pokémon deleted");
});

render();
