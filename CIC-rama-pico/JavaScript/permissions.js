// JavaScript/permissions.js
// ✅ Control de permisos por rol SIN romper tu sistema actual
// Usa sessionStorage.userRole (admin|operador|profesional|lectura)
// y permite ocultar/deshabilitar UI con data-attributes.

const ROLE = (() => (sessionStorage.getItem("userRole") || "lectura").toLowerCase())();

const PERMS = (() => {
  const base = {
    role: ROLE,

    // Visibilidad de paneles (pediste que todos vean todos)
    canViewPanels: true,

    // Exportaciones / PDF / Excel
    canExport: true,

    // Consultas
    canCreateConsultas: false,
    canEditConsultas: false,
    canDerivarConsultas: false,
    canCambiarEstadoConsultas: false,

    // WhatsApp citatorios / notificaciones
    canSendWhatsApp: false,

    // Usuarios (gestión)
    canCreateUsers: false,
    canEditUsers: false,

    // Profesionales (edición)
    canEditProfessionals: false,
  };

  if (ROLE === "admin") {
    return {
      ...base,
      canCreateConsultas: true,
      canEditConsultas: true,
      canDerivarConsultas: true,
      canCambiarEstadoConsultas: true,
      canSendWhatsApp: true,
      canCreateUsers: true,
      canEditUsers: true,
      canEditProfessionals: true,
    };
  }

  if (ROLE === "operador") {
    // ✅ Operador: crear consultas y derivarlas, ver todo, exportar todo, NO crear usuarios
    return {
      ...base,
      canCreateConsultas: true,
      canEditConsultas: true,
      canDerivarConsultas: true,
      canCambiarEstadoConsultas: true,
      canSendWhatsApp: true, // si querés que operador NO mande WhatsApp, ponelo false
      canCreateUsers: false,
      canEditUsers: false,
      canEditProfessionals: true, // si querés que operador NO edite profesionales, ponelo false
    };
  }

  if (ROLE === "profesional") {
    // ✅ Profesional: “todo” excepto crear usuarios (pero sí pueden editarlos)
    return {
      ...base,
      canCreateConsultas: true,
      canEditConsultas: true,
      canDerivarConsultas: true,          // si querés que NO deriven, ponelo false
      canCambiarEstadoConsultas: true,
      canSendWhatsApp: true,
      canCreateUsers: false,
      canEditUsers: true,
      canEditProfessionals: true,
    };
  }

  // ✅ Solo lectura: ver todo + exportar + PDF/Excel, sin whatsapp ni escrituras
  return {
    ...base,
    canCreateConsultas: false,
    canEditConsultas: false,
    canDerivarConsultas: false,
    canCambiarEstadoConsultas: false,
    canSendWhatsApp: false,
    canCreateUsers: false,
    canEditUsers: false,
    canEditProfessionals: false,
  };
})();

// Exponemos para que cualquier JS lo use sin romper nada
window.CIC_PERMS = PERMS;

function disable(el, reason = "Sin permisos") {
  if (!el) return;
  el.setAttribute("disabled", "disabled");
  el.setAttribute("aria-disabled", "true");
  el.style.pointerEvents = "none";
  el.style.opacity = "0.55";
  // tooltip simple
  if (!el.getAttribute("title")) el.setAttribute("title", reason);
}

function hide(el) {
  if (!el) return;
  el.style.display = "none";
}

// Convenciones por data-attributes:
// - data-perm="export" | "consultas-create" | "consultas-edit" | "consultas-derivar" | "consultas-estado" | "whatsapp" | "users-create" | "users-edit" | "professionals-edit"
// - data-perm-mode="hide" (si querés ocultar en vez de deshabilitar)
function applyPermSelector(permKey, allowed, reason) {
  const nodes = document.querySelectorAll(`[data-perm="${permKey}"]`);
  nodes.forEach((el) => {
    const mode = (el.getAttribute("data-perm-mode") || "disable").toLowerCase();
    if (allowed) return;
    if (mode === "hide") hide(el);
    else disable(el, reason);
  });
}

export function initPagePermissions(pageKey = "") {
  // Guard: si no hay rol, default lectura
  const role = PERMS.role;

  // Si querés mostrar rol en algún lado:
  const roleBadges = document.querySelectorAll("[data-show-role]");
  roleBadges.forEach((el) => (el.textContent = role));

  // Aplicar permisos genéricos
  applyPermSelector("export", PERMS.canExport, "Solo exportación habilitada.");
  applyPermSelector("consultas-create", PERMS.canCreateConsultas, "No podés crear consultas.");
  applyPermSelector("consultas-edit", PERMS.canEditConsultas, "No podés editar.");
  applyPermSelector("consultas-derivar", PERMS.canDerivarConsultas, "No podés derivar.");
  applyPermSelector("consultas-estado", PERMS.canCambiarEstadoConsultas, "No podés cambiar estado.");
  applyPermSelector("whatsapp", PERMS.canSendWhatsApp, "No podés enviar WhatsApp.");
  applyPermSelector("users-create", PERMS.canCreateUsers, "No podés crear usuarios.");
  applyPermSelector("users-edit", PERMS.canEditUsers, "No podés editar usuarios.");
  applyPermSelector("professionals-edit", PERMS.canEditProfessionals, "No podés editar profesionales.");

  // Compat: lo que ya venías usando
  // data-role-write="true" => si es lectura, deshabilitar
  const writeNodes = document.querySelectorAll('[data-role-write="true"]');
  if (role === "lectura") {
    writeNodes.forEach((el) => disable(el, "Modo lectura: no podés modificar datos."));
  }

  // Extra: bloquear “acciones sensibles” si estás en lectura
  if (role === "lectura") {
    // Por ejemplo botones que dicen "Enviar WhatsApp" sin data-perm:
    document.querySelectorAll("[data-action='send-whatsapp']").forEach((el) =>
      disable(el, "Modo lectura: WhatsApp deshabilitado.")
    );
  }
}
