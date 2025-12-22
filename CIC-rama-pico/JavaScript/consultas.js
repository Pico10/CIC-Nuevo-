// JavaScript/consultas.js
import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  increment,
  query,
  orderBy,
  limit,
  startAfter,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

let consultas = [];
let consultasFiltradas = [];
let consultaSeleccionada = null;

/* ===================== PAGINACIÓN ===================== */
const PAGE_SIZE = 25;
let pageCursor = null;
let pageStack = [];
let lastPageDocs = [];

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

function limpiarTelefono(tel) {
  if (!tel) return "";
  return String(tel).replace(/\D/g, "");
}

function formatFechaCorta(yyyyMmDd) {
  if (!yyyyMmDd) return "—";
  const d = new Date(yyyyMmDd + "T00:00:00");
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("es-AR");
}

function formatFechaHoraCita(cit) {
  if (!cit || !cit.fecha) return "—";
  const f = formatFechaCorta(cit.fecha);
  const h = cit.hora || "—";
  return `${f} ${h}`;
}

/* ===================== UI PAGER (AUTO-INJECT) ===================== */
function ensurePagerUI() {
  if ($("pagerCIC")) return;

  const controlsRow = document.querySelector(".controls .controls-row");
  if (!controlsRow) return;

  const wrap = document.createElement("div");
  wrap.id = "pagerCIC";
  wrap.style.cssText = `
    display:flex;align-items:center;gap:8px;
    padding:6px 10px;border:1px solid #e6e6e6;border-radius:8px;
    background:#fff; margin-left:auto;
  `;

  wrap.innerHTML = `
    <button id="btnPrevPage" class="btn btn-secondary btn-small" type="button">◀ Anterior</button>
    <span id="pageInfo" style="font-size:13px;color:#555;">Página 1</span>
    <button id="btnNextPage" class="btn btn-secondary btn-small" type="button">Siguiente ▶</button>
  `;

  controlsRow.appendChild(wrap);

  $("btnPrevPage")?.addEventListener("click", () => prevPage());
  $("btnNextPage")?.addEventListener("click", () => nextPage());
}

function setPageInfo() {
  const pageNum = pageStack.length + 1;
  setText("pageInfo", `Página ${pageNum}`);

  const prev = $("btnPrevPage");
  if (prev) prev.disabled = pageStack.length === 0;

  const next = $("btnNextPage");
  if (next) next.disabled = lastPageDocs.length < PAGE_SIZE;
}

/* ===================== LOAD FIRESTORE (PAGINADO) ===================== */
function docToObj(docSnap) {
  const d = docSnap.data();
  const created = d.createdAt || d.fecha || null;

  const obj = {
    id: docSnap.id,
    numeroConsulta: d.numeroConsulta ?? null,
    fecha: created,
    fechaLabel: formatFecha(created),

    personaNombre: d.personaNombre || "",
    personaDni: d.personaDni || "",
    personaTelefono: d.personaTelefono || "",
    personDocId: d.personDocId || "",
    personId: d.personId || "",

    motivo: d.motivo || "",
    tipo: d.tipo || "",
    prioridad: d.prioridad || "",
    profesionalAsignado: d.profesionalAsignado || "",
    profesionalNombre: d.profesionalNombre || "",
    estado: d.estado || "pendiente",

    historicoEstados: d.historicoEstados || [],
    observaciones: d.observaciones || [],
    firmaDigital: d.firmaDigital || null,
    citacion: d.citacion || null,
  };

  obj.searchText = (
    obj.personaNombre +
    " " +
    (obj.personaDni || "") +
    " " +
    obj.motivo +
    " " +
    (obj.profesionalNombre || "")
  )
    .toLowerCase()
    .trim();

  return obj;
}

// 🔥 Query robusta: intenta numeroConsulta, si falla usa createdAt
async function runPagedQuery({ orderMode = "numeroConsulta" } = {}) {
  const colRef = collection(db, "consultas");

  if (orderMode === "createdAt") {
    let q = query(colRef, orderBy("createdAt", "desc"), limit(PAGE_SIZE));
    if (pageCursor) q = query(colRef, orderBy("createdAt", "desc"), startAfter(pageCursor), limit(PAGE_SIZE));
    return await getDocs(q);
  }

  // default: numeroConsulta
  let q = query(colRef, orderBy("numeroConsulta", "desc"), limit(PAGE_SIZE));
  if (pageCursor) q = query(colRef, orderBy("numeroConsulta", "desc"), startAfter(pageCursor), limit(PAGE_SIZE));
  return await getDocs(q);
}

async function fetchConsultas({ reset = false } = {}) {
  if (reset) {
    pageCursor = null;
    pageStack = [];
  }

  ensurePagerUI();

  const tbody = $("consultasTableBody");
  if (tbody) {
    tbody.innerHTML = `
      <tr><td colspan="8" class="loading">Cargando consultas...</td></tr>
    `;
  }

  try {
    // 1) Intento por numeroConsulta
    let snap;
    try {
      snap = await runPagedQuery({ orderMode: "numeroConsulta" });
    } catch (e1) {
      console.warn("⚠️ Falla orderBy(numeroConsulta). Fallback a createdAt.", e1);
      // 2) Fallback por createdAt
      snap = await runPagedQuery({ orderMode: "createdAt" });
    }

    lastPageDocs = snap.docs;
    const lista = snap.docs.map(docToObj);

    consultas = lista;
    consultasFiltradas = [...consultas];

    // cursor nuevo
    pageCursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : pageCursor;

    renderStats();
    buildProfesionalFilterOptions();
    aplicarFiltros(true);
    setPageInfo();
  } catch (err) {
    console.error("❌ Error cargando consultas:", err);
    if (tbody) {
      tbody.innerHTML = `
        <tr><td colspan="8" class="loading">Error al cargar consultas.</td></tr>
      `;
    }
  }
}

async function nextPage() {
  if (lastPageDocs.length < PAGE_SIZE) return;
  pageStack.push(pageCursor);
  await fetchConsultas({ reset: false });
}

async function prevPage() {
  if (pageStack.length === 0) return;

  pageStack.pop();
  const targetPages = pageStack.length;

  pageCursor = null;
  const savedStack = [...pageStack];
  pageStack = [];

  for (let i = 0; i < targetPages; i++) {
    await fetchConsultas({ reset: i === 0 });
    pageStack.push(pageCursor);
  }

  await fetchConsultas({ reset: targetPages === 0 });
  pageStack = savedStack;
  setPageInfo();
}

/* ===================== STATS ===================== */
function renderStats() {
  const consultasActivas = consultas.filter((c) => c.estado !== "archivado");

  const total = consultasActivas.length;
  const pendientes = consultasActivas.filter((c) => c.estado === "pendiente").length;
  const enProceso = consultasActivas.filter((c) => c.estado === "en_proceso").length;
  const resueltas = consultasActivas.filter((c) => c.estado === "resuelto").length;
  const urgentes = consultasActivas.filter((c) => c.prioridad === "urgente").length;
  const derivacion = consultasActivas.filter((c) => c.tipo === "derivacion").length;

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

  if (selected) sel.value = selected;
}

/* ===================== FILTROS ===================== */
function getQueryDni() {
  try {
    const params = new URLSearchParams(window.location.search);
    const dni = (params.get("dni") || "").trim();
    return dni;
  } catch {
    return "";
  }
}

function aplicarFiltros(fromFetch = false) {
  const search = ($("searchInput")?.value || "").toLowerCase().trim();
  const filtroEstado = $("filterEstado")?.value || "";
  const filtroTipo = $("filterTipo")?.value || "";
  const filtroPrioridad = $("filterPrioridad")?.value || "";
  const filtroProfesional = $("filterProfesional")?.value || "";
  const mostrarArchivados = $("showArchivados")?.checked || false;

  // ✅ si viene dni por URL, fuerza el filtro por DNI (sin romper lo demás)
  const dniUrl = getQueryDni();

  // si es la primera vez y hay dniUrl, precarga el search input
  if (fromFetch && dniUrl && $("searchInput") && !$("searchInput").value) {
    $("searchInput").value = dniUrl;
  }

  consultasFiltradas = consultas.filter((c) => {
    if (!mostrarArchivados && c.estado === "archivado") return false;

    if (dniUrl) {
      if (String(c.personaDni || "").trim() !== dniUrl) return false;
    }

    if (search && !c.searchText.includes(search)) return false;
    if (filtroEstado && c.estado !== filtroEstado) return false;
    if (filtroTipo && c.tipo !== filtroTipo) return false;
    if (filtroPrioridad && c.prioridad !== filtroPrioridad) return false;
    if (filtroProfesional && c.profesionalAsignado !== filtroProfesional) return false;

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
      <tr><td colspan="8" class="loading">No se encontraron consultas con los filtros actuales.</td></tr>
    `;
    if (resultCount) resultCount.textContent = "0 resultados";
    return;
  }

  tbody.innerHTML = consultasFiltradas
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
      if (estadoLabel === "en_proceso") estadoColor = "background:#cfe2ff;color:#084298;";
      if (estadoLabel === "notificado") estadoColor = "background:#e2e3e5;color:#41464b;";
      if (estadoLabel === "resuelto") estadoColor = "background:#d1e7dd;color:#0f5132;";
      if (estadoLabel === "cerrado") estadoColor = "background:#f8d7da;color:#842029;";
      if (estadoLabel === "archivado") estadoColor = "background:#6c757d;color:#fff;";

      let prioridadColor = "background:#e2e3e5;color:#41464b;";
      if (c.prioridad === "baja") prioridadColor = "background:#d1e7dd;color:#0f5132;";
      if (c.prioridad === "media") prioridadColor = "background:#cff4fc;color:#055160;";
      if (c.prioridad === "alta") prioridadColor = "background:#fff3cd;color:#856404;";
      if (c.prioridad === "urgente") prioridadColor = "background:#f8d7da;color:#842029;";

      const tieneFirma = !!(c.firmaDigital && c.firmaDigital.profesional);

      const btnPdf = tieneFirma
        ? `<button class="btn btn-small" data-perm="pdf" onclick="window.exportarPDFCertificado('${c.id}')">✍️ Certificado</button>`
        : `<button class="btn btn-small" data-perm="pdf" onclick="window.exportarPDFConsultaSimple('${c.id}')">📄 PDF</button>`;

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
            <div class="btn-group">
              ${btnPdf}
              <button class="btn btn-small" data-perm="wpp" onclick="window.citarPorWhatsApp('${c.id}')">📲 Citar</button>
              <button class="btn btn-small" data-perm="consultas-estado" onclick="window.abrirEstadoModal('${c.id}')">Estado</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  if (resultCount) {
    resultCount.textContent = `${consultasFiltradas.length} resultado${
      consultasFiltradas.length !== 1 ? "s" : ""
    } (de ${consultas.length} en esta página)`;
  }

  // ✅ Reaplicar permisos si tu permissions.js oculta por data-perm
  // (si no existe, no rompe)
  try {
    if (window.applyPermissionsUI) window.applyPermissionsUI();
  } catch (_) {}
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

  const estadoAnterior = consultaSeleccionada.estado;
  const nuevoEstado = select?.value || "pendiente";
  const observacion = obsEl?.value.trim() || "";

  if (
    estadoAnterior === "resuelto" &&
    consultaSeleccionada.firmaDigital &&
    consultaSeleccionada.firmaDigital.profesional &&
    nuevoEstado !== "resuelto"
  ) {
    const confirmar = confirm(
      '⚠️ ADVERTENCIA LEGAL\n\n' +
        "Este caso ha sido FIRMADO DIGITALMENTE.\n" +
        "Cambiar el estado invalidará la firma digital.\n\n" +
        "¿Está COMPLETAMENTE seguro de continuar?\n\n" +
        "⚠️ Esto puede tener implicaciones legales."
    );

    if (!confirmar) {
      cerrarModalEstado();
      return;
    }
  }

  try {
    const ahora = new Date().toISOString();
    const usuario = sessionStorage.getItem("currentUser") || "sistema";

    const nuevosHistoricos = [
      ...(consultaSeleccionada.historicoEstados || []),
      { estado: nuevoEstado, fecha: ahora, usuario, nota: observacion },
    ];

    const nuevasObs = [...(consultaSeleccionada.observaciones || [])];
    if (observacion) {
      nuevasObs.push({ fecha: ahora, usuario, nota: observacion });
    }

    if (
      estadoAnterior === "resuelto" &&
      consultaSeleccionada.firmaDigital &&
      consultaSeleccionada.firmaDigital.profesional &&
      nuevoEstado !== "resuelto"
    ) {
      nuevasObs.push({
        fecha: ahora,
        usuario,
        nota: `⚠️ ADVERTENCIA: Firma digital invalidada por cambio de estado de "resuelto" a "${nuevoEstado}". Firmado anteriormente por: ${consultaSeleccionada.firmaDigital.profesional}`,
      });
    }

    const updateData = {
      estado: nuevoEstado,
      historicoEstados: nuevosHistoricos,
      observaciones: nuevasObs,
      updatedAt: serverTimestamp(),
    };

    if (
      estadoAnterior === "resuelto" &&
      consultaSeleccionada.firmaDigital &&
      consultaSeleccionada.firmaDigital.profesional &&
      nuevoEstado !== "resuelto"
    ) {
      updateData.firmaDigital = null;
      consultaSeleccionada.firmaDigital = null;
    }

    const ref = doc(db, "consultas", consultaSeleccionada.id);
    await updateDoc(ref, updateData);

    const profesionalId = consultaSeleccionada.profesionalAsignado;

    if (profesionalId) {
      try {
        const profRef = doc(db, "professionals", profesionalId);

        if (estadoAnterior !== "resuelto" && nuevoEstado === "resuelto") {
          await updateDoc(profRef, {
            casosActivos: increment(-1),
            casosResueltos: increment(1),
          });
        }

        if (estadoAnterior === "resuelto" && nuevoEstado !== "resuelto") {
          await updateDoc(profRef, {
            casosActivos: increment(1),
            casosResueltos: increment(-1),
          });
        }
      } catch (profError) {
        console.warn(`⚠️ Profesional ${profesionalId} no existe. No se actualizaron contadores.`);
      }
    }

    consultaSeleccionada.estado = nuevoEstado;
    consultaSeleccionada.historicoEstados = nuevosHistoricos;
    consultaSeleccionada.observaciones = nuevasObs;

    renderStats();
    aplicarFiltros();
    cerrarModalEstado();
  } catch (err) {
    console.error("Error actualizando estado:", err);
    alert("Error al actualizar el estado de la consulta.");
  }
}

/* ===================== PDF SIMPLE (sin firma) ===================== */
async function exportarPDFConsultaSimple(consultaId) {
  try {
    const snap = await getDoc(doc(db, "consultas", consultaId));
    if (!snap.exists()) {
      alert("❌ Consulta no encontrada");
      return;
    }
    const c = snap.data();

    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("jsPDF no cargó");
      return;
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");
    const margin = 15;
    let y = 18;

    const pageW = pdf.internal.pageSize.getWidth();

    // Header
    pdf.setFillColor(54, 141, 255);
    pdf.rect(0, 0, pageW, 18, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(12);
    pdf.setFont(undefined, "bold");
    pdf.text("CIC PAVÓN ARRIBA - CONSULTA", pageW / 2, 11, { align: "center" });

    y = 28;
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(11);
    pdf.setFont(undefined, "bold");
    pdf.text(
      `Nº Consulta: ${c.numeroConsulta ? "#" + c.numeroConsulta : consultaId}`,
      margin,
      y
    );

    y += 8;
    pdf.setFontSize(10);
    pdf.setFont(undefined, "normal");

    const addRow = (label, value) => {
      pdf.setFont(undefined, "bold");
      pdf.text(label + ":", margin, y);
      pdf.setFont(undefined, "normal");
      pdf.text(String(value || "—"), margin + 45, y);
      y += 6;
    };

    const fechaCaso =
      c.createdAt && c.createdAt.toDate
        ? c.createdAt.toDate().toLocaleDateString("es-AR")
        : "—";

    addRow("Persona", c.personaNombre || "—");
    addRow("DNI", c.personaDni || "—");
    addRow("Fecha", fechaCaso);
    addRow("Motivo", c.motivo || "—");
    addRow(
      "Tipo",
      c.tipo === "derivacion"
        ? "Derivación Institucional"
        : "Demanda Espontánea"
    );
    addRow("Prioridad", String(c.prioridad || "media").toUpperCase());
    addRow("Profesional", c.profesionalNombre || "—");

    if (c.citacion && c.citacion.requiere) {
      addRow("Citación", `${formatFechaHoraCita(c.citacion)}`);
      if (c.citacion.asignadaAt) {
        const d = new Date(c.citacion.asignadaAt);
        const txt = isNaN(d)
          ? "—"
          : d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
        addRow("Asignada", txt);
      }
    }

    y += 4;
    pdf.setFont(undefined, "bold");
    pdf.text("Descripción:", margin, y);
    y += 6;
    pdf.setFont(undefined, "normal");
    pdf.setFontSize(9);

    const desc = c.descripcion || "—";
    const lines = pdf.splitTextToSize(desc, pageW - margin * 2);
    pdf.text(lines, margin, y);

    const nombreArchivo = `Consulta_${(c.personaNombre || "Paciente").replace(
      /\s+/g,
      "_"
    )}_${c.numeroConsulta || consultaId}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, "");

    pdf.save(nombreArchivo);
  } catch (err) {
    console.error("Error PDF simple:", err);
    alert("❌ Error exportando PDF.");
  }
}

/* ===================== WHATSAPP CITACIÓN ===================== */
async function obtenerTelefonoPersona(consulta) {
  if (consulta.personaTelefono) return consulta.personaTelefono;

  if (consulta.personDocId) {
    try {
      const pSnap = await getDoc(doc(db, "persons", consulta.personDocId));
      if (pSnap.exists()) {
        const p = pSnap.data();
        return p.telefono || p.celular || p.phone || "";
      }
    } catch (_) {}
  }

  if (consulta.personId) {
    try {
      const snap = await getDocs(collection(db, "persons"));
      for (const d of snap.docs) {
        const p = d.data();
        if ((p.personId || d.id) === consulta.personId) {
          return p.telefono || p.celular || p.phone || "";
        }
      }
    } catch (_) {}
  }

  return "";
}

function construirMensajeCitacion({ profesionalNombre, citaStr, asignadaStr }) {
  return `Estimado/a, usted ha sido citado para una visita con el profesional "${profesionalNombre}".
Fecha y horario de la cita: ${citaStr}.
Fecha y hora de asignación: ${asignadaStr}.

Por favor confirmar recepción.`;
}

async function citarPorWhatsApp(consultaId) {
  try {
    let c = (consultas || []).find((x) => x.id === consultaId) || null;

    if (!c) {
      const snap = await getDoc(doc(db, "consultas", consultaId));
      if (!snap.exists()) {
        alert("❌ Consulta no encontrada.");
        return;
      }
      c = { id: snap.id, ...snap.data() };
    }

    if (!c.profesionalAsignado) {
      alert("⚠️ Esta consulta no tiene profesional asignado. Asigná uno antes de citar.");
      return;
    }

    const profesionalNombre = c.profesionalNombre || "Sin asignar";

    const cit = c.citacion || null;
    if (!cit || !cit.requiere || !cit.fecha || !cit.hora) {
      alert("⚠️ Esta consulta no tiene citación configurada (día y horario).");
      return;
    }

    const tel = await obtenerTelefonoPersona(c);
    const telClean = limpiarTelefono(tel);

    if (!telClean) {
      alert("⚠️ No se encontró teléfono de la persona para enviar WhatsApp.");
      return;
    }

    const citaStr = formatFechaHoraCita(cit);

    let asignadaStr = "—";
    if (cit.asignadaAt) {
      const d = new Date(cit.asignadaAt);
      if (!isNaN(d)) {
        asignadaStr = d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
      }
    }

    const mensaje = construirMensajeCitacion({ profesionalNombre, citaStr, asignadaStr });

    const url = `https://api.whatsapp.com/send?phone=54${telClean}&text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
  } catch (err) {
    console.error("Error citando por WhatsApp:", err);
    alert("❌ Error al intentar citar por WhatsApp.");
  }
}

/* ===================== LOAD + INIT ===================== */
async function loadConsultas() {
  await fetchConsultas({ reset: true });
}

document.addEventListener("DOMContentLoaded", () => {
  ensurePagerUI();

  const searchInput = $("searchInput");
  const filterEstado = $("filterEstado");
  const filterTipo = $("filterTipo");
  const filterPrioridad = $("filterPrioridad");
  const filterProfesional = $("filterProfesional");
  const showArchivados = $("showArchivados");

  if (searchInput) searchInput.addEventListener("input", () => aplicarFiltros());
  if (filterEstado) filterEstado.addEventListener("change", () => aplicarFiltros());
  if (filterTipo) filterTipo.addEventListener("change", () => aplicarFiltros());
  if (filterPrioridad) filterPrioridad.addEventListener("change", () => aplicarFiltros());
  if (filterProfesional) filterProfesional.addEventListener("change", () => aplicarFiltros());
  if (showArchivados) showArchivados.addEventListener("change", () => aplicarFiltros());

  loadConsultas();
});

/* ===================== EXPOSE GLOBAL ===================== */
window.loadConsultas = loadConsultas;
window.abrirEstadoModal = abrirEstadoModal;
window.cerrarModalEstado = cerrarModalEstado;
window.confirmarCambioEstado = confirmarCambioEstado;

window.exportarPDFConsultaSimple = exportarPDFConsultaSimple;
window.citarPorWhatsApp = citarPorWhatsApp;

// Si tus otros scripts exponen estas funciones, no las tocamos acá.
// window.exportarPDFCertificado(...) lo aporta export-certificado.js
// window.exportarPDFConsultaSimple(...) lo aporta este archivo (fallback)
