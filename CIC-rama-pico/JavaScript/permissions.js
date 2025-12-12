// JavaScript/permissions.js
// Sistema central de roles + permisos + auditoría local

export const ROLES = {
  ADMIN: "admin",
  OPERADOR: "operador",
  PROFESIONAL: "profesional", // tratado como OPERADOR
  LECTURA: "lectura",
};

const AUDIT_KEY = "cicAuditLog";

// ===============================================================
// ROLES Y SESIÓN
// ===============================================================

export function isMasterAdmin() {
  return sessionStorage.getItem("cicMaster") === "true";
}

function roleLevel(role) {
  switch (role) {
    case ROLES.ADMIN:
      return 3;
    case ROLES.OPERADOR:
    case ROLES.PROFESIONAL:
      return 2;
    case ROLES.LECTURA:
      return 1;
    default:
      return 0;
  }
}

export function getCurrentUser() {
  return (
    sessionStorage.getItem("cicUser") ||
    sessionStorage.getItem("currentUser") ||
    "desconocido"
  );
}

export function getCurrentRole() {
  return (
    sessionStorage.getItem("cicRole") ||
    sessionStorage.getItem("userRole") || // compatibilidad
    null
  );
}

// Redirige desde cualquier carpeta
function goToLogin() {
  window.location.href = "/CIC-rama-pico/Pages/admin-login.html";
}

// ===============================================================
// LOGIN REQUIRED
// ===============================================================
export function requireLogin() {
  const role = getCurrentRole();
  if (!role) {
    goToLogin();
    throw new Error("No autenticado");
  }
  return role;
}

// ===============================================================
// AUDITORÍA LOCAL
// ===============================================================

export function logAudit({ action, resource, success, details = "" }) {
  try {
    const user = getCurrentUser();
    const role = getCurrentRole();
    const now = new Date().toISOString();

    const entry = { time: now, user, role, action, resource, success, details };

    const stored = localStorage.getItem(AUDIT_KEY);
    let logs = stored ? JSON.parse(stored) : [];
    logs.push(entry);

    // Limitar tamaño
    if (logs.length > 200) logs = logs.slice(-200);

    localStorage.setItem(AUDIT_KEY, JSON.stringify(logs));
    console.log("[AUDIT]", entry);

  } catch (e) {
    console.warn("No se pudo guardar auditoría", e);
  }
}

// ===============================================================
// PERMISOS GENERALES
// ===============================================================

export function canWrite() {
  const role = getCurrentRole();
  return roleLevel(role) >= roleLevel(ROLES.OPERADOR); // operador/profesional/admin
}

export function canManageUsers() {
  return getCurrentRole() === ROLES.ADMIN;
}

export function canDeleteRecords() {
  return getCurrentRole() === ROLES.ADMIN;
}

// ===============================================================
// ASSERTS – Usados antes de operaciones sensibles
// ===============================================================

export function assertCanWrite(actionDesc = "ACCION_ESCRITURA") {
  const role = getCurrentRole();
  if (!canWrite()) {
    logAudit({
      action: "DENEGADO_" + actionDesc,
      resource: "general",
      success: false,
      details: "Rol sin permisos: " + role,
    });
    alert("❌ No tiene permisos para realizar esta acción.");
    throw new Error("Permiso denegado");
  }
}

export function assertCanManageUsers() {
  if (!canManageUsers()) {
    logAudit({
      action: "DENEGADO_GESTION_USUARIOS",
      resource: "users",
      success: false,
      details: "Rol: " + getCurrentRole(),
    });
    alert("❌ Solo un administrador puede gestionar usuarios.");
    throw new Error("Permiso denegado");
  }
}

export function assertCanDeleteRecords(resourceName = "registro") {
  if (!canDeleteRecords()) {
    logAudit({
      action: "DENEGADO_DELETE_" + resourceName.toUpperCase(),
      resource: resourceName,
      success: false,
      details: "Rol: " + getCurrentRole(),
    });
    alert("❌ Solo un administrador puede eliminar " + resourceName + ".");
    throw new Error("Permiso denegado");
  }
}

// ===============================================================
// DECORACIÓN DE LA UI
// ===============================================================
//
// data-role-min="admin"     → solo admin lo ve
// data-role-min="operador"  → operador, profesional, admin
// data-role-write="true"    → ocultar o bloquear si es LECTURA
//

export function decorateDOM(role) {

  // element[data-role-min="..."]
  document.querySelectorAll("[data-role-min]").forEach((el) => {
    const minRole = el.getAttribute("data-role-min");
    if (roleLevel(role) < roleLevel(minRole)) {
      el.style.display = "none";
    }
  });

  // En modo lectura se ocultan todos los elementos de escritura
  if (role === ROLES.LECTURA) {
    document.querySelectorAll("[data-role-write='true']").forEach((el) => {
      el.style.display = "none";
    });

    // Bloquear todos los formularios
    document.querySelectorAll("form").forEach((form) => {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        alert("🔒 Modo solo lectura. No puede guardar cambios.");
      });
    });
  }
}

// ===============================================================
// INIT PAGE
// ===============================================================
//
// pageId:
//  - admin-panel
//  - form-personas
//  - form-consultas
//  - form-profesionales
//  - consultas-list
//  - profesionales-list
//  - user-management
//

export function initPagePermissions(pageId) {
  const role = requireLogin(); // asegura que exista sesión

  // Ocultar link a gestión de usuarios si no es admin
  const userMngLink = document.getElementById("userManagementLink");
  if (userMngLink && role !== ROLES.ADMIN) {
    userMngLink.style.display = "none";
  }

  // Validaciones por página
  switch (pageId) {
    case "user-management":
      if (role !== ROLES.ADMIN) {
        alert("❌ Solo un administrador puede acceder a Gestión de Usuarios.");
        window.location.href = "/CIC-rama-pico/Pages/admin.html";
        return;
      }
      break;

    case "form-personas":
    case "form-consultas":
    case "form-profesionales":
      if (!canWrite()) {
        alert("❌ No tiene permisos para realizar esta acción.");
        window.location.href = "/CIC-rama-pico/Pages/admin.html";
        return;
      }
      break;

    // Estas páginas las pueden ver todos los roles logueados
    case "admin-panel":
    case "consultas-list":
    case "profesionales-list":
      break;
  }

  // Decoración general de UI
  decorateDOM(role);
}
