// script.js

// ===============================
// PREVISUALIZAR FOTO (si existe)
// ===============================
const fotoInput = document.getElementById('foto');
const preview = document.getElementById('preview');

if (fotoInput && preview) {
  fotoInput.addEventListener('change', function () {
    const file = this.files && this.files[0];

    if (file) {
      const reader = new FileReader();
      reader.onload = function (e) {
        preview.innerHTML = `<img src="${e.target.result}" alt="Foto" />`;
      };
      reader.readAsDataURL(file);
    } else {
      preview.innerHTML = '';
    }
  });
}

// ===============================
// ALERTA DE BIENVENIDA (opcional)
// ===============================
// Solo se ejecuta una vez por sesión de navegador
window.addEventListener('load', () => {
  try {
    if (!sessionStorage.getItem('bienvenidaMostrada')) {
      alert('¡Bienvenido al formulario del CIC!');
      sessionStorage.setItem('bienvenidaMostrada', 'true');
    }
  } catch (e) {
    console.warn('No se pudo usar sessionStorage para la bienvenida:', e);
  }
});
