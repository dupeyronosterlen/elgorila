// --- SISTEMA DE CERTIFICADOS DIGITALES ---
// Genera certificados únicos con QR para cada boleto
// Optimizado para validar 200 boletos en <30 minutos

const CertificadoManager = {
    // Generar ID único para certificado
    generarIdUnico() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 9).toUpperCase();
        return `CERT-${timestamp}-${random}`;
    },

    // Generar código QR único (formato: CERT-{timestamp}-{random})
    generarCodigoQR() {
        return this.generarIdUnico();
    },

    // Crear certificado para un boleto
    crearCertificado(ordenCompra, numeroBoleto) {
        const codigoQR = this.generarCodigoQR();
        const certificado = {
            id: codigoQR,
            numeroBoleto: numeroBoleto,
            numeroOrden: ordenCompra.numeroOrden,
            fecha: ordenCompra.fecha,
            fechaCompra: ordenCompra.fechaCompra || new Date().toISOString(),
            email: ordenCompra.email,
            estado: 'activo', // activo, usado, cancelado
            fechaUso: null,
            fechaCreacion: new Date().toISOString()
        };

        return certificado;
    },

    // Guardar certificados en base de datos optimizada
    guardarCertificados(certificados) {
        try {
            // Obtener base de datos existente
            const db = JSON.parse(localStorage.getItem('certificados_db') || '{}');
            
            // Estructura optimizada:
            // db.certificados = { [codigoQR]: certificado }
            // db.indices = { porOrden: { [numeroOrden]: [codigosQR] }, porEmail: { [email]: [codigosQR] } }
            
            if (!db.certificados) db.certificados = {};
            if (!db.indices) db.indices = { porOrden: {}, porEmail: {}, porFecha: {} };
            
            // Guardar cada certificado
            certificados.forEach(cert => {
                // Guardar certificado
                db.certificados[cert.id] = cert;
                
                // Actualizar índices para búsqueda rápida
                // Índice por orden
                if (!db.indices.porOrden[cert.numeroOrden]) {
                    db.indices.porOrden[cert.numeroOrden] = [];
                }
                db.indices.porOrden[cert.numeroOrden].push(cert.id);
                
                // Índice por email
                if (!db.indices.porEmail[cert.email]) {
                    db.indices.porEmail[cert.email] = [];
                }
                db.indices.porEmail[cert.email].push(cert.id);
                
                // Índice por fecha (para validación rápida)
                const fechaKey = cert.fecha || 'sin-fecha';
                if (!db.indices.porFecha[fechaKey]) {
                    db.indices.porFecha[fechaKey] = [];
                }
                db.indices.porFecha[fechaKey].push(cert.id);
            });
            
            // Guardar en localStorage
            localStorage.setItem('certificados_db', JSON.stringify(db));
            
            return { exito: true, cantidad: certificados.length };
        } catch (error) {
            console.error('Error al guardar certificados:', error);
            return { exito: false, error: error.message };
        }
    },

    // Generar certificados para una orden completa
    generarCertificadosParaOrden(ordenCompra) {
        const certificados = [];
        
        // Generar un certificado por cada boleto
        for (let i = 1; i <= ordenCompra.cantidad; i++) {
            const certificado = this.crearCertificado(ordenCompra, i);
            certificados.push(certificado);
        }
        
        // Guardar en base de datos
        const resultado = this.guardarCertificados(certificados);
        
        if (resultado.exito) {
            return { exito: true, certificados: certificados };
        } else {
            return { exito: false, error: resultado.error };
        }
    },

    // Verificar certificado por código QR (OPTIMIZADO para velocidad)
    verificarCertificado(codigoQR) {
        try {
            const startTime = performance.now();
            
            // Cargar base de datos
            const db = JSON.parse(localStorage.getItem('certificados_db') || '{}');
            
            if (!db.certificados || !db.certificados[codigoQR]) {
                return {
                    valido: false,
                    error: 'Certificado no encontrado',
                    tiempo: performance.now() - startTime
                };
            }
            
            const certificado = db.certificados[codigoQR];
            
            // Verificar estado
            if (certificado.estado === 'cancelado') {
                return {
                    valido: false,
                    error: 'Certificado cancelado',
                    certificado: certificado,
                    tiempo: performance.now() - startTime
                };
            }
            
            if (certificado.estado === 'usado') {
                return {
                    valido: false,
                    error: 'Certificado ya utilizado',
                    certificado: certificado,
                    fechaUso: certificado.fechaUso,
                    tiempo: performance.now() - startTime
                };
            }
            
            // Certificado válido
            return {
                valido: true,
                certificado: certificado,
                tiempo: performance.now() - startTime
            };
        } catch (error) {
            console.error('Error al verificar certificado:', error);
            return {
                valido: false,
                error: 'Error al verificar certificado',
                tiempo: performance.now() - startTime
            };
        }
    },

    // Marcar certificado como usado (validación en entrada)
    marcarComoUsado(codigoQR) {
        try {
            const db = JSON.parse(localStorage.getItem('certificados_db') || '{}');
            
            if (!db.certificados || !db.certificados[codigoQR]) {
                return { exito: false, error: 'Certificado no encontrado' };
            }
            
            const certificado = db.certificados[codigoQR];
            
            // Verificar que no esté ya usado
            if (certificado.estado === 'usado') {
                return { exito: false, error: 'Certificado ya utilizado', fechaUso: certificado.fechaUso };
            }
            
            // Marcar como usado
            certificado.estado = 'usado';
            certificado.fechaUso = new Date().toISOString();
            
            // Guardar cambios
            db.certificados[codigoQR] = certificado;
            localStorage.setItem('certificados_db', JSON.stringify(db));
            
            return { exito: true, certificado: certificado };
        } catch (error) {
            console.error('Error al marcar certificado como usado:', error);
            return { exito: false, error: error.message };
        }
    },

    // Validación en batch (para validar múltiples boletos rápidamente)
    validarBatch(codigosQR) {
        const resultados = [];
        const startTime = performance.now();
        
        codigosQR.forEach(codigo => {
            const resultado = this.verificarCertificado(codigo);
            resultados.push({
                codigo: codigo,
                ...resultado
            });
        });
        
        const tiempoTotal = performance.now() - startTime;
        
        return {
            resultados: resultados,
            tiempoTotal: tiempoTotal,
            promedio: tiempoTotal / codigosQR.length,
            validos: resultados.filter(r => r.valido).length,
            invalidos: resultados.filter(r => !r.valido).length
        };
    },

    // Obtener certificados por orden
    obtenerCertificadosPorOrden(numeroOrden) {
        try {
            const db = JSON.parse(localStorage.getItem('certificados_db') || '{}');
            
            if (!db.indices || !db.indices.porOrden || !db.indices.porOrden[numeroOrden]) {
                return [];
            }
            
            const codigosQR = db.indices.porOrden[numeroOrden];
            const certificados = codigosQR.map(codigo => db.certificados[codigo]).filter(c => c);
            
            return certificados;
        } catch (error) {
            console.error('Error al obtener certificados por orden:', error);
            return [];
        }
    },

    // Obtener certificados por email
    obtenerCertificadosPorEmail(email) {
        try {
            const db = JSON.parse(localStorage.getItem('certificados_db') || '{}');
            
            if (!db.indices || !db.indices.porEmail || !db.indices.porEmail[email]) {
                return [];
            }
            
            const codigosQR = db.indices.porEmail[email];
            const certificados = codigosQR.map(codigo => db.certificados[codigo]).filter(c => c);
            
            return certificados;
        } catch (error) {
            console.error('Error al obtener certificados por email:', error);
            return [];
        }
    },

    // Estadísticas de certificados
    obtenerEstadisticas() {
        try {
            const db = JSON.parse(localStorage.getItem('certificados_db') || '{}');
            
            if (!db.certificados) {
                return {
                    total: 0,
                    activos: 0,
                    usados: 0,
                    cancelados: 0
                };
            }
            
            const certificados = Object.values(db.certificados);
            
            return {
                total: certificados.length,
                activos: certificados.filter(c => c.estado === 'activo').length,
                usados: certificados.filter(c => c.estado === 'usado').length,
                cancelados: certificados.filter(c => c.estado === 'cancelado').length
            };
        } catch (error) {
            console.error('Error al obtener estadísticas:', error);
            return { total: 0, activos: 0, usados: 0, cancelados: 0 };
        }
    }
};

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.CertificadoManager = CertificadoManager;
}
