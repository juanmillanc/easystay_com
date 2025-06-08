document.addEventListener('DOMContentLoaded', function() {
    const form = document.querySelector('.form-login');
    
    // Verificar si el formulario existe antes de agregar event listeners
    if (!form) return;

    const alertaError = form.querySelector('.alerta-error');
    const alertaExito = form.querySelector('.alerta-exito');

    // Función para mostrar mensajes de error
    function showError(message) {
        if (!alertaError) return;
        alertaError.textContent = message;
        alertaError.style.display = 'block';
        if (alertaExito) alertaExito.style.display = 'none';
    }

    // Función para mostrar mensajes de éxito
    function showSuccess(message) {
        if (!alertaExito) return;
        alertaExito.textContent = message;
        alertaExito.style.display = 'block';
        if (alertaError) alertaError.style.display = 'none';
    }

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Validación básica de campos
        const email = form.querySelector('input[name="email"]').value.trim();
        const password = form.querySelector('input[name="password"]').value.trim();

        if (!email || !password) {
            showError('Por favor completa todos los campos');
            return;
        }

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: email,
                    password: password
                })
            });

            // Verificar si la respuesta es JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                // Si no es JSON, asumimos redirección
                if (response.redirected) {
                    window.location.href = response.url;
                } else {
                    showError('Error inesperado en la respuesta del servidor');
                }
                return;
            }

            const result = await response.json();

            if (response.ok && result.success) {
                showSuccess(result.message || 'Inicio de sesión exitoso');
                
                // Guardar información del usuario solo si existe
                if (result.user) {
                    localStorage.setItem('user', JSON.stringify(result.user));
                }
                // Mostrar mensaje bonito de bienvenida
                const msgDiv = document.getElementById('login-success-message');
                if(msgDiv) {
                    msgDiv.textContent = `¡Bienvenido, ${result.user?.nombre || 'usuario'}! Nos alegra tenerte de vuelta 😊`;
                    msgDiv.style.display = 'block';
                }
                // Redirigir después de 1.5 segundos
                setTimeout(() => {
                    window.location.href = result.redirectUrl || '/search';
                }, 1500);
            } else {
                showError(result.message || 'Error al iniciar sesión');
            }
        } catch (error) {
            console.error('Error en la solicitud:', error);
            showError('Error de conexión con el servidor');
        }
    });
});