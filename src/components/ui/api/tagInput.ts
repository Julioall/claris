// API para TagInput (busca de sugestões)

import { supabase } from '@/integrations/supabase/client';

export async function searchStudents(q: string) {
  return supabase.from('students').select('id, full_name').ilike('full_name', `%${q}%`).limit(10);
}

export async function searchCourses(q: string) {
  return supabase.from('courses').select('id, name, short_name').ilike('name', `%${q}%`).limit(10);
}

export async function searchCategories(q: string) {
  return supabase.from('courses').select('category').not('category', 'is', null).ilike('category', `%${q}%`).limit(300);
}
