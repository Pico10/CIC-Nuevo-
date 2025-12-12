// JavaScript/consultas.js
import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

let consultas = [];
let consultasFiltradas = [];
let consultaSeleccionada = null;

/* ===================== HELPERS ===================== */

function formatFecha(value) {
  if (!value) return "—";

  if (value.toDate) {
    const d = value.toDate();
    return d.toLocaleDateString("es-AR");
  }

  if (typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d)) return d.toLocaleDateString("es-AR");
  }

  return "—";
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

/* ===================== LOAD FIRESTORE ===================== */

async function fetchConsultas() {
  consultas = [];
  const tbody = $("consultasTableBody");
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="loading">Cargando consultas...</td>
      </tr>
    `;
  }

  try {
    const snap = await getDocs(collection(db, "consultas"));
    const lista = [];

    snap.forEach((docSnap) => {
      const d = docSnap.data();

      const created = d.createdAt || d.fecha || null;

      const obj = {
        id: docSnap.id,
        numeroConsulta: d.numeroConsulta ?? null,
        fecha: created,
        fechaLabel: formatFecha(created),
        personaNombre: d.personaNombre || "",
        personaDni: d.personaDni || "",
        motivo: d.motivo || "",
        tipo: d.tipo || "",
        prioridad: d.prioridad || "",
        profesionalAsignado: d.profesionalAsignado || "",
        profesionalNombre: d.profesionalNombre || "",
        estado: d.estado || "pendiente",
        historicoEstados: d.historicoEstados || [],
        observaciones: d.observaciones || [],
      };

      obj.searchText = (
        obj.personaNombre +
        " " +
        (obj.personaDni || "") +
        " " +
        obj.motivo +
        " " +
        obj.profesionalNombre
      )
        .toLowerCase()
        .trim();

      lista.push(obj);
    });

    consultas = lista;
    consultasFiltradas = [...consultas];

    renderStats();
    buildProfesionalFilterOptions();
    aplicarFiltros();
  } catch (err) {
    console.error("Error cargando consultas:", err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="loading">Error al cargar consultas.</td>
        </tr>
      `;
    }
  }
}

/* ===================== STATS ===================== */

function renderStats() {
  const total = consultas.length;
  const pendientes = consultas.filter((c) => c.estado === "pendiente").length;
  const enProceso = consultas.filter((c) => c.estado === "en_proceso").length;
  const resueltas = consultas.filter((c) => c.estado === "resuelto").length;
  const urgentes = consultas.filter((c) => c.prioridad === "urgente").length;
  const derivacion = consultas.filter((c) => c.tipo === "derivacion").length;

  setText("totalConsultas", total);
  setText("consultasPendientes", pendientes);
  setText("consultasEnProceso", enProceso);
  setText("consultasResueltas", resueltas);
  setText("consultasUrgentes", urgentes);
  setText("consultasDerivacion", derivacion);
}

/* ===================== FILTER PROFESIONALES ===================== */

function buildProfesionalFilterOptions() {
  const sel = $("filterProfesional");
  if (!sel) return;

  const selected = sel.value || "";

  sel.innerHTML = `<option value="">Todos los profesionales</option>`;

  const mapa = new Map();
  consultas.forEach((c) => {
    if (c.profesionalAsignado) {
      mapa.set(c.profesionalAsignado, c.profesionalNombre || "Sin nombre");
    }
  });

  Array.from(mapa.entries()).forEach(([id, nombre]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = nombre;
    sel.appendChild(opt);
  });

  if (selected) {
    sel.value = selected;
  }
}

/* ===================== FILTROS ===================== */

function aplicarFiltros() {
  const search = ($("searchInput")?.value || "").toLowerCase().trim();
  const filtroEstado = $("filterEstado")?.value || "";
  const filtroTipo = $("filterTipo")?.value || "";
  const filtroPrioridad = $("filterPrioridad")?.value || "";
  const filtroProfesional = $("filterProfesional")?.value || "";

  consultasFiltradas = consultas.filter((c) => {
    if (search && !c.searchText.includes(search)) return false;

    if (filtroEstado && c.estado !== filtroEstado) return false;
    if (filtroTipo && c.tipo !== filtroTipo) return false;
    if (filtroPrioridad && c.prioridad !== filtroPrioridad) return false;
    if (filtroProfesional && c.profesionalAsignado !== filtroProfesional)
      return false;

    return true;
  });

  renderTable();
}

/* ===================== RENDER TABLA ===================== */

function renderTable() {
  const tbody = $("consultasTableBody");
  const resultCount = $("resultCount");

  if (!tbody) return;

  if (!consultasFiltradas.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="loading">No se encontraron consultas con los filtros actuales.</td>
      </tr>
    `;
    if (resultCount) resultCount.textContent = "0 resultados";
    return;
  }

  tbody.innerHTML = consultasFiltradas
    .sort((a, b) => {
      // ordenar por fecha desc y luego por numeroConsulta desc
      const ad = a.fecha && a.fecha.toDate ? a.fecha.toDate() : null;
      const bd = b.fecha && b.fecha.toDate ? b.fecha.toDate() : null;
      if (ad && bd) return bd - ad;
      if (ad && !bd) return -1;
      if (!ad && bd) return 1;
      return (b.numeroConsulta || 0) - (a.numeroConsulta || 0);
    })
    .map((c) => {
      const tipoLabel =
        c.tipo === "derivacion"
          ? "Derivación Institucional"
          : c.tipo === "espontanea"
          ? "Demanda Espontánea"
          : "—";

      const prioridadLabel = (c.prioridad || "").toUpperCase();
      const estadoLabel = c.estado || "pendiente";

      let estadoColor = "background:#fff3cd;color:#856404;";
      if (estadoLabel === "en_proceso")
        estadoColor = "background:#cfe2ff;color:#084298;";
      if (estadoLabel === "notificado")
        estadoColor = "background:#e2e3e5;color:#41464b;";
      if (estadoLabel === "resuelto")
        estadoColor = "background:#d1e7dd;color:#0f5132;";
      if (estadoLabel === "cerrado")
        estadoColor = "background:#f8d7da;color:#842029;";

      let prioridadColor = "background:#e2e3e5;color:#41464b;";
      if (c.prioridad === "baja")
        prioridadColor = "background:#d1e7dd;color:#0f5132;";
      if (c.prioridad === "media")
        prioridadColor = "background:#cff4fc;color:#055160;";
      if (c.prioridad === "alta")
        prioridadColor = "background:#fff3cd;color:#856404;";
      if (c.prioridad === "urgente")
        prioridadColor = "background:#f8d7da;color:#842029;";

      return `
        <tr>
          <td>${c.fechaLabel}</td>
          <td>
            ${c.personaNombre || "—"}
            ${c.personaDni ? `<br><small>DNI: ${c.personaDni}</small>` : ""}
            ${
              c.numeroConsulta
                ? `<br><small>Nº Consulta: <strong>${c.numeroConsulta}</strong></small>`
                : ""
            }
          </td>
          <td>${c.motivo || "—"}</td>
          <td>${tipoLabel}</td>
          <td>${c.profesionalNombre || "—"}</td>
          <td>
            <span style="padding:4px 8px;border-radius:12px;font-size:12px;${estadoColor}">
              ${estadoLabel}
            </span>
          </td>
          <td>
            <span style="padding:4px 8px;border-radius:12px;font-size:12px;${prioridadColor}">
              ${prioridadLabel || "—"}
            </span>
          </td>
          <td>
            <button class="btn btn-small" onclick="window.abrirEstadoModal('${c.id}')">
              Estado
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  if (resultCount) {
    resultCount.textContent = `${consultasFiltradas.length} resultado${
      consultasFiltradas.length !== 1 ? "s" : ""
    }`;
  }
}

/* ===================== MODAL CAMBIO ESTADO ===================== */

function abrirEstadoModal(id) {
  const modal = $("estadoModal");
  const select = $("nuevoEstado");
  const obs = $("observacionEstado");

  const c = consultas.find((x) => x.id === id);
  if (!modal || !select || !c) return;

  consultaSeleccionada = c;
  select.value = c.estado || "pendiente";
  if (obs) obs.value = "";

  modal.style.display = "flex";
}

function cerrarModalEstado() {
  const modal = $("estadoModal");
  if (modal) modal.style.display = "none";
  consultaSeleccionada = null;
}

async function confirmarCambioEstado() {
  if (!consultaSeleccionada) return;

  const select = $("nuevoEstado");
  const obsEl = $("observacionEstado");

  const nuevoEstado = select?.value || "pendiente";
  const observacion = obsEl?.value.trim() || "";

  try {
    const ahora = new Date().toISOString();
    const usuario = sessionStorage.getItem("currentUser") || "sistema";

    const nuevosHistoricos = [
      ...(consultaSeleccionada.historicoEstados || []),
      { estado: nuevoEstado, fecha: ahora, usuario, nota: observacion },
    ];

    const nuevasObs = [...(consultaSeleccionada.observaciones || [])];
    if (observacion) {
      nuevasObs.push({
        fecha: ahora,
        usuario,
        nota: observacion,
      });
    }

    const ref = doc(db, "consultas", consultaSeleccionada.id);
    await updateDoc(ref, {
      estado: nuevoEstado,
      historicoEstados: nuevosHistoricos,
      observaciones: nuevasObs,
      updatedAt: serverTimestamp(),
    });

    consultaSeleccionada.estado = nuevoEstado;
    consultaSeleccionada.historicoEstados = nuevosHistoricos;
    consultaSeleccionada.observaciones = nuevasObs;

    renderStats();
    aplicarFiltros();
    cerrarModalEstado();
  } catch (err) {
    console.error("Error actualizando estado de consulta:", err);
    alert("Error al actualizar el estado de la consulta.");
  }
}

/* ===================== LOAD + INIT ===================== */

async function loadConsultas() {
  await fetchConsultas();
}

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = $("searchInput");
  const filterEstado = $("filterEstado");
  const filterTipo = $("filterTipo");
  const filterPrioridad = $("filterPrioridad");
  const filterProfesional = $("filterProfesional");

  if (searchInput) searchInput.addEventListener("input", aplicarFiltros);
  if (filterEstado) filterEstado.addEventListener("change", aplicarFiltros);
  if (filterTipo) filterTipo.addEventListener("change", aplicarFiltros);
  if (filterPrioridad)
    filterPrioridad.addEventListener("change", aplicarFiltros);
  if (filterProfesional)
    filterProfesional.addEventListener("change", aplicarFiltros);

  loadConsultas();
});

/* ===================== EXPOSE GLOBAL ===================== */

window.loadConsultas = loadConsultas;
window.abrirEstadoModal = abrirEstadoModal;
window.cerrarModalEstado = cerrarModalEstado;
window.confirmarCambioEstado = confirmarCambioEstado;
