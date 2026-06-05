// --- SISTEMA DE AUTENTICACIÓN Y ROLES v2 ---
// Autenticación server-side: credenciales van al Worker, que devuelve un JWT.
// El token se guarda en sessionStorage['elgorila_token'].
// Las contraseñas NUNCA se guardan en el cliente.

const AuthManager = {
    // ─── ROLES ────────────────────────────────────────────────────────────────

    ROLES: {
        ADMIN: 'admin',
        GERENTE: 'gerente',
        TAQUILLA: 'taquilla',
        VALIDACION: 'validacion',
        RECLAMOS: 'reclamos',
    },

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

    // ─── PERMISOS ─────────────────────────────────────────────────────────────

    PERMISOS: {
        admin: {
            verInventario: true, verVentas: true, modificarInventario: true,
            resetearInventario: true, limpiarReservas: true, limpiarVentas: true,
            verificarBoletos: true, gestionarReclamos: true, gestionarUsuarios: true,
            verAuditoria: true, exportarDatos: true,
        },
        gerente: {
            verInventario: true, verVentas: true, modificarInventario: true,
            resetearInventario: true, limpiarReservas: true, limpiarVentas: true,
            verificarBoletos: true, gestionarReclamos: true, gestionarUsuarios: true,
            verAuditoria: true, exportarDatos: true,
        },
        taquilla: {
            verInventario: true, verVentas: true, modificarInventario: false,
            resetearInventario: false, limpiarReservas: false, limpiarVentas: false,
            verificarBoletos: false, gestionarReclamos: false, gestionarUsuarios: false,
            verAuditoria: false, exportarDatos: true,
        },
        validacion: {
            verInventario: false, verVentas: false, modificarInventario: false,
            resetearInventario: false, limpiarReservas: false, limpiarVentas: false,
            verificarBoletos: true, gestionarReclamos: false, gestionarUsuarios: false,
            verAuditoria: false, exportarDatos: false,
        },
        reclamos: {
            verInventario: false, verVentas: true, modificarInventario: false,
            resetearInventario: false, limpiarReservas: false, limpiarVentas: false,
            verificarBoletos: false, gestionarReclamos: true, gestionarUsuarios: false,
            verAuditoria: false, exportarDatos: false,
        },
    },

    // ─── AUTENTICACIÓN (server-side) ──────────────────────────────────────────

    async autenticar(usuarioId, password) {
        if (!window.API_BASE) {
            return { exito: false, error: 'API no configurada. Recarga la página.' };
        }
        try {
            const res = await fetch(window.API_BASE + '/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario: usuarioId.trim(), password }),
            });
            const data = await res.json();
            if (!res.ok || !data.token) {
                return { exito: false, error: data.error || 'Credenciales incorrectas.' };
            }
            sessionStorage.setItem('elgorila_token', data.token);
            const sesion = {
                usuarioId: data.usuario,
                nombre: data.nombre || data.usuario,
                rol: data.rol,
                fechaLogin: new Date().toISOString(),
            };
            sessionStorage.setItem('usuario_sesion', JSON.stringify(sesion));
            this.registrarAuditoria({
                accion: 'login',
                usuario: sesion.nombre,
                rol: sesion.rol,
                detalles: 'Inicio de sesión',
            });
            return { exito: true, usuario: sesion };
        } catch (err) {
            console.error('Error de autenticación:', err);
            return { exito: false, error: 'Error de conexión. Verifica tu internet e intenta de nuevo.' };
        }
    },

    // Admin login vía secrets del Worker — token 30 días en localStorage
    async autenticarAdmin(usuarioId, password) {
        if (!window.API_BASE) return { exito: false, error: 'API no configurada.' };
        try {
            const res = await fetch(window.API_BASE + '/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario: usuarioId.trim(), password }),
            });
            const data = await res.json();
            if (!res.ok || !data.token) return { exito: false, error: data.error || 'Credenciales incorrectas.' };
            localStorage.setItem('elgorila_admin_token', data.token);
            const sesion = { usuarioId: data.usuario, nombre: data.nombre || data.usuario, rol: 'admin', fechaLogin: new Date().toISOString() };
            localStorage.setItem('elgorila_admin_sesion', JSON.stringify(sesion));
            return { exito: true, usuario: sesion };
        } catch (err) {
            return { exito: false, error: 'Error de conexión.' };
        }
    },

    // Token admin para llamadas autenticadas al Worker
    obtenerAdminToken() {
        return localStorage.getItem('elgorila_admin_token') || null;
    },

    // Decode JWT payload (no verifica firma — el servidor la verifica)
    _decodeJWT(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;
            const payload = JSON.parse(decodeURIComponent(
                Array.from(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
                    .map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
            ));
            if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
            return payload;
        } catch { return null; }
    },

    // Sesión activa: primero localStorage (admin 30d), luego sessionStorage
    obtenerUsuarioActual() {
        // Admin token (localStorage, 30 días)
        const adminToken = localStorage.getItem('elgorila_admin_token');
        if (adminToken) {
            const p = this._decodeJWT(adminToken);
            if (p) return { usuarioId: p.usuario, nombre: p.nombre || p.usuario, rol: p.rol, fechaLogin: p.iat ? new Date(p.iat * 1000).toISOString() : new Date().toISOString() };
            // Token expirado — limpiar
            localStorage.removeItem('elgorila_admin_token');
            localStorage.removeItem('elgorila_admin_sesion');
        }
        // KV token (sessionStorage, 8h)
        const token = sessionStorage.getItem('elgorila_token');
        if (!token) return null;
        const p = this._decodeJWT(token);
        if (!p) { sessionStorage.removeItem('elgorila_token'); sessionStorage.removeItem('usuario_sesion'); return null; }
        return { usuarioId: p.usuario, nombre: p.nombre || p.usuario, rol: p.rol, fechaLogin: p.iat ? new Date(p.iat * 1000).toISOString() : new Date().toISOString() };
    },

    cerrarSesion() {
        const usuario = this.obtenerUsuarioActual();
        if (usuario) {
            this.registrarAuditoria({ accion: 'logout', usuario: usuario.nombre, rol: usuario.rol, detalles: 'Cierre de sesión' });
        }
        sessionStorage.removeItem('elgorila_token');
        sessionStorage.removeItem('usuario_sesion');
        localStorage.removeItem('elgorila_admin_token');
        localStorage.removeItem('elgorila_admin_sesion');
    },

    tienePermiso(permiso) {
        const usuario = this.obtenerUsuarioActual();
        if (!usuario) return false;
        const permisos = this.PERMISOS[usuario.rol];
        return permisos && permisos[permiso] === true;
    },

    puedeHacerCambios() {
        const usuario = this.obtenerUsuarioActual();
        if (!usuario) return false;
        return usuario.rol === this.ROLES.ADMIN || usuario.rol === this.ROLES.GERENTE;
    },

    // ─── GESTIÓN DE USUARIOS (panel admin, localStorage) ─────────────────────
    // Nota: estos usuarios son independientes de los del Worker.
    // En una fase futura se migrarán a un endpoint del Worker.

    obtenerUsuarios() {
        try {
            const raw = localStorage.getItem('usuarios_sistema');
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    },

    guardarUsuarios(usuarios) {
        try {
            localStorage.setItem('usuarios_sistema', JSON.stringify(usuarios));
            return true;
        } catch {
            return false;
        }
    },

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
            id: usuarioId, nombre, rol: rolNorm, password,
            activo: true, fechaCreacion: new Date().toISOString(), ultimoAcceso: null,
        };
        usuarios[usuarioId] = nuevoUsuario;
        this.guardarUsuarios(usuarios);
        const usuarioActual = this.obtenerUsuarioActual();
        this.registrarAuditoria({
            accion: 'crear_usuario',
            usuario: usuarioActual.nombre,
            rol: usuarioActual.rol,
            detalles: `Usuario creado: ${nombre} (${rolNorm})`,
            cambios: { nuevoUsuario: this._redactPassword(nuevoUsuario) },
        });
        return { exito: true, usuario: nuevoUsuario };
    },

    modificarUsuario(usuarioId, cambios) {
        if (!this.puedeModificarUsuario(usuarioId)) {
            return { exito: false, error: 'No tienes permiso para modificar a este usuario' };
        }
        const usuarios = this.obtenerUsuarios();
        const usuario = usuarios[usuarioId];
        if (!usuario) return { exito: false, error: 'Usuario no encontrado' };
        const usuarioActual = this.obtenerUsuarioActual();
        const esPropio = usuarioId === usuarioActual.usuarioId;
        const cambiosAnteriores = { ...usuario };
        if (esPropio) {
            if (cambios.password !== undefined) usuario.password = cambios.password;
            if (cambios.nombre !== undefined) usuario.nombre = cambios.nombre;
        } else {
            if (usuarioActual.rol === this.ROLES.GERENTE && cambios.rol !== undefined) {
                if (this.rangoDe(cambios.rol) >= this.rangoDe(this.ROLES.GERENTE)) {
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
                nuevo: this._redactPassword({ ...usuario }),
            },
        });
        return { exito: true, usuario };
    },

    eliminarUsuario(usuarioId) {
        if (!this.puedeEliminarUsuario(usuarioId)) {
            return { exito: false, error: 'No tienes permiso para eliminar a este usuario' };
        }
        const usuarios = this.obtenerUsuarios();
        const usuario = usuarios[usuarioId];
        if (!usuario) return { exito: false, error: 'Usuario no encontrado' };
        delete usuarios[usuarioId];
        this.guardarUsuarios(usuarios);
        const usuarioActual = this.obtenerUsuarioActual();
        this.registrarAuditoria({
            accion: 'eliminar_usuario',
            usuario: usuarioActual.nombre,
            rol: usuarioActual.rol,
            detalles: `Usuario eliminado: ${usuario.nombre}`,
            cambios: { usuarioEliminado: this._redactPassword({ ...usuario }) },
        });
        return { exito: true };
    },

    // ─── AUDITORÍA ────────────────────────────────────────────────────────────

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
                ip: 'local',
                userAgent: navigator.userAgent,
            };
            auditoria.unshift(entrada);
            if (auditoria.length > 1000) auditoria.pop();
            localStorage.setItem('auditoria_sistema', JSON.stringify(auditoria));
            return entrada;
        } catch {
            return null;
        }
    },

    obtenerAuditoria(limite = 100) {
        try {
            return JSON.parse(localStorage.getItem('auditoria_sistema') || '[]').slice(0, limite);
        } catch {
            return [];
        }
    },

    obtenerAuditoriaPorUsuario(usuarioId, limite = 50) {
        return this.obtenerAuditoria(1000)
            .filter(e => e.usuario === usuarioId)
            .slice(0, limite);
    },

    obtenerAuditoriaPorAccion(accion, limite = 50) {
        return this.obtenerAuditoria(1000)
            .filter(e => e.accion === accion)
            .slice(0, limite);
    },
};

if (typeof window !== 'undefined') {
    window.AuthManager = AuthManager;
}
