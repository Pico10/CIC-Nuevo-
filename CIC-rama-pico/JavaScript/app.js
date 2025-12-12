// JavaScript/app.js
import { db } from "./firebase.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

// ===================== HELPERS GENERALES =====================

const $ = (id) => document.getElementById(id);

function setStatus(msg, color = "#333") {
  const el = $("status");
  if (!el) return;
  el.innerHTML = msg;
  el.style.color = color;
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
  if (!cuit) return true; // opcional
  const regex = /^\d{2}-\d{8}-\d{1}$/;
  return regex.test(cuit);
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
  const d = (dni || "").trim();

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

      const textoExtra =
        (barrio ? ` - ${barrio}` : "") +
        (ciudad ? ` (${ciudad})` : "");

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
  const barrio = $("barrio")?.value || "";
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

  // ===== Nueva familia =====
  // Si no pusieron nombre de grupo, lo generamos en base al apellido + dirección
  let nombreGrupo = grupoFamiliarInput;
  if (!nombreGrupo) {
    const apeMay = apellido.toUpperCase();
    const dirLabel = [calle, numero].filter(Boolean).join(" ");
    if (apeMay || dirLabel) {
      nombreGrupo = `${apeMay}${dirLabel ? " - " + dirLabel : ""}`;
    } else {
      nombreGrupo = "GRUPO FAMILIAR";
    }
  }

  // ID custom: 3 primeras letras del apellido + calle + número
  const prefijoApe =
    (apellido || "FAM").substring(0, 3).toUpperCase();
  const calleSlug = slugify(calle) || "SINCALLE";
  const numPart = numero || "SN";

  const householdId = `${prefijoApe}-${calleSlug}-${numPart}`;

  const docRef = doc(db, "households", householdId);
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

  // como acordamos, dejamos visible el hhId en blanco
  const hhIdInput = $("hhId");
  if (hhIdInput) hhIdInput.value = "";

  return {
    householdId,
    creado: true,
  };
}

// ===================== PERSONA =====================

async function guardarPersona(householdId) {
  const relacionHogar = $("relacionHogar")?.value || "";
  const nombre = $("nombre")?.value.trim() || "";
  const apellido = $("apellido")?.value.trim() || "";
  const dni = $("dni")?.value.trim() || "";
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

  if (!nombre || !apellido || !dni) {
    throw new Error("Nombre, apellido y DNI son obligatorios.");
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
    const [nivel, inst, estado] = line
      .split("|")
      .map((s) => (s || "").trim());
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

  await setDoc(personaRef, {
    personId,
    householdId,
    relacionHogar,
    nombre,
    apellido,
    dni,
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

    // Validar CUIT antes de guardar
    const cuitValue = $("cuit")?.value.trim() || "";
    if (cuitValue && !validarCUIT(cuitValue)) {
      setStatus(
        '<span class="err">❌ El formato del CUIT es incorrecto. Use: XX-XXXXXXXX-X</span>',
        "red"
      );
      $("cuit").focus();
      return;
    }

    setStatus("Guardando datos...", "#333");

    try {
      // 1) Household
      const { householdId } = await obtenerOCrearHousehold();

      // 2) Persona
      const personId = await guardarPersona(householdId);

      setStatus(
        `<span class="ok">✅ Datos guardados correctamente.<br>ID persona: <code>${personId}</code><br>ID grupo familiar: <code>${householdId}</code></span>`,
        "green"
      );

      form.reset();

      if (nuevaFamiliaSection)
        nuevaFamiliaSection.style.display = "block";

      const hhIdInput = $("hhId");
      if (hhIdInput) hhIdInput.value = "";

      await cargarFamiliasExistentes();
    } catch (err) {
      console.error("Error al guardar:", err);
      setStatus(
        `<span class="err">❌ Error al guardar: ${
          err.message || String(err)
        }</span>`,
        "red"
      );
    }
  });
});
