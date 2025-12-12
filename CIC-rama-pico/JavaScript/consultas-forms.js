// JavaScript/consultas-form.js
import { db } from "./firebase.js";

import {
  collection,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
  query,
  orderBy,
  increment,
  updateDoc,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

let statusEl = null;
let personasCache = [];
let profesionalesCache = [];
let ultimaConsultaCreada = null;

/* ============================================================
   UTILIDADES
   ============================================================ */

function getStatusEl() {
  if (!statusEl) statusEl = $("status");
  return statusEl;
}

function showStatus(message, type = "info") {
  const el = getStatusEl();
  if (!el) {
    console.log("[STATUS]", type.toUpperCase(), message);
    return;
  }

  el.className = "hint";
  if (type === "error") el.className += " err";
  if (type === "ok") el.className += " ok";

  el.innerHTML = message;
}

function prioridadEmoji(prioridad) {
  const map = {
    urgente: "🚨",
    alta: "⚠️",
    media: "ℹ️",
    baja: "📋",
  };
  return map[prioridad] || "📋";
}

function limpiarTelefono(tel) {
  if (!tel) return "";
  return String(tel).replace(/\D/g, "");
}

/* ============================================================
   CARGAR PERSONAS DESDE FIRESTORE
   ============================================================ */

async function loadPersonas() {
  const select = $("personId");
  if (!select) return;

  select.innerHTML = `<option value="">Cargando personas...</option>`;

  try {
    const q = query(collection(db, "persons"), orderBy("apellido"));
    const snap = await getDocs(q);

    personasCache = [];
    select.innerHTML = `<option value="">— Seleccione una persona —</option>`;

    snap.forEach((d) => {
      const p = d.data();
      const obj = {
        docId: d.id,
        personId: p.personId || d.id,
        nombre: p.nombre || "",
        apellido: p.apellido || "",
        dni: p.dni || "",
        edad: p.edad ?? null,
        householdId: p.householdId || "",
        grupoFamiliar: p.grupoFamiliar || "",
      };

      personasCache.push(obj);

      const opt = document.createElement("option");
      opt.value = obj.docId;
      opt.textContent = `${obj.apellido}, ${obj.nombre} - DNI ${obj.dni || "—"}`;
      opt.dataset.nombre = `${obj.nombre} ${obj.apellido}`.trim();
      opt.dataset.dni = obj.dni || "";
      opt.dataset.edad = obj.edad != null ? obj.edad : "";
      opt.dataset.personId = obj.personId;
      opt.dataset.householdId = obj.householdId;
      opt.dataset.grupoFamiliar = obj.grupoFamiliar;

      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Error cargando personas:", err);
    select.innerHTML = `<option value="">Error al cargar personas</option>`;
  }
}

/* ============================================================
   MOSTRAR INFO DE PERSONA SELECCIONADA
   ============================================================ */

function showPersonInfo() {
  const select = $("personId");
  const infoBox = $("personInfo");
  const details = $("personDetails");

  if (!select || !infoBox || !details) return;

  if (!select.value) {
    infoBox.style.display = "none";
    details.innerHTML = "";
    return;
  }

  const opt = select.options[select.selectedIndex];

  const nombre = opt.dataset.nombre || "";
  const dni = opt.dataset.dni || "";
  const edad = opt.dataset.edad || "";
  const grupoFamiliar =
    opt.dataset.grupoFamiliar || opt.dataset.householdId || "—";

  details.innerHTML = `
    <div><strong>Nombre:</strong> ${nombre}</div>
    <div><strong>DNI:</strong> ${dni || "—"}</div>
    <div><strong>Edad:</strong> ${edad ? edad + " años" : "—"}</div>
    <div><strong>Grupo Familiar:</strong> ${grupoFamiliar}</div>
  `;

  infoBox.style.display = "block";
}

/* ============================================================
   CARGAR PROFESIONALES ACTIVOS
   ============================================================ */

async function loadProfesionales() {
  const select = $("profesionalAsignado");
  if (!select) return;

  select.innerHTML = `<option value="">Cargando profesionales...</option>`;

  try {
    const snap = await getDocs(collection(db, "professionals"));
    profesionalesCache = [];

    const activos = [];
    snap.forEach((d) => {
      const p = d.data();
      const obj = {
        id: d.id,
        nombre: p.nombre || "",
        apellido: p.apellido || "",
        especialidad: p.especialidad || "",
        telefono: p.telefono || "",
        activo: p.activo !== false,
      };
      profesionalesCache.push(obj);
      if (obj.activo) activos.push(obj);
    });

    select.innerHTML = `<option value="">— Sin asignar —</option>`;

    activos.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.nombre} ${p.apellido} - ${p.especialidad}`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Error cargando profesionales:", err);
    select.innerHTML = `<option value="">Error al cargar profesionales</option>`;
  }
}

/* ============================================================
   MOSTRAR / OCULTAR CAMPOS DINÁMICOS
   ============================================================ */

function toggleDerivadoPor() {
  const tipoEl = $("tipo");
  const container = $("derivadoPorContainer");
  const input = $("derivadoPor");

  if (!tipoEl || !container || !input) return;

  const tipo = tipoEl.value;

  if (tipo === "derivacion") {
    container.style.display = "block";
    input.required = true;
  } else {
    container.style.display = "none";
    input.required = false;
    input.value = "";
  }
}

function toggleOtroMotivo() {
  const motivoEl = $("motivo");
  const container = $("otroMotivoContainer");
  const input = $("otroMotivo");

  if (!motivoEl || !container || !input) return;

  const motivo = motivoEl.value;

  if (motivo === "Otro") {
    container.style.display = "block";
    input.required = true;
  } else {
    container.style.display = "none";
    input.required = false;
    input.value = "";
  }
}

/* ============================================================
   VALIDAR FORMULARIO
   ============================================================ */

function validateForm() {
  const personId = $("personId")?.value;
  const tipo = $("tipo")?.value;
  const derivadoPor = $("derivadoPor")?.value.trim();
  const motivo = $("motivo")?.value;
  const otroMotivo = $("otroMotivo")?.value.trim();
  const descripcion = $("descripcion")?.value.trim();

  if (!personId) {
    showStatus("❌ Debe seleccionar una persona", "error");
    $("personId")?.focus();
    return false;
  }

  if (!tipo) {
    showStatus("❌ Debe seleccionar el tipo de consulta", "error");
    $("tipo")?.focus();
    return false;
  }

  if (tipo === "derivacion" && !derivadoPor) {
    showStatus("❌ Debe indicar quién deriva la consulta", "error");
    $("derivadoPor")?.focus();
    return false;
  }

  if (!motivo) {
    showStatus("❌ Debe seleccionar el motivo", "error");
    $("motivo")?.focus();
    return false;
  }

  if (motivo === "Otro" && !otroMotivo) {
    showStatus("❌ Debe especificar el motivo", "error");
    $("otroMotivo")?.focus();
    return false;
  }

  if (!descripcion) {
    showStatus("❌ Debe agregar una descripción", "error");
    $("descripcion")?.focus();
    return false;
  }

  if (descripcion.length < 20) {
    showStatus(
      "❌ La descripción debe tener al menos 20 caracteres",
      "error"
    );
    $("descripcion")?.focus();
    return false;
  }

  return true;
}

/* ============================================================
   CONSTRUIR PAYLOAD PARA FIRESTORE
   ============================================================ */

function buildConsultaPayload() {
  const selectPersona = $("personId");
  const personDocId = selectPersona.value;
  const opt = selectPersona.options[selectPersona.selectedIndex];

  const personaNombre = opt.dataset.nombre || "";
  const personaDni = opt.dataset.dni || "";
  const personaEdad = opt.dataset.edad || "";
  const personId = opt.dataset.personId || personDocId;
  const householdId = opt.dataset.householdId || "";
  const grupoFamiliar = opt.dataset.grupoFamiliar || "";

  let motivoFinal = $("motivo").value;
  if (motivoFinal === "Otro") {
    motivoFinal = $("otroMotivo").value.trim();
  }

  const profesionalAsignado = $("profesionalAsignado")?.value || "";
  const prioridad = $("prioridad")?.value;
  const tipo = $("tipo")?.value;

  const payload = {
    personDocId,
    personId,
    personaNombre,
    personaDni,
    personaEdad,
    householdId,
    grupoFamiliar,

    tipo,
    derivadoPor: $("derivadoPor")?.value.trim(),
    prioridad,
    motivo: motivoFinal,
    descripcion: $("descripcion")?.value.trim(),

    profesionalAsignado,
    profesionalNombre: "",
    estado: "pendiente",

    acciones: [],

    historicoEstados: [
      {
        estado: "pendiente",
        fecha: new Date().toISOString(),
        usuario: sessionStorage.getItem("currentUser") || "sistema",
      },
    ],

    observaciones: [],
  };

  if (profesionalAsignado) {
    const prof = profesionalesCache.find((p) => p.id === profesionalAsignado);
    if (prof) {
      payload.profesionalNombre = `${prof.nombre} ${prof.apellido}`.trim();
    }
  }

  const obsInicial = $("observacionInicial")?.value.trim();
  if (obsInicial) {
    payload.observaciones.push({
      fecha: new Date().toISOString(),
      usuario: sessionStorage.getItem("currentUser") || "sistema",
      nota: obsInicial,
    });
  }

  return payload;
}

/* ============================================================
   GENERAR NÚMERO DE CONSULTA (COUNTER EN "systems/consultas")
   ============================================================ */

async function getNextConsultaNumber() {
  const counterRef = doc(db, "systems", "consultas"); // ajustá nombres si tu doc es otro

  const nextNumber = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(counterRef);

    if (!snap.exists()) {
      transaction.set(counterRef, { lastNumber: 1 });
      return 1;
    } else {
      const data = snap.data() || {};
      const last = data.lastNumber || 0;
      const next = last + 1;
      transaction.update(counterRef, { lastNumber: next });
      return next;
    }
  });

  return nextNumber;
}

/* ============================================================
   GUARDAR CONSULTA EN FIRESTORE
   ============================================================ */

async function saveConsulta(payload) {
  // 1) obtener número correlativo
  const numeroConsulta = await getNextConsultaNumber();

  // si querés con ceros a la izquierda, descomentá esta línea:
  // const consultaId = String(numeroConsulta).padStart(6, "0");
  // si la querés "cruda", solo número:
  const consultaId = String(numeroConsulta);

  // 2) guardar documento en 'consultas' con ese ID
  const consultaRef = doc(db, "consultas", consultaId);

  await setDoc(consultaRef, {
    ...payload,
    numeroConsulta,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 3) si tiene profesional asignado, incrementar casos activos
  if (payload.profesionalAsignado) {
    try {
      const profRef = doc(db, "professionals", payload.profesionalAsignado);
      await updateDoc(profRef, {
        casosActivos: increment(1),
      });
    } catch (err) {
      console.warn(
        "No se pudo actualizar contador de casos del profesional:",
        err
      );
    }
  }

  return {
    id: consultaId,
    numeroConsulta,
    ...payload,
  };
}

/* ============================================================
   WHATSAPP: MODAL DE CONFIRMACIÓN + ENVÍO
   ============================================================ */

function notificarPorWhatsApp(consulta, profesional) {
  const tel = limpiarTelefono(profesional.telefono);
  if (!tel) {
    alert("El profesional no tiene teléfono configurado.");
    return;
  }

  const emoji = prioridadEmoji(consulta.prioridad);

  const mensaje = `${emoji} *Nuevo Caso Asignado - CIC Pavón Arriba*

*Paciente:* ${consulta.personaNombre}
*DNI:* ${consulta.personaDni || "N/A"}
*Motivo:* ${consulta.motivo}
*Prioridad:* ${consulta.prioridad.toUpperCase()}
*Tipo:* ${
    consulta.tipo === "derivacion"
      ? "Derivación Institucional"
      : "Demanda Espontánea"
  }
${consulta.derivadoPor ? `*Derivado por:* ${consulta.derivadoPor}` : ""}

*Descripción:*
${consulta.descripcion}

*Fecha de asignación:* ${new Date().toLocaleDateString("es-AR")}

Por favor confirmar recepción.

_Mensaje automático del Sistema CIC_`;

  const encoded = encodeURIComponent(mensaje);
  const url = `https://api.whatsapp.com/send?phone=54${tel}&text=${encoded}`;

  window.open(url, "_blank");
}

function mostrarConfirmacionWhatsApp(consulta) {
  const profesional = profesionalesCache.find(
    (p) => p.id === consulta.profesionalAsignado
  );

  if (!profesional || !profesional.telefono) {
    setTimeout(() => {
      window.location.href = "consultas.html";
    }, 1200);
    return;
  }

  const modal = document.createElement("div");
  modal.id = "whatsappModal";
  modal.style.cssText = `
    display:flex;position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center;
  `;

  modal.innerHTML = `
    <div style="background:#fff;padding:30px;border-radius:10px;max-width:500px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,.3);">
      <h2 style="color:#25D366;margin-bottom:20px;text-align:center;">✅ Consulta Registrada</h2>
      <div style="background:#f0f8ff;padding:15px;border-radius:8px;margin:20px 0;">
        <p style="margin:0;font-size:14px;"><strong>Profesional asignado:</strong></p>
        <p style="margin:5px 0 0 0;font-size:16px;">${profesional.nombre} ${profesional.apellido}</p>
        <p style="margin:5px 0 0 0;font-size:14px;color:#666;">📱 ${profesional.telefono}</p>
      </div>
      <div style="background:#fff3cd;padding:15px;border-radius:8px;margin:20px 0;">
        <p style="margin:0;font-size:14px;color:#856404;">
          <strong>💡 Sugerencia:</strong> Notifique al profesional por WhatsApp para una respuesta más rápida.
        </p>
      </div>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:20px;">
        <button id="btnMasTarde" style="background:#6c757d;color:white;padding:12px 24px;border:none;border-radius:6px;cursor:pointer;font-size:14px;">
          Más tarde
        </button>
        <button id="btnEnviarWA" style="background:#25D366;color:white;padding:12px 24px;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:bold;">
          📱 Enviar WhatsApp
        </button>
      </div>
      <p style="text-align:center;margin-top:15px;font-size:12px;color:#666;">
        Se abrirá WhatsApp Web con el mensaje pre-cargado.
      </p>
    </div>
  `;

  document.body.appendChild(modal);
  ultimaConsultaCreada = { consulta, profesional };

  document.getElementById("btnMasTarde").onclick = () => {
    cerrarModalWhatsApp();
    window.location.href = "consultas.html";
  };

  document.getElementById("btnEnviarWA").onclick = () => {
    if (ultimaConsultaCreada) {
      notificarPorWhatsApp(
        ultimaConsultaCreada.consulta,
        ultimaConsultaCreada.profesional
      );
    }
    setTimeout(() => {
      cerrarModalWhatsApp();
      window.location.href = "consultas.html";
    }, 500);
  };
}

function cerrarModalWhatsApp() {
  const modal = document.getElementById("whatsappModal");
  if (modal) modal.remove();
}

window.cerrarModalWhatsApp = cerrarModalWhatsApp;

/* ============================================================
   SUBMIT DEL FORMULARIO
   ============================================================ */

async function onSubmitConsulta(e) {
  e.preventDefault();

  if (!validateForm()) return;

  showStatus("Guardando consulta...", "info");

  try {
    const payload = buildConsultaPayload();
    const consultaGuardada = await saveConsulta(payload);

    showStatus(
      `<span class="ok">✅ Consulta registrada correctamente. Nº ${consultaGuardada.numeroConsulta}</span>`,
      "ok"
    );

    if (payload.profesionalAsignado) {
      setTimeout(() => {
        mostrarConfirmacionWhatsApp(consultaGuardada);
      }, 800);
    } else {
      setTimeout(() => {
        window.location.href = "consultas.html";
      }, 1200);
    }
  } catch (err) {
    console.error("Error al guardar consulta:", err);
    showStatus("❌ Error al guardar la consulta.", "error");
  }
}

/* ============================================================
   INIT
   ============================================================ */

document.addEventListener("DOMContentLoaded", async () => {
  statusEl = $("status") || null;

  try {
    await Promise.all([loadPersonas(), loadProfesionales()]);
  } catch (e) {
    console.error("Error en carga inicial:", e);
  }

  const personSelect = $("personId");
  if (personSelect) {
    personSelect.addEventListener("change", showPersonInfo);
  }

  const tipoSelect = $("tipo");
  if (tipoSelect) {
    tipoSelect.addEventListener("change", toggleDerivadoPor);
  }

  const motivoSelect = $("motivo");
  if (motivoSelect) {
    motivoSelect.addEventListener("change", toggleOtroMotivo);
  }

  const form = $("consultaForm");
  if (form) {
    form.addEventListener("submit", onSubmitConsulta);
  }
});
