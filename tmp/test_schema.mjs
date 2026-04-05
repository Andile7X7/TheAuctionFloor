import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testQuery() {
  const { data, error } = await supabase
    .from('users')
    .select('firstname, avatar_url, avatar_bg')
    .limit(1);
  
  if (error) {
    console.log("Error Status:", error.code);
    console.log("Error Message:", error.message);
  } else {
    console.log("Success!");
  }
}

testQuery();
