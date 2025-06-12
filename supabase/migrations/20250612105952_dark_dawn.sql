/*
  # Facial Recognition Database Schema

  1. New Tables
    - `per` - Stores person information (ID, name, surname)
    - `face` - Stores facial recognition data and templates
    - `perface` - Junction table linking persons to their faces

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage facial recognition data
    - Public read access for the application to function properly

  3. Features
    - Auto-incrementing IDs for persons and faces
    - Binary data storage for face templates
    - Active/inactive face status tracking
    - Cascade deletion for data integrity
    - Timestamps for audit trails
*/

-- Create persons table
CREATE TABLE IF NOT EXISTS per (
  "personaID" SERIAL PRIMARY KEY,
  nombre VARCHAR(255),
  apellido VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create faces table  
CREATE TABLE IF NOT EXISTS face (
  "facialID" SERIAL PRIMARY KEY,
  "templateData" BYTEA,
  activo BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Create person-face junction table
CREATE TABLE IF NOT EXISTS perface (
  "personaID" INTEGER NOT NULL,
  "facialID" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY ("personaID", "facialID"),
  FOREIGN KEY ("personaID") REFERENCES per("personaID") ON DELETE CASCADE,
  FOREIGN KEY ("facialID") REFERENCES face("facialID") ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_per_nombre ON per(nombre);
CREATE INDEX IF NOT EXISTS idx_per_apellido ON per(apellido);
CREATE INDEX IF NOT EXISTS idx_face_activo ON face(activo);
CREATE INDEX IF NOT EXISTS idx_perface_persona ON perface("personaID");
CREATE INDEX IF NOT EXISTS idx_perface_face ON perface("facialID");

-- Enable Row Level Security
ALTER TABLE per ENABLE ROW LEVEL SECURITY;
ALTER TABLE face ENABLE ROW LEVEL SECURITY;
ALTER TABLE perface ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (since this is an internal system)
-- In production, you might want to restrict these to authenticated users

CREATE POLICY "Allow public read access to persons"
  ON per
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert access to persons"
  ON per
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public update access to persons"
  ON per
  FOR UPDATE
  TO public
  USING (true);

CREATE POLICY "Allow public read access to faces"
  ON face
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert access to faces"
  ON face
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public update access to faces"
  ON face
  FOR UPDATE
  TO public
  USING (true);

CREATE POLICY "Allow public read access to perface"
  ON perface
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert access to perface"
  ON perface
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public delete access to perface"
  ON perface
  FOR DELETE
  TO public
  USING (true);

-- Insert some sample data for testing
INSERT INTO per (nombre, apellido) VALUES 
  ('Juan', 'Pérez'),
  ('María', 'García'),
  ('Carlos', 'López'),
  ('Ana', 'Martínez'),
  ('Luis', 'Rodríguez'),
  ('Carmen', 'Fernández'),
  ('José', 'González'),
  ('Isabel', 'Sánchez'),
  ('Miguel', 'Ruiz'),
  ('Laura', 'Díaz'),
  ('Antonio', 'Moreno'),
  ('Pilar', 'Muñoz'),
  ('Francisco', 'Álvarez'),
  ('Rosa', 'Romero'),
  ('Manuel', 'Alonso'),
  ('Teresa', 'Gutiérrez'),
  ('David', 'Navarro'),
  ('Cristina', 'Torres'),
  ('Javier', 'Domínguez'),
  ('Mónica', 'Vázquez')
ON CONFLICT DO NOTHING;