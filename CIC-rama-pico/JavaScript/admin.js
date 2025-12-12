// JavaScript/admin.js
import { db } from "./firebase.js";
import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

// ====== STATE ======
let households = [];          // grupos familiares
let householdsMap = {};       // { householdId: { ... } }
let persons = [];             // personas
let professionals = [];       // profesionales
let rows = [];                // persons + household info
let filteredRows = [];
let currentPage = 1;
const pageSize = 20;

// ====== UTILS ======
function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function formatFecha(value) {
  if (!value) return "—";

  // Firestore Timestamp
  if (value.toDate) {
    const d = value.toDate();
    return d.toLocaleDateString("es-AR");
  }

  // ISO
  if (typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d)) return d.toLocaleDateString("es-AR");
  }

  return "—";
}

function isTrue(val) {
  return (
    val === true ||
    val === "true" ||
    val === "Si" ||
    val === "Sí" ||
    val === "sí"
  );
}

// ====== FIRESTORE LOAD ======
async function fetchHouseholds() {
  households = [];
  householdsMap = {};
  const snap = await getDocs(collection(db, "households"));
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const obj = {
      id: docSnap.id,
      nombreGrupo: data.nombreGrupo || "",
      vivienda: data.vivienda || "",
      calle: data.calle || "",
      numero: data.numero || "",
      barrio: data.barrio || "",
      ciudad: data.ciudad || "",
      provincia: data.provincia || "",
      createdAt: data.createdAt || null,
    };
    households.push(obj);
    householdsMap[obj.id] = obj;
  });
}

async function fetchPersons() {
  persons = [];
  const snap = await getDocs(collection(db, "persons"));
  snap.forEach((docSnap) => {
    const p = docSnap.data();
    persons.push({
      id: docSnap.id,
      ...p,
    });
  });
}

async function fetchProfessionals() {
  professionals = [];
  const snap = await getDocs(collection(db, "professionals"));
  snap.forEach((docSnap) => {
    const p = docSnap.data();
    professionals.push({
      id: docSnap.id,
      ...p,
    });
  });
}

// ====== BUILD ROWS (join persons + households) ======
function buildRows() {
  rows = persons.map((p) => {
    const hh = householdsMap[p.householdId] || {};
    const nombreCompleto = `${p.nombre || ""} ${p.apellido || ""}`.trim();
    const direccion = [
      hh.calle,
      hh.numero,
      hh.barrio,
      hh.ciudad,
      hh.provincia,
    ]
      .filter(Boolean)
      .join(" ");

    // edad ya calculada en formulario, pero si no está la recalculamos
    let edad = p.edad;
    if (!edad && p.fechaNacimiento) {
      const fn = new Date(p.fechaNacimiento);
      const h = new Date();
      let e = h.getFullYear() - fn.getFullYear();
      const m = h.getMonth() - fn.getMonth();
      if (m < 0 || (m === 0 && h.getDate() < fn.getDate())) e--;
      edad = e;
    }

    const tieneDis = isTrue(p.tieneDiscapacidad);
    const tieneBen = isTrue(p.tieneBeneficio);
    const esMenor =
      (p.flags && p.flags.esMayor === false) ||
      (typeof edad === "number" && edad < 18);

    const createdAt = p.createdAt || null;

    return {
      personId: p.personId || p.id,
      nombreCompleto,
      dni: p.dni || "",
      edad: typeof edad === "number" ? edad : "",
      relacionHogar: p.relacionHogar || "",
      grupoFamiliar: hh.nombreGrupo || "",
      householdId: p.householdId || "",
      direccion,
      tieneDiscapacidad: tieneDis,
      tieneBeneficio: tieneBen,
      esMenor,
      createdAt,
      createdAtLabel: formatFecha(createdAt),
      searchText: (
        nombreCompleto +
        " " +
        (p.dni || "") +
        " " +
        direccion +
        " " +
        (p.relacionHogar || "") +
        " " +
        (hh.nombreGrupo || "")
      )
        .toLowerCase()
        .trim(),
    };
  });
}

// ====== STATS ======
function renderStats() {
  const totalHouseholds = households.length;
  const totalPersons = rows.length;
  const totalProfessionals = professionals.length;

  const totalDisabilities = rows.filter((r) => r.tieneDiscapacidad).length;
  const totalBenefits = rows.filter((r) => r.tieneBeneficio).length;
  const totalMinors = rows.filter((r) => r.esMenor).length;

  const avg =
    totalHouseholds > 0
      ? (totalPersons / totalHouseholds).toFixed(1)
      : "0";

  setText("totalHouseholds", totalHouseholds);
  setText("totalPersons", totalPersons);
  setText("averageHouseholdSize", avg);
  setText("totalDisabilities", totalDisabilities);
  setText("totalBenefits", totalBenefits);
  setText("totalMinors", totalMinors);
  setText("totalProfessionals", totalProfessionals); // si existe en el HTML
}

// ====== FILTERS ======
function buildHouseholdFilterOptions() {
  const sel = $("filterHousehold");
  if (!sel) return;

  sel.innerHTML = `<option value="">Todas las familias</option>`;

  const lista = [...households].sort((a, b) =>
    (a.nombreGrupo || "").localeCompare(b.nombreGrupo || "")
  );

  lista.forEach((hh) => {
    const label = [
      hh.nombreGrupo || "(Sin nombre)",
      hh.barrio || "",
      hh.ciudad ? `(${hh.ciudad})` : "",
    ]
      .filter(Boolean)
      .join(" ");

    const opt = document.createElement("option");
    opt.value = hh.id;
    opt.textContent = label;
    sel.appendChild(opt);
  });
}

function aplicarFiltros() {
  const search = ($("searchInput")?.value || "").toLowerCase().trim();
  const filtroRel = $("filterRelation")?.value || "";
  const filtroDis = $("filterDisability")?.value || "";
  const filtroHouse = $("filterHousehold")?.value || "";

  filteredRows = rows.filter((r) => {
    if (search && !r.searchText.includes(search)) return false;

    if (filtroRel && r.relacionHogar !== filtroRel) return false;

    if (filtroDis === "true" && !r.tieneDiscapacidad) return false;
    if (filtroDis === "false" && r.tieneDiscapacidad) return false;

    if (filtroHouse && r.householdId !== filtroHouse) return false;

    return true;
  });

  currentPage = 1;
  renderTable();
}

// ====== TABLE + PAGINATION ======
function renderTable() {
  const tbody = $("dataTableBody");
  const resultCount = $("resultCount");
  const pagination = $("pagination");

  if (!tbody) return;

  if (!filteredRows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="loading">No se encontraron resultados con los filtros actuales.</td>
      </tr>
    `;
    if (resultCount) resultCount.textContent = "0 resultados";
    if (pagination) pagination.style.display = "none";
    return;
  }

  const total = filteredRows.length;
  const totalPages = Math.ceil(total / pageSize);
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pageRows = filteredRows.slice(start, end);

  tbody.innerHTML = pageRows
    .map((r) => {
      const disLabel = r.tieneDiscapacidad ? "Sí" : "No";
      const benLabel = r.tieneBeneficio ? "Sí" : "No";

      return `
        <tr>
          <td>${r.nombreCompleto || "—"}</td>
          <td>${r.dni || "—"}</td>
          <td>${r.edad !== "" ? r.edad : "—"}</td>
          <td>${r.relacionHogar || "—"}</td>
          <td>${r.grupoFamiliar || "—"}</td>
          <td>${r.direccion || "—"}</td>
          <td>${disLabel}</td>
          <td>${benLabel}</td>
          <td>${r.createdAtLabel}</td>
          <td>
            <button class="btn btn-small" onclick="window.verPersonaDetalle('${r.personId}')">
              Ver
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  if (resultCount) {
    resultCount.textContent = `${total} resultado${
      total !== 1 ? "s" : ""
    } (mostrando ${pageRows.length})`;
  }

  if (!pagination) return;

  if (totalPages <= 1) {
    pagination.style.display = "none";
    pagination.innerHTML = "";
    return;
  }

  pagination.style.display = "flex";
  pagination.innerHTML = "";

  const addBtn = (label, page, disabled = false, active = false) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.className = "page-btn";
    if (active) btn.classList.add("active");
    if (disabled) {
      btn.disabled = true;
    } else {
      btn.addEventListener("click", () => {
        currentPage = page;
        renderTable();
      });
    }
    pagination.appendChild(btn);
  };

  addBtn("«", 1, currentPage === 1);
  addBtn("‹", currentPage - 1, currentPage === 1);

  for (let p = 1; p <= totalPages; p++) {
    addBtn(String(p), p, false, p === currentPage);
  }

  addBtn("›", currentPage + 1, currentPage === totalPages);
  addBtn("»", totalPages, currentPage === totalPages);
}

// ====== CARGA GLOBAL ======
async function loadData() {
  const tbody = $("dataTableBody");
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="loading">Cargando datos...</td>
      </tr>
    `;
  }

  try {
    await fetchHouseholds();
    await fetchPersons();
    await fetchProfessionals();
    buildRows();
    renderStats();
    buildHouseholdFilterOptions();
    aplicarFiltros();
  } catch (err) {
    console.error("Error cargando datos admin:", err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="loading">Error al cargar datos.</td>
        </tr>
      `;
    }
  }
}

// ====== ACCIONES GLOBALES ======
function verPersonaDetalle(personId) {
  console.log("Ver detalle de persona:", personId);
  alert("En esta etapa de test, solo mostramos el ID: " + personId);
}

function handleLogout() {
  try {
    sessionStorage.clear();
  } catch (e) {
    console.warn("No se pudo limpiar sessionStorage:", e);
  }
  // Igual que en el resto de las páginas protegidas
  window.location.href = "admin-login.html";
}

// ====== INIT ======
document.addEventListener("DOMContentLoaded", () => {
  // El control de permisos y ocultar el link de Gestión de Usuarios
  // ahora lo maneja permissions.js (initPagePermissions("admin-panel"))
  if (!$("dataTableBody")) return;

  const searchInput = $("searchInput");
  const filterRelation = $("filterRelation");
  const filterDisability = $("filterDisability");
  const filterHousehold = $("filterHousehold");

  if (searchInput) {
    searchInput.addEventListener("input", aplicarFiltros);
  }
  if (filterRelation) {
    filterRelation.addEventListener("change", aplicarFiltros);
  }
  if (filterDisability) {
    filterDisability.addEventListener("change", aplicarFiltros);
  }
  if (filterHousehold) {
    filterHousehold.addEventListener("change", aplicarFiltros);
  }

  loadData();
});

// Exponer para HTML
window.loadData = loadData;
window.verPersonaDetalle = verPersonaDetalle;
window.handleLogout = handleLogout;
