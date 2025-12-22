// JavaScript/profesionales-form.js
// ✅ Crea profesional en:
// 1) Firebase Auth (Email/Password)  ✅ (SIN guardar contraseña en Firestore)
// 2) Firestore: professionals/{profesionalId} + users/{uid}
// ✅ Mantiene tu profesionalId: Primera letra Nombre + Primera letra Apellido + DNI
// ⚠️ Nota: El UID de Firebase Auth NO se puede elegir (Firebase lo genera). Tu ID “humano” es profesionalId.

import { db } from "./firebase.js";
import {
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

import {
  initializeApp,
  getApps,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

const $ = (id) => document.getElementById(id);

/* =========================
   ✅ ID Profesional (tu regla)
   ========================= */
function generarProfesionalId(nombre, apellido, dni) {
  const n = (nombre || "").trim();
  const a = (apellido || "").trim();
  const d = (dni || "").trim();

  const inicialNombre = n[0] || "";
  const inicialApellido = a[0] || "";

  return (inicialNombre + inicialApellido + d).toUpperCase();
}

/* =========================
   HASH helpers (SHA-256)
   ========================= */
function randomNonce(len = 16) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text) {
  if (!crypto?.subtle?.digest) {
    // fallback (NO criptográfico) - solo para no romper
    return "fallback_" + btoa(unescape(encodeURIComponent(text))).slice(0, 32);
  }
  const enc = new TextEncoder();
  const buf = enc.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buf);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* =========================
   Modal credenciales (UI)
   ========================= */
function mostrarCredenciales(email, password, profesionalId) {
  const modal = document.createElement("div");
  modal.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  modal.innerHTML = `
    <div style="
      background: white;
      padding: 30px;
      border-radius: 12px;
      max-width: 520px;
      width: 92%;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    ">
      <h2 style="color: #27ae60; margin-bottom: 16px; text-align: center;">
        ✅ Profesional Creado Exitosamente
      </h2>

      <div style="
        background: #e8f4f8;
        border-left: 4px solid #3498db;
        padding: 18px;
        margin: 14px 0 18px;
        border-radius: 6px;
      ">
        <p style="margin: 0 0 10px 0; font-size: 14px; color: #2c3e50;">
          <strong>⚠️ IMPORTANTE:</strong> Comunicale estas credenciales al profesional.
          <br/>Contraseña guardada.
        </p>

        <div style="background: white; padding: 14px; border-radius: 8px; margin-top: 10px;">
          <p style="margin: 8px 0; color: #333;">
            <strong>ID Profesional:</strong><br>
            <code style="background: #f5f5f5; padding: 4px 8px; border-radius: 4px; font-size: 14px;">${profesionalId}</code>
          </p>
          <p style="margin: 8px 0; color: #333;">
            <strong>Email / Usuario:</strong><br>
            <code style="background: #f5f5f5; padding: 4px 8px; border-radius: 4px; font-size: 14px;">${email}</code>
          </p>
          <p style="margin: 8px 0; color: #333;">
            <strong>Contraseña:</strong><br>
            <code style="background: #f5f5f5; padding: 4px 8px; border-radius: 4px; font-size: 14px;">${password}</code>
          </p>
        </div>
      </div>

      <div style="
        background: #fff3cd;
        border-left: 4px solid #856404;
        padding: 14px;
        border-radius: 6px;
        margin-bottom: 16px;
      ">
        <p style="margin: 0; font-size: 13px; color: #856404; line-height: 1.4;">
          💡 <strong>El profesional deberá:</strong><br>
          1) Ir a <b>admin-login.html</b><br>
          2) Ingresar su <b>email</b><br>
          3) Usar su <b>contraseña</b><br>
          4) El sistema lo redirige a su panel según su rol.
        </p>
      </div>

      <div style="text-align: center;">
        <button
          onclick="this.closest('div').parentElement.remove(); window.location.href='profesionales.html';"
          style="
            background: #27ae60;
            color: white;
            padding: 12px 26px;
            border: none;
            border-radius: 8px;
            font-size: 15px;
            font-weight: 700;
            cursor: pointer;
          "
        >
          Entendido, ir a lista de profesionales
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

/* =========================
   ✅ Crear usuario en Auth sin “desloguear” al admin
   Usamos una app secundaria.
   ========================= */

// ⚠️ Repetimos config acá para poder inicializar app secundaria.
// (Mantiene todo lo anterior funcionando, y evita tocar firebase.js otra vez.)
const firebaseConfig = {
  apiKey: "AIzaSyC53FSplPAH9DilXPurPbMl_5OHJvVeBbw",
  authDomain: "cic-db.firebaseapp.com",
  databaseURL: "https://cic-db-default-rtdb.firebaseio.com",
  projectId: "cic-db",
  storageBucket: "cic-db.firebasestorage.app",
  messagingSenderId: "200568123888",
  appId: "1:200568123888:web:348b446a1e5a60a5d7ad35",
  measurementId: "G-D17ZTJQX1E",
};

function getSecondaryAuth() {
  // Si ya existe, no la recrea
  const name = "secondary";
  const exists = getApps().some((a) => a.name === name);
  const secondaryApp = exists ? getApps().find((a) => a.name === name) : initializeApp(firebaseConfig, name);
  return getAuth(secondaryApp);
}

async function crearUsuarioAuthSinRomperSesionAdmin(email, password) {
  const secondaryAuth = getSecondaryAuth();
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  const uid = cred.user.uid;

  // dejamos limpia la auth secundaria (no afecta la sesión del admin en la app principal)
  try { await signOut(secondaryAuth); } catch (_) {}

  return uid;
}

/* =========================
   MAIN
   ========================= */

document.addEventListener("DOMContentLoaded", () => {
  const form = $("profesionalForm");
  const statusEl = $("statusProfesional");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.textContent = "Guardando profesional...";
    statusEl.style.color = "#333";

    const nombre = $("nombre").value.trim();
    const apellido = $("apellido").value.trim();
    const dni = $("dni").value.trim();
    const especialidad = $("especialidad").value;
    const matricula = $("matricula").value.trim();
    const email = $("email").value.trim().toLowerCase();
    const password = $("password").value;
    const telefono = $("telefono").value.trim();
    const horarios = $("horarios").value.trim();
    const rolSistema = $("rolSistema").value;

    // Validaciones
    if (!nombre || !apellido || !dni || !especialidad || !email || !password || !telefono || !rolSistema) {
      statusEl.textContent = "❌ Complete todos los campos obligatorios (marcados con *)";
      statusEl.style.color = "red";
      return;
    }

    if (password.length < 6) {
      statusEl.textContent = "❌ La contraseña debe tener al menos 6 caracteres";
      statusEl.style.color = "red";
      $("password").focus();
      return;
    }

    try {
      const profesionalId = generarProfesionalId(nombre, apellido, dni);

      // ✅ Hash único fijo del profesional (identidad)
      const nonce = randomNonce(16);
      const profesionalHash = await sha256Hex(
        ["CIC_PROFESIONAL", profesionalId, email, dni, Date.now(), nonce].join("|")
      );

      // 1) ✅ Crear usuario en Firebase Auth (sin romper sesión del admin)
      statusEl.textContent = "Creando usuario en Authentication...";
      const uid = await crearUsuarioAuthSinRomperSesionAdmin(email, password);

      // 2) ✅ Guardar perfil “central” en users/{uid} (para roles/login)
      statusEl.textContent = "Guardando perfil de usuario...";
      await setDoc(doc(db, "users", uid), {
        uid,
        email,
        role: rolSistema, // admin | operador | lectura | profesional
        displayName: `${nombre} ${apellido}`.trim(),
        profesionalId,
        profesionalNombre: `${nombre} ${apellido}`.trim(),
        profesionalEspecialidad: especialidad || "",
        profesionalEmail: email,
        activo: true,
        creadoEn: serverTimestamp(),
      });

      // 3) ✅ Guardar profesional en professionals/{profesionalId} (para asignación, contadores, etc)
      statusEl.textContent = "Guardando profesional en Firestore...";
      await setDoc(doc(db, "professionals", profesionalId), {
        profesionalId,
        uid, // ✅ vínculo al Auth UID (clave para el login/roles)
        profesionalHash,
        profesionalHashCreatedAt: serverTimestamp(),

        dni,
        nombre,
        apellido,
        especialidad,
        matricula,
        email,

        // ❌ password NO se guarda (pedido tuyo)
        telefono,
        horarios,
        rolSistema,

        activo: true,
        casosActivos: 0,
        casosResueltos: 0,
        creadoEn: serverTimestamp(),
      });

      console.log("✅ Profesional creado:", { profesionalId, uid });
      console.log("🔐 Hash profesional:", profesionalHash);

      statusEl.innerHTML = `✅ Profesional guardado correctamente`;
      statusEl.style.color = "green";

      // Mostramos credenciales (la contraseña viene del input, no de Firestore)
      mostrarCredenciales(email, password, profesionalId);

      form.reset();
    } catch (err) {
      console.error("❌ Error al crear el profesional:", err);

      const code = err?.code || "";
      if (code.includes("auth/email-already-in-use")) {
        statusEl.textContent = "❌ Ese email ya existe en Authentication. Usá otro email o recuperá la cuenta.";
        statusEl.style.color = "red";
        return;
      }
      if (code.includes("auth/invalid-email")) {
        statusEl.textContent = "❌ Email inválido.";
        statusEl.style.color = "red";
        return;
      }
      if (code.includes("auth/weak-password")) {
        statusEl.textContent = "❌ Contraseña débil. Usá al menos 6 caracteres.";
        statusEl.style.color = "red";
        return;
      }

      statusEl.textContent = "❌ Error al guardar el profesional: " + (err?.message || err);
      statusEl.style.color = "red";
    }
  });
});
