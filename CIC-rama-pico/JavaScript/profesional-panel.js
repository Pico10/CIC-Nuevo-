// JavaScript/profesional-panel.js
import { db } from "./firebase.js";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  increment,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

let profesionalId = null;
let profesionalNombre = null;
let profesionalEmail = null;
let casos = [];
let casosFiltrados = [];
let casoParaFirmar = null;

/* ===================== AUTH CHECK ===================== */

function checkAuth() {
  const isLoggedIn = sessionStorage.getItem("profesionalLoggedIn");

  if (isLoggedIn !== "true") {
    alert("Acceso denegado. Debe iniciar sesión como profesional.");
    window.location.href = "profesional-login.html";
    return false;
  }

  profesionalId = sessionStorage.getItem("profesionalId");
  profesionalNombre = sessionStorage.getItem("profesionalNombre");
  profesionalEmail = sessionStorage.getItem("profesionalEmail");
  const especialidad = sessionStorage.getItem("profesionalEspecialidad");

  // Mostrar info del profesional
  if ($("profesionalNombre")) $("profesionalNombre").textContent = profesionalNombre;
  if ($("profesionalEspecialidad"))
    $("profesionalEspecialidad").textContent = especialidad || "—";
  if ($("profesionalEmail")) $("profesionalEmail").textContent = profesionalEmail;
  if ($("welcomeTitle"))
    $("welcomeTitle").textContent = `Bienvenido/a, ${profesionalNombre}`;

  return true;
}

window.handleLogout = function () {
  if (confirm("¿Desea cerrar la sesión?")) {
    sessionStorage.removeItem("profesionalLoggedIn");
    sessionStorage.removeItem("profesionalId");
    sessionStorage.removeItem("profesionalNombre");
    sessionStorage.removeItem("profesionalEmail");
    sessionStorage.removeItem("profesionalEspecialidad");
    alert("Sesión cerrada exitosamente");
    window.location.href = "../index.html";
  }
};

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

function formatFechaHora(value) {
  if (!value) return "—";

  if (value.toDate) {
    const d = value.toDate();
    return d.toLocaleDateString("es-AR") + " " + d.toLocaleTimeString("es-AR");
  }

  if (typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d))
      return d.toLocaleDateString("es-AR") + " " + d.toLocaleTimeString("es-AR");
  }

  return "—";
}

/* ===================== CARGAR CASOS ===================== */

async function cargarCasos() {
  casos = [];
  const container = $("casosContainer");

  if (container) {
    container.innerHTML =
      '<p style="text-align: center; color: #999;">Cargando casos...</p>';
  }

  try {
    // Buscar solo las consultas asignadas a este profesional
    const q = query(
      collection(db, "consultas"),
      where("profesionalAsignado", "==", profesionalId)
    );

    const snap = await getDocs(q);
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
        descripcion: d.descripcion || "",
        tipo: d.tipo || "",
        prioridad: d.prioridad || "",
        estado: d.estado || "pendiente",
        historicoEstados: d.historicoEstados || [],
        observaciones: d.observaciones || [],
        firmaDigital: d.firmaDigital || null,
      };

      obj.searchText = (
        obj.personaNombre +
        " " +
        (obj.personaDni || "") +
        " " +
        obj.motivo
      )
        .toLowerCase()
        .trim();

      lista.push(obj);
    });

    casos = lista;
    casosFiltrados = [...casos];

    renderStats();
    aplicarFiltros();
  } catch (err) {
    console.error("Error cargando casos:", err);
    if (container) {
      container.innerHTML =
        '<p style="text-align: center; color: #e74c3c;">❌ Error al cargar casos</p>';
    }
  }
}

window.cargarCasos = cargarCasos;

/* ===================== STATS ===================== */

function renderStats() {
  const total = casos.length;
  const pendientes = casos.filter((c) => c.estado === "pendiente").length;
  const enProceso = casos.filter((c) => c.estado === "en_proceso").length;
  const resueltos = casos.filter((c) => c.estado === "resuelto").length;

  if ($("totalCasos")) $("totalCasos").textContent = total;
  if ($("casosPendientes")) $("casosPendientes").textContent = pendientes;
  if ($("casosEnProceso")) $("casosEnProceso").textContent = enProceso;
  if ($("casosResueltos")) $("casosResueltos").textContent = resueltos;
}

/* ===================== FILTROS ===================== */

function aplicarFiltros() {
  const search = ($("searchInput")?.value || "").toLowerCase().trim();
  const filtroEstado = $("filterEstado")?.value || "";
  const filtroPrioridad = $("filterPrioridad")?.value || "";

  casosFiltrados = casos.filter((c) => {
    if (search && !c.searchText.includes(search)) return false;
    if (filtroEstado && c.estado !== filtroEstado) return false;
    if (filtroPrioridad && c.prioridad !== filtroPrioridad) return false;
    return true;
  });

  renderCasos();
}

/* ===================== RENDER CASOS ===================== */

function renderCasos() {
  const container = $("casosContainer");
  const resultCount = $("resultCount");

  if (!container) return;

  if (!casosFiltrados.length) {
    container.innerHTML =
      '<p style="text-align: center; color: #999;">No se encontraron casos con los filtros actuales.</p>';
    if (resultCount) resultCount.textContent = "0 resultados";
    return;
  }

  container.innerHTML = casosFiltrados
    .sort((a, b) => {
      const ad = a.fecha && a.fecha.toDate ? a.fecha.toDate() : null;
      const bd = b.fecha && b.fecha.toDate ? b.fecha.toDate() : null;
      if (ad && bd) return bd - ad;
      return (b.numeroConsulta || 0) - (a.numeroConsulta || 0);
    })
    .map((c) => {
      const estadoLabel = c.estado || "pendiente";
      const prioridadLabel = (c.prioridad || "").toUpperCase();

      let estadoColor = "background:#fff3cd;color:#856404;";
      if (estadoLabel === "en_proceso")
        estadoColor = "background:#cfe2ff;color:#084298;";
      if (estadoLabel === "notificado")
        estadoColor = "background:#e2e3e5;color:#41464b;";
      if (estadoLabel === "resuelto")
        estadoColor = "background:#d1e7dd;color:#0f5132;";

      let prioridadColor = "background:#e2e3e5;color:#41464b;";
      if (c.prioridad === "baja")
        prioridadColor = "background:#d1e7dd;color:#0f5132;";
      if (c.prioridad === "media")
        prioridadColor = "background:#cff4fc;color:#055160;";
      if (c.prioridad === "alta")
        prioridadColor = "background:#fff3cd;color:#856404;";
      if (c.prioridad === "urgente")
        prioridadColor = "background:#f8d7da;color:#842029;";

      const tipoLabel = c.tipo === "derivacion" ? "Derivación" : "Espontánea";

      // Firma digital
      let firmaHTML = "";
      if (c.firmaDigital && c.firmaDigital.profesional) {
        firmaHTML = `
          <div class="firma-badge">
            <strong>🖊️ FIRMADO DIGITALMENTE</strong>
            Por: ${c.firmaDigital.profesional}<br>
            Fecha: ${formatFechaHora(c.firmaDigital.timestamp)}<br>
            Hash: <code style="font-size: 11px;">${String(c.firmaDigital.hash || "").substring(0, 16)}...</code>
          </div>
        `;
      } else if (c.estado === "resuelto") {
        firmaHTML = `
          <div class="sin-firma">
            ⚠️ Caso resuelto sin firma digital
          </div>
        `;
      }

      // Botones de acción
      let actionButtons = "";

      if (c.estado === "resuelto" && c.firmaDigital) {
        actionButtons = `
          <button class="btn btn-success" onclick="exportarPDFCertificado('${c.id}')" style="background: #27ae60;">
            📄 Exportar PDF Certificado
          </button>
        `;
      } else if (c.estado === "resuelto" && !c.firmaDigital) {
        actionButtons = `
          <button class="btn btn-primary" onclick="abrirModalFirma('${c.id}')">
            🖊️ Firmar Digitalmente
          </button>
        `;
      } else if (c.estado !== "resuelto") {
        actionButtons = `
          <button class="btn btn-primary" onclick="cambiarEstado('${c.id}', 'en_proceso')">
            ▶️ Tomar Caso
          </button>
          <button class="btn btn-success" onclick="cambiarEstado('${c.id}', 'resuelto')">
            ✅ Marcar Resuelto
          </button>
        `;
      }

      return `
        <div class="caso-card">
          <div class="caso-header">
            <div>
              <h3 style="margin: 0; color: #2c3e50;">
                ${c.personaNombre || "Sin nombre"}
                ${c.numeroConsulta ? ` - #${c.numeroConsulta}` : ""}
              </h3>
              <p style="margin: 5px 0; color: #7f8c8d; font-size: 14px;">
                DNI: ${c.personaDni || "—"} | Fecha: ${c.fechaLabel}
              </p>
            </div>
            <div style="text-align: right;">
              <span style="padding:6px 12px;border-radius:12px;font-size:13px;${estadoColor}">
                ${estadoLabel}
              </span>
            </div>
          </div>

          <div class="caso-info">
            <p><strong>Motivo:</strong> ${c.motivo || "—"}</p>
            <p><strong>Tipo:</strong> ${tipoLabel}</p>
            <p><strong>Prioridad:</strong>
              <span style="padding:4px 8px;border-radius:8px;font-size:12px;${prioridadColor}">
                ${prioridadLabel}
              </span>
            </p>
            ${c.descripcion ? `<p><strong>Descripción:</strong> ${c.descripcion}</p>` : ""}
            ${c.observaciones.length > 0 ? `<p><strong>Observaciones:</strong> ${c.observaciones.length}</p>` : ""}
          </div>

          ${firmaHTML}

          <div class="caso-actions">
            ${actionButtons}
          </div>
        </div>
      `;
    })
    .join("");

  if (resultCount) {
    resultCount.textContent = `${casosFiltrados.length} resultado${
      casosFiltrados.length !== 1 ? "s" : ""
    }`;
  }
}

/* ===================== CAMBIAR ESTADO ===================== */

async function cambiarEstado(casoId, nuevoEstado) {
  const caso = casos.find((c) => c.id === casoId);
  if (!caso) return;

  // 🔒 PROTECCIÓN: No permitir cambiar estado de casos firmados
  if (
    caso.firmaDigital &&
    caso.firmaDigital.profesional &&
    caso.estado === "resuelto" &&
    nuevoEstado !== "resuelto"
  ) {
    alert(
      "🔒 CASO FIRMADO DIGITALMENTE\n\n" +
        "Este caso ha sido firmado digitalmente y no se puede modificar su estado.\n\n" +
        "La firma digital garantiza la inmutabilidad del caso resuelto."
    );
    return;
  }

  const confirmMsg =
    nuevoEstado === "resuelto"
      ? "¿Está seguro de marcar este caso como RESUELTO?\n\nPodrá firmarlo digitalmente después."
      : `¿Cambiar estado a "${nuevoEstado}"?`;

  if (!confirm(confirmMsg)) return;

  try {
    const ahora = new Date().toISOString();

    const nuevosHistoricos = [
      ...(caso.historicoEstados || []),
      {
        estado: nuevoEstado,
        fecha: ahora,
        usuario: profesionalNombre,
        profesionalId: profesionalId,
      },
    ];

    const ref = doc(db, "consultas", casoId);
    await updateDoc(ref, {
      estado: nuevoEstado,
      historicoEstados: nuevosHistoricos,
      updatedAt: serverTimestamp(),
    });

    caso.estado = nuevoEstado;
    caso.historicoEstados = nuevosHistoricos;

    renderStats();
    aplicarFiltros();

    if (nuevoEstado === "resuelto") {
      setTimeout(() => {
        if (
          confirm(
            "✅ Caso marcado como resuelto.\n\n¿Desea firmarlo digitalmente ahora?"
          )
        ) {
          abrirModalFirma(casoId);
        }
      }, 500);
    }
  } catch (err) {
    console.error("Error cambiando estado:", err);
    alert("Error al cambiar el estado del caso.");
  }
}

window.cambiarEstado = cambiarEstado;

/* ===================== FIRMA DIGITAL ===================== */

function abrirModalFirma(casoId) {
  const caso = casos.find((c) => c.id === casoId);
  if (!caso) return;

  if (caso.estado !== "resuelto") {
    alert("⚠️ Solo puede firmar casos con estado RESUELTO.");
    return;
  }

  if (caso.firmaDigital && caso.firmaDigital.profesional) {
    alert("ℹ️ Este caso ya ha sido firmado digitalmente.");
    return;
  }

  casoParaFirmar = caso;

  if ($("firmaPersona")) $("firmaPersona").textContent = caso.personaNombre;
  if ($("firmaMotivo")) $("firmaMotivo").textContent = caso.motivo;
  if ($("firmaEstado")) $("firmaEstado").textContent = caso.estado.toUpperCase();
  if ($("firmaPassword")) $("firmaPassword").value = "";
  if ($("firmaObservacion")) $("firmaObservacion").value = "";

  const modal = $("firmaModal");
  if (modal) modal.style.display = "flex";
}

window.abrirModalFirma = abrirModalFirma;

function cerrarModalFirma() {
  const modal = $("firmaModal");
  if (modal) modal.style.display = "none";
  casoParaFirmar = null;
}

window.cerrarModalFirma = cerrarModalFirma;

async function confirmarFirma() {
  if (!casoParaFirmar) return;

  const password = $("firmaPassword")?.value || "";
  const observacion = $("firmaObservacion")?.value.trim() || "";

  if (!password) {
    alert("❌ Debe ingresar su contraseña para confirmar la firma.");
    $("firmaPassword").focus();
    return;
  }

  // Verificar contraseña contra Firebase
  try {
    const emailBusqueda = (profesionalEmail || "").toLowerCase().trim();

    const q = query(collection(db, "professionals"), where("email", "==", emailBusqueda));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      alert("❌ Error: No se pudo verificar su identidad.");
      return;
    }

    let passwordCorrecta = false;
    snapshot.forEach((docu) => {
      const data = docu.data();
      if (data.password === password) passwordCorrecta = true;
    });

    if (!passwordCorrecta) {
      alert("❌ Contraseña incorrecta. No se puede firmar.");
      $("firmaPassword").value = "";
      $("firmaPassword").focus();
      return;
    }

    // Contraseña correcta, proceder con la firma
    const timestamp = new Date();
    const timestampISO = timestamp.toISOString();

    // ✅ FIX DEFINITIVO: hashData con entropía real (evita repetidos)
    const hashData = [
      profesionalId,
      casoParaFirmar.id,
      timestampISO,
      crypto.randomUUID(),
      navigator.userAgent,
    ].join("|");

    const hash = await generarHash(hashData);

    const firmaDigital = {
      profesional: profesionalNombre,
      profesionalId: profesionalId,
      profesionalEmail: profesionalEmail,
      timestamp: timestampISO,
      hash: hash,
      verificado: true,
      ipAddress: await obtenerIP(),
      userAgent: navigator.userAgent,
    };

    // Agregar observación si existe
    const nuevasObs = [...(casoParaFirmar.observaciones || [])];
    if (observacion) {
      nuevasObs.push({
        fecha: timestampISO,
        usuario: profesionalNombre,
        nota: `[FIRMA DIGITAL] ${observacion}`,
      });
    }

    const ref = doc(db, "consultas", casoParaFirmar.id);
    await updateDoc(ref, {
      firmaDigital: firmaDigital,
      observaciones: nuevasObs,
      updatedAt: serverTimestamp(),
    });

    // Actualizar contadores del profesional en Firebase
    const profRef = doc(db, "professionals", profesionalId);
    await updateDoc(profRef, {
      casosActivos: increment(-1),
      casosResueltos: increment(1),
    });

    casoParaFirmar.firmaDigital = firmaDigital;
    casoParaFirmar.observaciones = nuevasObs;

    cerrarModalFirma();
    aplicarFiltros();

    alert(
      `✅ CASO FIRMADO DIGITALMENTE\n\n` +
        `Profesional: ${profesionalNombre}\n` +
        `Fecha: ${timestamp.toLocaleString("es-AR")}\n` +
        `Hash: ${hash.substring(0, 16)}...\n\n` +
        `La firma ha sido registrada permanentemente.`
    );
  } catch (err) {
    console.error("Error al firmar:", err);
    alert("❌ Error al firmar digitalmente el caso.");
  }
}

window.confirmarFirma = confirmarFirma;

/* ===================== UTILIDADES ===================== */

async function generarHash(data) {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

async function obtenerIP() {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();
    return data.ip;
  } catch {
    return "unknown";
  }
}

/* ===================== INIT ===================== */

document.addEventListener("DOMContentLoaded", () => {
  if (!checkAuth()) return;

  const searchInput = $("searchInput");
  const filterEstado = $("filterEstado");
  const filterPrioridad = $("filterPrioridad");

  if (searchInput) searchInput.addEventListener("input", aplicarFiltros);
  if (filterEstado) filterEstado.addEventListener("change", aplicarFiltros);
  if (filterPrioridad) filterPrioridad.addEventListener("change", aplicarFiltros);

  cargarCasos();
});
