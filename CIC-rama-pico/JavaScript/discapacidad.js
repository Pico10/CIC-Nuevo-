// JavaScript/discapacidadExtra.js
// Manejo dinámico del campo "Discapacidad"

// Se ejecuta solo cuando el DOM está listo
document.addEventListener("DOMContentLoaded", () => {

  const tieneDis = document.getElementById("tieneDis");
  const extra = document.getElementById("discapacidadExtra");

  // Si el formulario no tiene estos campos, evitar errores
  if (!tieneDis || !extra) return;

  // Ocultar al inicio
  extra.style.display = "none";

  // Mostrar u ocultar según selección
  tieneDis.addEventListener("change", () => {
    const value = tieneDis.value;

    // Tus formularios usan "true" y "false" (NO "Si")
    if (value === "true") {
      extra.style.display = "block";
    } else {
      extra.style.display = "none";
    }
  });

});
