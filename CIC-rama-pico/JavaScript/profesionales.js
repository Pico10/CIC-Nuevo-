// JavaScript/profesionales.js
import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

let profesionales = [];
let profesionalesFiltrados = [];

// ======================= PERMISOS BÁSICOS =========================

function canWrite() {
  // Nuevo esquema
  const role = sessionStorage.getItem("cicRole")
    || sessionStorage.getItem("userRole")
    || "";

  // Solo estos roles pueden modificar datos
  return role === "admin" || role === "operador" || role === "profesional";
}

// ======================= RENDER STATS =========================

function renderStats() {
  const total = profesionales.length;
  const activos = profesionales.filter((p) => p.activo).length;

  const totalCasosActivos = profesionales.reduce(
    (acc, p) => acc + (p.casosActivos || 0),
    0
  );
  const totalCasosResueltos = profesionales.reduce(
    (acc, p) => acc + (p.casosResueltos || 0),
    0
  );

  const totalEl = $("totalProfesionales");
  const activosEl = $("profesionalesActivos");
  const casosAsigEl = $("casosAsignados");
  const casosResEl = $("casosResueltos");

  if (totalEl) totalEl.textContent = total;
  if (activosEl) activosEl.textContent = activos;
  if (casosAsigEl) casosAsigEl.textContent = totalCasosActivos;
  if (casosResEl) casosResEl.textContent = totalCasosResueltos;
}

// ======================= RENDER TABLA =========================

function renderTabla() {
  const tbody = $("profesionalesTableBody");
  const resultCount = $("resultCount");

  if (!tbody) return;

  if (!profesionalesFiltrados.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="loading">
          No se encontraron profesionales con los filtros actuales.
        </td>
      </tr>
    `;
    if (resultCount) resultCount.textContent = "0 resultados";
    return;
  }

  const tienePermisoEscritura = canWrite();

  tbody.innerHTML = profesionalesFiltrados
    .map((p) => {
      const nombreCompleto = `${p.nombre || ""} ${p.apellido || ""}`.trim();
      const especialidad = p.especialidad || "—";
      const matricula = p.matricula || "—";
      const email = p.email || "—";
      const telefono = p.telefono || "—";
      const horarios = p.horarios || "—";
      const casosActivos = p.casosActivos ?? 0;
      const casosResueltos = p.casosResueltos ?? 0;
      const estadoTexto = p.activo ? "Activo" : "Inactivo";
      const estadoClase = p.activo ? "estado-activo" : "estado-inactivo";

      // Botón activar/desactivar solo si puede escribir
      const botonEstado = tienePermisoEscritura
        ? `
          <button
            class="btn btn-small"
            data-role-write="true"
            onclick="window.toggleEstadoProfesional('${p.id}')"
          >
            ${p.activo ? "Desactivar" : "Activar"}
          </button>
        `
        : "—";

      return `
        <tr>
          <td>${nombreCompleto}</td>
          <td>${especialidad}</td>
          <td>${matricula}</td>
          <td>${email}</td>
          <td>${telefono}</td>
          <td>${horarios}</td>
          <td style="text-align:center;">${casosActivos}</td>
          <td style="text-align:center;">${casosResueltos}</td>
          <td><span class="${estadoClase}">${estadoTexto}</span></td>
          <td>${botonEstado}</td>
        </tr>
      `;
    })
    .join("");

  if (resultCount) {
    resultCount.textContent = `${profesionalesFiltrados.length} resultado${
      profesionalesFiltrados.length !== 1 ? "s" : ""
    }`;
  }
}

// ======================= FILTROS / BÚSQUEDA ===================

function aplicarFiltros() {
  const search = ($("searchInput")?.value || "").toLowerCase().trim();
  const filtroEsp = $("filterEspecialidad")?.value || "";
  const filtroEstado = $("filterEstado")?.value || "";

  profesionalesFiltrados = profesionales.filter((p) => {
    const texto = (
      (p.nombre || "") +
      " " +
      (p.apellido || "") +
      " " +
      (p.especialidad || "") +
      " " +
      (p.matricula || "")
    )
      .toLowerCase()
      .trim();

    if (search && !texto.includes(search)) return false;

    if (filtroEsp && p.especialidad !== filtroEsp) return false;

    if (filtroEstado === "true" && !p.activo) return false;
    if (filtroEstado === "false" && p.activo) return false;

    return true;
  });

  renderStats();
  renderTabla();
}

// ======================= CARGA DESDE FIRESTORE =================

async function fetchProfesionales() {
  const tbody = $("profesionalesTableBody");
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="loading">Cargando profesionales...</td>
      </tr>
    `;
  }

  try {
    const snap = await getDocs(collection(db, "professionals"));
    const lista = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      lista.push({
        id: docSnap.id,
        nombre: data.nombre || "",
        apellido: data.apellido || "",
        especialidad: data.especialidad || "",
        matricula: data.matricula || "",
        email: data.email || "",
        telefono: data.telefono || "",
        horarios: data.horarios || "",
        activo: data.activo ?? true,
        casosActivos: data.casosActivos ?? 0,
        casosResueltos: data.casosResueltos ?? 0,
      });
    });

    console.log("✅ Profesionales cargados desde Firestore:", lista.length);
    profesionales = lista;
    profesionalesFiltrados = [...profesionales];
    aplicarFiltros();
  } catch (err) {
    console.error("Error cargando profesionales:", err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="loading">
            Error al cargar profesionales.
          </td>
        </tr>
      `;
    }
  }
}

async function loadProfesionales() {
  await fetchProfesionales();
}

// ======================= ACCIONES ==============================

async function toggleEstadoProfesional(id) {
  // Seguridad extra por si alguien fuerza el onclick
  if (!canWrite()) {
    alert("No tiene permisos para modificar profesionales.");
    return;
  }

  try {
    const prof = profesionales.find((p) => p.id === id);
    if (!prof) return;

    const nuevoEstado = !prof.activo;
    await updateDoc(doc(db, "professionals", id), {
      activo: nuevoEstado,
    });

    prof.activo = nuevoEstado;
    console.log(
      `Profesional ${prof.nombre} ${prof.apellido} ahora está ${
        nuevoEstado ? "ACTIVO" : "INACTIVO"
      }`
    );
    aplicarFiltros();
  } catch (err) {
    console.error("Error cambiando estado de profesional:", err);
    alert("Error al cambiar el estado del profesional.");
  }
}

// ======================= INICIALIZACIÓN ========================

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = $("searchInput");
  const filterEspecialidad = $("filterEspecialidad");
  const filterEstado = $("filterEstado");

  if (searchInput) {
    searchInput.addEventListener("input", () => aplicarFiltros());
  }
  if (filterEspecialidad) {
    filterEspecialidad.addEventListener("change", () => aplicarFiltros());
  }
  if (filterEstado) {
    filterEstado.addEventListener("change", () => aplicarFiltros());
  }

  // Carga inicial
  loadProfesionales();
});

// Exponer funciones globales para los onclick del HTML
window.loadProfesionales = loadProfesionales;
window.toggleEstadoProfesional = toggleEstadoProfesional;
