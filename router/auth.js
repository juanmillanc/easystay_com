const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../databases/db');
const path = require('path');
const fs = require('fs').promises;
const db = require('../databases/db'); // Ajusta según tu conexión
const fileUpload = require('express-fileupload');


// Middleware para verificar si el usuario es administrador
const isAdmin = (req, res, next) => {
    if (!req.session.user || (req.session.user.rol !== 'admin' && req.session.user.rol !== 'superadmin')) {
        return res.status(403).send('Acceso denegado: Solo administradores');
    }
    next();
};

// Middleware para verificar si el usuario está autenticado
const isAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

// Ruta de login (GET)
router.get('/login', (req, res) => {
    res.render('index', { loginForm: true });
});

// Ruta para la búsqueda de hoteles
router.get('/search', async (req, res) => {
    console.log('Accessing search route...');
    try {
        console.log('Attempting to fetch hotels and restaurants from database...');
        
        // Fetch hotels
        const [hotels] = await pool.query(`
            SELECT h.*, c.* 
            FROM hoteles h 
            LEFT JOIN caracteristicas_hotel c ON h.id = c.hotel_id
            WHERE h.estado = 'activo'
            ORDER BY h.fecha_creacion DESC
        `);

        // Fetch restaurants with all necessary fields
        const [restaurants] = await pool.query(`
            SELECT 
                id,
                nombre,
                descripcion,
                direccion,
                ciudad,
                tipo_cocina,
                precio_promedio,
                imagen_principal,
                estado,
                fecha_creacion
            FROM restaurantes 
            WHERE estado = 'activo'
            ORDER BY fecha_creacion DESC
        `);

        console.log(`Successfully fetched ${hotels.length} hotels and ${restaurants.length} restaurants from database`);

        // Agrupar características por hotel
        const hotelsMap = new Map();
        hotels.forEach(row => {
            if (!hotelsMap.has(row.id)) {
                const hotel = {...row};
                delete hotel.hotel_id;
                hotel.caracteristicas = {};
                hotelsMap.set(row.id, hotel);
            }
            const hotel = hotelsMap.get(row.id);
            if (row.wifi !== null) {
                hotel.caracteristicas = {
                    wifi: row.wifi,
                    parking: row.parking,
                    piscina: row.piscina,
                    restaurante: row.restaurante,
                    aire_acondicionado: row.aire_acondicionado,
                    gimnasio: row.gimnasio,
                    spa: row.spa,
                    bar: row.bar,
                    mascotas: row.mascotas
                };
            }
        });

        const hotelsArray = Array.from(hotelsMap.values());
        console.log(`Processed ${hotelsArray.length} hotels with their characteristics`);

        // Log restaurants data for debugging
        console.log('Restaurants data:', JSON.stringify(restaurants, null, 2));

        res.render('search', {
            hotels: hotelsArray || [],
            restaurants: restaurants || [],
            user: req.session.user
        });
    } catch (error) {
        console.error('Error in search route:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            errno: error.errno,
            sqlState: error.sqlState,
            sqlMessage: error.sqlMessage
        });
        res.render('search', {
            hotels: [],
            restaurants: [],
            user: req.session.user
        });
    }
});

// Ruta principal redirige a la búsqueda
router.get('/', async (req, res) => {
    try {
        const [hotels] = await pool.query(`
            SELECT h.*, c.* 
            FROM hoteles h 
            LEFT JOIN caracteristicas_hotel c ON h.id = c.hotel_id
            WHERE h.estado = 'activo'
            ORDER BY h.fecha_creacion DESC
        `);

        // Agrupar características por hotel
        const hotelsMap = new Map();
        hotels.forEach(row => {
            if (!hotelsMap.has(row.id)) {
                const hotel = {...row};
                delete hotel.hotel_id;
                hotel.caracteristicas = {};
                hotelsMap.set(row.id, hotel);
            }
            const hotel = hotelsMap.get(row.id);
            if (row.wifi !== null) {
                hotel.caracteristicas = {
                    wifi: row.wifi,
                    parking: row.parking,
                    piscina: row.piscina,
                    restaurante: row.restaurante,
                    aire_acondicionado: row.aire_acondicionado,
                    gimnasio: row.gimnasio,
                    spa: row.spa,
                    bar: row.bar,
                    mascotas: row.mascotas
                };
            }
        });

        res.render('search', {
            hotels: Array.from(hotelsMap.values()),
            user: req.session.user
        });
    } catch (error) {
        console.error('Error al cargar hoteles:', error);
        res.render('search', {
            hotels: [],
            user: req.session.user
        });
    }
});

// API para buscar hoteles por ciudad
router.get('/api/hotels/search', (req, res) => {
    const { ciudad } = req.query;
    
    if (!ciudad) {
        return res.json({ success: false, message: 'Por favor, ingresa una ciudad' });
    }

    const query = `
        SELECT h.*, c.nombre as ciudad_nombre 
        FROM hoteles h 
        INNER JOIN ciudades c ON h.ciudad_id = c.id 
        WHERE c.nombre LIKE ?
    `;

    pool.query(query, [`%${ciudad}%`], (error, results) => {
        if (error) {
            console.error('Error en la búsqueda:', error);
            return res.json({ success: false, message: 'Error al buscar hoteles' });
        }
        
        res.json({
            success: true,
            hotels: results
        });
    });
});

// Ruta para el registro
router.post('/register', async (req, res) => {
    try {
        console.log('\n=== NUEVO INTENTO DE REGISTRO ===');
        console.log('Datos recibidos del formulario:', {
            nombre: req.body.nombre || 'no proporcionado',
            email: req.body.email || 'no proporcionado',
            telefono: req.body.telefono || 'no proporcionado',
            password: req.body.password ? '********' : 'no proporcionado'
        });

        // Validar que todos los campos requeridos estén presentes
        if (!req.body.nombre || !req.body.email || !req.body.password) {
            console.log('❌ Error: Faltan campos requeridos');
            return res.status(400).json({
                success: false,
                message: 'Todos los campos son obligatorios'
            });
        }

        const { nombre, email, password, telefono } = req.body;

        // Verificar si el email ya existe
        console.log('\nVerificando si el email ya existe...');
        const [existingUser] = await pool.execute(
            'SELECT * FROM usuarios WHERE email = ?',
            [email]
        );

        if (existingUser.length > 0) {
            console.log('❌ Email ya registrado:', email);
            return res.status(400).json({ 
                success: false, 
                message: 'El email ya está registrado' 
            });
        }
        console.log('✅ Email disponible');

        // Encriptar la contraseña
        console.log('\nEncriptando contraseña...');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        console.log('✅ Contraseña encriptada correctamente');

        // Insertar el nuevo usuario
        console.log('\nInsertando nuevo usuario en la base de datos...');
        const [result] = await pool.execute(
            'INSERT INTO usuarios (nombre, email, password, telefono, rol) VALUES (?, ?, ?, ?, ?)',
            [nombre, email, hashedPassword, telefono, 'usuario']
        );

        console.log('✅ Usuario registrado exitosamente');
        console.log('ID del nuevo usuario:', result.insertId);
        console.log('=== REGISTRO COMPLETADO ===\n');

        res.status(201).json({
            success: true,
            message: 'Usuario registrado exitosamente',
            userId: result.insertId
        });

    } catch (error) {
        console.error('\n❌ ERROR EN EL REGISTRO:');
        console.error('Mensaje de error:', error.message);
        console.error('Stack trace:', error.stack);
        console.error('=== ERROR DETALLADO ===\n');
        
        res.status(500).json({
            success: false,
            message: 'Error al registrar el usuario',
            error: error.message
        });
    }
});


// Ruta para el inicio de sesión (POST /login)
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const ip_address = req.ip || 'desconocida';
        console.log('Intentando login con email:', email);
        console.log('Contraseña ingresada:', password);

        // 1. Buscar usuario usando pool
        const [users] = await pool.execute(
            'SELECT * FROM usuarios WHERE LOWER(email) = LOWER(?)', 
            [email]
        );
        console.log('Resultado de búsqueda de usuario:', users);

        if (users.length === 0) {
            console.log('Usuario no encontrado');
            return res.render('index', { 
                error: 'Credenciales incorrectas',
                loginForm: true
            });
        }

        const user = users[0];
        console.log('Usuario encontrado:', user);
        console.log('Contraseña recibida:', password);
        console.log('Hash en base de datos:', user.password);
        console.log('Longitud de la contraseña:', password.length);
        console.log('Longitud del hash:', user.password.length);
        // 2. Comparar contraseñas
        const validPassword = await bcrypt.compare(password, user.password);
        console.log('¿Contraseña válida?', validPassword);
        
        if (!validPassword) {
            console.log('Contraseña incorrecta para usuario:', user.email);
            return res.render('index', { 
                error: 'Credenciales incorrectas',
                loginForm: true
            });
        }

        // 3. Llamar al procedimiento autenticar_usuario
        try {
            const [authResult] = await pool.query(
                'CALL autenticar_usuario(?, ?, ?)',
                [email, validPassword, ip_address]
            );

            // Configurar la sesión del usuario
            req.session.user = {
                id: user.id,
                email: user.email,
                nombre: user.nombre,
                rol: user.rol
            };

            console.log('Usuario autenticado:', req.session.user); // Para debugging

            // Redirigir según el rol
            if (user.rol === 'admin' || user.rol === 'superadmin') {
                console.log('Redirección exitosa: usuario con rol', user.rol, 'redirigido a /admin/dashboard');
                return res.redirect('/admin/dashboard');
            } else {
                console.log('Redirección estándar: usuario con rol', user.rol, 'redirigido a /');
                return res.redirect('/');
            }
            
        } catch (authError) {
            console.error('Error en autenticación:', authError);
            return res.render('index', {
                error: 'Error al iniciar sesión',
                loginForm: true
            });
        }
    } catch (error) {
        console.error('Error general en login:', error);
        return res.render('index', {
            error: 'Error al iniciar sesión',
            loginForm: true
        });
    }
});

// Ruta para cerrar sesión (GET /logout)
router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error al cerrar sesión:', err);
            return res.redirect('/');
        }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});


// Otras rutas que ya tengas...
router.get('/', (req, res) => { /* ... */ });
router.get('/login', (req, res) => { /* ... */ });

// Nueva ruta para restaurantes
router.get('/restaurantes', async (req, res) => {
    try {
        // Fetch restaurants from database
        const [restaurants] = await pool.query(`
            SELECT * FROM restaurantes 
            WHERE estado = 'activo'
            ORDER BY fecha_creacion DESC
        `);

        console.log(`Fetched ${restaurants.length} restaurants from database`);

        // Always pass restaurants array to the template
        res.render('restaurantes', { 
            title: 'EasyStay - Restaurantes',
            page: 'restaurantes',
            user: req.session.user,
            restaurants: restaurants || [] // Ensure restaurants is always an array
        });
    } catch (error) {
        console.error('Error fetching restaurants:', error);
        // Pass empty array in case of error
        res.render('restaurantes', { 
            title: 'EasyStay - Restaurantes',
            page: 'restaurantes',
            user: req.session.user,
            restaurants: [] // Ensure restaurants is always an array
        });
    }
});


router.get('/perfil', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.id;
        const user = await db.getUserById(userId); // Ajusta según tu función
        res.render('perfil.ejs', { user, error: null });
    } catch (error) {
        res.render('perfil.ejs', { user: {}, error: 'No se pudo cargar el perfil' });
    }
});

// Ruta para "Mis reservas"
router.get('/bookings', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    try {
        const [hotelBookings] = await pool.query(
            'SELECT * FROM reservas_hotel WHERE usuario_id = ?',
            [req.session.user.id]
        );
        const [restaurantBookings] = await pool.query(
            `SELECT rr.*, m.numero AS numero_mesa, m.capacidad, rest.nombre AS nombre_restaurante, rest.ciudad AS ciudad_restaurante
             FROM reservas_restaurante rr
             LEFT JOIN mesas m ON rr.mesa_id = m.id
             LEFT JOIN restaurantes rest ON rr.restaurante_id = rest.id
             WHERE rr.usuario_id = ?
             ORDER BY rr.fecha DESC`,
            [req.session.user.id]
        );

        // Calculate modification restriction for each restaurant booking
        const now = new Date();
        const modificationRestrictedHours = 12;

        const processedRestaurantBookings = restaurantBookings.map(booking => {
            let fechaStr = '';
            if (booking.fecha instanceof Date) {
                fechaStr = booking.fecha.toISOString().split('T')[0];
            } else {
                fechaStr = booking.fecha;
            }
            const bookingDateTime = new Date(`${fechaStr}T${booking.hora}`);
            const diffMs = bookingDateTime - now;
            const diffHours = diffMs / (1000 * 60 * 60);

            // Add a flag indicating if modification is restricted (within 12 hours and not in the past)
            booking.isModificationRestricted = diffHours < modificationRestrictedHours && bookingDateTime >= now;
            // Also add a flag if it's a past reservation for clarity
            booking.isPastReservation = bookingDateTime < now;

            return booking;
        });

        res.render('bookings', {
            user: req.session.user,
            hotelBookings,
            restaurantBookings: processedRestaurantBookings, // Pass the processed bookings
            error: null
        });

    } catch (error) {
        console.error('Error al obtener reservas:', error);
        res.render('bookings', {
            user: req.session.user,
            hotelBookings: [],
            restaurantBookings: [],
            error: 'Error al cargar reservas'
        });
    }
});

// Ruta para el dashboard de administrador
router.get('/admin/dashboard', isAuthenticated, isAdmin, (req, res) => {
    res.render('admin/dashboard', {
        user: req.session.user,
        path: '/admin/dashboard'
    });
});

// Ruta para gestionar usuarios (solo admin)
router.get('/admin/users', isAdmin, async (req, res) => {
    const query = 'SELECT * FROM usuarios';
    try {
        const [results] = await pool.query(query);
        res.render('admin/users', { users: results, error: null });
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.render('admin/users', { users: [], error: 'Error al cargar usuarios' });
    }
});

// Ruta para gestionar hoteles (solo admin)
router.get('/admin/hotels', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const [hotels] = await pool.query('SELECT * FROM hoteles ORDER BY nombre ASC');
        res.render('admin/hotels', {
            hotels,
            user: req.session.user,
            error: null
        });
    } catch (error) {
        console.error('Error al obtener hoteles:', error);
        res.render('admin/hotels', {
            hotels: [],
            user: req.session.user,
            error: 'Error al cargar los hoteles'
        });
    }
});


// Ruta para mostrar el formulario de editar perfil
router.get('/editar-perfil', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const [users] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.redirect('/mi-perfil');
        }
        res.render('editar-perfil', { user: users[0], error: null, success: null });
    } catch (error) {
        res.render('editar-perfil', { user: req.session.user, error: 'No se pudo cargar el perfil', success: null });
    }
});


// Ruta para procesar la edición del perfil
router.post('/editar-perfil', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id;
    const { nombre, telefono } = req.body;
    try {
        await pool.query(
            'UPDATE usuarios SET nombre = ?, telefono = ? WHERE id = ?',
            [nombre, telefono, userId]
        );
        // Actualiza la sesión con los nuevos datos
        req.session.user.nombre = nombre;
        req.session.user.telefono = telefono;
        res.render('editar-perfil', { user: req.session.user, error: null, success: 'Perfil actualizado correctamente' });
    } catch (error) {
        console.error('Error al actualizar el perfil:', error);
        res.render('editar-perfil', { user: req.session.user, error: 'Error al actualizar el perfil', success: null });
    }
});

// Ruta para cambiar contraseña
router.post('/cambiar-contrasena', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    try {
        // 1. Obtener datos del usuario primero
        const [userDetails] = await pool.query(
            'SELECT * FROM usuarios WHERE id = ?',
            [req.session.user.id]
        );

        // 2. Verificar contraseña actual
        const validPassword = await bcrypt.compare(currentPassword, userDetails[0].password);
        if (!validPassword) {
            return res.render('editar-perfil', {
                user: req.session.user,
                userDetails: userDetails[0],
                success: null,
                passwordError: 'La contraseña actual es incorrecta',
                passwordSuccess: null,
                error: null
            });
        }

        // 3. Validar que las nuevas coincidan
        if (newPassword !== confirmPassword) {
            return res.render('editar-perfil', {
                user: req.session.user,
                userDetails: userDetails[0],
                success: null,
                passwordError: 'Las nuevas contraseñas no coinciden',
                passwordSuccess: null,
                error: null
            });
        }

        // 4. Validar complejidad de la contraseña
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            return res.render('editar-perfil', {
                user: req.session.user,
                userDetails: userDetails[0],
                success: null,
                passwordError: 'La contraseña debe contener al menos: 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial',
                passwordSuccess: null,
                error: null
            });
        }

        // 5. Actualizar contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        await pool.query(
            'UPDATE usuarios SET password = ? WHERE id = ?',
            [hashedPassword, req.session.user.id]
        );

        // Obtener datos actualizados
        const [updatedUser] = await pool.query(
            'SELECT * FROM usuarios WHERE id = ?',
            [req.session.user.id]
        );

        res.render('editar-perfil', {
            user: req.session.user,
            userDetails: updatedUser[0],
            success: 'Contraseña cambiada correctamente',
            passwordError: null,
            passwordSuccess: 'Contraseña cambiada correctamente',
            error: null
        });
    } catch (error) {
        console.error('Error cambiando contraseña:', error);
        const [userDetails] = await pool.query(
            'SELECT * FROM usuarios WHERE id = ?',
            [req.session.user.id]
        );
        
        res.render('editar-perfil', {
            user: req.session.user,
            userDetails: userDetails[0],
            success: null,
            passwordError: 'Error al cambiar la contraseña',
            passwordSuccess: null,
            error: null
        });
    }
});

// ========== RUTAS DE ADMINISTRACIÓN UNIFICADAS ==========

// Formulario para nuevo hotel
router.get('/admin/hotels/new', isAuthenticated, isAdmin, (req, res) => {
    res.render('admin/hotels/form', { hotel: null, error: null, user: req.session.user });
});

// Guardar nuevo hotel
router.post('/admin/hotels', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { nombre, descripcion, direccion, ciudad, estrellas, precio_base, estado, coordenadas_lat, coordenadas_lng } = req.body;
        let imagen_principal = null;

        // Procesar la imagen si se subió una
        if (req.files && req.files.imagen_principal) {
            const file = req.files.imagen_principal;
            // Reemplazar espacios por guiones bajos en el nombre del archivo
            const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
            const uploadPath = path.join(__dirname, '../public/uploads/hotels', fileName);
            
            // Asegurarse de que el directorio existe
            await fs.mkdir(path.join(__dirname, '../public/uploads/hotels'), { recursive: true });
            
            // Mover el archivo
            await file.mv(uploadPath);
            imagen_principal = `/uploads/hotels/${fileName}`;
        }

        const creado_por = req.session.user.id;
        const query = `INSERT INTO hoteles (nombre, descripcion, direccion, ciudad, estrellas, precio_base, imagen_principal, coordenadas_lat, coordenadas_lng, estado, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        // Validar que los campos requeridos no sean nulos
        if (!nombre || !direccion || !ciudad || !estrellas || !precio_base) {
            throw new Error('Todos los campos marcados con * son obligatorios');
        }

        await pool.query(query, [
            nombre,
            descripcion || '',
            direccion,
            ciudad,
            estrellas,
            precio_base,
            imagen_principal,
            coordenadas_lat || null,
            coordenadas_lng || null,
            estado || 'activo',
            creado_por
        ]);

        req.flash('success', 'Hotel creado exitosamente');
        res.redirect('/admin/hotels');
    } catch (error) {
        console.error('Error al guardar hotel:', error);
        req.flash('error', error.message || 'Error al guardar el hotel');
        res.render('admin/hotels/form', { 
            hotel: null, 
            error: error.message || 'Error al guardar el hotel', 
            user: req.session.user 
        });
    }
});

// Mostrar formulario de edición de hotel
router.get('/admin/hotels/:id/edit', isAdmin, async (req, res) => {
    try {
        const [hotels] = await pool.query('SELECT * FROM hoteles WHERE id = ?', [req.params.id]);
        if (hotels.length === 0) return res.redirect('/admin/hotels');
        res.render('admin/hotels/edit', { hotel: hotels[0] });
    } catch (error) {
        console.error('Error al obtener hotel:', error);
        res.redirect('/admin/hotels');
    }
});

// Guardar edición de hotel
router.post('/admin/hotels/:id/edit', isAdmin, async (req, res) => {
    const { nombre, descripcion, direccion, ciudad, estrellas, precio_base, imagen_principal } = req.body;
    try {
        await pool.query(
            'UPDATE hoteles SET nombre=?, descripcion=?, direccion=?, ciudad=?, estrellas=?, precio_base=?, imagen_principal=?, modificado_por=? WHERE id=?',
            [nombre, descripcion, direccion, ciudad, estrellas, precio_base, imagen_principal, req.session.user.id, req.params.id]
        );
        res.redirect('/admin/hotels');
    } catch (error) {
        console.error('Error al editar hotel:', error);
        res.redirect('/admin/hotels');
    }
});

// ========== RUTAS DE RESTAURANTES ==========

// Mostrar listado de restaurantes
router.get('/admin/restaurants', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const [restaurants] = await pool.query('SELECT * FROM restaurantes ORDER BY nombre ASC');
        res.render('admin/restaurants', {
            restaurants,
            user: req.session.user,
            error: null
        });
    } catch (error) {
        console.error('Error al obtener restaurantes:', error);
        res.render('admin/restaurants', {
            restaurants: [],
            user: req.session.user,
            error: 'Error al cargar los restaurantes'
        });
    }
});

// Mostrar formulario para nuevo restaurante
router.get('/admin/restaurants/new', isAuthenticated, isAdmin, (req, res) => {
    res.render('admin/restaurants/form', { restaurant: null, error: null, user: req.session.user });
});

// Guardar nuevo restaurante
router.post('/admin/restaurants', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { nombre, descripcion, direccion, ciudad, tipo_cocina, precio_promedio, estado, coordenadas_lat, coordenadas_lng } = req.body;
        let imagen_principal = null;

        // Procesar la imagen si se subió una
        if (req.files && req.files.imagen_principal) {
            const file = req.files.imagen_principal;
            const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
            const uploadPath = path.join(__dirname, '../public/uploads/restaurants', fileName);
            await fs.mkdir(path.join(__dirname, '../public/uploads/restaurants'), { recursive: true });
            await file.mv(uploadPath);
            imagen_principal = `/uploads/restaurants/${fileName}`;
        }

        const creado_por = req.session.user.id;
        const query = `INSERT INTO restaurantes (nombre, descripcion, direccion, ciudad, tipo_cocina, precio_promedio, imagen_principal, coordenadas_lat, coordenadas_lng, estado, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        await pool.query(query, [nombre, descripcion, direccion, ciudad, tipo_cocina, precio_promedio, imagen_principal, coordenadas_lat, coordenadas_lng, estado, creado_por]);
        res.redirect('/admin/restaurants');
    } catch (error) {
        console.error('Error al guardar restaurante:', error);
        res.render('admin/restaurants/form', { error: 'Error al guardar el restaurante', user: req.session.user, success: null });
    }
});

// Mostrar formulario de edición de restaurante
router.get('/admin/restaurants/:id/edit', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const [restaurants] = await pool.query('SELECT * FROM restaurantes WHERE id = ?', [req.params.id]);
        if (restaurants.length === 0) {
            return res.redirect('/admin/restaurants');
        }

        // Obtener las mesas del restaurante
        const [mesas] = await pool.query('SELECT id, numero, capacidad as sillas FROM mesas WHERE restaurante_id = ?', [req.params.id]);

        res.render('admin/restaurants/form', {
            restaurant: restaurants[0],
            mesas: mesas,
            error: null,
            user: req.session.user,
            success: null
        });
    } catch (error) {
        console.error('Error al obtener restaurante para editar:', error);
        res.redirect('/admin/restaurants');
    }
});

// Ruta corregida para guardar edición de restaurante
router.post('/admin/restaurants/:id/edit', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const restaurantId = req.params.id;
        const { 
            nombre, 
            descripcion, 
            direccion, 
            ciudad, 
            tipo_cocina, 
            precio_promedio, 
            estado, 
            coordenadas_lat, 
            coordenadas_lng,
            existing_imagen_principal,
            mesas_numero,
            mesas_sillas
        } = req.body;

        console.log('Datos recibidos:', {
            mesas_numero,
            mesas_sillas
        });

        let imagen_principal = existing_imagen_principal || null;
        if (Array.isArray(imagen_principal)) {
            imagen_principal = imagen_principal[0];
        }

        // Si se sube una nueva imagen, reemplaza la existente
        if (req.files && req.files.imagen_principal) {
            const file = req.files.imagen_principal;
            const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
            const uploadPath = path.join(__dirname, '../public/uploads/restaurants', fileName);
            await fs.mkdir(path.dirname(uploadPath), { recursive: true });
            await file.mv(uploadPath);
            imagen_principal = `/uploads/restaurants/${fileName}`;
        }

        // Iniciar transacción
        await pool.query('START TRANSACTION');

        try {
            // Actualizar información del restaurante
            const query = `
                UPDATE restaurantes SET
                    nombre = ?,
                    descripcion = ?,
                    direccion = ?,
                    ciudad = ?,
                    tipo_cocina = ?,
                    precio_promedio = ?,
                    imagen_principal = ?,
                    coordenadas_lat = ?,
                    coordenadas_lng = ?,
                    estado = ?,
                    modificado_por = ?,
                    fecha_modificacion = CURRENT_TIMESTAMP
                WHERE id = ?
            `;

            const params = [
                nombre,
                descripcion || null,
                direccion,
                ciudad,
                tipo_cocina,
                precio_promedio,
                imagen_principal,
                coordenadas_lat || null,
                coordenadas_lng || null,
                estado || 'activo',
                req.session.user.id,
                restaurantId
            ];

            await pool.query(query, params);

            // Obtener las mesas actuales
            const [mesasActuales] = await pool.query(
                'SELECT id FROM mesas WHERE restaurante_id = ?',
                [restaurantId]
            );

            // Obtener las reservas activas para estas mesas
            const [reservasActivas] = await pool.query(
                `SELECT DISTINCT mesa_id 
                 FROM reservas_restaurante 
                 WHERE mesa_id IN (?) 
                 AND estado IN ('activa', 'pendiente')`,
                [mesasActuales.map(m => m.id)]
            );

            // Crear un conjunto de IDs de mesas con reservas activas
            const mesasConReservas = new Set(reservasActivas.map(r => r.mesa_id));

            // Convertir a arrays si no lo son
            const mesasArray = Array.isArray(mesas_numero) ? mesas_numero : [mesas_numero];
            const sillasArray = Array.isArray(mesas_sillas) ? mesas_sillas : [mesas_sillas];

            // Crear array de valores para insertar
            const mesasValues = [];
            for (let i = 0; i < mesasArray.length; i++) {
                const numero = parseInt(mesasArray[i]);
                const sillas = parseInt(sillasArray[i]);
                if (!isNaN(numero) && !isNaN(sillas) && numero > 0 && sillas > 0) {
                    mesasValues.push([numero, sillas, restaurantId]);
                }
            }

            // Eliminar solo las mesas que no tienen reservas activas
            await pool.query(
                'DELETE FROM mesas WHERE restaurante_id = ? AND id NOT IN (?)',
                [restaurantId, Array.from(mesasConReservas)]
            );

            // Insertar nuevas mesas
            if (mesasValues.length > 0) {
                await pool.query(
                    'INSERT INTO mesas (numero, capacidad, restaurante_id) VALUES ?',
                    [mesasValues]
                );
            }

            // Confirmar transacción
            await pool.query('COMMIT');

            req.flash('success', 'Restaurante actualizado exitosamente');
            return res.redirect('/admin/restaurants');
        } catch (error) {
            // Revertir transacción en caso de error
            await pool.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Error detallado:', {
            message: error.message,
            sql: error.sql,
            stack: error.stack
        });

        try {
            const [restaurant] = await pool.query('SELECT * FROM restaurantes WHERE id = ?', [req.params.id]);
            const [mesas] = await pool.query('SELECT id, numero, capacidad as sillas FROM mesas WHERE restaurante_id = ?', [req.params.id]);
            
            return res.render('admin/restaurants/form', {
                restaurant: restaurant[0] || {},
                mesas: mesas,
                error: 'Error al actualizar: ' + error.message,
                user: req.session.user
            });
        } catch (fetchError) {
            console.error('Error al recuperar restaurante:', fetchError);
            req.flash('error', 'Error grave al procesar la solicitud');
            return res.redirect('/admin/restaurants');
        }
    }
});

// Mostrar detalles de restaurante (solo vista, no edición)
router.get('/admin/restaurants/:id/view', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const [restaurants] = await pool.query('SELECT * FROM restaurantes WHERE id = ?', [req.params.id]);
        if (restaurants.length === 0) {
            return res.redirect('/admin/restaurants');
        }

        // Obtener las mesas del restaurante
        const [mesas] = await pool.query('SELECT id, numero, capacidad FROM mesas WHERE restaurante_id = ?', [req.params.id]);

        res.render('admin/restaurants/view', {
            restaurant: restaurants[0],
            mesas: mesas,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error al obtener restaurante para ver:', error);
        res.redirect('/admin/restaurants');
    }
});

router.get('/mi-perfil', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.render('perfil', {
        user: req.session.user,
        error: null // o puedes pasar un mensaje si hay error
    });
});

router.get('/restaurants/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM restaurantes WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).render('error', { message: 'Restaurante no encontrado', user: req.session.user });
        }
        const restaurant = rows[0];
        res.render('restaurants/detail', { restaurant, user: req.session.user });
    } catch (error) {
        console.error('Error al obtener restaurante:', error);
        res.status(500).render('error', { message: 'Error al cargar el restaurante', user: req.session.user });
    }
});

router.post('/admin/restaurants/:id/toggle-status', isAuthenticated, isAdmin, async (req, res) => {
    try {
        // Obtén el estado actual
        const [rows] = await pool.query('SELECT estado FROM restaurantes WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.redirect('/admin/restaurants');
        const estadoActual = rows[0].estado;
        // Alterna el estado
        let nuevoEstado = 'inactivo';
        if (estadoActual === 'inactivo' || estadoActual === 'cerrado_temporalmente') {
            nuevoEstado = 'activo';
        }
        await pool.query('UPDATE restaurantes SET estado = ? WHERE id = ?', [nuevoEstado, req.params.id]);
        res.redirect('/admin/restaurants');
    } catch (error) {
        res.status(500).send('Error al cambiar el estado');
    }
});

// Obtener mesas disponibles por restaurante
router.get('/api/mesas', async (req, res) => {
    const restaurante_id = req.query.restaurante_id;
    const fecha = req.query.fecha;
    const hora = req.query.hora;
    const num_comensales = req.query.num_comensales;

    console.log('API mesas - restaurante_id:', restaurante_id, 'fecha:', fecha, 'hora:', hora, 'num_comensales:', num_comensales);

    if (!restaurante_id || !fecha || !hora || !num_comensales) {
        return res.status(400).json({ success: false, message: 'restaurante_id, fecha, hora y num_comensales son requeridos' });
    }

    try {
        // Find tables that are NOT booked for the given date, time, and restaurant
        // AND have capacity greater than or equal to the number of guests
        const mesasQuery = `
            SELECT id, numero, capacidad
            FROM mesas
            WHERE restaurante_id = ?
              AND capacidad >= ?
              AND id NOT IN (
                  SELECT mesa_id
                  FROM reservas_restaurante
                  WHERE restaurante_id = ?
                    AND fecha = ?
                    AND hora = ?
                    AND estado IN ('activa', 'pendiente') -- Also exclude tables with 'pendiente' status
              );
        `;
        const params = [parseInt(restaurante_id), parseInt(num_comensales), parseInt(restaurante_id), fecha, hora];

        const [mesas] = await pool.query(mesasQuery, params);
        console.log('Resultado SQL mesas:', mesas);

        if (mesas.length > 0) {
            res.json({ success: true, mesas });
        } else {
            res.json({ success: true, mesas: [], message: 'No hay mesas disponibles para la fecha, hora y número de comensales seleccionados.' });
        }

    } catch (error) {
        console.error('Error obteniendo mesas:', error);
        res.status(500).json({ success: false, message: 'Error al obtener mesas disponibles.' });
    }
});

// --- RESERVA DE MESA CON CÓDIGO Y SUGERENCIAS DE HORARIO ---
router.post('/api/reservar-mesa', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Debes iniciar sesión.' });
    }
    const { restaurante_id, mesa_id, fecha, hora, num_comensales, nombre_reclamo, observaciones } = req.body;
    try {
        // Verificar si la mesa está disponible para la fecha y hora
        const [ocupadas] = await pool.query(
            `SELECT id FROM reservas_restaurante WHERE mesa_id = ? AND fecha = ? AND hora = ? AND estado = 'activa'`,
            [mesa_id, fecha, hora]
        );
        if (ocupadas.length > 0) {
            // Buscar horarios alternativos (±2 horas)
            const horasAlternativas = [];
            const horaBase = parseInt(hora.split(':')[0]);
            for (let offset = -2; offset <= 2; offset++) {
                if (offset === 0) continue;
                const nuevaHora = (horaBase + offset).toString().padStart(2, '0') + ':00';
                const [libres] = await pool.query(
                    `SELECT id FROM reservas_restaurante WHERE mesa_id = ? AND fecha = ? AND hora = ? AND estado = 'activa'`,
                    [mesa_id, fecha, nuevaHora]
                );
                if (libres.length === 0) {
                    horasAlternativas.push(nuevaHora);
                }
            }
            return res.status(409).json({
                success: false,
                message: 'No hay disponibilidad para la hora seleccionada.',
                sugerencias: horasAlternativas
            });
        }
        // Insertar la reserva y devolver el ID como código
        const [result] = await pool.query(
            `INSERT INTO reservas_restaurante (usuario_id, restaurante_id, mesa_id, fecha, hora, numero_personas, nombre_reclamo, notas, estado)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')`,
            [
                req.session.user.id,
                restaurante_id,
                mesa_id,
                fecha,
                hora,
                num_comensales,
                nombre_reclamo || null,
                observaciones || null
            ]
        );
        res.json({ success: true, message: 'Reserva realizada correctamente.', codigo: result.insertId });
    } catch (error) {
        console.error('Error al guardar reserva:', error);
        res.status(500).json({ success: false, message: 'Error al guardar la reserva.' });
    }
});

// --- RESTRICCIÓN DE CANCELACIÓN CERCA DE LA FECHA ---
router.post('/restaurante/reserva/cancelar/:id', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Debes iniciar sesión.' });
    }
    const reservaId = req.params.id;
    try {
        // Solo el dueño de la reserva puede cancelarla
        const [rows] = await pool.query('SELECT usuario_id, fecha, hora, estado FROM reservas_restaurante WHERE id = ?', [reservaId]);
        if (!rows.length || rows[0].usuario_id !== req.session.user.id) {
            return res.status(403).json({ success: false, message: 'No autorizado.' });
        }
        // Restricción: no cancelar si faltan menos de 2 horas
        const fechaReserva = rows[0].fecha;
        const horaReserva = rows[0].hora;
        const estadoReserva = rows[0].estado;
        if (estadoReserva !== 'pendiente') {
            return res.status(400).json({ success: false, message: 'Solo puedes cancelar reservas pendientes.' });
        }
        const fechaHoraReserva = new Date(`${fechaReserva}T${horaReserva}`);
        const ahora = new Date();
        const diffMs = fechaHoraReserva - ahora;
        const diffHoras = diffMs / (1000 * 60 * 60);
        if (diffHoras < 2) {
            return res.status(400).json({ success: false, message: 'No puedes cancelar la reserva con menos de 2 horas de antelación.' });
        }
        await pool.query('UPDATE reservas_restaurante SET estado = ? WHERE id = ?', ['cancelada', reservaId]);
        res.json({ success: true, message: 'Reserva cancelada.' });
    } catch (error) {
        console.error('Error al cancelar reserva:', error);
        res.status(500).json({ success: false, message: 'Error al cancelar la reserva.', error: error.message });
    }
});

function cancelarReserva(reservaId) {
    Swal.fire({
        title: '¿Cancelar reserva?',
        text: '¿Estás seguro de cancelar esta reserva?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, cancelar',
        cancelButtonText: 'No'
    }).then((result) => {
        if (result.isConfirmed) {
            fetch(`/restaurante/reserva/cancelar/${reservaId}`, {
                method: 'POST'
            })
            .then(res => res.json())
            .then(resp => {
                if (resp.success) {
                    Swal.fire('Cancelada', 'La reserva fue cancelada.', 'success')
                        .then(() => location.reload());
                } else {
                    Swal.fire('Error', resp.message, 'error');
                }
            })
            .catch(() => Swal.fire('Error', 'No se pudo cancelar la reserva.', 'error'));
        }
    });
}

// Ver perfil y reservas de un usuario (solo admin)
router.get('/admin/users/:id', isAuthenticated, isAdmin, async (req, res) => {
    const userId = req.params.id;
    try {
        // Info del usuario
        const [users] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [userId]);
        if (!users.length) {
            return res.render('admin/users/user_detail', { user: null, hotelBookings: [], restaurantBookings: [], error: 'Usuario no encontrado' });
        }
        // Reservas de hotel
        const [hotelBookings] = await pool.query('SELECT * FROM reservas_hotel WHERE usuario_id = ?', [userId]);
        // Reservas de restaurante (con número de mesa)
        const [restaurantBookings] = await pool.query(
            `SELECT rr.*, m.numero AS numero_mesa, m.capacidad, rest.nombre AS nombre_restaurante, rest.ciudad AS ciudad_restaurante
             FROM reservas_restaurante rr
             LEFT JOIN mesas m ON rr.mesa_id = m.id
             LEFT JOIN restaurantes rest ON rr.restaurante_id = rest.id
             WHERE rr.usuario_id = ?
             ORDER BY rr.fecha DESC`,
            [userId]
        );
        res.render('admin/users/user_detail', {
            user: users[0],
            hotelBookings,
            restaurantBookings,
            error: null
        });
    } catch (error) {
        res.render('admin/users/user_detail', { user: null, hotelBookings: [], restaurantBookings: [], error: 'Error al cargar datos' });
    }
});

// Mostrar formulario de edición de usuario (solo admin)
router.get('/admin/users/edit/:id', isAuthenticated, isAdmin, async (req, res) => {
    const userId = req.params.id;
    try {
        const [users] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [userId]);
        if (!users.length) {
            return res.render('admin/users/edit', { user: null, error: 'Usuario no encontrado' });
        }
        res.render('admin/users/edit', { user: users[0], error: null });
    } catch (error) {
        res.render('admin/users/edit', { user: null, error: 'Error al cargar usuario' });
    }
});

// Procesar edición de usuario (solo admin)
router.post('/admin/users/edit/:id', isAuthenticated, isAdmin, async (req, res) => {
    const userId = req.params.id;
    const { nombre, email, telefono, rol, estado } = req.body;
    try {
        await pool.query(
            'UPDATE usuarios SET nombre = ?, email = ?, telefono = ?, rol = ?, estado = ? WHERE id = ?',
            [nombre, email, telefono, rol, estado, userId]
        );
        res.redirect('/admin/users');
    } catch (error) {
        const [users] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [userId]);
        res.render('admin/users/edit', { user: users[0], error: 'Error al actualizar usuario' });
    }
});

// Cambiar estado de reserva de restaurante (admin)
router.post('/admin/restaurante/reserva/estado/:id', isAuthenticated, isAdmin, async (req, res) => {
    const reservaId = req.params.id;
    const { estado } = req.body;
    try {
        await pool.query('UPDATE reservas_restaurante SET estado = ? WHERE id = ?', [estado, reservaId]);
        req.flash('success', 'Estado de la reserva actualizado');
    } catch (error) {
        console.error('Error al actualizar estado de reserva restaurante:', error);
        req.flash('error', 'Error al actualizar el estado de la reserva');
    }
    res.redirect('back');
});

// --- RUTAS DE EDICIÓN DE RESERVAS DE RESTAURANTE ---

// Mostrar formulario de edición de reserva de restaurante
router.get('/bookings/restaurant/:id/edit', isAuthenticated, async (req, res) => {
    const reservaId = req.params.id;
    try {
        const [reservas] = await pool.query(
            `SELECT rr.*, rest.nombre AS nombre_restaurante, rest.ciudad AS ciudad_restaurante
             FROM reservas_restaurante rr
             LEFT JOIN restaurantes rest ON rr.restaurante_id = rest.id
             WHERE rr.id = ? AND rr.usuario_id = ?`,
            [reservaId, req.session.user.id]
        );

        if (!reservas.length) {
            req.flash('error', 'Reserva no encontrada o no pertenece a tu usuario.');
            return res.redirect('/bookings');
        }

        const reserva = reservas[0];

        // Log details for debugging past reservation issue
        console.log('Checking past reservation status for booking ID:', reserva.id);
        console.log('Reserva date:', reserva.fecha);
        console.log('Reserva time:', reserva.hora);
        console.log('Current server time:', new Date().toISOString());

        const fechaHoraReserva = new Date(`${reserva.fecha}T${reserva.hora}`);
        const ahora = new Date();
        const diffMs = fechaHoraReserva - ahora;
        const diffHours = diffMs / (1000 * 60 * 60);
        
        // New restriction: Modification of core fields (date, time, guests) is restricted within 12 hours
        const modificationRestrictedHours = 12;
        const isModificationRestrictedFields = diffHours < modificationRestrictedHours;

        // Existing check for past reservation
        const isPastReservation = fechaHoraReserva < ahora;

        res.render('bookings/edit_restaurant_booking', {
            user: req.session.user,
            reserva,
            // Pass the new restriction flag and the past reservation flag
            isModificationRestrictedFields,
            isPastReservation,
            error: null,
            success: null
        });

    } catch (error) {
        console.error('Error al cargar reserva para editar:', error);
        req.flash('error', 'Error al cargar la reserva.');
        res.redirect('/bookings');
    }
});

// Procesar edición de reserva de restaurante
router.post('/bookings/restaurant/:id/edit', isAuthenticated, async (req, res) => {
    const reservaId = req.params.id;
    const { fecha, hora, num_comensales, nombre_reclamo, observaciones } = req.body;
    const userId = req.session.user.id;

    try {
        // Obtener la reserva original para verificar restricciones
        const [originalReservas] = await pool.query(
            'SELECT id, fecha, hora, numero_personas FROM reservas_restaurante WHERE id = ? AND usuario_id = ?',
            [reservaId, userId]
        );

        if (!originalReservas.length) {
            req.flash('error', 'Reserva no encontrada o no pertenece a tu usuario.');
            return res.redirect('/bookings');
        }

        const originalReserva = originalReservas[0];

        // --- VALIDACIÓN: NO EDITAR SI LA RESERVA YA PASÓ ---
        const now = new Date();
        const originalReservaDateTime = new Date(`${originalReserva.fecha}T${originalReserva.hora}`);
        if (originalReservaDateTime < now) {
            req.flash('error', 'No se puede editar una reserva que ya ha pasado.');
            return res.redirect('/bookings'); // Redirigir de vuelta a la lista de reservas
        }
        // --- FIN VALIDACIÓN RESERVA PASADA ---

        // --- RESTRICCIÓN DE 12 HORAS ---
        const fechaHoraReserva = new Date(`${originalReserva.fecha}T${originalReserva.hora}`);
        const diffMs = fechaHoraReserva - now;
        const diffHoras = diffMs / (1000 * 60 * 60);
        const edicionRestringida = diffHoras < 12;

        // Verificar si se intentan cambiar campos restringidos dentro del plazo
        let camposModificados = {};
        let restriccionViolada = false;

        // Comparar fecha, hora y número de comensales
        let originalFechaStr = (originalReserva.fecha instanceof Date)
            ? originalReserva.fecha.toISOString().split('T')[0]
            : originalReserva.fecha;
        if (fecha !== originalFechaStr) camposModificados.fecha = true;
        if (hora !== originalReserva.hora) camposModificados.hora = true;
        if (parseInt(num_comensales) !== originalReserva.numero_personas) camposModificados.num_comensales = true;

        if (edicionRestringida && (camposModificados.fecha || camposModificados.hora || camposModificados.num_comensales)) {
            restriccionViolada = true;
        }

        if (restriccionViolada) {
            // Renderizar de nuevo el formulario con el mensaje de restricción
            const [reservaParaRender] = await pool.query(
                `SELECT rr.*, rest.nombre AS nombre_restaurante, rest.ciudad AS ciudad_restaurante
                 FROM reservas_restaurante rr
                 LEFT JOIN restaurantes rest ON rr.restaurante_id = rest.id
                 WHERE rr.id = ? AND rr.usuario_id = ?`,
                [reservaId, userId]
            );
            return res.render('bookings/edit_restaurant_booking', {
                user: req.session.user,
                reserva: reservaParaRender[0],
                isModificationRestrictedFields: true,
                isPastReservation: false,
                error: 'No es posible modificar la reserva porque está dentro del plazo restringido. Comuníquese directamente con el restaurante.',
                success: null
            });
        }

        // Si no hay restricción o solo se cambian campos no restringidos, proceder con la actualización
        const updateQuery = `
            UPDATE reservas_restaurante SET
                fecha = ?,
                hora = ?,
                numero_personas = ?,
                nombre_reclamo = ?,
                notas = ?
            WHERE id = ? AND usuario_id = ?
        `;
        await pool.query(updateQuery, [
            fecha,
            hora,
            parseInt(num_comensales),
            nombre_reclamo || null,
            observaciones || null,
            reservaId,
            userId
        ]);

        req.flash('success', 'Reserva actualizada exitosamente.');
        res.redirect('/bookings'); // Redirigir a la página de reservas

    } catch (error) {
        console.error('Error al actualizar reserva:', error);
        req.flash('error', 'Error al actualizar la reserva.');
        res.redirect('/bookings');
    }
});

module.exports = router; 