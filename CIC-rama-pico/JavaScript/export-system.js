// JavaScript/export-system.js
// Sistema genérico de exportación para tablas del panel CIC
// Parche: excluye columna "Acciones" y limpia emojis/controles antes de exportar.
// Requiere: XLSX, jsPDF, autoTable ya cargados en el HTML.

(function () {
  // ================== HELPERS ==================

  function getConfig(contexto) {
    switch (contexto) {
      case "formularios":
        return {
          selectorTabla: ".data-table table",
          nombreArchivo: "personas_cic",
          titulo: "Registro de Personas - CIC",
        };
      case "consultas":
        return {
          selectorTabla: ".data-table table",
          nombreArchivo: "consultas_cic",
          titulo: "Registro de Consultas - CIC",
        };
      case "profesionales":
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
    if (!table) alert("No se encontró la tabla para exportar.");
    return table;
  }

  // Limpia texto (saca emojis / caracteres raros comunes)
  function cleanText(str) {
    if (str == null) return "";
    let s = String(str);

    // remover emojis (rango amplio) y caracteres de control
    s = s.replace(/[\u{1F300}-\u{1FAFF}]/gu, "");
    s = s.replace(/[\u{2600}-\u{27BF}]/gu, "");
    s = s.replace(/[\u0000-\u001F\u007F]/g, " ");
    s = s.replace(/\s+/g, " ").trim();

    return s;
  }

  // Genera data (head + body) excluyendo "Acciones"
  function extractTableData(table) {
    const headers = Array.from(table.querySelectorAll("thead th")).map((th) =>
      cleanText(th.textContent)
    );

    const idxAcciones = headers.findIndex(
      (h) => h.toLowerCase() === "acciones"
    );

    const finalHeaders =
      idxAcciones >= 0
        ? headers.filter((_, i) => i !== idxAcciones)
        : headers;

    const rows = Array.from(table.querySelectorAll("tbody tr"));
    const body = [];

    rows.forEach((tr) => {
      const tds = Array.from(tr.querySelectorAll("td"));
      if (!tds.length) return;

      const row = tds.map((td) => cleanText(td.textContent));

      const finalRow =
        idxAcciones >= 0 ? row.filter((_, i) => i !== idxAcciones) : row;

      body.push(finalRow);
    });

    return { headers: finalHeaders, body };
  }

  // ================== EXPORT A EXCEL ==================

  function exportarExcel(contexto) {
    const config = getConfig(contexto);
    if (!config) return alert("Contexto de exportación no reconocido.");

    const table = getTableElement(config.selectorTabla);
    if (!table) return;

    try {
      const { headers, body } = extractTableData(table);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
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
    if (!config) return alert("Contexto de exportación no reconocido.");

    const table = getTableElement(config.selectorTabla);
    if (!table) return;

    try {
      if (!window.jspdf || !window.jspdf.jsPDF) {
        alert("La librería PDF no se cargó correctamente.");
        return;
      }

      const { headers, body } = extractTableData(table);

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF("p", "pt", "a4");

      doc.setFontSize(12);
      doc.text(config.titulo, 40, 40);

      doc.autoTable({
        head: [headers],
        body,
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
          Se exportan SOLO los datos de la tabla (sin la columna Acciones).
        </p>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:10px;">
          <button id="btnExportExcel" style="
            background:#198754;color:white;border:none;padding:10px 16px;border-radius:6px;
            cursor:pointer;font-size:14px;
          ">Excel</button>
          <button id="btnExportPdf" style="
            background:#dc3545;color:white;border:none;padding:10px 16px;border-radius:6px;
            cursor:pointer;font-size:14px;
          ">PDF</button>
          <button id="btnExportCancel" style="
            background:#6c757d;color:white;border:none;padding:10px 16px;border-radius:6px;
            cursor:pointer;font-size:14px;
          ">Cancelar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("btnExportExcel").addEventListener("click", function () {
      exportarExcel(contexto);
      cerrarModalExportacion();
    });

    document.getElementById("btnExportPdf").addEventListener("click", function () {
      exportarPDF(contexto);
      cerrarModalExportacion();
    });

    document.getElementById("btnExportCancel").addEventListener("click", cerrarModalExportacion);
  }

  // ================== EXponer a window ==================

  window.mostrarModalExportacion = mostrarModalExportacion;
  window.cerrarModalExportacion = cerrarModalExportacion;
})();
