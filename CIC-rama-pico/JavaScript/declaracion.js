document.addEventListener("DOMContentLoaded", function () {
    const checkbox = document.getElementById("acepto");
    const boton = document.getElementById("continuarBtn");

    checkbox.addEventListener("change", function () {
        boton.disabled = !this.checked;
    });

    boton.addEventListener("click", function () {
        window.location.href = "formulario.html";
    });


});
