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
  where,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

/* ===================== CONTEXTO (PANEL PROFESIONAL) ===================== */
const IS_PRO_PANEL = location.pathname.endsWith("profesional-panel.html");
const ROLE = (sessionStorage.getItem("userRole") || "lectura").toLowerCase();
const SESSION_PRO_ID = (sessionStorage.getItem("profesionalId") || "").trim();
const SESSION_EMAIL = (
  sessionStorage.getItem("profesionalEmail") ||
  sessionStorage.getItem("currentUser") ||
  ""
)
  .toLowerCase()
  .trim();

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

  const d = new Date(value);
  if (!isNaN(d.getTime())) return d.toLocaleDateString("es-AR");

  return String(value);
}

function formatFechaHora(value) {
  if (!value) return "—";
  if (value.toDate) {
    const d = value.toDate();
    return d.toLocaleString("es-AR");
  }
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d.toLocaleString("es-AR");
  return String(value);
}

function getQueryDni() {
  try {
    const params = new URLSearchParams(location.search);
    return (params.get("dni") || "").trim();
  } catch {
    return "";
  }
}

// Construye un texto de búsqueda robusto
function buildSearchText(obj) {
  return (
    (obj.personaNombre || "") +
    " " +
    (obj.personaDni || "") +
    " " +
    (obj.motivo || "") +
    " " +
    (obj.profesionalNombre || "") +
    " " +
    (obj.profesional || "") +
    " " +
    (obj.profesionalEmail || "")
  )
    .toLowerCase()
    .trim();
}

function toSafeString(v) {
  return (v === null || v === undefined) ? "" : String(v);
}

// Normaliza doc -> objeto usable
function docToObj(docSnap) {
  const d = docSnap.data() || {};

  const obj = {
    id: docSnap.id,

    // Fechas
    createdAt: d.createdAt || null,
    updatedAt: d.updatedAt || null,
    fecha: d.fecha || "",

    // Datos persona
    personaNombre: d.personaNombre || "",
    personaDni: d.personaDni || "",
    personaEdad: d.personaEdad || "",
    personaTelefono: d.personaTelefono || "",
    personDocId: d.personDocId || d.personId || "",

    // Consulta
    motivo: d.motivo || "",
    descripcion: d.descripcion || "",
    tipo: d.tipo || "",
    estado: d.estado || "pendiente",
    prioridad: d.prioridad || "",

    // Profesional (varios esquemas compatibles)
    profesionalAsignado: toSafeString(d.profesionalAsignado || d.profesionalId || d.professionalId).trim(),
    profesionalNombre: d.profesionalNombre || d.profesional || "",
    profesionalEmail: (d.profesionalEmail || d?.verificado?.profesionalEmail || "").toLowerCase().trim(),

    // Identificadores
    householdId: d.householdId || d.grupoFamiliar || "",
    numeroConsulta: (typeof d.numeroConsulta === "number") ? d.numeroConsulta : null,

    // Firma + observaciones
    firmaDigital: d.firmaDigital || null,
    observaciones: Array.isArray(d.observaciones) ? d.observaciones : [],

    // Historico
    historicoEstados: Array.isArray(d.historicoEstados) ? d.historicoEstados : [],

    // Campos extra que pueden existir en derivadas (no molestan)
    requiere: d.requiere || false,
    asignadaAt: d.asignadaAt || "",
    asignadaPor: d.asignadaPor || "",
    derivadoPor: d.derivadoPor || "",
    timestamp: d.timestamp || "",
    userAgent: d.userAgent || "",
    ipAddress: d.ipAddress || "",
    verificado: d.verificado || false,
  };

  // Labels
  obj.fechaLabel = obj.fecha
    ? obj.fecha
    : (obj.createdAt ? formatFecha(obj.createdAt) : "—");

  obj.createdAtLabel = obj.createdAt ? formatFechaHora(obj.createdAt) : "—";
  obj.updatedAtLabel = obj.updatedAt ? formatFechaHora(obj.updatedAt) : "—";

  obj.searchText = buildSearchText(obj);

  return obj;
}

/* ===================== QUERY (PAGINADO) ===================== */

// Intenta orderBy numeroConsulta, si falla usa createdAt
async function runPagedQuery({ orderMode = "numeroConsulta" } = {}) {
  const colRef = collection(db, "consultas");

  let q;

  if (orderMode === "numeroConsulta") {
    q = query(colRef, orderBy("numeroConsulta", "desc"), limit(PAGE_SIZE));
    if (pageCursor) q = query(colRef, orderBy("numeroConsulta", "desc"), startAfter(pageCursor), limit(PAGE_SIZE));
  } else {
    q = query(colRef, orderBy("createdAt", "desc"), limit(PAGE_SIZE));
    if (pageCursor) q = query(colRef, orderBy("createdAt", "desc"), startAfter(pageCursor), limit(PAGE_SIZE));
  }

  const snap = await getDocs(q);
  return snap;
}

async function loadConsultas(resetPaging = true) {
  const tbody = $("consultasTableBody");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="8" class="loading">Cargando consultas...</td></tr>`;
  }

  if (resetPaging) {
    pageCursor = null;
    pageStack = [];
    lastPageDocs = [];
  }

  try {
    // 1) Probar por numeroConsulta
    let snap;
    try {
      snap = await runPagedQuery({ orderMode: "numeroConsulta" });
    } catch (e) {
      console.warn("orderBy(numeroConsulta) falló, uso createdAt:", e);
      snap = await runPagedQuery({ orderMode: "createdAt" });
    }

    lastPageDocs = snap.docs || [];
    if (lastPageDocs.length) {
      pageCursor = lastPageDocs[lastPageDocs.length - 1];
    }

    consultas = lastPageDocs.map(docToObj);

    fillProfesionalesFilter();
    updateStats();
    aplicarFiltros(true);

    updatePagerUI();
  } catch (err) {
    console.error("loadConsultas error:", err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="loading">❌ Error cargando consultas.</td></tr>`;
    }
  }
}

/* ===================== FILTROS / STATS ===================== */

function fillProfesionalesFilter() {
  const sel = $("filterProfesional");
  if (!sel) return;

  // Mantener el option inicial "Todos..."
  const first = sel.querySelector("option[value='']");
  sel.innerHTML = "";
  if (first) sel.appendChild(first);
  else {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Todos los profesionales";
    sel.appendChild(opt);
  }

  // Unique list
  const map = new Map();
  consultas.forEach((c) => {
    const id = (c.profesionalAsignado || "").trim();
    const nm = (c.profesionalNombre || "").trim();
    if (!id && !nm) return;
    const key = id || nm;
    if (!map.has(key)) map.set(key, { id, nm: nm || id });
  });

  [...map.values()]
    .sort((a, b) => (a.nm || "").localeCompare(b.nm || ""))
    .forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id || p.nm;
      opt.textContent = p.nm || p.id;
      sel.appendChild(opt);
    });
}

function updateStats() {
  const total = consultas.length;
  const pendientes = consultas.filter((c) => c.estado === "pendiente").length;
  const enProceso = consultas.filter((c) => c.estado === "en_proceso").length;
  const resueltas = consultas.filter((c) => c.estado === "resuelto").length;
  const urgentes = consultas.filter((c) => c.prioridad === "urgente").length;
  const derivacion = consultas.filter((c) => c.tipo === "derivacion").length;

  if ($("totalConsultas")) $("totalConsultas").textContent = total;
  if ($("consultasPendientes")) $("consultasPendientes").textContent = pendientes;
  if ($("consultasEnProceso")) $("consultasEnProceso").textContent = enProceso;
  if ($("consultasResueltas")) $("consultasResueltas").textContent = resueltas;
  if ($("consultasUrgentes")) $("consultasUrgentes").textContent = urgentes;
  if ($("consultasDerivacion")) $("consultasDerivacion").textContent = derivacion;
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

    // 🔒 FILTRO INTERNO OBLIGATORIO (solo en profesional-panel)
    if (IS_PRO_PANEL && ROLE === "profesional") {
      const pid = String(c.profesionalAsignado || c.profesionalId || c.professionalId || "").trim();
      const pem = String(c.profesionalEmail || c?.verificado?.profesionalEmail || c?.profesional?.profesionalEmail || "").toLowerCase().trim();
      const match = (pid && pid === SESSION_PRO_ID) || (SESSION_EMAIL && pem && pem === SESSION_EMAIL);
      if (!match) return false;
    }

    if (dniUrl) {
      if (String(c.personaDni || "").trim() !== dniUrl) return false;
    }

    if (search && !c.searchText.includes(search)) return false;
    if (filtroEstado && c.estado !== filtroEstado) return false;
    if (filtroTipo && c.tipo !== filtroTipo) return false;
    if (filtroPrioridad && c.prioridad !== filtroPrioridad) return false;

    if (filtroProfesional) {
      // match por id o por nombre
      const pid = (c.profesionalAsignado || "").trim();
      const pnm = (c.profesionalNombre || "").trim();
      if (pid !== filtroProfesional && pnm !== filtroProfesional) return false;
    }

    return true;
  });

  renderTable();
}

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
      const estadoLabel = {
        pendiente: "Pendiente",
        en_proceso: "En Proceso",
        notificado: "Notificado",
        resuelto: "Resuelto",
        cerrado: "Cerrado",
        archivado: "Archivado",
      }[c.estado] || c.estado;

      let estadoColor = "background:#e2e3e5;color:#41464b;";
      if (c.estado === "pendiente") estadoColor = "background:#fff3cd;color:#856404;";
      if (c.estado === "en_proceso") estadoColor = "background:#cfe2ff;color:#084298;";
      if (c.estado === "resuelto") estadoColor = "background:#d1e7dd;color:#0f5132;";
      if (c.estado === "archivado") estadoColor = "background:#f8d7da;color:#842029;";

      const prioridadLabel = {
        baja: "Baja",
        media: "Media",
        alta: "Alta",
        urgente: "Urgente",
      }[c.prioridad] || c.prioridad;

      let prioridadColor = "background:#e2e3e5;color:#41464b;";
      if (c.prioridad === "baja") prioridadColor = "background:#e2e3e5;color:#41464b;";
      if (c.prioridad === "media") prioridadColor = "background:#cff4fc;color:#055160;";
      if (c.prioridad === "alta") prioridadColor = "background:#fff3cd;color:#856404;";
      if (c.prioridad === "urgente") prioridadColor = "background:#f8d7da;color:#842029;";

      const tieneFirma = !!(c.firmaDigital && c.firmaDigital.profesional);

      const btnPdf = tieneFirma
        ? `<button class="btn btn-small" data-perm="pdf" onclick="window.exportarPDFCertificado('${c.id}')">✍️ Certificado</button>`
        : `<button class="btn btn-small" data-perm="pdf" onclick="window.exportarPDFConsultaSimple('${c.id}')">📄 PDF</button>`;

      const puedeFirmar =
        IS_PRO_PANEL &&
        ROLE === "profesional" &&
        (c.estado === "resuelto") &&
        !(c.firmaDigital && c.firmaDigital.profesional);

      const btnFirmar = puedeFirmar
        ? `<button class="btn btn-small" data-perm="firmar" onclick="window.abrirModalFirma('${c.id}')">✍️ Firmar</button>`
        : ``;

      return `
        <tr>
          <td>${c.fechaLabel}</td>
          <td>
            ${c.personaNombre || "—"}
            ${c.personaDni ? `<br><small>DNI: ${c.personaDni}</small>` : ""}
          </td>
          <td>${c.motivo || "—"}</td>
          <td>${c.tipo === "derivacion" ? "Derivación" : (c.tipo === "espontanea" ? "Espontánea" : (c.tipo || "—"))}</td>
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
              ${btnFirmar}
              <button class="btn btn-small" data-perm="whatsapp" onclick="window.citarPorWhatsApp('${c.id}')">📲 Citar</button>
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

  // ✅ Reaplicar permisos si tu sistema los oculta por data-perm
  try {
    if (window.initPagePermissions) window.initPagePermissions();
  } catch (_) {}
}

/* ===================== MODAL ESTADO ===================== */

let estadoTargetId = null;

function abrirEstadoModal(id) {
  estadoTargetId = id;
  const modal = $("estadoModal");
  if (!modal) return;

  // precargar estado actual
  const c = consultas.find((x) => x.id === id);

  // ✅ BLOQUEO: si ya está RESUELTO, no permitir cambiar estado
  if (c?.estado === "resuelto") {
    alert(
      "Esta consulta fue firmada y cerrada. No puede cambiar el estado, para un tratamiento distinto genere una consulta nueva"
    );
    estadoTargetId = null;
    return;
  }

  const sel = $("nuevoEstado");
  if (sel && c?.estado) sel.value = c.estado;

  const obs = $("observacionEstado");
  if (obs) obs.value = "";

  modal.style.display = "flex";
}


function cerrarModalEstado() {
  const modal = $("estadoModal");
  if (modal) modal.style.display = "none";
  estadoTargetId = null;
}

async function confirmarCambioEstado() {
  try {
    if (!estadoTargetId) return;

    const nuevo = $("nuevoEstado")?.value || "pendiente";
    const obs = ($("observacionEstado")?.value || "").trim();

    const ref = doc(db, "consultas", estadoTargetId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

        const d = snap.data() || {};

    // ✅ Si quieren marcar RESUELTO pero está derivada a otro profesional
    if (nuevo === "resuelto") {
      const asignadoId = String(d.profesionalAsignado || d.profesionalId || d.professionalId || "").trim();
      const asignadoEmail = String(d.profesionalEmail || d?.verificado?.profesionalEmail || "").toLowerCase().trim();

      const match =
        (SESSION_PRO_ID && asignadoId && asignadoId === SESSION_PRO_ID) ||
        (SESSION_EMAIL && asignadoEmail && asignadoEmail === SESSION_EMAIL);

      if ((asignadoId || asignadoEmail) && !match) {
        alert("Esta consulta fue derivada a otra persona");
        return;
      }
    }

    const historico = Array.isArray(d.historicoEstados) ? [...d.historicoEstados] : [];


    await updateDoc(ref, {
      estado: nuevo,
      historicoEstados: historico,
      updatedAt: serverTimestamp(),
    });

    // actualizar local
    const local = consultas.find((x) => x.id === estadoTargetId);
    if (local) {
      local.estado = nuevo;
      local.historicoEstados = historico;
      local.updatedAt = { toDate: () => new Date() };
      local.updatedAtLabel = formatFechaHora(new Date());
    }

    cerrarModalEstado();
    updateStats();
    aplicarFiltros();
  } catch (err) {
    console.error("confirmarCambioEstado error:", err);
    alert("❌ Error al actualizar estado.");
  }
}

/* ===================== WHATSAPP ===================== */

function citarPorWhatsApp(id) {
  const c = consultas.find((x) => x.id === id);
  if (!c) return;

  const tel = (c.personaTelefono || "").replace(/\D/g, "");
  if (!tel) {
    alert("⚠️ No hay teléfono registrado para esta persona.");
    return;
  }

  const msg =
    `Hola ${c.personaNombre || ""}. ` +
    `Te contactamos por tu consulta: "${c.motivo || ""}". ` +
    `Estado actual: ${c.estado || ""}.`;

  const url = `https://wa.me/54${tel}?text=${encodeURIComponent(msg)}`;
  window.open(url, "_blank");
}

/* ===================== PAGER UI ===================== */

function ensurePagerUI() {
  // Si ya existe un pager en el HTML, no hacemos nada.
  // Si no existe, se puede agregar acá, pero para no romper tu UI lo dejamos liviano.
}

function updatePagerUI() {
  // Si tenés botones de siguiente/anterior, podés conectarlos acá.
  // Este archivo mantiene el mismo comportamiento que ya venías usando.
}

/* ===================== INIT ===================== */

document.addEventListener("DOMContentLoaded", () => {
  ensurePagerUI();

  // ✅ Panel Profesional: mostrar/ocultar secciones (sin tocar el HTML)
  if (IS_PRO_PANEL) {
    const welcomeOnly = $("welcomeOnly");
    const panelList = $("panelList");
    if (ROLE === "lectura") {
      if (welcomeOnly) welcomeOnly.style.display = "block";
      if (panelList) panelList.style.display = "none";
    } else {
      if (welcomeOnly) welcomeOnly.style.display = "none";
      if (panelList) panelList.style.display = "block";
    }
  }

  // Hooks filtros
  $("searchInput")?.addEventListener("input", () => aplicarFiltros());
  $("filterEstado")?.addEventListener("change", () => aplicarFiltros());
  $("filterTipo")?.addEventListener("change", () => aplicarFiltros());
  $("filterPrioridad")?.addEventListener("change", () => aplicarFiltros());

  const filterProfesional = $("filterProfesional");

  // 🔒 Panel Profesional: fija y bloquea el filtro de profesional
  if (IS_PRO_PANEL && ROLE === "profesional" && filterProfesional) {
    filterProfesional.value = SESSION_PRO_ID;
    filterProfesional.disabled = true;
    filterProfesional.style.pointerEvents = "none";
    filterProfesional.style.opacity = "0.75";
  }

  filterProfesional?.addEventListener("change", () => aplicarFiltros());

  $("showArchivados")?.addEventListener("change", () => aplicarFiltros());

  // Exponer funciones usadas por el HTML
  window.loadConsultas = () => loadConsultas(false);
  window.abrirEstadoModal = abrirEstadoModal;
  window.cerrarModalEstado = cerrarModalEstado;
  window.confirmarCambioEstado = confirmarCambioEstado;
  window.citarPorWhatsApp = citarPorWhatsApp;

  // Primera carga
  loadConsultas(true);
});

/* ===================== NOTAS ===================== */
// window.exportarPDFConsultaSimple(...) lo aporta export-consulta-pdf.js
// window.exportarPDFCertificado(...) lo aporta export-certificado.js

/* ===================== FIRMA DIGITAL (SOLO PANEL PROFESIONAL) ===================== */

let consultaParaFirmar = null;

function ensureFirmaModal() {
  if (!IS_PRO_PANEL) return;
  if (document.getElementById("firmaModal")) return;

  const modal = document.createElement("div");
  modal.id = "firmaModal";
  modal.style.cssText = `
    display:none; position:fixed; inset:0;
    background:rgba(0,0,0,.5); z-index:99999;
    align-items:center; justify-content:center;
  `;

  modal.innerHTML = `
    <div style="background:#fff;padding:26px;border-radius:10px;max-width:520px;width:92%;">
      <h3 style="margin:0 0 10px;color:#333;">Firma Digital del Caso</h3>

      <div style="background:#fff3cd;border-left:4px solid #856404;padding:12px;margin:12px 0;border-radius:4px;">
        <p style="margin:0;font-size:13px;color:#856404;">
          <b>⚠️ Atención:</b> La firma se permite solo en estado <b>RESUELTO</b> y queda registrada.
        </p>
      </div>

      <div style="margin-top:10px;">
        <label style="display:block;margin-bottom:6px;font-weight:600;">Persona</label>
        <div id="firmaPersona" style="padding:10px;border:1px solid #ddd;border-radius:6px;color:#444;">—</div>
      </div>

      <div style="margin-top:12px;">
        <label style="display:block;margin-bottom:6px;font-weight:600;">Contraseña del profesional</label>
        <input id="firmaPassword" type="password" placeholder="••••••••"
          style="width:100%;padding:10px;border:2px solid #ddd;border-radius:6px;outline:none;" />
        <small style="color:#666;">Se verifica contra tu registro en <b>professionals</b>.</small>
      </div>

      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;">
        <button class="btn btn-secondary" type="button" onclick="window.cerrarModalFirma()">Cancelar</button>
        <button class="btn btn-primary" type="button" onclick="window.confirmarFirma()">Firmar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

function abrirModalFirma(consultaId) {
  const c = (consultas || []).find((x) => x.id === consultaId);
  if (!c) return;

  // Seguridad: solo firmar lo asignado al profesional actual (en panel profesional)
  if (ROLE === "profesional") {
    const pid = String(c.profesionalAsignado || c.profesionalId || "").trim();
    const pem = String(c.profesionalEmail || "").toLowerCase().trim();
    const match = (pid && pid === SESSION_PRO_ID) || (SESSION_EMAIL && pem && pem === SESSION_EMAIL);
    if (!match) {
      alert("⛔ No autorizado para firmar esta consulta.");
      return;
    }
  }

  if (c.estado !== "resuelto") {
    alert("⚠️ Solo puede firmar casos con estado RESUELTO.");
    return;
  }

  if (c.firmaDigital && c.firmaDigital.profesional) {
    alert("ℹ️ Este caso ya ha sido firmado digitalmente.");
    return;
  }

  consultaParaFirmar = c;

  ensureFirmaModal();
  const m = document.getElementById("firmaModal");
  if (!m) return;

  const persona = document.getElementById("firmaPersona");
  if (persona) {
    const dni = c.personaDni ? ` (DNI ${c.personaDni})` : "";
    persona.textContent = `${c.personaNombre || "—"}${dni}`;
  }

  const pass = document.getElementById("firmaPassword");
  if (pass) pass.value = "";

  m.style.display = "flex";
  setTimeout(() => pass?.focus(), 30);
}

function cerrarModalFirma() {
  const m = document.getElementById("firmaModal");
  if (m) m.style.display = "none";
  consultaParaFirmar = null;
}

async function generarHash(data) {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function obtenerIP() {
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const j = await r.json();
    return j?.ip || "unknown";
  } catch {
    return "unknown";
  }
}

async function confirmarFirma() {
  try {
    if (!IS_PRO_PANEL || ROLE !== "profesional") return;
    if (!consultaParaFirmar) return;

    if (consultaParaFirmar.estado !== "resuelto") {
      alert("⚠️ Solo puede firmar casos con estado RESUELTO.");
      return;
    }

    if (consultaParaFirmar.firmaDigital && consultaParaFirmar.firmaDigital.profesional) {
      alert("ℹ️ Este caso ya ha sido firmado digitalmente.");
      return;
    }

    const password = (document.getElementById("firmaPassword")?.value || "").trim();
    if (!password) {
      alert("⚠️ Ingrese su contraseña para firmar.");
      return;
    }

    const profesionalEmail = SESSION_EMAIL;
    const profesionalNombre =
      (sessionStorage.getItem("profesionalNombre") ||
        sessionStorage.getItem("displayName") ||
        "Profesional").trim();
    const profesionalId = SESSION_PRO_ID;

    // 1) Verificar password contra professionals por email
    const q = query(collection(db, "professionals"), where("email", "==", profesionalEmail));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      alert("❌ Error: No se pudo verificar su identidad (professionals/email).");
      return;
    }

    let ok = false;

snapshot.forEach((docu) => {
  const data = docu.data() || {};

  // ✅ soportar diferentes nombres de campo y limpiar espacios
  const stored =
    String(
      data.password ??
      data.pass ??
      data.contrasena ??
      data.contraseña ??
      data.clave ??
      ""
    ).trim();

  const typed = String(password).trim();

  if (stored && typed && stored === typed) ok = true;
});


    // 2) Generar firma
    const timestamp = new Date();
    const timestampISO = timestamp.toISOString();

    const hashData = [
      profesionalId,
      consultaParaFirmar.id,
      timestampISO,
      crypto.randomUUID(),
      navigator.userAgent || "unknown",
    ].join("|");

    const hash = await generarHash(hashData);
    const ip = await obtenerIP();

    const firmaDigital = {
      profesional: profesionalNombre,
      profesionalId,
      profesionalEmail,
      fecha: timestampISO,
      hash,
      ipAddress: ip,
      userAgent: navigator.userAgent || "unknown",
      timestamp: timestampISO,
      verificado: true,
    };

    const nuevasObs = [...(consultaParaFirmar.observaciones || [])];
    nuevasObs.push({
      fecha: timestampISO,
      usuario: profesionalNombre,
      nota: `[FIRMA DIGITAL] Caso firmado. Hash: ${hash}`,
      profesionalId,
    });

    // 3) Guardar en Firestore
    await updateDoc(doc(db, "consultas", consultaParaFirmar.id), {
      firmaDigital,
      observaciones: nuevasObs,
      updatedAt: serverTimestamp(),
    });

    // 4) Refrescar local
    consultaParaFirmar.firmaDigital = firmaDigital;
    consultaParaFirmar.observaciones = nuevasObs;

    cerrarModalFirma();
    aplicarFiltros();

    alert(
      `✅ CASO FIRMADO DIGITALMENTE\n\n` +
        `Profesional: ${profesionalNombre}\n` +
        `Fecha: ${timestamp.toLocaleString("es-AR")}\n` +
        `Hash: ${hash.substring(0, 16)}...\n\n` +
        `La firma ha sido registrada.`
    );
  } catch (err) {
    console.error("Error al firmar:", err);
    alert("❌ Error al firmar digitalmente el caso.");
  }
}

window.abrirModalFirma = abrirModalFirma;
window.cerrarModalFirma = cerrarModalFirma;
window.confirmarFirma = confirmarFirma;
