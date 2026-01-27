// --- SISTEMA DE ROTACIÓN ALEATORIA DE IMÁGENES ---
// Rota aleatoriamente fondos e imágenes de sinopsis

// Obtener imagen aleatoria de una carpeta
function obtenerImagenAleatoria(carpeta, cantidad) {
    const numero = Math.floor(Math.random() * cantidad) + 1;
    return `img/${carpeta}/${numero}.png`;
}

// Aplicar fondo aleatorio al body
function aplicarFondoAleatorio() {
    // Hay hasta 5 fondos disponibles
    const fondo = obtenerImagenAleatoria('FONDOS', 5);
    console.log('🎨 Aplicando fondo:', fondo);
    
    // Aplicar al contenedor principal si existe
    const mainContainer = document.querySelector('.main-container');
    if (mainContainer) {
        mainContainer.style.backgroundImage = `url('${fondo}')`;
        console.log('✅ Fondo aplicado al main-container:', mainContainer.style.backgroundImage);
    }
    
    // Aplicar a elementos con fondo en el style inline
    const elementos = document.querySelectorAll('[style*="background-image"]');
    elementos.forEach(el => {
        const style = el.getAttribute('style');
        if (style && style.includes('img/FONDOS/')) {
            // Reemplazar cualquier fondo existente
            const nuevoStyle = style.replace(/url\(['"]?img\/FONDOS\/\d+\.png['"]?\)/g, `url('${fondo}')`);
            el.setAttribute('style', nuevoStyle);
        }
    });
    
    // Aplicar a elementos con clase background-gradient
    const elementosGradient = document.querySelectorAll('.background-gradient');
    elementosGradient.forEach(el => {
        el.style.backgroundImage = `url('${fondo}')`;
    });
}

// Aplicar imagen de sinopsis aleatoria
function aplicarSinopsisAleatoria() {
    // Hay 7 imágenes de sinopsis disponibles
    const sinopsis = obtenerImagenAleatoria('SINOPSIS', 7);
    const imgSinopsis = document.getElementById('imagen-sinopsis');
    if (imgSinopsis) {
        imgSinopsis.src = sinopsis;
    }
}

// Aplicar fondo aleatorio a la sección de sinopsis en boletos
function aplicarFondoSinopsisBoletos() {
    const seccionSinopsis = document.getElementById('seccion-sinopsis');
    if (!seccionSinopsis) return;
    
    // Ajusta este número según cuántas imágenes tengas en la carpeta "fondo sinopsis boletos"
    // Las imágenes deben estar numeradas: 1.png, 2.png, 3.png, etc.
    const cantidadFondos = 3; // Cambia este número si tienes más o menos imágenes
    
    const fondo = obtenerImagenAleatoria('fondo sinopsis boletos', cantidadFondos);
    
    // Aplicar el fondo a la sección
    seccionSinopsis.style.backgroundImage = `url('${fondo}')`;
}

// Aplicar imágenes aleatorias a la galería
function aplicarGaleriaAleatoria() {
    // Seleccionar 6 números aleatorios únicos del 1 al 50
    const cantidadImagenes = 50;
    const cantidadMostrar = 6;
    const numerosSeleccionados = [];
    
    // Generar números aleatorios únicos
    while (numerosSeleccionados.length < cantidadMostrar) {
        const numero = Math.floor(Math.random() * cantidadImagenes) + 1;
        if (!numerosSeleccionados.includes(numero)) {
            numerosSeleccionados.push(numero);
        }
    }
    
    // Aplicar a cada imagen de la galería
    for (let i = 1; i <= cantidadMostrar; i++) {
        const imgElement = document.getElementById(`galeria-img-${i}`);
        if (imgElement) {
            imgElement.src = `img/GALERIA/${numerosSeleccionados[i - 1]}.png`;
        }
    }
}

// Sistema de carrusel de carteles
let cartelActual = 1;
const totalCarteles = 2; // Actualizar si hay más carteles
let intervaloCartel = null;

function cambiarCartel(direccion) {
    // Calcular nuevo índice
    cartelActual += direccion;
    
    // Circular: si pasa de 2, vuelve a 1; si pasa de 0, va a 2
    if (cartelActual > totalCarteles) {
        cartelActual = 1;
    } else if (cartelActual < 1) {
        cartelActual = totalCarteles;
    }
    
    // Aplicar el cambio con transición
    const cartelImagen = document.getElementById('cartel-imagen');
    if (cartelImagen) {
        cartelImagen.style.opacity = '0';
        setTimeout(() => {
            cartelImagen.style.backgroundImage = `url('img/CARTEL PRINCIPAL/${cartelActual}.png')`;
            cartelImagen.style.opacity = '1';
        }, 250);
    }
    
    // Reiniciar el intervalo automático
    reiniciarIntervaloCartel();
}

function reiniciarIntervaloCartel() {
    // Limpiar intervalo anterior
    if (intervaloCartel) {
        clearInterval(intervaloCartel);
    }
    
    // Crear nuevo intervalo (9 segundos = 9000 ms)
    intervaloCartel = setInterval(() => {
        cambiarCartel(1);
    }, 9000);
}

function inicializarCartel() {
    const cartelImagen = document.getElementById('cartel-imagen');
    if (cartelImagen) {
        // Iniciar con cartel 1
        cartelActual = 1;
        cartelImagen.style.backgroundImage = `url('img/CARTEL PRINCIPAL/1.png')`;
        cartelImagen.style.opacity = '1';
        
        // Iniciar cambio automático cada 9 segundos
        reiniciarIntervaloCartel();
    }
}

// Rotación de imágenes de La Obra
let obraImagenActual = 1;
const totalObraImagenes = 2;

function cambiarImagenObra() {
    obraImagenActual = obraImagenActual === totalObraImagenes ? 1 : obraImagenActual + 1;
    const imgObra = document.getElementById('obra-imagen');
    if (imgObra) {
        imgObra.style.opacity = '0';
        setTimeout(() => {
            imgObra.src = `img/OBRA/${obraImagenActual}.png`;
            imgObra.style.opacity = '1';
        }, 250);
    }
}

// Rotación de imágenes del Actor
let actorImagenActual = 1;
const totalActorImagenes = 2;

function cambiarImagenActor() {
    actorImagenActual = actorImagenActual === totalActorImagenes ? 1 : actorImagenActual + 1;
    const imgActor = document.getElementById('actor-imagen');
    if (imgActor) {
        imgActor.style.opacity = '0';
        setTimeout(() => {
            // Intentar JPG primero, luego jpg
            const extension = imgActor.src.includes('.JPG') ? 'JPG' : 'jpg';
            imgActor.src = `img/HUMBERTO DUPEYRON/${actorImagenActual}.${extension}`;
            imgActor.onerror = function() {
                // Si falla, intentar la otra extensión
                const altExtension = extension === 'JPG' ? 'jpg' : 'JPG';
                this.src = `img/HUMBERTO DUPEYRON/${actorImagenActual}.${altExtension}`;
            };
            imgActor.style.opacity = '1';
        }, 250);
    }
}

// Inicializar rotación de imágenes
function inicializarRotacionImagenes() {
    // Rotar imágenes de La Obra cada 8 segundos
    const imgObra = document.getElementById('obra-imagen');
    if (imgObra) {
        setInterval(cambiarImagenObra, 8000);
        // Cambiar al hacer click (opcional)
        imgObra.parentElement.addEventListener('click', cambiarImagenObra);
        imgObra.parentElement.style.cursor = 'pointer';
    }
    
    // Rotar imágenes del Actor cada 8 segundos
    const imgActor = document.getElementById('actor-imagen');
    if (imgActor) {
        setInterval(cambiarImagenActor, 8000);
        // Cambiar al hacer click (opcional)
        imgActor.parentElement.addEventListener('click', cambiarImagenActor);
        imgActor.parentElement.style.cursor = 'pointer';
    }
}

// Inicializar rotación de imágenes
function inicializarImagenes() {
    aplicarFondoAleatorio();
    aplicarSinopsisAleatoria();
    
    // Inicializar carrusel de carteles si estamos en Index
    if (document.getElementById('cartel-imagen')) {
        inicializarCartel();
    }
    
    // Aplicar imágenes aleatorias a la galería si estamos en la página principal
    if (document.getElementById('galeria-img-1')) {
        aplicarGaleriaAleatoria();
    }
    
    // Inicializar rotación de imágenes para las nuevas secciones
    inicializarRotacionImagenes();
    
    // Ya no aplicamos fondo especial a la sinopsis en boletos
    // (se quitó según solicitud del usuario)
}

// Exportar función para uso en HTML
window.cambiarCartel = cambiarCartel;

// Ejecutar al cargar la página
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarImagenes);
} else {
    inicializarImagenes();
}
