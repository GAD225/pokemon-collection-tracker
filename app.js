const starterPokemon = [
  { id: 1, name: "Charizard", dex: 6, game: "FireRed", level: 78, nickname: "Blaze", nature: "Adamant", shiny: true, notes: "Caught after a long reset hunt." },
  { id: 2, name: "Lucario", dex: 448, game: "Platinum", level: 65, nickname: "", nature: "Jolly", shiny: false, notes: "Part of my main story team." },
  { id: 3, name: "Gengar", dex: 94, game: "FireRed", level: 54, nickname: "Shade", nature: "Timid", shiny: true, notes: "Traded to complete the evolution." }
];

const storageKey = "pokemon-collection-tracker-v1";
const gameKey = game => String(game ?? "").replace(/\s+/g, "").toLocaleLowerCase();
const db = window.supabase?.createClient(
  "https://bkfuovzhapmbmiwvuckt.supabase.co",
  "sb_publishable_c3DwRJ2z0OfcucMg8B60pg_O9CFYmJ0"
);
let recovering = false;
let authBusy = false;
let collection = [];
let currentUser = null;
let ready = false;
let busy = false;
let loadGeneration = 0;
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

function fromRow(row) {
  return { ...row, dex: row.pokedex_number };
}
function toRow(entry) {
  return { name: entry.name, pokedex_number: entry.dex, game: entry.game,
    level: entry.level, nickname: entry.nickname, nature: entry.nature,
    shiny: entry.shiny, notes: entry.notes };
}
function setError(message) {
  document.querySelector("#accountError").textContent = message;
}
async function refreshCollection(user) {
  const generation = ++loadGeneration;
  currentUser = user;
  ready = false;
  collection = [];
  pokemonDialog.close(); deleteDialog.close();
  render();
  document.querySelector("#authForm").hidden = !!user || recovering;
  document.querySelector("#recoveryActions").hidden = !!user || recovering;
  document.querySelector("#recoveryForm").hidden = !recovering;
  document.querySelector("#accountActions").hidden = !user;
  document.querySelector("#importButton").hidden = true;
  document.querySelector("#accountStatus").textContent = user
    ? "Loading your collection..." : "Sign in or create an account to access your saved Pokémon.";
  if (!user) return;
  const { data, error } = await db.from("pokemon").select("*").order("created_at", { ascending: false });
  if (generation !== loadGeneration) return;
  if (error) { setError("Could not load your collection. Check your connection and refresh to try again."); return; }
  collection = data.map(fromRow);
  ready = true;
  document.querySelector("#accountStatus").textContent = `Signed in as ${user.email}. Collection saved online.`;
  document.querySelector("#importButton").hidden = collection.length !== 0 || loadCollection().length === 0;
  if (!recovering) setError(""); render();
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
  document.querySelectorAll("#openAddButton, #openAddButtonTop, #emptyAddButton").forEach(button => button.disabled = !ready || busy);

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
  if (!ready || busy) return;
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
  if (!button || !ready || busy) return;
  const id = button.dataset.id;
  const pokemon = collection.find(item => item.id === id);
  if (!pokemon) return;
  if (button.dataset.action === "edit") openForm(pokemon);
  if (button.dataset.action === "delete") {
    pendingDeleteId = id;
    document.querySelector("#deleteMessage").textContent = `${pokemon.name} will be removed from your collection.`;
    deleteDialog.showModal();
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!ready || busy || !form.reportValidity()) return;
  const id = document.querySelector("#pokemonId").value;
  const level = Number(document.querySelector("#level").value);
  if (level < 1 || level > 100) {
    document.querySelector("#formError").textContent = "Level must be between 1 and 100.";
    return;
  }
  const entry = {
    id,
    name: document.querySelector("#pokemonName").value.trim(),
    dex: Number(document.querySelector("#pokedexNumber").value),
    game: gameNames().get(gameKey(document.querySelector("#game").value)) || document.querySelector("#game").value.trim().replace(/\s+/g, " "),
    level,
    nickname: document.querySelector("#nickname").value.trim(),
    nature: document.querySelector("#nature").value.trim(),
    shiny: document.querySelector("#isShiny").checked,
    notes: document.querySelector("#notes").value.trim()
  };
  if (!entry.name || !entry.game) {
    document.querySelector("#formError").textContent = "Name and game cannot be blank.";
    return;
  }
  busy = true; render();
  const saveButton = form.querySelector('[type="submit"]');
  saveButton.disabled = true;
  try {
    const result = id
      ? await db.from("pokemon").update(toRow(entry)).eq("id", id).select().single()
      : await db.from("pokemon").insert(toRow(entry)).select().single();
    if (result.error) throw result.error;
    const saved = fromRow(result.data);
    collection = id ? collection.map(item => item.id === id ? saved : item) : [saved, ...collection];
    pokemonDialog.close();
    showToast(id ? "Pokémon updated online" : "Pokémon saved online");
  } catch (error) { document.querySelector("#formError").textContent = error.message; }
  finally { busy = false; saveButton.disabled = false; render(); }
});

document.querySelector("#confirmDeleteButton").addEventListener("click", async () => {
  if (!ready || busy || !pendingDeleteId) return;
  busy = true; render();
  const button = document.querySelector("#confirmDeleteButton"); button.disabled = true;
  try {
    const { data, error } = await db.from("pokemon").delete().eq("id", pendingDeleteId).select("id").single();
    if (error) throw error;
    collection = collection.filter(item => item.id !== data.id);
    pendingDeleteId = null; deleteDialog.close(); showToast("Pokémon deleted online");
  } catch (error) { document.querySelector("#deleteMessage").textContent = error.message; }
  finally { busy = false; button.disabled = false; render(); }
});

async function authenticate(signup) {
  const authForm = document.querySelector("#authForm");
  if (busy || authBusy || !db || !authForm.reportValidity()) return;
  authBusy = true;
  busy = true;
  authForm.querySelectorAll("button").forEach(b => b.disabled = true);
  setError("");
  try {
    const credentials = { email: document.querySelector("#authEmail").value.trim(), password: document.querySelector("#authPassword").value };
    const { data, error } = signup ? await db.auth.signUp(credentials) : await db.auth.signInWithPassword(credentials);
    if (error) throw error;
    document.querySelector("#authPassword").value = "";
    if (signup && !data.session) document.querySelector("#accountStatus").textContent = "Check your email to confirm your account, then return here and sign in.";
  } catch (error) { setError(accountError(error)); }
  finally { authBusy = false; busy = false; authForm.querySelectorAll("button").forEach(b => b.disabled = false); render(); }
}
document.querySelector("#authForm").addEventListener("submit", e => { e.preventDefault(); authenticate(false); });
document.querySelector("#signupButton").addEventListener("click", () => authenticate(true));
document.querySelector("#signoutButton").addEventListener("click", async () => {
  if (busy) return;
  const { error } = await db.auth.signOut();
  if (error) setError(error.message);
});
document.querySelector("#importButton").addEventListener("click", async () => {
  if (!ready || busy || collection.length) return;
  busy = true; const button = document.querySelector("#importButton"); button.disabled = true;
  try {
    const entries = loadCollection().map(toRow);
    const { data, error } = await db.from("pokemon").insert(entries).select();
    if (error) throw error;
    collection = data.map(fromRow); button.hidden = true; showToast("Collection imported online");
  } catch (error) { setError(error.message); }
  finally { busy = false; button.disabled = false; render(); }
});

function accountError(error) {
  const code = error?.code || "";
  const message = error?.message || "";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) return "Email or password is incorrect. Try again or use Forgot password.";
  if (code === "email_not_confirmed") return "Confirm your email using the newest confirmation email, then sign in.";
  if (/rate_limit|too_many/i.test(code) || error?.status === 429) return "Too many requests. Wait a few minutes before trying again.";
  if (code === "same_password") return "Choose a password different from your current password.";
  if (code === "weak_password") return "Choose a stronger password with at least 8 characters.";
  if (/session|token|otp_expired/i.test(code)) return "This account link has expired or your session ended. Request a new reset email.";
  if (/fetch|network/i.test(message)) return "Could not connect. Check your internet connection and try again.";
  return "The account request could not be completed. Please try again.";
}

document.querySelector("#resetPasswordButton").addEventListener("click", async () => {
  if (authBusy || busy || !db) return;
  const emailInput = document.querySelector("#authEmail");
  if (!emailInput.reportValidity()) return;
  authBusy = true;
  const button = document.querySelector("#resetPasswordButton");
  button.disabled = true;
  setError("");
  try {
    // Supabase uses the project's configured Site URL for the email redirect.
    const { error } = await db.auth.resetPasswordForEmail(emailInput.value.trim());
    if (error) throw error;
    document.querySelector("#accountStatus").textContent = "If an account exists for this email, a reset link has been sent. Check your inbox and spam folder; use the newest link.";
  } catch (error) { setError(accountError(error)); }
  finally { authBusy = false; button.disabled = false; }
});

document.querySelector("#recoveryForm").addEventListener("submit", async event => {
  event.preventDefault();
  const recoveryForm = document.querySelector("#recoveryForm");
  if (authBusy || busy || !db || !recovering || !currentUser || !recoveryForm.reportValidity()) return;
  const password = document.querySelector("#newPassword").value;
  if (password !== document.querySelector("#confirmPassword").value) {
    setError("The new passwords do not match."); return;
  }
  authBusy = true;
  const button = recoveryForm.querySelector('[type="submit"]');
  button.disabled = true;
  setError("");
  try {
    const { error } = await db.auth.updateUser({ password });
    if (error) throw error;
    recovering = false;
    recoveryForm.reset();
    recoveryForm.hidden = true;
    document.querySelector("#accountStatus").textContent = "Password updated successfully. You can use your new password the next time you sign in.";
    showToast("Password updated successfully");
  } catch (error) { setError(accountError(error)); }
  finally { authBusy = false; button.disabled = false; }
});

// Display actionable callback errors without leaving the failed link in the address bar.
const callbackParams = new URLSearchParams(window.location?.hash?.slice(1) || "");
const callbackError = callbackParams.has("error");
if (callbackError) {
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  setError("This email link is invalid or expired. Use the newest email, or request a new password reset link.");
}

render();
if (!db) setError("Could not load the database connection. Refresh the page and check your connection.");
else {
  db.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") recovering = true;
    if (event === "SIGNED_OUT") recovering = false;
    if (["INITIAL_SESSION", "SIGNED_IN", "SIGNED_OUT", "PASSWORD_RECOVERY"].includes(event)) {
      window.setTimeout(async () => {
        try {
          await refreshCollection(session?.user ?? null);
          if (recovering) document.querySelector("#accountStatus").textContent = "Choose a new password below (at least 8 characters).";
          if (callbackError) setError("This email link is invalid or expired. Use the newest email, or request a new password reset link.");
        } catch (error) { setError(accountError(error)); }
      }, 0);
    }
  });
}
