CREATE TABLE inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  barcode text UNIQUE NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  category text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (since no auth required)
CREATE POLICY "select_inventory_items" ON inventory_items FOR SELECT
  USING (true);
CREATE POLICY "insert_inventory_items" ON inventory_items FOR INSERT
  WITH CHECK (true);
CREATE POLICY "update_inventory_items" ON inventory_items FOR UPDATE
  USING (true) WITH CHECK (true);
CREATE POLICY "delete_inventory_items" ON inventory_items FOR DELETE
  USING (true);

-- Create index for faster barcode lookups
CREATE INDEX idx_inventory_items_barcode ON inventory_items(barcode);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_inventory_items_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();