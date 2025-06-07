-- Insertar hoteles de muestra
INSERT INTO hoteles (nombre, descripcion, direccion, ciudad, estrellas, precio_base, imagen_principal, estado, creado_por) VALUES
('Hotel Marina Resort', 'Lujoso resort frente al mar con vistas panorámicas', 'Av. Costera 123', 'Playa del Carmen', 5, 250.00, '/img/3.png', 'activo', 1),
('Mountain View Resort', 'Hotel boutique con vistas a las montañas', 'Carretera Panorámica 456', 'Valle de Bravo', 4, 180.00, '/img/2.png', 'activo', 1),
('City Lights Hotel', 'Hotel moderno en el corazón de la ciudad', 'Av. Reforma 789', 'Ciudad de México', 4, 200.00, '/img/5.png', 'activo', 1);

-- Insertar características para cada hotel
INSERT INTO caracteristicas_hotel (hotel_id, wifi, parking, piscina, restaurante, aire_acondicionado, gimnasio, spa, bar, mascotas) VALUES
(1, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE),
(2, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, TRUE, TRUE),
(3, TRUE, TRUE, FALSE, TRUE, TRUE, TRUE, FALSE, TRUE, FALSE);

CREATE TABLE mesas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero INT NOT NULL,
    capacidad INT NOT NULL,
    disponible BOOLEAN DEFAULT TRUE,
    restaurante_id INT,
    FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id)
);

INSERT INTO mesas (numero, capacidad, disponible, restaurante_id) VALUES
(1, 2, TRUE, 1),
(2, 4, TRUE, 1),
(3, 6, FALSE, 1),
(4, 2, TRUE, 1); 