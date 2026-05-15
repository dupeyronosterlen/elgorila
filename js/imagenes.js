// --- SISTEMA DE ROTACIÓN ALEATORIA DE IMÁGENES ---
// Rota aleatoriamente fondos e imágenes de sinopsis

// Función helper para verificar si un elemento está en viewport
function isElementInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

// Obtener imagen aleatoria de una carpeta
function obtenerImagenAleatoria(carpeta, cantidad) {
    const numero = Math.floor(Math.random() * cantidad) + 1;
    return `img/${carpeta}/${numero}.png`;
}

// Fondo negro sólido (sin rotación de imágenes para mejor rendimiento)

// Aplicar imagen de sinopsis aleatoria (solo si existe el elemento)
function aplicarSinopsisAleatoria() {
    const imgSinopsis = document.getElementById('imagen-sinopsis');
    if (imgSinopsis) {
        const n = Math.floor(Math.random() * 7) + 1;
        imgSinopsis.src = 'img/SINOPSIS/mobile/' + n + '.webp';
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

// Lista de imágenes en img/GALERIA (solo archivos que existen; actualizar si añades o quitas fotos)
const imagenesGaleria = [
    '01.jpeg', '02.png', '03.jpeg', '04.png', '05.jpeg', '06.png', '07.jpeg', '08.png', '09.jpeg',
    '011.jpeg', '013.jpeg', '014.png', '015.jpeg', '016.png', '017.jpeg', '018.png', '019.jpeg',
    '021.jpeg', '022.png', '023.jpeg', '025.jpeg', '026.jpeg', '027.jpeg', '028.jpeg', '029.jpeg',
    '030.jpeg', '031.jpeg', '032.jpeg', '033.jpeg', '034.jpeg', '035.jpeg', '036.jpeg', '037.jpeg',
    '038.jpeg', '039.jpeg', '040.jpeg', '041.jpeg', '042.png', '043.png', '044.png', '045.png',
    '046.png', '047.png', '048.png', '049.png', '050.png', '051.png', '052.png', '053.png',
    '054.png', '055.png', '056.png', '057.png', '058.png', '059.png', '061.png', '062.png',
    '063.png', '064.png', '066.png', '067.png', '068.png', '069.png', '070.png', '071.png',
    '072.png', '073.png', '074.png', '075.png', '076.png'
];
const galeriaFallback = 'img/GALERIA/mobile/02.webp';
const GALERIA_MOBILE_BREAKPOINT = 1230;

function galeriaRuta(filename) {
    var base = filename.replace(/\.(jpe?g|png)$/i, '');
    return 'img/GALERIA/mobile/' + base + '.webp';
}

// Aplicar imágenes aleatorias a la galería: móvil usa WebP en mobile/, desktop usa original
function aplicarGaleriaAleatoria() {
    const cantidadMostrar = 12;
    const numerosSeleccionados = new Set();
    while (numerosSeleccionados.size < cantidadMostrar) {
        numerosSeleccionados.add(Math.floor(Math.random() * imagenesGaleria.length));
    }
    const indices = Array.from(numerosSeleccionados);
    const fallback = galeriaFallback;
    for (let i = 0; i < cantidadMostrar; i++) {
        const imgElement = document.getElementById(`galeria-img-${i + 1}`);
        if (imgElement) {
            const idx = indices[i];
            imgElement.src = galeriaRuta(imagenesGaleria[idx]);
            imgElement.setAttribute('data-galeria-index', String(idx));
            imgElement.setAttribute('data-galeria-filename', imagenesGaleria[idx]);
            imgElement.onerror = function () {
                this.onerror = null;
                this.src = fallback;
            };
        }
    }
}

// Índices actualmente usados por otras fotos de la galería (para no duplicar al avanzar)
function getIndicesUsadosGaleria(excluirImg) {
    var usados = new Set();
    for (var i = 1; i <= 12; i++) {
        var el = document.getElementById('galeria-img-' + i);
        if (!el || el === excluirImg) continue;
        var idx = parseInt(el.getAttribute('data-galeria-index'), 10);
        if (!isNaN(idx)) usados.add(idx);
    }
    return usados;
}

// Avanzar a la siguiente imagen de la galería (ciclo) al hacer clic; no duplicar con otras
function siguienteImagenGaleria(imgElement) {
    if (!imgElement || !imagenesGaleria.length) return;
    var current = parseInt(imgElement.getAttribute('data-galeria-index'), 10);
    if (isNaN(current)) {
        var name = (imgElement.src || '').split('/').pop();
        current = imagenesGaleria.indexOf(name);
        if (current < 0) current = 0;
    }
    var usados = getIndicesUsadosGaleria(imgElement);
    var next = (current + 1) % imagenesGaleria.length;
    var intentos = 0;
    while (usados.has(next) && intentos < imagenesGaleria.length) {
        next = (next + 1) % imagenesGaleria.length;
        intentos++;
    }
    imgElement.setAttribute('data-galeria-index', String(next));
    imgElement.setAttribute('data-galeria-filename', imagenesGaleria[next]);
    imgElement.style.opacity = '0';
    var src = galeriaRuta(imagenesGaleria[next]);
    var preload = new Image();
    preload.onload = function () {
        imgElement.src = src;
        imgElement.onerror = function () {
            this.onerror = null;
            this.src = galeriaFallback;
        };
        imgElement.style.opacity = '1';
    };
    preload.onerror = function () {
        imgElement.src = galeriaFallback;
        imgElement.style.opacity = '1';
    };
    preload.src = src;
}

var galeriaMobileBreakpoint = 1230;

function setupGaleriaClic() {
    for (var i = 1; i <= 12; i++) {
        var el = document.getElementById('galeria-img-' + i);
        if (!el) continue;
        el.style.cursor = 'pointer';
        el.style.transition = 'opacity 0.2s ease';
        el.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var img = this;
            var isMobile = window.innerWidth < galeriaMobileBreakpoint;
            if (isMobile) {
                if (img.classList.contains('galeria-img-color')) {
                    img.classList.remove('galeria-img-color');
                    siguienteImagenGaleria(img);
                } else {
                    img.classList.add('galeria-img-color');
                }
            } else {
                siguienteImagenGaleria(img);
            }
        });
    }
}

// Sistema de carrusel de cartel rotatorio (lado izquierdo) - 01 al 09; WebP en mobile/ (móvil y desktop)
let cartelRotatorioActual = 1;
const totalCartelesRotatorios = 9; // Del 01 al 09
let intervaloCartelRotatorio = null;

// Cachear referencia al elemento
let cartelRotatorioElement = null;

// Cartel rotatorio: siempre WebP en mobile/ (~80–180 KB). Los PNG en raíz pesan ~8–14 MB cada uno y ralentizaban desktop.
function getCartelRotatorioRuta(numeroFormateado) {
    return 'img/CARTEL ROTATORIO/mobile/' + numeroFormateado + '.webp';
}

function cambiarCartelRotatorio(direccion) {
    // Obtener elemento una sola vez y cachearlo
    if (!cartelRotatorioElement) {
        cartelRotatorioElement = document.getElementById('cartel-rotatorio');
        if (!cartelRotatorioElement) return;
    }
    
    // Calcular nuevo índice
    cartelRotatorioActual += direccion;
    
    // Circular: si pasa de 9, vuelve a 1; si pasa de 0, va a 9
    if (cartelRotatorioActual > 9) {
        cartelRotatorioActual = 1;
    } else if (cartelRotatorioActual < 1) {
        cartelRotatorioActual = 9;
    }
    
    const numeroFormateado = cartelRotatorioActual.toString().padStart(2, '0');
    const ruta = getCartelRotatorioRuta(numeroFormateado);
    const prevIndex = cartelRotatorioActual - direccion;
    const prevNum = (prevIndex < 1 ? 9 : prevIndex > 9 ? 1 : prevIndex).toString().padStart(2, '0');
    const rutaPrev = getCartelRotatorioRuta(prevNum);

    cartelRotatorioElement.style.opacity = '0';
    requestAnimationFrame(function () {
        const img = new Image();
        img.onload = function () {
            cartelRotatorioElement.style.backgroundImage = "url('" + ruta + "')";
            cartelRotatorioElement.style.opacity = '1';
        };
        img.onerror = function () {
            cartelRotatorioActual = prevIndex < 1 ? 9 : prevIndex > 9 ? 1 : prevIndex;
            cartelRotatorioElement.style.backgroundImage = "url('" + rutaPrev + "')";
            cartelRotatorioElement.style.opacity = '1';
        };
        img.src = ruta;
    });
    
    // NO hay intervalo automático - solo manual
    reiniciarIntervaloCartelRotatorio();
}

function reiniciarIntervaloCartelRotatorio() {
    // Limpiar intervalo anterior - NO hay cambio automático, solo manual
    if (intervaloCartelRotatorio) {
        clearInterval(intervaloCartelRotatorio);
        intervaloCartelRotatorio = null;
    }
    // No crear nuevo intervalo - cambio solo manual con botones
}

function inicializarCartelRotatorio() {
    const cartelRotatorio = document.getElementById('cartel-rotatorio');
    if (!cartelRotatorio || cartelRotatorio.getAttribute('data-cartel-loaded') === '1') return;
    // Cargar solo la primera imagen (móvil: WebP, desktop: PNG); 02-09 se cargan al hacer clic
    cartelRotatorioActual = 1;
    const ruta01 = getCartelRotatorioRuta('01');
    const img = new Image();
    img.onload = function () {
        cartelRotatorio.style.backgroundImage = "url('" + ruta01 + "')";
        cartelRotatorio.style.opacity = '1';
        cartelRotatorio.setAttribute('data-cartel-loaded', '1');
    };
    img.onerror = function () {
        cartelRotatorio.style.opacity = '1';
        cartelRotatorio.setAttribute('data-cartel-loaded', '1');
    };
    img.src = ruta01;
    reiniciarIntervaloCartelRotatorio();
}

// Rotación de imágenes de La Obra - detecta automáticamente
let obraImagenActual = 2;
const totalObraImagenes = 10;
const extensionesObra = ['jpg', 'jpeg', 'png'];
// Números disponibles detectados: 2, 3, 4
const numerosObraDisponibles = [2, 3, 4];

// Cachear referencia al elemento
let obraImagenElement = null;

function cambiarImagenObra() {
    if (!obraImagenElement) {
        obraImagenElement = document.getElementById('obra-imagen');
        if (!obraImagenElement) return;
    }
    
    let indiceActual = numerosObraDisponibles.indexOf(obraImagenActual);
    if (indiceActual === -1) indiceActual = 0;
    indiceActual = (indiceActual + 1) % numerosObraDisponibles.length;
    obraImagenActual = numerosObraDisponibles[indiceActual];
    
    obraImagenElement.style.opacity = '0';
    
    requestAnimationFrame(() => {
        const extensiones = ['jpg', 'jpeg', 'png'];
        let extensionIndex = 0;
        let numeroIndex = 0;
        const todosLosNumeros = [...numerosObraDisponibles];
        
        const intentarCargar = () => {
            const numActual = todosLosNumeros[(indiceActual + numeroIndex) % todosLosNumeros.length];
            const ruta = `img/OBRA/${numActual}.${extensiones[extensionIndex]}`;
            const img = new Image();
            
            img.onload = () => {
                obraImagenElement.src = ruta;
                obraImagenElement.onerror = null;
                obraImagenElement.style.opacity = '1';
            };
            
            img.onerror = () => {
                extensionIndex++;
                if (extensionIndex >= extensiones.length) {
                    extensionIndex = 0;
                    numeroIndex++;
                    if (numeroIndex >= todosLosNumeros.length) {
                        obraImagenElement.style.opacity = '1';
                        return;
                    }
                }
                intentarCargar();
            };
            
            img.src = ruta;
        };
        
        intentarCargar();
    });
}

// Inicializar con la primera imagen disponible (optimizado con fallbacks robustos)
function inicializarImagenObra() {
    obraImagenElement = document.getElementById('obra-imagen');
    if (obraImagenElement && numerosObraDisponibles.length > 0) {
        obraImagenActual = numerosObraDisponibles[0];
        const extensiones = ['jpg', 'jpeg', 'png'];
        let extensionIndex = 0;
        let numeroIndex = 0;
        
        const intentarCargar = () => {
            const numActual = numerosObraDisponibles[numeroIndex];
            const ruta = `img/OBRA/${numActual}.${extensiones[extensionIndex]}`;
            const img = new Image();
            
            img.onload = () => {
                obraImagenElement.src = ruta;
                obraImagenElement.onerror = null;
                obraImagenActual = numActual;
            };
            
            img.onerror = () => {
                extensionIndex++;
                if (extensionIndex >= extensiones.length) {
                    extensionIndex = 0;
                    numeroIndex++;
                    if (numeroIndex < numerosObraDisponibles.length) {
                        intentarCargar();
                    }
                } else {
                    intentarCargar();
                }
            };
            
            img.src = ruta;
        };
        
        intentarCargar();
    }
}

// Rotación de imágenes del Actor - detecta automáticamente múltiples formatos
let actorImagenActual = 1;
const totalActorImagenes = 15;
// Solo JPG ligeros (evitar PNG pesados duplicados)
const numerosActorDisponibles = [1, 2, 3, 4, 5];

// Cachear referencia al elemento
let actorImagenElement = null;

function cambiarImagenActor() {
    if (!actorImagenElement) {
        actorImagenElement = document.getElementById('actor-imagen');
        if (!actorImagenElement) return;
    }
    
    let indiceActual = numerosActorDisponibles.indexOf(actorImagenActual);
    if (indiceActual === -1) indiceActual = 0;
    indiceActual = (indiceActual + 1) % numerosActorDisponibles.length;
    actorImagenActual = numerosActorDisponibles[indiceActual];
    
    actorImagenElement.style.opacity = '0';
    
    requestAnimationFrame(() => {
        const extensiones = ['jpg', 'JPG', 'jpeg'];
        const formatosNombre = [
            (num) => num.toString().padStart(2, '0'),
            (num) => num.toString(),
        ];
        let extensionIndex = 0;
        let formatoIndex = 0;
        let numeroIndex = 0;
        const todosLosNumeros = [...numerosActorDisponibles];
        
        const intentarCargar = () => {
            const numActual = todosLosNumeros[(indiceActual + numeroIndex) % todosLosNumeros.length];
            const nombreArchivo = formatosNombre[formatoIndex % formatosNombre.length](numActual);
            const ruta = `img/HUMBERTO DUPEYRON/${nombreArchivo}.${extensiones[extensionIndex]}`;
            const img = new Image();
            
            img.onload = () => {
                actorImagenElement.src = ruta;
                actorImagenElement.onerror = null;
                actorImagenElement.style.opacity = '1';
                actorImagenActual = numActual;
            };
            
            img.onerror = () => {
                extensionIndex++;
                if (extensionIndex >= extensiones.length) {
                    extensionIndex = 0;
                    formatoIndex++;
                    if (formatoIndex >= formatosNombre.length) {
                        numeroIndex++;
                        formatoIndex = 0;
                        if (numeroIndex >= todosLosNumeros.length) {
                            actorImagenElement.style.opacity = '1';
                            return;
                        }
                    } else {
                        intentarCargar();
                        return;
                    }
                }
                intentarCargar();
            };
            
            img.src = ruta;
        };
        
        intentarCargar();
    });
}

// Inicializar imagen del Actor (optimizado con fallbacks robustos)
function inicializarImagenActor() {
    actorImagenElement = document.getElementById('actor-imagen');
    if (actorImagenElement && numerosActorDisponibles.length > 0) {
        actorImagenActual = numerosActorDisponibles[0];
        const extensiones = ['jpg', 'JPG', 'jpeg'];
        const formatosNombre = [
            (num) => num.toString().padStart(2, '0'),
            (num) => num.toString(),
        ];
        let extensionIndex = 0;
        let formatoIndex = 0;
        let numeroIndex = 0;
        
        const intentarCargar = () => {
            const numActual = numerosActorDisponibles[numeroIndex];
            const nombreArchivo = formatosNombre[formatoIndex % formatosNombre.length](numActual);
            const ruta = `img/HUMBERTO DUPEYRON/${nombreArchivo}.${extensiones[extensionIndex]}`;
            const img = new Image();
            
            img.onload = () => {
                actorImagenElement.src = ruta;
                actorImagenElement.onerror = null;
                actorImagenActual = numActual;
            };
            
            img.onerror = () => {
                extensionIndex++;
                if (extensionIndex >= extensiones.length) {
                    extensionIndex = 0;
                    formatoIndex++;
                    if (formatoIndex >= formatosNombre.length) {
                        numeroIndex++;
                        formatoIndex = 0;
                        if (numeroIndex < numerosActorDisponibles.length) {
                            intentarCargar();
                        }
                    } else {
                        intentarCargar();
                    }
                } else {
                    intentarCargar();
                }
            };
            
            img.src = ruta;
        };
        
        intentarCargar();
    }
}

// Inicializar rotación de imágenes (optimizado con cacheo de elementos)
function inicializarRotacionImagenes() {
    // Inicializar imagen de La Obra
    inicializarImagenObra();
    
    // Rotar imágenes de La Obra cada 12 segundos - solo si está en viewport
    if (obraImagenElement) {
        setInterval(() => {
            if (isElementInViewport(obraImagenElement)) {
                cambiarImagenObra();
            }
        }, 12000);
        // Cambiar al hacer click (opcional)
        obraImagenElement.parentElement.addEventListener('click', cambiarImagenObra);
        obraImagenElement.parentElement.style.cursor = 'pointer';
    }
    
    // Inicializar imagen del Actor
    inicializarImagenActor();
    
    // Rotar imágenes del Actor cada 12 segundos - solo si está en viewport
    if (actorImagenElement) {
        setInterval(() => {
            if (isElementInViewport(actorImagenElement)) {
                cambiarImagenActor();
            }
        }, 12000);
        // Cambiar al hacer click (opcional)
        actorImagenElement.parentElement.addEventListener('click', cambiarImagenActor);
        actorImagenElement.parentElement.style.cursor = 'pointer';
    }
}

// Cuadros decorativos SINOPSIS: 20 cuadros (el doble), distribuidos aleatoriamente, difuminado variable
function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function inicializarCuadrosDecorativos() {
    if (window.innerWidth < 1230) return;
    const sinopsisTotal = 7;
    // 20 imágenes: dos rondas de 1-7 mezcladas + 6 extra al azar
    const ronda1 = shuffleArray([1, 2, 3, 4, 5, 6, 7]);
    const ronda2 = shuffleArray([1, 2, 3, 4, 5, 6, 7]);
    const extra = Array.from({ length: 6 }, () => Math.floor(Math.random() * sinopsisTotal) + 1);
    const numeros = ronda1.concat(ronda2).concat(extra);

    // Tamaños variados: 20 combinaciones [ancho vw, alto vw] y max px
    const tamanos = [
        [12, 14], [18, 11], [10, 18], [16, 16], [14, 10],
        [11, 16], [20, 12], [13, 20], [15, 13], [9, 15],
        [17, 9], [8, 19], [19, 14], [11, 12], [14, 17],
        [10, 15], [16, 11], [13, 18], [15, 10], [9, 16]
    ];
    const maxPx = [140, 200, 160, 180, 130, 170, 220, 190, 150, 120, 165, 155, 205, 125, 175, 145, 185, 195, 135, 115];

    // 20 posiciones aleatorias (porcentaje left, top) para distribución aleatoria
    const posiciones = [];
    for (let i = 0; i < 20; i++) {
        const left = Math.floor(Math.random() * 82) + 4;   // 4–85%
        const top = Math.floor(Math.random() * 82) + 4;    // 4–85%
        posiciones.push([left, top]);
    }

    // Blur variable: 1–4px (unas más difuminadas que otras); opacidad 0.06–0.11
    const blurs = shuffleArray([1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 1, 2, 2, 3, 1, 3, 2, 4, 2]);
    const opacidades = shuffleArray([0.06, 0.07, 0.07, 0.08, 0.08, 0.08, 0.09, 0.09, 0.09, 0.10, 0.10, 0.11, 0.07, 0.08, 0.09, 0.06, 0.10, 0.08, 0.07, 0.09]);

    for (let i = 1; i <= 20; i++) {
        const el = document.getElementById('cuadro-decorativo-' + i);
        if (!el) continue;
        el.style.backgroundImage = "url('img/SINOPSIS/mobile/" + numeros[i - 1] + ".webp')";
        const [left, top] = posiciones[i - 1];
        el.style.left = left + '%';
        el.style.top = top + '%';
        const [w, h] = tamanos[i - 1];
        const mx = maxPx[i - 1];
        el.style.width = "min(" + w + "vw, " + mx + "px)";
        el.style.height = "min(" + h + "vw, " + Math.round(mx * 0.9) + "px)";
        el.style.filter = "blur(" + (blurs[i - 1] || 2) + "px)";
        el.style.opacity = String(opacidades[i - 1] ?? 0.08);
    }
}

// Inicializar rotación de imágenes (optimizado)
function inicializarImagenes() {
    // Fondo negro sólido (sin imagen de fondo para mejor rendimiento)
    aplicarSinopsisAleatoria();
    
    // Cachear elementos una sola vez
    const cartelRotatorio = document.getElementById('cartel-rotatorio');
    const galeriaImg1 = document.getElementById('galeria-img-1');
    
    // Cartel rotatorio: cargar solo la primera imagen después del primer pintado; 02-09 se cargan al hacer clic
    if (cartelRotatorio) {
        if (window.requestIdleCallback) {
            requestIdleCallback(function () { inicializarCartelRotatorio(); }, { timeout: 120 });
        } else {
            setTimeout(inicializarCartelRotatorio, 0);
        }
    }
    
    // Aplicar imágenes aleatorias a la galería si estamos en la página principal; clic cambia de foto
    if (galeriaImg1) {
        aplicarGaleriaAleatoria();
        setupGaleriaClic();
    }
    
    // Inicializar rotación de imágenes para las nuevas secciones
    inicializarRotacionImagenes();

    // Cuadros decorativos: solo en desktop y después del load para no bloquear
    if (window.requestIdleCallback) {
        requestIdleCallback(function () { inicializarCuadrosDecorativos(); }, { timeout: 800 });
    } else {
        setTimeout(inicializarCuadrosDecorativos, 400);
    }

    // Si se redimensiona a vista wide (>=768px), mostrar cuadros decorativos
    var lastWidth = window.innerWidth;
    window.addEventListener('resize', function () {
        var w = window.innerWidth;
        if (lastWidth < 1230 && w >= 1230) {
            inicializarCuadrosDecorativos();
        }
        lastWidth = w;
    });
}

// Cartel Informativo - Imagen fija (solo 1.png, sin rotación)

// Exportar funciones para uso en HTML
window.cambiarCartelRotatorio = cambiarCartelRotatorio;

// Ejecutar al cargar la página (optimizado)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarImagenes);
} else {
    // DOM ya está listo
    inicializarImagenes();
}
