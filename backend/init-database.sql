CREATE DATABASE IF NOT EXISTS neural_planner;
USE neural_planner;

CREATE TABLE IF NOT EXISTS tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    deadline DATETIME NOT NULL,
    priority ENUM('Low', 'Medium', 'High') DEFAULT 'Medium',
    estimated_hours FLOAT DEFAULT 2,
    type ENUM('academic', 'project', 'personal') DEFAULT 'academic',
    energy_level ENUM('low', 'medium', 'high') DEFAULT 'medium',
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);