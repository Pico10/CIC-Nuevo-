// JavaScript/admin.js
import { db } from "./firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

// ====== STATE ======
let households = [];
let householdsMap = {};
let persons = [];
let professionals = [];
let rows = [];
let filteredRows = [];
let currentPage = 1;
const pageSize = 20;

// ✅ Cache de consultas para el drawer
let consultasCache = null;

// ====== UTILS ======
function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function formatFecha(value) {
  if (!value) return "—";
  if (value.toDate) return value.toDate().toLocaleDateString("es-AR");
  if (typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d)) return d.toLocaleDateString("es-AR");
  }
  return "—";
}

function isTrue(val) {
  return val === true || val === "true" || val === "Si" || val === "Sí" || val === "sí";
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
    persons.push({ id: docSnap.id, ...docSnap.data() });
  });
}

async function fetchProfessionals() {
  professionals = [];
  const snap = await getDocs(collection(db, "professionals"));
  snap.forEach((docSnap) => {
    professionals.push({ id: docSnap.id, ...docSnap.data() });
  });
}

// ✅ Cargar consultas 1 vez (para el panel derecho)
async function fetchConsultasOnce() {
  if (consultasCache) return consultasCache;

  const snap = await getDocs(collection(db, "consultas"));
  const lista = [];

  snap.forEach((docSnap) => {
    const d = docSnap.data();
    const created = d.createdAt || d.fecha || null;

    lista.push({
      id: docSnap.id,
      fecha: created,
      fechaLabel: formatFecha(created),
      personaNombre: d.personaNombre || "",
      personaDni: d.personaDni || "",
      motivo: d.motivo || "",
      tipo: d.tipo || "",
      prioridad: d.prioridad || "",
      estado: d.estado || "pendiente",
      profesionalNombre: d.profesionalNombre || "",
      numeroConsulta: d.numeroConsulta ?? null,
    });
  });

  consultasCache = lista;
  return lista;
}

// ====== BUILD ROWS ======
function buildRows() {
  rows = persons.map((p) => {
    const hh = householdsMap[p.householdId] || {};
    const nombreCompleto = `${p.nombre || ""} ${p.apellido || ""}`.trim();
    const direccion = [hh.calle, hh.numero, hh.barrio, hh.ciudad, hh.provincia]
      .filter(Boolean)
      .join(" ");

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
    const esMenor = (p.flags && p.flags.esMayor === false) || (typeof edad === "number" && edad < 18);

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

  const totalDisabilities = rows.filter((r) => r.tieneDiscapacidad).length;
  const totalBenefits = rows.filter((r) => r.tieneBeneficio).length;
  const totalMinors = rows.filter((r) => r.esMenor).length;

  const avg = totalHouseholds > 0 ? (totalPersons / totalHouseholds).toFixed(1) : "0";

  setText("totalHouseholds", totalHouseholds);
  setText("totalPersons", totalPersons);
  setText("averageHouseholdSize", avg);
  setText("totalDisabilities", totalDisabilities);
  setText("totalBenefits", totalBenefits);
  setText("totalMinors", totalMinors);
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
    const label = [hh.nombreGrupo || "(Sin nombre)", hh.barrio || "", hh.ciudad ? `(${hh.ciudad})` : ""]
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
    tbody.innerHTML = `<tr><td colspan="10" class="loading">No se encontraron resultados con los filtros actuales.</td></tr>`;
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
          <td data-label="Nombre Completo">${r.nombreCompleto || "—"}</td>
          <td data-label="DNI">${r.dni || "—"}</td>
          <td data-label="Edad">${r.edad !== "" ? r.edad : "—"}</td>
          <td data-label="Relación">${r.relacionHogar || "—"}</td>
          <td data-label="Grupo Familiar">${r.grupoFamiliar || "—"}</td>
          <td data-label="Dirección">${r.direccion || "—"}</td>
          <td data-label="Discapacidad">${disLabel}</td>
          <td data-label="Beneficios">${benLabel}</td>
          <td data-label="Fecha Registro">${r.createdAtLabel}</td>
          <td data-label="Acciones">
            <button class="btn btn-small" onclick="window.verPersonaDetalle('${r.personId}')">Ver</button>
          </td>
        </tr>
      `;
    })
    .join("");

  if (resultCount) {
    resultCount.textContent = `${total} resultado${total !== 1 ? "s" : ""} (mostrando ${pageRows.length})`;
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
  for (let p = 1; p <= totalPages; p++) addBtn(String(p), p, false, p === currentPage);
  addBtn("›", currentPage + 1, currentPage === totalPages);
  addBtn("»", totalPages, currentPage === totalPages);
}

// ====== DRAWER ======
function abrirDrawerPersona() {
  const overlay = $("drawerOverlay");
  const drawer = $("personaDrawer");
  if (overlay) overlay.style.display = "block";
  if (drawer) {
    drawer.style.display = "block";
    drawer.setAttribute("aria-hidden", "false");
  }
}

function cerrarDrawerPersona() {
  const overlay = $("drawerOverlay");
  const drawer = $("personaDrawer");
  if (overlay) overlay.style.display = "none";
  if (drawer) {
    drawer.style.display = "none";
    drawer.setAttribute("aria-hidden", "true");
  }
}

function renderDrawerPersona(row, consultasDePersona) {
  const title = $("drawerTitle");
  const info = $("drawerPersonaInfo");
  const list = $("drawerConsultasList");
  const count = $("drawerConsultasCount");

  if (title) title.textContent = row?.nombreCompleto ? `Detalle: ${row.nombreCompleto}` : "Detalle";

  // ✅ botón “Ver en Consultas (filtrado por DNI)”
  const linkConsultas = row?.dni
    ? `<a class="btn btn-primary btn-small" href="consultas.html?dni=${encodeURIComponent(
        row.dni
      )}" style="text-decoration:none;margin-top:10px;display:inline-flex;">Ver en Consultas</a>`
    : "";

  if (info) {
    info.innerHTML = `
      <div class="drawer-kv">
        <b>DNI</b><span>${row.dni || "—"}</span>
        <b>Edad</b><span>${row.edad !== "" ? row.edad : "—"}</span>
        <b>Relación</b><span>${row.relacionHogar || "—"}</span>
        <b>Grupo</b><span>${row.grupoFamiliar || "—"}</span>
        <b>Dirección</b><span>${row.direccion || "—"}</span>
        <b>Registro</b><span>${row.createdAtLabel || "—"}</span>
      </div>
      ${linkConsultas}
    `;
  }

  if (count)
    count.textContent = `${consultasDePersona.length} consulta${
      consultasDePersona.length !== 1 ? "s" : ""
    }`;

  if (list) {
    if (!consultasDePersona.length) {
      list.innerHTML = `<div class="drawer-consulta-item">No hay consultas asociadas a esta persona.</div>`;
      return;
    }

    list.innerHTML = consultasDePersona
      .sort((a, b) => {
        const ad = a.fecha && a.fecha.toDate ? a.fecha.toDate() : a.fecha ? new Date(a.fecha) : null;
        const bd = b.fecha && b.fecha.toDate ? b.fecha.toDate() : b.fecha ? new Date(b.fecha) : null;
        if (ad && bd) return bd - ad;
        if (ad && !bd) return -1;
        if (!ad && bd) return 1;
        return 0;
      })
      .map((c) => {
        const nro = c.numeroConsulta ? `Nº ${c.numeroConsulta}` : "—";
        const prof = c.profesionalNombre || "—";
        const estado = c.estado || "—";
        const tipo = c.tipo || "—";
        const prioridad = c.prioridad ? String(c.prioridad).toUpperCase() : "—";

        return `
          <div class="drawer-consulta-item">
            <b>${c.fechaLabel || "—"}</b> • <span>${nro}</span>
            <small><b>Motivo:</b> ${c.motivo || "—"}</small>
            <small><b>Tipo:</b> ${tipo} | <b>Estado:</b> ${estado} | <b>Prioridad:</b> ${prioridad}</small>
            <small><b>Profesional:</b> ${prof}</small>
          </div>
        `;
      })
      .join("");
  }
}

// ====== ACCIONES ======
async function verPersonaDetalle(personId) {
  const row = rows.find((r) => r.personId === personId);
  if (!row) return;

  abrirDrawerPersona();

  const info = $("drawerPersonaInfo");
  const list = $("drawerConsultasList");
  const count = $("drawerConsultasCount");
  if (info) info.innerHTML = `<div class="loading">Cargando detalle...</div>`;
  if (list) list.innerHTML = `<div class="drawer-consulta-item">Cargando consultas...</div>`;
  if (count) count.textContent = "—";

  try {
    const consultas = await fetchConsultasOnce();
    const dniRow = String(row.dni || "").trim();
    const consultasDePersona = consultas.filter((c) => String(c.personaDni || "").trim() === dniRow);
    renderDrawerPersona(row, consultasDePersona);
  } catch (e) {
    console.error("Error cargando consultas para drawer:", e);
    if (list) list.innerHTML = `<div class="drawer-consulta-item">Error al cargar consultas.</div>`;
  }
}

// ====== INIT ======
async function loadData() {
  const tbody = $("dataTableBody");
  if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="loading">Cargando datos...</td></tr>`;

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
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="loading">Error al cargar datos.</td></tr>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (!$("dataTableBody")) return;

  const searchInput = $("searchInput");
  const filterRelation = $("filterRelation");
  const filterDisability = $("filterDisability");
  const filterHousehold = $("filterHousehold");

  if (searchInput) searchInput.addEventListener("input", aplicarFiltros);
  if (filterRelation) filterRelation.addEventListener("change", aplicarFiltros);
  if (filterDisability) filterDisability.addEventListener("change", aplicarFiltros);
  if (filterHousehold) filterHousehold.addEventListener("change", aplicarFiltros);

  loadData();
});

window.loadData = loadData;
window.verPersonaDetalle = verPersonaDetalle;
window.cerrarDrawerPersona = cerrarDrawerPersona;

// ⚠️ IMPORTANTE:
// NO definimos ni exportamos window.handleLogout acá. Así NO pisamos el handleLogout del admin.html,

