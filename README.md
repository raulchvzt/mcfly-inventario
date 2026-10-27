# McFly Inventario

Sistema web de control de inventario para **McFly**, un negocio de autolavado con dos sucursales (**McFly Centro** y **McFly Villa**). Proyecto de portafolio desarrollado como si fuera un encargo real: partió de una entrevista con el cliente, de la que salieron los requerimientos, el modelo de datos y el alcance.

## El problema

El dueño controla hoy su inventario con libretas, hojas de Excel y preguntándole a sus empleados cuánto producto queda. Esto provoca:

- **Pérdida de productos:** no sabe si lo que compra se usa bien o se desperdicia.
- **Compras innecesarias:** compra producto que ya tiene en la otra sucursal.
- **Falta de control:** no puede confirmar si las cantidades reportadas son reales.
- **Diferencias de inventario:** el conteo físico no coincide con sus registros.
- **Falta de información:** no sabe cuánto dinero tiene invertido en producto.

## La solución

Una herramienta que permite saber **qué hay, dónde está y cuánto se gasta**, con historial completo de movimientos y trazabilidad de quién hizo cada uno.

### Funcionalidades (MVP)

- Catálogo de productos con categoría, presentación, unidad de medida, costo, proveedores y stock mínimo por sucursal.
- Inventario por sucursal y total del negocio, calculado a partir de los movimientos.
- Registro de entradas (compras), consumos, mermas, transferencias entre sucursales y ajustes.
- Alertas de stock bajo en el panel.
- Login con roles y permisos (dueño, encargado, empleado).
- Historial de movimientos con filtros, sin posibilidad de editar ni borrar.

### Segunda etapa

- Reportes: valor del inventario, productos más consumidos, compras, mermas y diferencias contra el conteo físico.
- Conteos físicos con comparación contra el sistema.

## Decisiones de diseño clave

- **El stock no se guarda, se calcula.** Se obtiene sumando y restando movimientos, por lo que no se puede alterar sin dejar rastro.
- **Los movimientos son inmutables.** Un error se corrige con un movimiento de ajuste con motivo.
- **Las transferencias usan transacciones** y requieren confirmación de la sucursal que recibe.
- **Nada se elimina, se desactiva** (usuarios, productos, sucursales), para no romper el historial.

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React (Vite) |
| Backend | Node.js + Express |
| Base de datos | SQL Server (paquete `mssql`) |
| Autenticación | JWT + bcrypt |
| Control de versiones | Git + GitHub |

## Estructura del repositorio

```
mcfly-inventario/
├── backend/        API en Node + Express
├── frontend/       Aplicación en React
├── database/
│   └── schema.sql  Esquema de la base de datos
├── docs/
│   └── requerimientos.md
└── README.md
```

## Cómo crear la base de datos

1. Instala **SQL Server** (Express o Developer) y **SQL Server Management Studio (SSMS)**.
2. Conéctate a tu instancia (por ejemplo `localhost\SQLEXPRESS`).
3. Abre `database/schema.sql` y ejecútalo completo.
4. Verifica con `SELECT * FROM sucursales;`. Deben aparecer McFly Centro y McFly Villa.

## Documentación

- [Requerimientos del cliente](docs/requerimientos.md)

## Estado del proyecto

- [x] Levantamiento de requerimientos
- [x] Instalación del entorno (SQL Server, SSMS, Git)
- [x] Tablas `sucursales` y `usuarios`
- [x] Tablas `proveedores`, `productos` y `producto_proveedor`
- [x] Tabla `producto_sucursal` (stock mínimo por sucursal)
- [x] Tablas `compras` y `compra_detalle`
- [x] Tabla `transferencias`
- [x] Tabla `movimientos`
- [ ] Backend: autenticación y roles
- [ ] Backend: productos, movimientos, stock y alertas
- [ ] Frontend: login, catálogo, movimientos, inventario y panel
- [ ] Reportes y conteos físicos
- [ ] Datos de ejemplo (`seed`), capturas y despliegue

## Autor

Raul Alejandro · [GitHub](https://github.com/TU-USUARIO)
