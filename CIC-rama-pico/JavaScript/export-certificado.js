// JavaScript/export-certificado.js
// PDF certificado institucional + QR + logo + ID único del documento
// Requiere jsPDF cargado en la página: window.jspdf.jsPDF
// Carga QRCode desde CDN si no existe.

(function () {
  const CONFIG = {
    institucionTitulo: "CIC PAVÓN ARRIBA",
    institucionSubtitulo: "Centro de Integración Comunitaria",
    documentoTitulo: "CASO RESUELTO - CERTIFICADO DIGITAL",
    logoUrl: "../Images/PavonArriba.jpg",

    colorPrimario: [54, 141, 255],
    colorVerdeBorde: [20, 120, 80],
    colorVerdeFondo: [220, 240, 230],
    colorAmarilloFondo: [255, 243, 205],
    colorAmarilloBorde: [133, 100, 4],

    qrCdnUrl: "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js",
  };

  async function loadImageAsDataURL(url) {
    try {
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) throw new Error("No se pudo cargar logo: " + resp.status);

      const blob = await resp.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      return dataUrl;
    } catch (e) {
      console.warn("[PDF] Logo no disponible:", e.message);
      return null;
    }
  }

  function ensureQRCodeLib() {
    return new Promise((resolve) => {
      if (window.QRCode && window.QRCode.toDataURL) return resolve(true);

      if (document.getElementById("qrcode-lib")) {
        const t = setInterval(() => {
          if (window.QRCode && window.QRCode.toDataURL) {
            clearInterval(t);
            resolve(true);
          }
        }, 100);
        setTimeout(() => {
          clearInterval(t);
          resolve(false);
        }, 6000);
        return;
      }

      const s = document.createElement("script");
      s.id = "qrcode-lib";
      s.src = CONFIG.qrCdnUrl;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  // ✅ REEMPLAZO: makeQRDataURL con fallback robusto (SIN romper nada)
  async function makeQRDataURL(text) {
    // 1) Intento con librería QRCode (CDN)
    const ok = await ensureQRCodeLib();
    if (ok && window.QRCode?.toDataURL) {
      try {
        return await window.QRCode.toDataURL(text, {
          errorCorrectionLevel: "M",
          margin: 1,
          scale: 6,
        });
      } catch (e) {
        console.warn("[PDF] Error QR (lib):", e);
      }
    }

    // 2) Fallback: API externa que devuelve imagen QR
    // (sirve cuando el CDN falla, CORS, cache, etc.)
    try {
      const api = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
        text
      )}`;
      const resp = await fetch(api, { cache: "no-store" });
      if (!resp.ok) throw new Error("QR API status " + resp.status);

      const blob = await resp.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });

      return dataUrl;
    } catch (e) {
      console.warn("[PDF] Error QR (fallback):", e);
      return null;
    }
  }

  function formatFechaAR(ts) {
    try {
      if (!ts) return "—";
      if (ts.toDate) return ts.toDate().toLocaleDateString("es-AR");
      const d = new Date(ts);
      if (!isNaN(d)) return d.toLocaleDateString("es-AR");
      return "—";
    } catch {
      return "—";
    }
  }

  function formatFechaHoraAR(ts) {
    try {
      if (!ts) return "—";
      const d = ts instanceof Date ? ts : new Date(ts);
      if (isNaN(d)) return "—";
      return d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "medium" });
    } catch {
      return "—";
    }
  }

  window.exportarPDFCertificado = async function (casoId) {
    try {
      if (!window.jspdf?.jsPDF) {
        alert("La librería jsPDF no se cargó correctamente.");
        return;
      }

      // ✅ IMPORT CORRECTO (funciona desde Pages/*.html)
      const { db } = await import("../JavaScript/firebase.js");
      const { doc, getDoc } = await import(
        "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js"
      );

      const casoRef = doc(db, "consultas", casoId);
      const casoSnap = await getDoc(casoRef);

      if (!casoSnap.exists()) {
        alert("Caso no encontrado");
        return;
      }

      const caso = casoSnap.data() || {};

      if (!caso.firmaDigital || !caso.firmaDigital.profesional) {
        alert("Este caso no ha sido firmado digitalmente");
        return;
      }

      const firma = caso.firmaDigital;

      const docUID = `CIC-${(caso.numeroConsulta || casoId)}-${Date.now()}`;

      const qrPayload =
`CIC PAVÓN ARRIBA
Centro de Integración Comunitaria

CERTIFICADO DIGITAL DE CASO RESUELTO
ID Documento: ${docUID}

==============================
DATOS DEL CASO
==============================
Número de consulta: ${caso.numeroConsulta || casoId}
Fecha de consulta: ${formatFechaAR(caso.createdAt || caso.fecha)}
Estado: ${(caso.estado || "resuelto").toUpperCase()}
Tipo: ${caso.tipo === "derivacion" ? "Derivación Institucional" : "Demanda Espontánea"}
Prioridad: ${(caso.prioridad || "media").toUpperCase()}

Motivo:
${caso.motivo || "—"}

Descripción:
${(caso.descripcion || "—").toString().slice(0, 700)}

==============================
DATOS DEL PACIENTE
==============================
Nombre: ${caso.personaNombre || "—"}
DNI: ${caso.personaDni || "—"}

==============================
PROFESIONAL INTERVINIENTE
==============================
Nombre: ${firma.profesional || "—"}
ID Profesional: ${firma.profesionalId || "—"}
Email: ${firma.profesionalEmail || "—"}

==============================
FIRMA DIGITAL
==============================
Fecha y hora de firma:
${formatFechaHoraAR(firma.timestamp)}

Documento firmado digitalmente.
La validez legal se encuentra respaldada
por el registro interno del sistema CIC.

CIC Pavón Arriba – Documento oficial
`;

      const logoDataURL = await loadImageAsDataURL(CONFIG.logoUrl);
      const qrDataURL = await makeQRDataURL(qrPayload);

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF("p", "mm", "a4");

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 16;
      let y = 14;

      // HEADER
      pdf.setFillColor(...CONFIG.colorPrimario);
      pdf.rect(0, 0, pageWidth, 26, "F");

      if (logoDataURL) {
        try {
          pdf.addImage(logoDataURL, "JPEG", margin, 5, 16, 16);
        } catch (e) {
          console.warn("[PDF] No se pudo insertar logo:", e);
        }
      }

      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(16);
      pdf.setFont(undefined, "bold");
      pdf.text(CONFIG.institucionTitulo, pageWidth / 2, 11, { align: "center" });

      pdf.setFontSize(10);
      pdf.setFont(undefined, "normal");
      pdf.text(CONFIG.institucionSubtitulo, pageWidth / 2, 18, { align: "center" });

      y = 34;

      // TÍTULO
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(13);
      pdf.setFont(undefined, "bold");
      pdf.text(CONFIG.documentoTitulo, pageWidth / 2, y, { align: "center" });

      y += 7;
      pdf.setFontSize(9);
      pdf.setFont(undefined, "normal");
      pdf.setTextColor(90, 90, 90);
      pdf.text(`ID Documento: ${docUID}`, pageWidth / 2, y, { align: "center" });

      y += 10;

      // INFO CASO
      const fechaCaso = formatFechaAR(caso.createdAt || caso.fecha);
      const tipo =
        caso.tipo === "derivacion"
          ? "Derivación Institucional"
          : "Demanda Espontánea";
      const prioridad = (caso.prioridad || "media").toUpperCase();

      pdf.setFillColor(248, 249, 250);
      pdf.roundedRect(margin, y, pageWidth - margin * 2, 58, 2, 2, "F");
      pdf.setDrawColor(220, 220, 220);
      pdf.roundedRect(margin, y, pageWidth - margin * 2, 58, 2, 2, "S");

      y += 8;

      pdf.setFontSize(11);
      pdf.setFont(undefined, "bold");
      pdf.setTextColor(0, 0, 0);
      pdf.text("INFORMACIÓN DEL CASO", margin + 4, y);

      y += 8;

      const labelX = margin + 4;
      const valueX = margin + 52;
      const lineH = 6;

      const field = (label, value) => {
        pdf.setFont(undefined, "bold");
        pdf.text(label + ":", labelX, y);
        pdf.setFont(undefined, "normal");
        pdf.text(String(value || "—"), valueX, y);
        y += lineH;
      };

      pdf.setFontSize(10);
      field("Nº Consulta", caso.numeroConsulta ? `#${caso.numeroConsulta}` : casoId);
      field("Paciente", caso.personaNombre || "—");
      field("DNI", caso.personaDni || "—");
      field("Fecha", fechaCaso);
      field("Motivo", caso.motivo || "—");
      field("Tipo", tipo);
      field("Prioridad", prioridad);

      y += 5;

      // DESCRIPCIÓN
      pdf.setFont(undefined, "bold");
      pdf.setFontSize(10);
      pdf.text("Descripción:", margin, y);
      y += 6;

      pdf.setFont(undefined, "normal");
      const descripcion = caso.descripcion || "Sin descripción";
      const descLines = pdf.splitTextToSize(descripcion, pageWidth - margin * 2);
      pdf.text(descLines, margin, y);
      y += descLines.length * 5 + 8;

      // FIRMA + QR
      const firmaBlockHeight = 66;
      if (y > pageHeight - (firmaBlockHeight + 35)) {
        pdf.addPage();
        y = 16;
      }

      pdf.setFillColor(...CONFIG.colorVerdeFondo);
      pdf.roundedRect(margin, y, pageWidth - margin * 2, firmaBlockHeight, 2, 2, "F");
      pdf.setDrawColor(...CONFIG.colorVerdeBorde);
      pdf.roundedRect(margin, y, pageWidth - margin * 2, firmaBlockHeight, 2, 2, "S");

      y += 8;

      pdf.setFont(undefined, "bold");
      pdf.setFontSize(12);
      pdf.setTextColor(...CONFIG.colorVerdeBorde);
      pdf.text("FIRMA DIGITAL CERTIFICADA", margin + 4, y);

      const qrSize = 30; // 🔼 más grande
      const qrX = pageWidth - margin - qrSize - 6; 
      const qrY = y - 4; // ajuste visual vertical


      if (qrDataURL) {
        try {
          pdf.addImage(qrDataURL, "PNG", qrX, qrY, qrSize, qrSize);
        } catch (e) {
          console.warn("[PDF] No se pudo insertar QR:", e);
        }
      } else {
        pdf.setFontSize(8);
        pdf.setFont(undefined, "normal");
        pdf.setTextColor(80, 80, 80);
        pdf.text("QR no disponible", qrX + qrSize / 2, qrY + 12, { align: "center" });
      }

      y += 9;
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(9);

      const fLabelX = margin + 4;
      const fValueX = margin + 42;

      const fField = (label, value) => {
        pdf.setFont(undefined, "bold");
        pdf.text(label + ":", fLabelX, y);
        pdf.setFont(undefined, "normal");
        pdf.text(String(value || "—"), fValueX, y);
        y += 5.5;
      };

      fField("Firmado por", firma.profesional);
      fField("Email", firma.profesionalEmail || "—");
      fField("Fecha y hora", formatFechaHoraAR(firma.timestamp));
      fField("ID Profesional", firma.profesionalId || "—");

      y += 1;
      pdf.setFont(undefined, "bold");
      pdf.text("Hash SHA-256:", fLabelX, y);
      y += 5;

      pdf.setFont("courier", "normal");
      pdf.setFontSize(7.5);

      const hash = firma.hash || "No disponible";
      const hashLines = pdf.splitTextToSize(hash, pageWidth - margin * 2 - 8);
      pdf.text(hashLines, fLabelX, y);

      y += hashLines.length * 3.8 + 4;

      pdf.setFont(undefined, "italic");
      pdf.setFontSize(9);
      pdf.setTextColor(...CONFIG.colorVerdeBorde);
      pdf.text("Esta firma es verificable y legalmente válida", fLabelX, y);

      y += 12;

      // ADVERTENCIA LEGAL
      const warnHeight = 26;
      if (y > pageHeight - 25) {
        pdf.addPage();
        y = 16;
      }

      pdf.setFillColor(...CONFIG.colorAmarilloFondo);
      pdf.roundedRect(margin, y, pageWidth - margin * 2, warnHeight, 2, 2, "F");
      pdf.setDrawColor(...CONFIG.colorAmarilloBorde);
      pdf.roundedRect(margin, y, pageWidth - margin * 2, warnHeight, 2, 2, "S");

      y += 7;
      pdf.setFont(undefined, "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(...CONFIG.colorAmarilloBorde);
      pdf.text("ADVERTENCIA LEGAL", margin + 4, y);

      y += 5;
      pdf.setFont(undefined, "normal");
      pdf.setFontSize(8);

      const advertencia =
        "Este documento ha sido firmado digitalmente y contiene información sensible. " +
        "La autenticidad puede verificarse mediante el QR y el hash SHA-256. " +
        "Cualquier modificación invalidará la firma.";

      const advLines = pdf.splitTextToSize(advertencia, pageWidth - margin * 2 - 8);
      pdf.text(advLines, margin + 4, y);

      // FOOTER
      pdf.setTextColor(120, 120, 120);
      pdf.setFontSize(8);
      pdf.setFont(undefined, "italic");
      const generado = new Date();
      pdf.text(
        `Documento generado el ${generado.toLocaleString("es-AR")} • ID: ${docUID}`,
        pageWidth / 2,
        pageHeight - 8,
        { align: "center" }
      );

      const safeName = `Certificado_${(caso.personaNombre || "Caso")}_${(caso.numeroConsulta || casoId)}`
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9_.-]/g, "");

      pdf.save(`${safeName}.pdf`);
    } catch (err) {
      console.error("Error generando PDF certificado:", err);
      alert("Error al generar el PDF certificado: " + (err?.message || err));
    }
  };
})();
