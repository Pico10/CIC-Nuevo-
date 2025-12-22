// JavaScript/app.js
import { db } from "./firebase.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  query,
  where,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

// ===================== HELPERS GENERALES =====================

const $ = (id) => document.getElementById(id);

function setStatus(msg, color = "#333") {
  const el = $("status");
  if (!el) return;
  el.innerHTML = msg;
  el.style.color = color;
}

function focusAndStatus(id, msg) {
  setStatus(`<span class="err">❌ ${msg}</span>`, "red");
  const el = $(id);
  if (el && typeof el.focus === "function") el.focus();
}

function soloDigitos(str) {
  return (str || "").replace(/\D/g, "");
}

function pad8Dni(dni) {
  const d = soloDigitos(dni);
  return d.padStart(8, "0");
}

// Edad desde fecha AAAA-MM-DD
const edadFrom = (yyyyMmDd) => {
  if (!yyyyMmDd) return null;
  const fn = new Date(yyyyMmDd);
  const h = new Date();
  let e = h.getFullYear() - fn.getFullYear();
  const m = h.getMonth() - fn.getMonth();
  if (m < 0 || (m === 0 && h.getDate() < fn.getDate())) e--;
  return e;
};

// Validar formato CUIT (XX-XXXXXXXX-X)
function validarCUIT(cuit) {
  if (!cuit) return false; // ahora lo hacemos obligatorio
  const regex = /^\d{2}-\d{8}-\d{1}$/;
  return regex.test(cuit);
}

// Verifica que el DNI coincida con los 8 dígitos del medio del CUIT
function validarDniContraCuit(dni, cuit) {
  const dni8 = pad8Dni(dni);
  const cuitDigits = soloDigitos(cuit);
  if (cuitDigits.length !== 11) return false;
  const medio8 = cuitDigits.slice(2, 10);
  return medio8 === dni8;
}

// Formatear CUIT mientras se escribe
function formatearCUIT(value) {
  let v = value.replace(/\D/g, ""); // solo números
  // XX-XXXXXXXX-X
  if (v.length > 2) {
    v = v.slice(0, 2) + "-" + v.slice(2);
  }
  if (v.length > 11) {
    v = v.slice(0, 11) + "-" + v.slice(11, 12);
  }
  return v;
}

// Genera ID de persona: primera letra nombre + primera letra apellido + DNI
function generarPersonaId(nombre, apellido, dni) {
  const n = (nombre || "").trim();
  const a = (apellido || "").trim();
  const d = soloDigitos(dni);

  const inicialNombre = n[0] || "";
  const inicialApellido = a[0] || "";

  return (inicialNombre + inicialApellido + d).toUpperCase();
}

// Normalizar texto para usar en ID
function slugify(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // tildes
    .replace(/[^a-zA-Z0-9]/g, "") // todo lo que no es letra/numero
    .toUpperCase()
    .slice(0, 15); // limitar largo
}

// ===================== VALIDACIONES OBLIGATORIAS =====================

function validarObligatoriosPersona() {
  const nombre = $("nombre")?.value.trim() || "";
  const apellido = $("apellido")?.value.trim() || "";
  const dni = soloDigitos($("dni")?.value || "");
  const cuit = $("cuit")?.value.trim() || "";
  const fechaNacimiento = $("fechaNacimiento")?.value || "";
  const sexo = $("sexo")?.value || "";
  const ocupacion = $("ocupacion")?.value || "";
  const estadoCivil = $("estadoCivil")?.value || "";

  if (!nombre) return { ok: false, id: "nombre", msg: "El nombre es obligatorio." };
  if (!apellido) return { ok: false, id: "apellido", msg: "El apellido es obligatorio." };

  if (!dni) return { ok: false, id: "dni", msg: "El DNI es obligatorio." };
  if (dni.length < 7 || dni.length > 8)
    return { ok: false, id: "dni", msg: "El DNI debe tener 7 u 8 dígitos." };

  if (!cuit) return { ok: false, id: "cuit", msg: "El CUIT/CUIL es obligatorio." };
  if (!validarCUIT(cuit))
    return {
      ok: false,
      id: "cuit",
      msg: "El formato del CUIT es incorrecto. Use: XX-XXXXXXXX-X",
    };

  if (!validarDniContraCuit(dni, cuit))
    return {
      ok: false,
      id: "cuit",
      msg: "El DNI no coincide con el CUIT (los 8 del medio deben ser el DNI).",
    };

  if (!fechaNacimiento)
    return { ok: false, id: "fechaNacimiento", msg: "La fecha de nacimiento es obligatoria." };

  if (!sexo) return { ok: false, id: "sexo", msg: "El sexo es obligatorio." };
  if (!ocupacion) return { ok: false, id: "ocupacion", msg: "La ocupación es obligatoria." };
  if (!estadoCivil) return { ok: false, id: "estadoCivil", msg: "El estado civil es obligatorio." };

  return { ok: true };
}

function validarObligatoriosHouseholdSiNuevo() {
  const familiaExistente = $("familiaExistente")?.value || "";
  if (familiaExistente) return { ok: true }; // si eligió existente, no exigimos campos del nuevo

  const grupoFamiliar = $("grupoFamiliar")?.value.trim() || "";
  const vivienda = $("vivienda")?.value || "";
  const calle = $("calle")?.value.trim() || "";
  const numero = $("numero")?.value.trim() || "";
  const barrio = $("barrio")?.value.trim() || "";

  // Campos obligatorios solicitados
  if (!grupoFamiliar)
    return { ok: false, id: "grupoFamiliar", msg: "El nombre del grupo familiar es obligatorio." };
  if (!vivienda) return { ok: false, id: "vivienda", msg: "La vivienda es obligatoria." };
  if (!calle) return { ok: false, id: "calle", msg: "La calle es obligatoria." };
  if (!numero) return { ok: false, id: "numero", msg: "El número es obligatorio." };
  if (!barrio) return { ok: false, id: "barrio", msg: "El barrio es obligatorio." };

  return { ok: true };
}

// ===================== DUPLICADOS =====================

async function existeDniEnPersons(dni) {
  const dniNorm = soloDigitos(dni);
  const q = query(collection(db, "persons"), where("dni", "==", dniNorm), limit(1));
  const snap = await getDocs(q);
  return !snap.empty;
}

// ===================== HOUSEHOLDS =====================

// Cargar familias existentes en el selector
async function cargarFamiliasExistentes() {
  const select = $("familiaExistente");
  if (!select) return;

  select.innerHTML = '<option value="">— Crear nueva familia —</option>';

  try {
    const snap = await getDocs(collection(db, "households"));
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const nombreGrupo = data.nombreGrupo || "(Sin nombre)";
      const barrio = data.barrio || "";
      const ciudad = data.ciudad || "";

      const textoExtra = (barrio ? ` - ${barrio}` : "") + (ciudad ? ` (${ciudad})` : "");

      const opt = document.createElement("option");
      opt.value = docSnap.id; // ID interno Firestore
      opt.textContent = `${nombreGrupo}${textoExtra}`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Error al cargar familias:", err);
    setStatus("Error al cargar grupos familiares", "red");
  }
}

async function rellenarDatosFamilia(householdId) {
  const hhIdInput = $("hhId");
  const grupoFamiliar = $("grupoFamiliar");
  const vivienda = $("vivienda");
  const calle = $("calle");
  const numero = $("numero");
  const barrio = $("barrio");
  const ciudad = $("ciudad");
  const provincia = $("provincia");

  if (!householdId) {
    if (hhIdInput) hhIdInput.value = "";
    if (grupoFamiliar) grupoFamiliar.value = "";
    if (vivienda) vivienda.value = "";
    if (calle) calle.value = "";
    if (numero) numero.value = "";
    if (barrio) barrio.value = "";
    if (ciudad) ciudad.value = "Rosario";
    if (provincia) provincia.value = "Santa Fe";
    return;
  }

  try {
    const docRef = doc(db, "households", householdId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return;

    const data = docSnap.data();

    if (hhIdInput) hhIdInput.value = householdId;
    if (grupoFamiliar) grupoFamiliar.value = data.nombreGrupo || "";
    if (vivienda) vivienda.value = data.vivienda || "";
    if (calle) calle.value = data.calle || "";
    if (numero) numero.value = data.numero || "";
    if (barrio) barrio.value = data.barrio || "";
    if (ciudad) ciudad.value = data.ciudad || "Rosario";
    if (provincia) provincia.value = data.provincia || "Santa Fe";
  } catch (err) {
    console.error("Error al leer household:", err);
  }
}

// Crea o reutiliza household
async function obtenerOCrearHousehold() {
  const selectFamilia = $("familiaExistente");
  const familiaExistente = selectFamilia ? selectFamilia.value : "";

  const grupoFamiliarInput = $("grupoFamiliar")?.value.trim() || "";
  const vivienda = $("vivienda")?.value || "";
  const calle = $("calle")?.value.trim() || "";
  const numero = $("numero")?.value.trim() || "";
  const barrio = $("barrio")?.value.trim() || "";
  const ciudad = $("ciudad")?.value || "";
  const provincia = $("provincia")?.value || "";

  const apellido = $("apellido")?.value.trim() || "";

  // Usa familia existente
  if (familiaExistente) {
    const hhIdInput = $("hhId");
    if (hhIdInput) hhIdInput.value = familiaExistente;
    return {
      householdId: familiaExistente,
      creado: false,
    };
  }

  // ===== Nueva familia (ahora obligatoria con campos mínimos) =====
  // (ya validado antes en submit)
  const nombreGrupo = grupoFamiliarInput;

  // ID custom: 3 primeras letras del apellido + calle + número
  const prefijoApe = (apellido || "FAM").substring(0, 3).toUpperCase();
  const calleSlug = slugify(calle) || "SINCALLE";
  const numPart = numero || "SN";

  const householdId = `${prefijoApe}-${calleSlug}-${numPart}`;

  const docRef = doc(db, "households", householdId);

  // Si ya existe, no lo pisa: solo lo reutiliza
  const existing = await getDoc(docRef);
  if (!existing.exists()) {
    await setDoc(docRef, {
      householdId,
      nombreGrupo,
      vivienda,
      calle,
      numero,
      barrio,
      ciudad,
      provincia,
      createdAt: serverTimestamp(),
    });
  }

  // como acordamos, dejamos visible el hhId en blanco
  const hhIdInput = $("hhId");
  if (hhIdInput) hhIdInput.value = "";

  return {
    householdId,
    creado: !existing.exists(),
  };
}

// ===================== PERSONA =====================

async function guardarPersona(householdId) {
  const relacionHogar = $("relacionHogar")?.value || "";
  const nombre = $("nombre")?.value.trim() || "";
  const apellido = $("apellido")?.value.trim() || "";
  const dni = soloDigitos($("dni")?.value || "");
  const cuit = $("cuit")?.value.trim() || "";
  const fechaNacimiento = $("fechaNacimiento")?.value || "";
  const sexo = $("sexo")?.value || "";
  const email = $("email")?.value.trim() || "";
  const telefono = $("telefono")?.value.trim() || "";
  const ocupacion = $("ocupacion")?.value.trim() || "";
  const estadoCivil = $("estadoCivil")?.value || "";

  const nivelActual = $("nivelActual")?.value || "";
  const institucion = $("institucion")?.value.trim() || "";
  const estadoEdu = $("estadoEdu")?.value || "";
  const anterioresRaw = $("anteriores")?.value || "";

  const tieneDis = $("tieneDis")?.value || "";
  const tipoDis = $("tipoDis")?.value.trim() || "";
  const tratDis = $("tratDis")?.value || "";
  const conCUD = $("conCUD")?.value || "";
  const cudVto = $("cudVto")?.value || "";

  const tieneBen = $("tieneBen")?.value || "";
  const nomBen = $("nomBen")?.value.trim() || "";
  const orgBen = $("orgBen")?.value.trim() || "";
  const estBen = $("estBen")?.value || "";

  const tieneOS = $("tieneOS")?.value || "";
  const nomOS = $("nomOS")?.value.trim() || "";

  // Validación (ya chequeada en submit, pero dejamos por seguridad)
  if (!nombre || !apellido || !dni || !cuit) {
    throw new Error("Nombre, apellido, DNI y CUIT son obligatorios.");
  }
  if (!validarCUIT(cuit)) {
    throw new Error("El formato del CUIT es incorrecto. Use: XX-XXXXXXXX-X");
  }
  if (!validarDniContraCuit(dni, cuit)) {
    throw new Error("El DNI no coincide con el CUIT (los 8 del medio deben ser el DNI).");
  }

  // Bloqueo duplicado por DNI
  const yaExiste = await existeDniEnPersons(dni);
  if (yaExiste) {
    throw new Error("Ese DNI ya está registrado. No se puede duplicar la persona.");
  }

  // Edad y flags
  const edad = edadFrom(fechaNacimiento);
  const flags = {
    esMayor: edad !== null ? edad >= 18 : null,
    hasDisability: tieneDis === "true",
    hasBenefit: tieneBen === "true",
    hasObraSocial: tieneOS === "true",
  };

  // Parsear estudios anteriores: "nivel | institución | estado" por línea
  const estudiosAnteriores = [];
  const prevLines = anterioresRaw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const line of prevLines) {
    const [nivel, inst, estado] = line.split("|").map((s) => (s || "").trim());
    if (nivel || inst || estado) {
      estudiosAnteriores.push({
        nivel: nivel || "",
        institucion: inst || "",
        estado: estado || "",
      });
    }
  }

  const personId = generarPersonaId(nombre, apellido, dni);
  const personaRef = doc(db, "persons", personId);

  // Seguridad extra: no pisar si casualmente existe ese ID
  const existing = await getDoc(personaRef);
  if (existing.exists()) {
    throw new Error(
      `Ya existe una persona con ID ${personId}. (Probable mismo nombre/apellido/DNI).`
    );
  }

  await setDoc(personaRef, {
    personId,
    householdId,
    relacionHogar,
    nombre,
    apellido,
    dni,          // guardamos normalizado
    cuit,
    fechaNacimiento,
    edad,
    sexo,
    email,
    telefono,
    ocupacion,
    estadoCivil,
    nivelActual,
    institucion,
    estadoEdu,
    estudiosAnteriores,
    tieneDiscapacidad: tieneDis,
    tipoDiscapacidad: tipoDis,
    tratamientoDiscapacidad: tratDis,
    conCUD,
    cudVto,
    tieneBeneficio: tieneBen,
    nombreBeneficio: nomBen,
    organismoBeneficio: orgBen,
    estadoBeneficio: estBen,
    tieneObraSocial: tieneOS,
    nombreObraSocial: nomOS,
    flags,
    createdAt: serverTimestamp(),
  });

  return personId;
}

// ===================== INICIALIZACIÓN =====================

document.addEventListener("DOMContentLoaded", () => {
  const form = $("formulario");
  if (!form) return;

  const selectFamilia = $("familiaExistente");
  const nuevaFamiliaSection = $("nuevaFamiliaSection");
  const cuitInput = $("cuit");

  // Auto-formatear CUIT mientras se escribe
  if (cuitInput) {
    cuitInput.addEventListener("input", (e) => {
      const cursorPos = e.target.selectionStart;
      const oldLength = e.target.value.length;
      e.target.value = formatearCUIT(e.target.value);
      const newLength = e.target.value.length;
      const diff = newLength - oldLength;
      const newPos = cursorPos + diff;
      e.target.setSelectionRange(newPos, newPos);
    });
  }

  if (nuevaFamiliaSection) {
    nuevaFamiliaSection.style.display = "block";
  }

  // Cargar familias desde Firestore
  cargarFamiliasExistentes();

  if (selectFamilia) {
    selectFamilia.addEventListener("change", async (e) => {
      const householdId = e.target.value;

      if (!householdId) {
        if (nuevaFamiliaSection) nuevaFamiliaSection.style.display = "block";
        await rellenarDatosFamilia("");
      } else {
        if (nuevaFamiliaSection) nuevaFamiliaSection.style.display = "none";
        await rellenarDatosFamilia(householdId);
      }
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // 0) Validaciones obligatorias (según lo que pediste)
    const vHH = validarObligatoriosHouseholdSiNuevo();
    if (!vHH.ok) {
      focusAndStatus(vHH.id, vHH.msg);
      return;
    }

    const vP = validarObligatoriosPersona();
    if (!vP.ok) {
      focusAndStatus(vP.id, vP.msg);
      return;
    }

    // (El checkbox “declaración jurada” y teléfono sin 0/15 ya lo bloquean desde el HTML/patch)

    setStatus("Guardando datos...", "#333");

    try {
      // 1) Household
      const { householdId } = await obtenerOCrearHousehold();

      // 2) Persona (incluye check de duplicado por DNI)
      const personId = await guardarPersona(householdId);

      setStatus(
        `<span class="ok">✅ Datos guardados correctamente.<br>ID persona: <code>${personId}</code><br>ID grupo familiar: <code>${householdId}</code></span>`,
        "green"
      );

      form.reset();

      if (nuevaFamiliaSection) nuevaFamiliaSection.style.display = "block";

      const hhIdInput = $("hhId");
      if (hhIdInput) hhIdInput.value = "";

      await cargarFamiliasExistentes();
    } catch (err) {
      console.error("Error al guardar:", err);
      setStatus(
        `<span class="err">❌ Error al guardar: ${err.message || String(err)}</span>`,
        "red"
      );
    }
  });
});
