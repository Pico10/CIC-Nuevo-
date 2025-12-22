const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

// Helper: validar rol permitido
function normalizeRole(role) {
  const r = String(role || "").toLowerCase();
  const allowed = ["admin", "operador", "lectura", "profesional"];
  return allowed.includes(r) ? r : "profesional";
}

exports.createProfessionalUser = functions.https.onCall(async (data, context) => {
  // 1) Debe estar logueado
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "No autenticado.");
  }

  // 2) Solo admin / operador pueden crear usuarios (ajustá si querés)
  const requesterUid = context.auth.uid;
  const requesterSnap = await admin.firestore().doc(`users/${requesterUid}`).get();
  const requesterRole = (requesterSnap.exists ? requesterSnap.data().role : "lectura") || "lectura";

  if (!["admin", "operador"].includes(String(requesterRole).toLowerCase())) {
    throw new functions.https.HttpsError("permission-denied", "No tenés permisos para crear usuarios.");
  }

  // 3) Datos requeridos
  const email = String(data.email || "").trim().toLowerCase();
  const password = String(data.password || "");
  const role = normalizeRole(data.role);

  const nombre = String(data.nombre || "").trim();
  const apellido = String(data.apellido || "").trim();
  const dni = String(data.dni || "").trim();

  const especialidad = String(data.especialidad || "").trim();
  const matricula = String(data.matricula || "").trim();
  const telefono = String(data.telefono || "").trim();
  const horarios = String(data.horarios || "").trim();

  if (!email || !email.includes("@")) {
    throw new functions.https.HttpsError("invalid-argument", "Email inválido.");
  }
  if (!password || password.length < 6) {
    throw new functions.https.HttpsError("invalid-argument", "La contraseña debe tener al menos 6 caracteres.");
  }
  if (!nombre || !apellido || !dni) {
    throw new functions.https.HttpsError("invalid-argument", "Nombre, apellido y DNI son obligatorios.");
  }

  // 4) Crear en Auth
  let userRecord;
  try {
    userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: `${nombre} ${apellido}`.trim(),
    });
  } catch (e) {
    const msg = e?.message || String(e);
    // Email ya existe, etc.
    throw new functions.https.HttpsError("already-exists", msg);
  }

  const uid = userRecord.uid;

  // 5) Crear profesionalId formato: 1ra letra nombre + 1ra letra apellido + dni
  const profId = `${(nombre[0] || "X").toUpperCase()}${(apellido[0] || "X").toUpperCase()}${dni}`.replace(/\s+/g, "");

  // 6) Guardar en Firestore (sin password)
  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();

  // professionals/{profId}
  await db.doc(`professionals/${profId}`).set(
    {
      profesionalId: profId,
      nombre,
      apellido,
      dni,
      especialidad,
      matricula: matricula || "",
      email,
      telefono,
      horarios: horarios || "",
      role, // para compat
      casosActivos: 0,
      casosResueltos: 0,
      createdAt: now,
      updatedAt: now,
      authUid: uid,
    },
    { merge: true }
  );

  // users/{uid}
  await db.doc(`users/${uid}`).set(
    {
      role,
      email,
      displayName: `${nombre} ${apellido}`.trim(),
      username: profId,
      profesionalId: profId,
      profesionalNombre: `${nombre} ${apellido}`.trim(),
      profesionalEspecialidad: especialidad,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  return {
    ok: true,
    uid,
    profesionalId: profId,
    role,
    email,
  };
});
