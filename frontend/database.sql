
-- DriveFlow MySQL Database Schema - Morocco Edition

CREATE DATABASE IF NOT EXISTS driveflow_db;
USE driveflow_db;

-- Table: Users (Staff)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('ADMIN', 'AGENT', 'CLIENT') DEFAULT 'AGENT',
    avatar VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: Clients (Focus CIN)
CREATE TABLE clients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    id_number VARCHAR(50) UNIQUE NOT NULL, -- CIN Marocaine
    license_number VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: Vehicles (With Moroccan Documents)
CREATE TABLE vehicles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    year INT NOT NULL,
    registration VARCHAR(50) UNIQUE NOT NULL, -- Immatriculation locale
    registration_card VARCHAR(100) NOT NULL, -- Carte Grise
    insurance_expiry DATE NOT NULL,
    tech_control_expiry DATE NOT NULL,
    vignette_expiry DATE NOT NULL,
    status ENUM('AVAILABLE', 'RENTED', 'MAINTENANCE') DEFAULT 'AVAILABLE',
    price_per_day DECIMAL(10, 2) NOT NULL,
    image_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: Reservations
CREATE TABLE reservations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT NOT NULL,
    vehicle_id INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    status ENUM('PENDING', 'CONFIRMED', 'ONGOING', 'COMPLETED', 'CANCELLED') DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

-- Initial Seed
INSERT INTO users (name, email, password, role) VALUES 
('Directeur DriveFlow', 'admin@driveflow.ma', 'hashed_pwd', 'ADMIN'),
('Agent Casablanca', 'agent@driveflow.ma', 'hashed_pwd', 'AGENT');
