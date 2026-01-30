# 🎫 Sistema de Certificados/Tokens Digitales

## 🎯 Concepto

Los certificados son **activos digitales** (tokens), NO imágenes. Son un acuerdo personal - el dinero es otro universo. Se aprueban certificados por el monto pagado.

---

## 📋 ESPECIFICACIONES TÉCNICAS

### **1. Numeración Secuencial**
- ✅ Empiezan desde **00001** (folio/certificado 00001)
- ✅ Continúan secuencialmente: 00002, 00003, 00004...
- ✅ Control y visión completa de la numeración
- ✅ Se envían 1 a 1 (uno por uno)

### **2. Caducidad**
- ✅ Certificados **CADUCAN a las 12:00 PM (mediodía) del día de la función**
- ✅ Después de las 12pm, se regeneran certificados para la nueva semana que se desbloquea
- ✅ Certificados antiguos se marcan como caducados

### **3. Generación**
- ✅ Se generan cuando se confirma el pago
- ✅ Un certificado por cada boleto comprado
- ✅ Numeración continua (no se reinicia)

### **4. Estructura de Datos**
```javascript
{
    folio: "00001",           // Numeración secuencial
    numeroOrden: "ORD-...",   // Orden de compra
    fechaFuncion: "2025-02-15", // Fecha de la función
    fechaCaducidad: "2025-02-15T12:00:00", // 12pm del día de función
    email: "usuario@email.com",
    estado: "activo",         // activo, usado, caducado
    fechaCreacion: "2025-02-10T10:00:00",
    fechaUso: null,
    qrCode: "CERT-00001-..."  // Código único para QR
}
```

---

## 🔄 FLUJO COMPLETO

### **Paso 1: Compra**
1. Usuario compra X boletos
2. Pago confirmado
3. Se generan X certificados con numeración secuencial

### **Paso 2: Envío**
1. Certificados se envían 1 a 1 al email
2. Cada certificado tiene su QR único
3. Numeración visible (00001, 00002, etc.)

### **Paso 3: Caducidad**
1. A las **12:00 PM del día de la función**
2. Certificados de esa función se marcan como "caducados"
3. Ya no son válidos para entrada

### **Paso 4: Regeneración Semanal**
1. Después de las 12pm del día de función
2. Se regeneran certificados para la nueva semana
3. Numeración continúa desde donde quedó

---

## 💾 ALMACENAMIENTO

### **Base de Datos Local (localStorage)**
```javascript
{
    certificados: {
        "00001": { ...certificado... },
        "00002": { ...certificado... },
        ...
    },
    ultimoFolio: "00250",  // Último folio usado
    indices: {
        porFecha: { "2025-02-15": ["00001", "00002", ...] },
        porOrden: { "ORD-123": ["00001", "00002"] },
        porEmail: { "user@email.com": ["00001", "00002"] }
    }
}
```

---

## 🔢 GENERACIÓN DE FOLIOS

### **Función de Generación**
```javascript
function obtenerSiguienteFolio() {
    const db = obtenerBaseDatos();
    const ultimoFolio = parseInt(db.ultimoFolio || "0");
    const siguienteFolio = ultimoFolio + 1;
    
    // Formato: 00001, 00002, etc. (5 dígitos con ceros a la izquierda)
    const folioFormateado = String(siguienteFolio).padStart(5, '0');
    
    // Guardar nuevo último folio
    db.ultimoFolio = folioFormateado;
    guardarBaseDatos(db);
    
    return folioFormateado;
}
```

---

## ⏰ CADUCIDAD Y REGENERACIÓN

### **Verificar Caducidad**
```javascript
function verificarCaducidad() {
    const ahora = new Date();
    const horaActual = ahora.getHours();
    const minutoActual = ahora.getMinutes();
    
    // Si es después de las 12:00 PM
    if (horaActual >= 12 && minutoActual >= 0) {
        // Marcar certificados del día como caducados
        marcarCertificadosCaducados(ahora);
        
        // Regenerar para nueva semana si es necesario
        if (esDiaDeFuncion(ahora)) {
            regenerarCertificadosSemana();
        }
    }
}
```

---

## 📧 ENVÍO 1 A 1

### **Enviar Certificados**
```javascript
function enviarCertificados(ordenCompra, certificados) {
    // Enviar uno por uno (1 a 1)
    certificados.forEach((certificado, index) => {
        setTimeout(() => {
            enviarCertificadoPorEmail(certificado, ordenCompra.email);
        }, index * 100); // Pequeño delay entre envíos
    });
}
```

---

## ✅ VENTAJAS DE ESTE SISTEMA

1. **Control Total:**
   - Numeración secuencial clara
   - Fácil rastrear qué certificados se han generado

2. **Caducidad Automática:**
   - No hay certificados válidos después de la función
   - Limpieza automática a las 12pm

3. **Regeneración Semanal:**
   - Sistema siempre listo para nueva semana
   - Numeración continua sin reiniciar

4. **Activos Digitales:**
   - No son imágenes, son tokens
   - Valor es acuerdo personal
   - Dinero es otro universo

---

## 🔧 IMPLEMENTACIÓN

### **Fase 1: Arreglar Recursión (AHORA)**
- ✅ Arreglar error de recursión infinita
- ✅ Sistema funcional básico

### **Fase 2: Numeración Secuencial**
- ✅ Implementar folios 00001, 00002, etc.
- ✅ Sistema de incremento automático

### **Fase 3: Caducidad**
- ✅ Marcar certificados como caducados a las 12pm
- ✅ Verificación automática

### **Fase 4: Regeneración Semanal**
- ✅ Sistema de regeneración después de 12pm
- ✅ Preparación para nueva semana

---

**¿Listo para implementar?**
