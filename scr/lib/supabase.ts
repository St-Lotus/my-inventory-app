import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface InventoryItem {
  id: string;
  name: string;
  barcode: string;
  quantity: number;
  category: string | null;
  description: string | null;
  price: number;
  supplier: string;
  created_at: string;
  updated_at: string;
}
