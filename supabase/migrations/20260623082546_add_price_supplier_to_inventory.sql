ALTER TABLE inventory_items 
ADD COLUMN price numeric(10,2) DEFAULT 0.00,
ADD COLUMN supplier text DEFAULT '';