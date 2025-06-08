/*const mysql = require('mysql2'); // En lugar de require('mysql')

const conexion = mysql.createConnection({
    host: 'localhost',
    database: 'easystay_p',
    user: 'root',
    password: 'root',
    insecureAuth: true
    
});

conexion.connect((error)=> {
    if (error){
        console.error('El error de conexion es: '+error);
        return
    }
    console.log('¡Conectado a la BD mysql!');    
})

module.exports = conexion;*/

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    database: 'easystay_p',
    user: 'root',
    password: 'root',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Verificación de conexión al iniciar
pool.getConnection()
    .then(connection => {
        console.log('✅ Conectado a la base de datos MySQL');
        connection.release();
    })
    .catch(err => {
        console.error('❌ Error al conectar a MySQL:', err);
    });

// Manejo de errores del pool
pool.on('error', (err) => {
    console.error('Error en el pool de conexiones:', err);
});

async function getUserById(id) {
    try {
        const [rows] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [id]);
        return rows[0];
    } catch (error) {
        console.error('Error al obtener usuario:', error);
        throw error;
    }
}

async function updateUser(id, data) {
    try {
        const { nombre, email, telefono } = data;
        const [result] = await pool.query(
            'UPDATE usuarios SET nombre = ?, email = ?, telefono = ? WHERE id = ?',
            [nombre, email, telefono, id]
        );
        return result;
    } catch (error) {
        console.error('Error al actualizar usuario:', error);
        throw error;
    }
}

module.exports = {
    pool,
    getUserById,
    updateUser
};