# Requerimientos: Sistema de inventario McFly

## 1. Contexto del negocio

McFly es un autolavado con dos sucursales: **McFly Centro** y **McFly Villa**. En ambas se usan productos para lavar y detallar vehículos: shampoo, cera, abrillantador de llantas, desengrasantes, limpiadores de interiores, microfibras y otros materiales.

Hoy no existe un sistema centralizado. El inventario se maneja con libretas, hojas de Excel y preguntando a los empleados. Cada sucursal lo maneja por separado, y a veces una tiene producto de sobra mientras la otra tiene que comprarlo. El dueño no está todo el tiempo en las sucursales y quiere revisar la operación desde su computadora.

### Problemas que quiere resolver

- **Pérdida de productos:** no sabe si lo que compra se usa correctamente o se desperdicia.
- **Compras innecesarias:** puede comprar producto que ya tiene en la otra sucursal.
- **Falta de control:** no sabe si las cantidades que reportan los empleados son reales.
- **Diferencias de inventario:** el conteo físico no siempre coincide con sus registros.
- **Falta de información:** no tiene una forma rápida de saber cuánto dinero tiene invertido en producto.

> El cliente no quiere un sistema que solo registre productos, sino una herramienta que ayude a controlar el negocio, reducir pérdidas y tomar mejores decisiones.

## 2. Resultados de la entrevista

### Compras y proveedores

- Hay **tres proveedores principales**:
  - Una distribuidora de productos de limpieza automotriz en Colima (shampoo, cera, abrillantador de llantas). Entrega en la sucursal y da crédito a 15 días.
  - Una tienda de químicos industriales (desengrasantes y limpiadores de interiores). Hay que recoger el pedido.
  - Compras variables de microfibras y similares (Mercado Libre, tiendas de autopartes), según la oferta.
- Las compras las hace el dueño casi siempre, sin fecha fija: compra cuando se acuerda o cuando le avisan.
- Los encargados a veces compran con su dinero o con caja chica y luego entregan el ticket.
- Los precios cambian según el mes, y hay descuentos por volumen.
- La mercancía llega casi siempre a **Centro** y de ahí se envía a Villa lo que necesite. Hoy esos envíos no se registran.

### Decisiones del dueño

- **Compras:** las registran el dueño y los encargados. Cada compra lleva proveedor, fecha, forma de pago (contado, crédito o caja chica) y número de ticket o factura. No se controlan cuentas por pagar en esta versión.
- **Costos:** el costo de un producto es el de su **última compra**, y el valor del inventario se calcula con **costo promedio ponderado**.
- **Proveedores:** un producto puede comprarse a varios proveedores.
- **Consumo:** el empleado registra lo que saca de bodega al iniciar el turno, con producto, cantidad y sucursal. No se mide por servicio. Cada producto tiene su propia unidad de medida y no se convierten unidades entre productos.
- **Mermas:** derrames, producto vencido, microfibras dañadas o extraviadas. Siempre llevan **motivo obligatorio**.
- **Transferencias:** las inicia el encargado que envía y las confirma el encargado que recibe. Mientras no se confirmen, el producto aparece "en tránsito" y no cuenta en ninguna sucursal.
- **Alertas:** cada producto tiene un **stock mínimo por sucursal**. Se muestran en el panel; por ahora no se necesita correo ni WhatsApp.
- **Conteo físico:** se hace una vez al mes. La diferencia entre lo contado y el sistema genera un **ajuste** con motivo, y solo el encargado o el dueño pueden aprobarlo.
- **Reportes:** el dueño los revisa semanalmente.

## 3. Roles y permisos

| Acción | Dueño | Encargado | Empleado |
|---|---|---|---|
| Ver inventario | Ambas sucursales y total | Solo su sucursal | Solo su sucursal |
| Registrar consumo | Sí | Sí | Sí |
| Registrar merma | Sí | Sí | No |
| Registrar compra | Sí | Sí (su sucursal) | No |
| Crear transferencia | Sí | Sí | No |
| Confirmar recepción | Sí | Sí (la sucursal destino) | No |
| Conteo físico y ajustes | Sí | Sí | No |
| Catálogo de productos y proveedores | Sí | No | No |
| Gestionar usuarios | Sí | No | No |
| Ver reportes | Todos | Su sucursal | No |

## 4. Requerimientos funcionales

- **RF1.** Catálogo de productos con nombre, categoría, presentación, unidad de medida (litros, mililitros, piezas, galones), costo, proveedores y stock mínimo por sucursal.
- **RF2.** Stock por sucursal y total, calculado a partir de los movimientos.
- **RF3.** Registro de movimientos: entrada (compra), consumo, merma, transferencia y ajuste. Todos guardan usuario, fecha y hora.
- **RF4.** Alertas de stock bajo en el panel.
- **RF5.** Login con roles y permisos.
- **RF6.** Reportes: valor del inventario, productos más consumidos, compras por periodo, mermas y diferencias contra el conteo físico.
- **RF7.** Historial de movimientos con filtros por fecha, producto, usuario, sucursal y tipo.
- **RF8.** Conteo físico con comparación contra el sistema.

## 5. Reglas de negocio

- **RN1.** Los movimientos no se editan ni se borran. Un error se corrige con un movimiento de ajuste.
- **RN2.** No se puede registrar una salida mayor al stock disponible.
- **RN3.** Merma y ajuste exigen motivo.
- **RN4.** Una transferencia solo afecta el stock destino al ser confirmada, y se ejecuta en una transacción.
- **RN5.** Un usuario solo opera en su sucursal, salvo el dueño.
- **RN6.** Los productos, usuarios y sucursales no se eliminan, se **desactivan**, para no romper el historial.

## 6. Requerimientos no funcionales

- Acceso desde el navegador de una computadora.
- Contraseñas almacenadas con hash (bcrypt) y sesiones con JWT.
- Toda operación sensible debe registrar usuario, fecha y hora.
- Las transferencias deben ejecutarse en una transacción para no quedar a medias.

## 7. Alcance

**MVP:** RF1, RF2, RF3, RF4, RF5, RF7.

**Segunda etapa:** reportes (RF6) y conteos físicos (RF8).

**Fuera de alcance:** cuentas por pagar, facturación, punto de venta, notificaciones por correo o WhatsApp, app móvil.

## 8. Modelo de datos (resumen)

Orden de construcción de las tablas:

1. `sucursales` y `usuarios`
2. `proveedores`, `productos`, `producto_proveedor`
3. `producto_sucursal` (stock mínimo por sucursal)
4. `compras` y `compra_detalle`
5. `transferencias` (con estado `pendiente` o `confirmada`)
6. `movimientos` (tabla central: entrada, consumo, merma, transferencia_salida, transferencia_entrada, ajuste)
7. `conteos_fisicos` y `conteo_detalle` (segunda etapa)

## 9. Preguntas abiertas

- ¿Qué stock mínimo corresponde a cada producto en cada sucursal?
- ¿Se necesita una lista de motivos predefinidos para mermas y ajustes, o es texto libre?
- ¿Los empleados registrarán consumo desde una computadora, una tablet o el celular?