// --- SISTEMA DE TAQUILLA ---
// Gestión de boletos en efectivo y códigos de ingreso

const TaquillaManager = {
    // Generar código de ingreso para boleto en efectivo
    generarCodigoIngreso(fecha, cantidad, metadata = {}) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 9).toUpperCase();
        const codigo = `EFECT-${timestamp}-${random}`;
        
        const boletoEfectivo = {
            id: codigo,
            tipo: 'efectivo',
            fecha: fecha,
            cantidad: cantidad,
            fechaCreacion: new Date().toISOString(),
            estado: 'activo',
            usado: false,
            fechaUso: null,
            metadata: {
                discapacidad: metadata.discapacidad || false,
                acompanantes: metadata.acompanantes || 0,
                notas: metadata.notas || '',
                ...metadata
            }
        };
        
        // Guardar en base de datos
        this.guardarBoletoEfectivo(boletoEfectivo);
        
        // Registrar en auditoría
        if (typeof AuthManager !== 'undefined') {
            const usuario = AuthManager.obtenerUsuarioActual();
            if (usuario) {
                AuthManager.registrarAuditoria({
                    accion: 'generar_codigo_efectivo',
                    usuario: usuario.nombre,
                    rol: usuario.rol,
                    detalles: `Código generado para ${cantidad} boleto(s) en efectivo - ${fecha}`,
                    cambios: { boletoEfectivo: boletoEfectivo }
                });
            }
        }
        
        return boletoEfectivo;
    },

    // Guardar boleto en efectivo
    guardarBoletoEfectivo(boleto) {
        try {
            const boletosEfectivo = this.obtenerBoletosEfectivo();
            boletosEfectivo[boleto.id] = boleto;
            localStorage.setItem('boletos_efectivo', JSON.stringify(boletosEfectivo));
            return true;
        } catch (error) {
            console.error('Error al guardar boleto en efectivo:', error);
            return false;
        }
    },

    // Obtener todos los boletos en efectivo
    obtenerBoletosEfectivo() {
        try {
            const boletos = localStorage.getItem('boletos_efectivo');
            return boletos ? JSON.parse(boletos) : {};
        } catch (error) {
            console.error('Error al obtener boletos en efectivo:', error);
            return {};
        }
    },

    // Obtener boletos por fecha
    obtenerBoletosPorFecha(fecha) {
        const boletos = this.obtenerBoletosEfectivo();
        return Object.values(boletos).filter(b => b.fecha === fecha);
    },

    // Obtener estadísticas por fecha
    obtenerEstadisticasPorFecha(fecha) {
        const boletos = this.obtenerBoletosPorFecha(fecha);
        
        return {
            total: boletos.length,
            activos: boletos.filter(b => b.estado === 'activo' && !b.usado).length,
            usados: boletos.filter(b => b.usado).length,
            conDiscapacidad: boletos.filter(b => b.metadata && b.metadata.discapacidad).length,
            totalPersonas: boletos.reduce((sum, b) => sum + (b.cantidad || 1), 0)
        };
    },

    // Marcar boleto en efectivo como usado
    marcarComoUsado(codigo) {
        try {
            const boletos = this.obtenerBoletosEfectivo();
            const boleto = boletos[codigo];
            
            if (!boleto) {
                return { exito: false, error: 'Boleto no encontrado' };
            }
            
            if (boleto.usado) {
                return { exito: false, error: 'Boleto ya utilizado', fechaUso: boleto.fechaUso };
            }
            
            boleto.usado = true;
            boleto.fechaUso = new Date().toISOString();
            boleto.estado = 'usado';
            
            this.guardarBoletoEfectivo(boleto);
            
            // Registrar en auditoría
            if (typeof AuthManager !== 'undefined') {
                const usuario = AuthManager.obtenerUsuarioActual();
                if (usuario) {
                    AuthManager.registrarAuditoria({
                        accion: 'marcar_efectivo_usado',
                        usuario: usuario.nombre,
                        rol: usuario.rol,
                        detalles: `Boleto en efectivo usado: ${codigo}`,
                        cambios: { boleto: boleto }
                    });
                }
            }
            
            return { exito: true, boleto: boleto };
        } catch (error) {
            console.error('Error al marcar boleto como usado:', error);
            return { exito: false, error: error.message };
        }
    },

    // Verificar código de ingreso
    verificarCodigo(codigo) {
        const boletos = this.obtenerBoletosEfectivo();
        const boleto = boletos[codigo];
        
        if (!boleto) {
            return { valido: false, error: 'Código no encontrado' };
        }
        
        if (boleto.usado) {
            return { 
                valido: false, 
                error: 'Código ya utilizado',
                boleto: boleto,
                fechaUso: boleto.fechaUso
            };
        }
        
        return { valido: true, boleto: boleto };
    }
};

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.TaquillaManager = TaquillaManager;
}
