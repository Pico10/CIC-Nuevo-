// JavaScript/export-consulta-pdf.js
// PDF institucional individual + Citación por WhatsApp

(function () {

  // =========================
  // PDF INDIVIDUAL DE CONSULTA
  // =========================
  window.exportConsultaPDF = function (consulta) {
    if (!consulta) {
      alert("Consulta inválida");
      return;
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");

    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();
    const m = 20;
    let y = 20;

    // HEADER
    pdf.setFillColor(54, 141, 255);
    pdf.rect(0, 0, w, 28, "F");

    pdf.setTextColor(255);
    pdf.setFontSize(18);
    pdf.setFont(undefined, "bold");
    pdf.text("CIC PAVÓN ARRIBA", w / 2, 12, { align: "center" });

    pdf.setFontSize(11);
    pdf.setFont(undefined, "normal");
    pdf.text("Centro de Integración Comunitaria", w / 2, 20, { align: "center" });

    y = 38;

    // TITULO
    pdf.setTextColor(0);
    pdf.setFontSize(15);
    pdf.setFont(undefined, "bold");
    pdf.text("REGISTRO DE CONSULTA", w / 2, y, { align: "center" });
    y += 12;

    const field = (label, value) => {
      pdf.setFont(undefined, "bold");
      pdf.text(label + ":", m, y);
      pdf.setFont(undefined, "normal");
      pdf.text(value || "—", m + 50, y);
      y += 7;
    };

    field("Nº Consulta", consulta.numeroConsulta ? "#" + consulta.numeroConsulta : consulta.id);
    field("Persona", consulta.personaNombre);
    field("DNI", consulta.personaDni || "—");

    const fecha = consulta.createdAt?.toDate
      ? consulta.createdAt.toDate().toLocaleDateString("es-AR")
      : new Date().toLocaleDateString("es-AR");

    field("Fecha", fecha);
    field("Motivo", consulta.motivo);
    field("Tipo", consulta.tipo === "derivacion" ? "Derivación Institucional" : "Demanda Espontánea");
    field("Prioridad", (consulta.prioridad || "").toUpperCase());
    field("Profesional", consulta.profesionalNombre || "Sin asignar");

    y += 5;

    pdf.setFont(undefined, "bold");
    pdf.text("Descripción:", m, y);
    y += 6;

    pdf.setFont(undefined, "normal");
    const descLines = pdf.splitTextToSize(
      consulta.descripcion || "—",
      w - m * 2
    );
    pdf.text(descLines, m, y);
    y += descLines.length * 5 + 10;

    // FIRMA (SI EXISTE)
    if (consulta.firmaDigital) {
      pdf.setFillColor(209, 231, 221);
      pdf.rect(m, y, w - m * 2, 38, "F");
      pdf.setDrawColor(15, 81, 50);
      pdf.rect(m, y, w - m * 2, 38);

      y += 7;
      pdf.setTextColor(15, 81, 50);
      pdf.setFont(undefined, "bold");
      pdf.text("Firma Digital Registrada", m + 5, y);

      y += 7;
      pdf.setTextColor(0);
      pdf.setFontSize(10);
      pdf.setFont(undefined, "normal");

      field("Profesional", consulta.firmaDigital.profesional);
      field(
        "Fecha",
        new Date(consulta.firmaDigital.timestamp).toLocaleString("es-AR")
      );
    }

    // FOOTER
    pdf.setFontSize(8);
    pdf.setTextColor(120);
    pdf.text(
      "Documento generado por el Sistema CIC Pavón Arriba",
      w / 2,
      h - 10,
      { align: "center" }
    );

    const nombre = `Consulta_${consulta.numeroConsulta || consulta.id}.pdf`;
    pdf.save(nombre);
  };

  // =========================
  // CITACIÓN POR WHATSAPP
  // =========================
  window.enviarCitacionWhatsApp = function ({
    telefono,
    profesional,
    fecha,
    horario,
  }) {
    if (!telefono) {
      alert("La persona no tiene teléfono registrado");
      return;
    }

    const tel = String(telefono).replace(/\D/g, "");
    if (!tel) {
      alert("Teléfono inválido");
      return;
    }

    const mensaje = `Estimado/a, usted ha sido citado para una visita con el profesional "${profesional}" el día ${fecha} en el siguiente horario: ${horario}.

CIC Pavón Arriba`;

    const url =
      "https://api.whatsapp.com/send?phone=54" +
      tel +
      "&text=" +
      encodeURIComponent(mensaje);

    window.open(url, "_blank");
  };

})();
