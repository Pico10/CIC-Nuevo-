// export-system.js
// Sistema genérico de exportación para tablas del panel CIC
// Usa las libs ya cargadas en el HTML: XLSX, jsPDF, autoTable

(function () {
  // ================== HELPERS ==================

  // Devuelve { selectorTabla, nombreArchivo } según el contexto
  function getConfig(contexto) {
    // Por ahora admin (formularios) y consultas usan la tabla principal
    switch (contexto) {
      case "formularios": // admin.html
        return {
          selectorTabla: ".data-table table",
          nombreArchivo: "personas_cic",
          titulo: "Registro de Personas - CIC",
        };
      case "consultas": // consultas.html
        return {
          selectorTabla: ".data-table table",
          nombreArchivo: "consultas_cic",
          titulo: "Registro de Consultas - CIC",
        };
      case "profesionales": // por si lo usas luego
        return {
          selectorTabla: ".data-table table",
          nombreArchivo: "profesionales_cic",
          titulo: "Registro de Profesionales - CIC",
        };
      default:
        return null;
    }
  }

  function getTableElement(selector) {
    const table = document.querySelector(selector);
    if (!table) {
      alert("No se encontró la tabla para exportar.");
    }
    return table;
  }

  // ================== EXPORT A EXCEL ==================

  function exportarExcel(contexto) {
    const config = getConfig(contexto);
    if (!config) {
      alert("Contexto de exportación no reconocido.");
      return;
    }

    const table = getTableElement(config.selectorTabla);
    if (!table) return;

    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.table_to_sheet(table);
      XLSX.utils.book_append_sheet(wb, ws, "Datos");
      XLSX.writeFile(wb, config.nombreArchivo + ".xlsx");
    } catch (err) {
      console.error("Error exportando a Excel:", err);
      alert("Ocurrió un error al exportar a Excel.");
    }
  }

  // ================== EXPORT A PDF ==================

  function exportarPDF(contexto) {
    const config = getConfig(contexto);
    if (!config) {
      alert("Contexto de exportación no reconocido.");
      return;
    }

    const table = getTableElement(config.selectorTabla);
    if (!table) return;

    try {
      if (!window.jspdf || !window.jspdf.jsPDF) {
        alert("La librería jsPDF no se cargó correctamente.");
        return;
      }

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF("p", "pt", "a4");

      doc.setFontSize(12);
      doc.text(config.titulo, 40, 40);

      doc.autoTable({
        html: table,
        startY: 60,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [54, 141, 255] },
      });

      doc.save(config.nombreArchivo + ".pdf");
    } catch (err) {
      console.error("Error exportando a PDF:", err);
      alert("Ocurrió un error al exportar a PDF.");
    }
  }

  // ================== MODAL SENCILLO ==================

  function cerrarModalExportacion() {
    const modal = document.getElementById("exportModalCIC");
    if (modal) modal.remove();
  }

  function mostrarModalExportacion(contexto) {
    // Si ya hay un modal, lo borro y creo nuevo
    cerrarModalExportacion();

    const modal = document.createElement("div");
    modal.id = "exportModalCIC";
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    `;

    modal.innerHTML = `
      <div style="
        background: #fff;
        padding: 24px;
        border-radius: 8px;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 10px 40px rgba(0,0,0,.3);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      ">
        <h3 style="margin-top:0;margin-bottom:16px;">Exportar datos</h3>
        <p style="margin-top:0;margin-bottom:20px;font-size:14px;color:#555;">
          Seleccione el formato de exportación para los datos visibles en la tabla.
        </p>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:10px;">
          <button id="btnExportExcel" style="
            background:#198754;
            color:white;
            border:none;
            padding:10px 16px;
            border-radius:6px;
            cursor:pointer;
            font-size:14px;
          ">📗 Excel</button>
          <button id="btnExportPdf" style="
            background:#dc3545;
            color:white;
            border:none;
            padding:10px 16px;
            border-radius:6px;
            cursor:pointer;
            font-size:14px;
          ">📄 PDF</button>
          <button id="btnExportCancel" style="
            background:#6c757d;
            color:white;
            border:none;
            padding:10px 16px;
            border-radius:6px;
            cursor:pointer;
            font-size:14px;
          ">Cancelar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document
      .getElementById("btnExportExcel")
      .addEventListener("click", function () {
        exportarExcel(contexto);
        cerrarModalExportacion();
      });

    document
      .getElementById("btnExportPdf")
      .addEventListener("click", function () {
        exportarPDF(contexto);
        cerrarModalExportacion();
      });

    document
      .getElementById("btnExportCancel")
      .addEventListener("click", cerrarModalExportacion);
  }

  // ================== EXponer a window ==================

  window.mostrarModalExportacion = mostrarModalExportacion;
  window.cerrarModalExportacion = cerrarModalExportacion;
})();
