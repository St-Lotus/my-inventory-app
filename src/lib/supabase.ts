import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface InventoryItem {
  id: number;                 
  stock_code: string;         
  barcode: string;
  description: string | null;
  short_description: string | null; 
  location: string | null;          
  category: string | null;
  main_vendor: string | null;       
  onhand_qty: number;               
  price: number;
  created_at: string;
}
