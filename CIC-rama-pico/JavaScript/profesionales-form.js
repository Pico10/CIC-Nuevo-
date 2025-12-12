// JavaScript/profesionales-form.js
import { db } from "./firebase.js";
import {
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

// genera ID: primera letra nombre + primera letra apellido + DNI
function generarProfesionalId(nombre, apellido, dni) {
  const n = (nombre || "").trim();
  const a = (apellido || "").trim();
  const d = (dni || "").trim();

  const inicialNombre = n[0] || "";
  const inicialApellido = a[0] || "";

  return (inicialNombre + inicialApellido + d).toUpperCase();
}

document.addEventListener("DOMContentLoaded", () => {
  const form = $("profesionalForm");
  const statusEl = $("statusProfesional");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.textContent = "Guardando profesional...";

    const nombre = $("nombre").value.trim();
    const apellido = $("apellido").value.trim();
    const dni = $("dni").value.trim();
    const especialidad = $("especialidad").value;
    const matricula = $("matricula").value.trim();
    const email = $("email").value.trim();
    const telefono = $("telefono").value.trim();
    const horarios = $("horarios").value.trim();
    const rolSistema = $("rolSistema").value;

    if (!nombre || !apellido || !dni || !especialidad || !telefono || !rolSistema) {
      statusEl.textContent = "❌ Complete los campos obligatorios.";
      return;
    }

    try {
      const profesionalId = generarProfesionalId(nombre, apellido, dni);

      const profRef = doc(db, "professionals", profesionalId);

      await setDoc(profRef, {
        profesionalId,
        dni,
        nombre,
        apellido,
        especialidad,
        matricula,
        email,
        telefono,
        horarios,
        rolSistema,
        activo: true,
        casosActivos: 0,
        casosResueltos: 0,
        creadoEn: serverTimestamp(),
      });

      console.log("Profesional creado con ID:", profesionalId);

      statusEl.innerHTML =
        `✅ Profesional guardado correctamente. ID: ` +
        `<code>${profesionalId}</code>`;

      form.reset();

      setTimeout(() => {
        window.location.href = "profesionales.html";
      }, 1200);
    } catch (err) {
      console.error("Error guardando profesional:", err);
      statusEl.textContent = "❌ Error al guardar el profesional.";
    }
  });
});
