import { createClient } from '@supabase/supabase-js';

function required(name) {
  const value = String(process.env[name] ?? '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const supabaseUrl = required('SUPABASE_URL');
const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
const email = required('CLARIS_FIRST_ADMIN_EMAIL').toLowerCase();
const password = required('CLARIS_FIRST_ADMIN_PASSWORD');
const fullName = required('CLARIS_FIRST_ADMIN_FULL_NAME');

if (password.length < 12) throw new Error('CLARIS_FIRST_ADMIN_PASSWORD must have at least 12 characters');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: usersPage, error: listError } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (listError) throw listError;

let authUser = usersPage.users.find((candidate) => candidate.email?.toLowerCase() === email);
if (!authUser) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  authUser = data.user;
}

const { error: profileError } = await supabase.from('users').upsert({
  email,
  full_name: fullName,
  id: authUser.id,
}, { onConflict: 'id' });
if (profileError) throw profileError;

const { error: roleError } = await supabase.from('admin_user_roles').upsert({
  permissions: ['admin'],
  role: 'admin',
  user_id: authUser.id,
}, { onConflict: 'user_id' });
if (roleError) throw roleError;

console.log(JSON.stringify({
  created: true,
  emailMasked: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
  userId: authUser.id,
}));
