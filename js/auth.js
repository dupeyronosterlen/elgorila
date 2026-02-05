// --- SISTEMA DE AUTENTICACIÓN Y ROLES ---
// Gestión de usuarios, roles, permisos y auditoría

const AuthManager = {
    // Roles disponibles
    ROLES: {
        ADMIN: 'admin',              // Acceso completo, puede hacer cambios
        GERENTE: 'gerente',          // Acceso completo, puede hacer cambios
        TAQUILLA: 'taquilla',        // Solo lectura de ventas e inventario
        VALIDACION: 'validacion',    // Solo verificación de boletos QR
        RECLAMOS: 'reclamos'         // Gestión de reclamos, solo lectura de ventas
    },

    // Jerarquía: solo admin puede tocar todo; los demás solo su cuenta o inferiores
    RANGO: { admin: 3, gerente: 2, taquilla: 1, validacion: 1, reclamos: 1 },
    rangoDe(rol) { return this.RANGO[rol] || 0; },
    puedeModificarUsuario(usuarioIdTarget) {
        const current = this.obtenerUsuarioActual();
        if (!current) return false;
        if (usuarioIdTarget === current.usuarioId) return true;
        if (current.rol === this.ROLES.ADMIN) return true;
        if (current.rol === this.ROLES.GERENTE) {
            const usuarios = this.obtenerUsuarios();
            const target = usuarios[usuarioIdTarget];
            return target && this.rangoDe(target.rol) < this.rangoDe(this.ROLES.GERENTE);
        }
        return false;
    },
    puedeEliminarUsuario(usuarioIdTarget) {
        const current = this.obtenerUsuarioActual();
        if (!current) return false;
        if (usuarioIdTarget === current.usuarioId) return false;
        const usuarios = this.obtenerUsuarios();
        const target = usuarios[usuarioIdTarget];
        if (!target) return false;
        if (current.rol === this.ROLES.ADMIN) return this.rangoDe(target.rol) < this.rangoDe(this.ROLES.ADMIN);
        if (current.rol === this.ROLES.GERENTE) return this.rangoDe(target.rol) < this.rangoDe(this.ROLES.GERENTE);
        return false;
    },
    puedeCrearRol(rol) {
        const current = this.obtenerUsuarioActual();
        if (!current) return false;
        if (current.rol === this.ROLES.ADMIN) return true;
        if (current.rol === this.ROLES.GERENTE) return this.rangoDe(rol) < this.rangoDe(this.ROLES.GERENTE);
        return false;
    },
    _redactPassword(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        const copy = { ...obj };
        if ('password' in copy) copy.password = '***';
        return copy;
    },

    // Permisos por rol
    PERMISOS: {
        admin: {
            verInventario: true,
            verVentas: true,
            modificarInventario: true,
            resetearInventario: true,
            limpiarReservas: true,
            limpiarVentas: true,
            verificarBoletos: true,
            gestionarReclamos: true,
            gestionarUsuarios: true,
            verAuditoria: true,
            exportarDatos: true
        },
        gerente: {
            verInventario: true,
            verVentas: true,
            modificarInventario: true,
            resetearInventario: true,
            limpiarReservas: true,
            limpiarVentas: true,
            verificarBoletos: true,
            gestionarReclamos: true,
            gestionarUsuarios: true,
            verAuditoria: true,
            exportarDatos: true
        },
        taquilla: {
            verInventario: true,
            verVentas: true,
            modificarInventario: false,
            resetearInventario: false,
            limpiarReservas: false,
            limpiarVentas: false,
            verificarBoletos: false,
            gestionarReclamos: false,
            gestionarUsuarios: false,
            verAuditoria: false,
            exportarDatos: true
        },
        validacion: {
            verInventario: false,
            verVentas: false,
            modificarInventario: false,
            resetearInventario: false,
            limpiarReservas: false,
            limpiarVentas: false,
            verificarBoletos: true,
            gestionarReclamos: false,
            gestionarUsuarios: false,
            verAuditoria: false,
            exportarDatos: false
        },
        reclamos: {
            verInventario: false,
            verVentas: true,
            modificarInventario: false,
            resetearInventario: false,
            limpiarReservas: false,
            limpiarVentas: false,
            verificarBoletos: false,
            gestionarReclamos: true,
            gestionarUsuarios: false,
            verAuditoria: false,
            exportarDatos: false
        }
    },

    // Inicializar usuarios por defecto
    inicializarUsuarios() {
        const usuarios = this.obtenerUsuarios();

        // Si no hay usuarios, crear todos por defecto
        if (Object.keys(usuarios).length === 0) {
        // Usuarios por defecto (solo se crean si no hay ninguno).
        // Importante: antes de subir a producción, cambiar las contraseñas desde el panel de admin o eliminar usuarios de prueba.
        const usuariosDefault = {
            'osterlen': {
                id: 'osterlen',
                nombre: 'osterlen',
                rol: this.ROLES.ADMIN,
                password: 'valentino',
                activo: true,
                fechaCreacion: new Date().toISOString(),
                ultimoAcceso: null
            },
            'admin': {
                id: 'admin',
                nombre: 'Administrador',
                rol: this.ROLES.ADMIN,
                password: 'admin2024', // Cambiar en producción
                activo: true,
                fechaCreacion: new Date().toISOString(),
                ultimoAcceso: null
            },
            'gerente': {
                id: 'gerente',
                nombre: 'Gerente General',
                rol: this.ROLES.GERENTE,
                password: 'gerente2024', // Cambiar en producción
                activo: true,
                fechaCreacion: new Date().toISOString(),
                ultimoAcceso: null
            },
            'taquilla1': {
                id: 'taquilla1',
                nombre: 'Taquilla Principal',
                rol: this.ROLES.TAQUILLA,
                password: 'taquilla2024', // Cambiar en producción
                activo: true,
                fechaCreacion: new Date().toISOString(),
                ultimoAcceso: null
            },
            'validacion1': {
                id: 'validacion1',
                nombre: 'Validación QR 1',
                rol: this.ROLES.VALIDACION,
                password: 'validacion2024', // Cambiar en producción
                activo: true,
                fechaCreacion: new Date().toISOString(),
                ultimoAcceso: null
            },
            'validacion2': {
                id: 'validacion2',
                nombre: 'Validación QR 2',
                rol: this.ROLES.VALIDACION,
                password: 'validacion2024',
                activo: true,
                fechaCreacion: new Date().toISOString(),
                ultimoAcceso: null
            },
            'validacion3': {
                id: 'validacion3',
                nombre: 'Validación QR 3',
                rol: this.ROLES.VALIDACION,
                password: 'validacion2024',
                activo: true,
                fechaCreacion: new Date().toISOString(),
                ultimoAcceso: null
            },
            'reclamos1': {
                id: 'reclamos1',
                nombre: 'Atención a Reclamos',
                rol: this.ROLES.RECLAMOS,
                password: 'reclamos2024', // Cambiar en producción
                activo: true,
                fechaCreacion: new Date().toISOString(),
                ultimoAcceso: null
            }
        };

        this.guardarUsuarios(usuariosDefault);
            return;
        }
        // Si ya hay usuarios, asegurar que osterlen exista (para entrar con osterlen / valentino)
        if (!usuarios['osterlen']) {
            usuarios['osterlen'] = {
                id: 'osterlen',
                nombre: 'osterlen',
                rol: this.ROLES.ADMIN,
                password: 'valentino',
                activo: true,
                fechaCreacion: new Date().toISOString(),
                ultimoAcceso: null
            };
            this.guardarUsuarios(usuarios);
        }
    },

    // Obtener todos los usuarios
    obtenerUsuarios() {
        try {
            const usuarios = localStorage.getItem('usuarios_sistema');
            return usuarios ? JSON.parse(usuarios) : {};
        } catch (error) {
            console.error('Error al obtener usuarios:', error);
            return {};
        }
    },

    // Guardar usuarios
    guardarUsuarios(usuarios) {
        try {
            localStorage.setItem('usuarios_sistema', JSON.stringify(usuarios));
            return true;
        } catch (error) {
            console.error('Error al guardar usuarios:', error);
            return false;
        }
    },

    // Autenticar usuario
    autenticar(usuarioId, password) {
        const usuarios = this.obtenerUsuarios();
        const usuario = usuarios[usuarioId];

        if (!usuario) {
            return { exito: false, error: 'Usuario no encontrado' };
        }

        if (!usuario.activo) {
            return { exito: false, error: 'Usuario desactivado' };
        }

        if (usuario.password !== password) {
            return { exito: false, error: 'Contraseña incorrecta' };
        }

        // Actualizar último acceso
        usuario.ultimoAcceso = new Date().toISOString();
        this.guardarUsuarios(usuarios);

        // Guardar sesión
        const sesion = {
            usuarioId: usuario.id,
            nombre: usuario.nombre,
            rol: usuario.rol,
            fechaLogin: new Date().toISOString()
        };

        sessionStorage.setItem('usuario_sesion', JSON.stringify(sesion));

        // Registrar en auditoría
        this.registrarAuditoria({
            accion: 'login',
            usuario: usuario.nombre,
            rol: usuario.rol,
            detalles: 'Inicio de sesión'
        });

        return { exito: true, usuario: sesion };
    },

    // Obtener usuario actual
    obtenerUsuarioActual() {
        try {
            const sesion = sessionStorage.getItem('usuario_sesion');
            return sesion ? JSON.parse(sesion) : null;
        } catch (error) {
            return null;
        }
    },

    // Cerrar sesión
    cerrarSesion() {
        const usuario = this.obtenerUsuarioActual();
        
        if (usuario) {
            this.registrarAuditoria({
                accion: 'logout',
                usuario: usuario.nombre,
                rol: usuario.rol,
                detalles: 'Cierre de sesión'
            });
        }

        sessionStorage.removeItem('usuario_sesion');
    },

    // Verificar si tiene permiso
    tienePermiso(permiso) {
        const usuario = this.obtenerUsuarioActual();
        if (!usuario) return false;

        const permisos = this.PERMISOS[usuario.rol];
        return permisos && permisos[permiso] === true;
    },

    // Verificar si puede hacer cambios
    puedeHacerCambios() {
        const usuario = this.obtenerUsuarioActual();
        if (!usuario) return false;

        return usuario.rol === this.ROLES.ADMIN || usuario.rol === this.ROLES.GERENTE;
    },

    // Crear nuevo usuario
    crearUsuario(usuarioId, nombre, rol, password) {
        if (!this.puedeCrearRol(rol)) {
            return { exito: false, error: 'No tienes permiso para crear usuarios con ese rol' };
        }

        const usuarios = this.obtenerUsuarios();
        
        if (usuarios[usuarioId]) {
            return { exito: false, error: 'El usuario ya existe' };
        }

        const rolNorm = (rol || '').toLowerCase();
        if (this.rangoDe(rolNorm) === 0) {
            return { exito: false, error: 'Rol inválido' };
        }

        const nuevoUsuario = {
            id: usuarioId,
            nombre: nombre,
            rol: rolNorm,
            password: password,
            activo: true,
            fechaCreacion: new Date().toISOString(),
            ultimoAcceso: null
        };

        usuarios[usuarioId] = nuevoUsuario;
        this.guardarUsuarios(usuarios);

        const usuarioActual = this.obtenerUsuarioActual();
        this.registrarAuditoria({
            accion: 'crear_usuario',
            usuario: usuarioActual.nombre,
            rol: usuarioActual.rol,
            detalles: `Usuario creado: ${nombre} (${rolNorm})`,
            cambios: { nuevoUsuario: this._redactPassword(nuevoUsuario) }
        });

        return { exito: true, usuario: nuevoUsuario };
    },

    // Modificar usuario
    modificarUsuario(usuarioId, cambios) {
        if (!this.puedeModificarUsuario(usuarioId)) {
            return { exito: false, error: 'No tienes permiso para modificar a este usuario' };
        }

        const usuarios = this.obtenerUsuarios();
        const usuario = usuarios[usuarioId];

        if (!usuario) {
            return { exito: false, error: 'Usuario no encontrado' };
        }

        const usuarioActual = this.obtenerUsuarioActual();
        const esPropio = usuarioId === usuarioActual.usuarioId;
        const cambiosAnteriores = { ...usuario };

        if (esPropio) {
            if (cambios.password !== undefined) usuario.password = cambios.password;
            if (cambios.nombre !== undefined) usuario.nombre = cambios.nombre;
        } else {
            if (usuarioActual.rol === this.ROLES.GERENTE && cambios.rol !== undefined) {
                const r = this.rangoDe(cambios.rol);
                if (r >= this.rangoDe(this.ROLES.GERENTE)) {
                    return { exito: false, error: 'No puedes asignar ese rol' };
                }
            }
            Object.assign(usuario, cambios);
        }

        usuario.fechaModificacion = new Date().toISOString();
        this.guardarUsuarios(usuarios);
        this.registrarAuditoria({
            accion: 'modificar_usuario',
            usuario: usuarioActual.nombre,
            rol: usuarioActual.rol,
            detalles: `Usuario modificado: ${usuario.nombre}`,
            cambios: {
                anterior: this._redactPassword(cambiosAnteriores),
                nuevo: this._redactPassword({ ...usuario })
            }
        });

        return { exito: true, usuario: usuario };
    },

    // Eliminar usuario
    eliminarUsuario(usuarioId) {
        if (!this.puedeEliminarUsuario(usuarioId)) {
            return { exito: false, error: 'No tienes permiso para eliminar a este usuario' };
        }

        const usuarios = this.obtenerUsuarios();
        const usuario = usuarios[usuarioId];

        if (!usuario) {
            return { exito: false, error: 'Usuario no encontrado' };
        }

        delete usuarios[usuarioId];
        this.guardarUsuarios(usuarios);

        const usuarioActual = this.obtenerUsuarioActual();
        this.registrarAuditoria({
            accion: 'eliminar_usuario',
            usuario: usuarioActual.nombre,
            rol: usuarioActual.rol,
            detalles: `Usuario eliminado: ${usuario.nombre}`,
            cambios: { usuarioEliminado: this._redactPassword({ ...usuario }) }
        });

        return { exito: true };
    },

    // Registrar acción en auditoría
    registrarAuditoria(registro) {
        try {
            const auditoria = JSON.parse(localStorage.getItem('auditoria_sistema') || '[]');
            
            const entrada = {
                id: 'AUD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
                fecha: new Date().toISOString(),
                accion: registro.accion,
                usuario: registro.usuario,
                rol: registro.rol,
                detalles: registro.detalles,
                cambios: registro.cambios || null,
                ip: 'local', // En producción, obtener IP real
                userAgent: navigator.userAgent
            };

            auditoria.unshift(entrada); // Agregar al inicio

            // Mantener solo los últimos 1000 registros
            if (auditoria.length > 1000) {
                auditoria.pop();
            }

            localStorage.setItem('auditoria_sistema', JSON.stringify(auditoria));
            return entrada;
        } catch (error) {
            console.error('Error al registrar auditoría:', error);
            return null;
        }
    },

    // Obtener auditoría
    obtenerAuditoria(limite = 100) {
        try {
            const auditoria = JSON.parse(localStorage.getItem('auditoria_sistema') || '[]');
            return auditoria.slice(0, limite);
        } catch (error) {
            console.error('Error al obtener auditoría:', error);
            return [];
        }
    },

    // Obtener auditoría por usuario
    obtenerAuditoriaPorUsuario(usuarioId, limite = 50) {
        const auditoria = this.obtenerAuditoria(1000);
        return auditoria
            .filter(entrada => entrada.usuario === usuarioId)
            .slice(0, limite);
    },

    // Obtener auditoría por acción
    obtenerAuditoriaPorAccion(accion, limite = 50) {
        const auditoria = this.obtenerAuditoria(1000);
        return auditoria
            .filter(entrada => entrada.accion === accion)
            .slice(0, limite);
    }
};

// Inicializar usuarios por defecto al cargar
if (typeof window !== 'undefined') {
    window.AuthManager = AuthManager;
    
    // Inicializar usuarios si no existen
    document.addEventListener('DOMContentLoaded', function() {
        AuthManager.inicializarUsuarios();
    });
}
