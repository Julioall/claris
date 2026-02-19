import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // IMPORTANT: Must include every header the browser may send in the preflight.
  // If a header is missing here, the browser will block the call and you'll see
  // "Failed to fetch" / "Failed to send a request to the Edge Function".
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface MoodleTokenResponse {
  token?: string;
  error?: string;
  errorcode?: string;
}

interface MoodleCourse {
  id: number;
  shortname: string;
  fullname: string;
  category?: number; // Category ID (not name) - from core_enrol_get_users_courses
  startdate?: number;
  enddate?: number;
}

interface MoodleCategory {
  id: number;
  name: string;
  parent: number;
  path: string; // e.g., "/1/5/10" - hierarchy of category IDs
  description?: string;
}

interface MoodleUser {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
  fullname: string;
  email: string;
  profileimageurl?: string;
}

interface MoodleEnrolledUser {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
  fullname: string;
  email?: string;
  profileimageurl?: string;
  lastaccess?: number;
  lastcourseaccess?: number; // Last access to this specific course
  roles?: { roleid: number; name: string; shortname: string }[];
  enrolledcourses?: { id: number; shortname: string; fullname: string; suspended?: boolean }[];
  suspended?: boolean; // User-level suspension
  status?: number; // 0 = active, 1 = suspended (direct field from API)
  enrolments?: { 
    id: number; 
    courseid: number; 
    type: string; 
    name: string; 
    status: number; // 0 = active, 1 = suspended
  }[];
}

// Get Moodle token using username/password
async function getMoodleToken(moodleUrl: string, username: string, password: string, service: string = 'moodle_mobile_app'): Promise<MoodleTokenResponse> {
  const tokenUrl = `${moodleUrl}/login/token.php`;
  const params = new URLSearchParams({
    username,
    password,
    service
  });

  console.log(`Requesting token from: ${tokenUrl} with service: ${service}`);
  
  try {
    const response = await fetch(`${tokenUrl}?${params.toString()}`);
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    
    console.log(`Response status: ${response.status}, content-type: ${contentType}`);
    console.log(`Response body (first 500 chars): ${text.substring(0, 500)}`);
    
    // Check if response is HTML (error page)
    if (contentType.includes('text/html') || text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      console.error('Moodle returned HTML instead of JSON - possibly invalid URL or service not enabled');
      return { 
        error: `O serviço "${service}" não está disponível neste Moodle. Verifique com o administrador se os Web Services estão habilitados.`,
        errorcode: 'service_unavailable'
      };
    }
    
    // Try to parse JSON
    try {
      const data = JSON.parse(text);
      console.log('Token response:', JSON.stringify(data));
      return data;
    } catch (parseError) {
      console.error('Failed to parse JSON response:', text.substring(0, 200));
      return { 
        error: 'Resposta inválida do Moodle. Verifique a URL.',
        errorcode: 'parse_error'
      };
    }
  } catch (fetchError) {
    console.error('Fetch error:', fetchError);
    return { 
      error: `Erro de conexão: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`,
      errorcode: 'network_error'
    };
  }
}

// Call Moodle Web Service API
async function callMoodleApi(moodleUrl: string, token: string, wsfunction: string, params: Record<string, string | number> = {}): Promise<any> {
  const apiUrl = `${moodleUrl}/webservice/rest/server.php`;
  const queryParams = new URLSearchParams({
    wstoken: token,
    wsfunction,
    moodlewsrestformat: 'json',
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  });

  console.log(`Calling Moodle API: ${wsfunction}`);
  
  const response = await fetch(`${apiUrl}?${queryParams.toString()}`);
  const data = await response.json();
  
  if (data.exception) {
    console.error(`Moodle API error: ${data.message}`);
    throw new Error(data.message || 'Moodle API error');
  }
  
  return data;
}

// Get current user info
async function getSiteInfo(moodleUrl: string, token: string): Promise<MoodleUser & { userid: number }> {
  const data = await callMoodleApi(moodleUrl, token, 'core_webservice_get_site_info');
  return data;
}

// Get user's enrolled courses
async function getUserCourses(moodleUrl: string, token: string, userId: number): Promise<MoodleCourse[]> {
  const data = await callMoodleApi(moodleUrl, token, 'core_enrol_get_users_courses', { userid: userId });
  return data;
}

// Get all categories from Moodle
async function getCategories(moodleUrl: string, token: string): Promise<MoodleCategory[]> {
  try {
    const data = await callMoodleApi(moodleUrl, token, 'core_course_get_categories');
    return data || [];
  } catch (error) {
    console.error('Error fetching categories (function may not be available):', error);
    return [];
  }
}

// Build category name with path (e.g., "Parent > Child > SubChild")
function buildCategoryPath(categoryId: number, categories: MoodleCategory[]): string {
  const categoryMap = new Map(categories.map(c => [c.id, c]));
  const category = categoryMap.get(categoryId);
  
  if (!category) {
    return '';
  }

  // Parse the path string (e.g., "/1/5/10") to get the hierarchy
  const pathIds = category.path
    .split('/')
    .filter(id => id !== '')
    .map(id => parseInt(id, 10));

  // Build the full path name
  const pathNames = pathIds
    .map(id => categoryMap.get(id)?.name)
    .filter((name): name is string => !!name);

  return pathNames.join(' > ');
}

// Get enrolled users in a course
async function getCourseEnrolledUsers(moodleUrl: string, token: string, courseId: number): Promise<MoodleEnrolledUser[]> {
  try {
    const data = await callMoodleApi(moodleUrl, token, 'core_enrol_get_enrolled_users', { courseid: courseId });
    return data;
  } catch (error) {
    console.error(`Error fetching enrolled users for course ${courseId}:`, error);
    return [];
  }
}

// --- Input Validation Helpers ---
function validateMoodleUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) return false;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function validatePositiveInteger(value: unknown): value is number {
  if (value === undefined || value === null) return false;
  const num = typeof value === 'number' ? value : parseInt(String(value), 10);
  return !isNaN(num) && Number.isFinite(num) && num > 0 && num < Number.MAX_SAFE_INTEGER;
}

function validateString(value: unknown, maxLength = 1024): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function validateStringArray(value: unknown, maxItems = 500): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every(v => typeof v === 'string' && v.length > 0 && v.length <= 255);
}

function parseNullableNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNullablePercentage(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const cleanPercentage = String(value).replace(/[%\s]/g, '').replace(',', '.');
  const parsed = parseFloat(cleanPercentage);
  return Number.isFinite(parsed) ? parsed : null;
}

function validationError(message: string) {
  return new Response(
    JSON.stringify({ error: message }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, moodleUrl, username, password, token, userId, courseId, service, selectedCourseIds } = body;

    console.log(`Moodle API action: ${action}`);

    // Validate action
    if (!validateString(action, 64)) {
      return validationError('Invalid or missing action');
    }

    // Validate moodleUrl when provided
    if (moodleUrl !== undefined && !validateMoodleUrl(moodleUrl)) {
      return validationError('Invalid Moodle URL format. Must be a valid HTTP/HTTPS URL.');
    }

    // Validate numeric IDs when provided
    if (userId !== undefined && !validatePositiveInteger(userId)) {
      return validationError('Invalid userId. Must be a positive integer.');
    }
    if (courseId !== undefined && !validatePositiveInteger(courseId)) {
      return validationError('Invalid courseId. Must be a positive integer.');
    }

    // Validate string params when provided
    if (username !== undefined && !validateString(username, 255)) {
      return validationError('Invalid username.');
    }
    if (password !== undefined && !validateString(password, 1024)) {
      return validationError('Invalid password.');
    }
    if (token !== undefined && !validateString(token, 512)) {
      return validationError('Invalid token.');
    }
    if (service !== undefined && !validateString(service, 128)) {
      return validationError('Invalid service name.');
    }

    // Validate selectedCourseIds when provided
    if (selectedCourseIds !== undefined && !validateStringArray(selectedCourseIds)) {
      return validationError('Invalid selectedCourseIds. Must be an array of strings.');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    switch (action) {
      case 'login': {
        if (!moodleUrl || !username || !password) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: moodleUrl, username, password' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get token from Moodle
        const tokenResponse = await getMoodleToken(moodleUrl, username, password, service || 'moodle_mobile_app');
        
        if (tokenResponse.error || !tokenResponse.token) {
          return new Response(
            JSON.stringify({ 
              error: tokenResponse.error || 'Authentication failed',
              errorcode: tokenResponse.errorcode 
            }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get user info from Moodle
        const siteInfo = await getSiteInfo(moodleUrl, tokenResponse.token);
        
        const authEmail = `moodle_${siteInfo.userid}@moodle.local`;
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
        const anonClient = createClient(supabaseUrl, anonKey);

        // Check if user exists in our users table
        const { data: existingUser } = await supabase
          .from('users')
          .select('*')
          .eq('moodle_user_id', String(siteInfo.userid))
          .single();

        const userData = {
          moodle_user_id: String(siteInfo.userid),
          moodle_username: siteInfo.username,
          full_name: siteInfo.fullname || `${siteInfo.firstname} ${siteInfo.lastname}`,
          email: siteInfo.email || null,
          avatar_url: siteInfo.profileimageurl || null,
          last_login: new Date().toISOString(),
          last_sync: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        let user;
        let session;

        if (existingUser) {
          // Try to sign in to Supabase Auth
          let signInResult = await anonClient.auth.signInWithPassword({
            email: authEmail,
            password: password,
          });

          if (signInResult.error) {
            // Auth user might not exist yet (migrating existing user) or password changed
            const createResult = await supabase.auth.admin.createUser({
              id: existingUser.id,
              email: authEmail,
              password: password,
              email_confirm: true,
              user_metadata: { moodle_user_id: String(siteInfo.userid) }
            });

            if (createResult.error) {
              // Auth user exists but password differs - update it
              await supabase.auth.admin.updateUserById(existingUser.id, { password });
            }

            // Sign in again
            signInResult = await anonClient.auth.signInWithPassword({
              email: authEmail,
              password: password,
            });

            if (signInResult.error) {
              console.error('Failed to sign in after auth user setup:', signInResult.error);
              throw new Error('Failed to create authentication session');
            }
          }

          session = signInResult.data.session;

          // Update user data
          const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update(userData)
            .eq('id', existingUser.id)
            .select()
            .single();

          if (updateError) throw updateError;
          user = updatedUser;
        } else {
          // Create new Supabase Auth user first
          const { data: newAuthUser, error: createAuthError } = await supabase.auth.admin.createUser({
            email: authEmail,
            password: password,
            email_confirm: true,
            user_metadata: { moodle_user_id: String(siteInfo.userid) }
          });

          if (createAuthError) throw createAuthError;
          const authUserId = newAuthUser.user.id;

          // Create users record with the same ID as auth user
          const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert({ ...userData, id: authUserId })
            .select()
            .single();

          if (insertError) throw insertError;
          user = newUser;

          // Sign in to get session
          const signInResult = await anonClient.auth.signInWithPassword({
            email: authEmail,
            password: password,
          });

          if (signInResult.error) throw signInResult.error;
          session = signInResult.data.session;
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            user,
            moodleToken: tokenResponse.token,
            moodleUserId: siteInfo.userid,
            session: {
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // login_with_token removed for security reasons

      case 'sync_courses': {
        if (!moodleUrl || !token || !userId) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: moodleUrl, token, userId' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get user's Supabase ID from moodle_user_id
        const { data: dbUser } = await supabase
          .from('users')
          .select('id')
          .eq('moodle_user_id', String(userId))
          .maybeSingle();

        if (!dbUser) {
          return new Response(
            JSON.stringify({ error: 'User not found in database' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get courses from Moodle
        const moodleCourses = await getUserCourses(moodleUrl, token, userId);
        console.log(`Found ${moodleCourses.length} courses for user ${userId}`);

        // Get all categories to build category names
        const categories = await getCategories(moodleUrl, token);
        console.log(`Found ${categories.length} categories`);

        // Prepare course data for batch upsert
        const now = new Date().toISOString();
        
        // Log first course for debugging
        if (moodleCourses.length > 0) {
          console.log('Sample course data:', JSON.stringify(moodleCourses[0]));
        }
        
        const coursesData = moodleCourses.map(course => {
          // The API returns 'category' as the category ID (not 'categoryid')
          let categoryName: string | null = null;
          
          if (course.category && categories.length > 0) {
            categoryName = buildCategoryPath(course.category, categories);
            console.log(`Course "${course.fullname}" - category ID: ${course.category}, resolved name: "${categoryName}"`);
          }
          
          // Fallback to just the category ID if we couldn't get the name
          if (!categoryName && course.category) {
            categoryName = String(course.category);
          }

          return {
            moodle_course_id: String(course.id),
            name: course.fullname,
            short_name: course.shortname,
            category: categoryName,
            start_date: course.startdate ? new Date(course.startdate * 1000).toISOString() : null,
            end_date: course.enddate ? new Date(course.enddate * 1000).toISOString() : null,
            last_sync: now,
            updated_at: now,
          };
        });

        // Batch upsert courses (uses unique constraint on moodle_course_id)
        const { data: syncedCourses, error: upsertError } = await supabase
          .from('courses')
          .upsert(coursesData, { 
            onConflict: 'moodle_course_id',
            ignoreDuplicates: false 
          })
          .select();

        if (upsertError) {
          console.error('Error upserting courses:', upsertError);
          return new Response(
            JSON.stringify({ error: 'Failed to sync courses', details: upsertError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`Upserted ${syncedCourses?.length || 0} courses`);

        // NOTE: We no longer auto-link ALL courses to user_courses here.
        // The client will call 'link_selected_courses' with only the selected course IDs.

        return new Response(
          JSON.stringify({ success: true, courses: syncedCourses || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'sync_students': {
        if (!moodleUrl || !token || !courseId) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: moodleUrl, token, courseId' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get course from database
        const { data: dbCourse } = await supabase
          .from('courses')
          .select('id')
          .eq('moodle_course_id', String(courseId))
          .maybeSingle();

        if (!dbCourse) {
          return new Response(
            JSON.stringify({ error: 'Course not found in database' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get enrolled users from Moodle
        const enrolledUsers = await getCourseEnrolledUsers(moodleUrl, token, courseId);
        console.log(`Found ${enrolledUsers.length} enrolled users in course ${courseId}`);

        // Filter to only students (role shortname = 'student')
        const students = enrolledUsers.filter(user => 
          user.roles?.some(role => role.shortname === 'student')
        );
        
        console.log(`Found ${students.length} students in course ${courseId}`);
        
        // Log sample student data to see available fields for debugging suspension detection
        if (students.length > 0) {
          const sample = students[0];
          console.log('Sample student fields:', JSON.stringify({
            id: sample.id,
            suspended: sample.suspended,
            status: (sample as any).status,
            lastaccess: sample.lastaccess,
            lastcourseaccess: (sample as any).lastcourseaccess,
            enrolments: sample.enrolments,
            enrolledcourses: sample.enrolledcourses,
            allKeys: Object.keys(sample),
          }, null, 2));
        }

        if (students.length === 0) {
          return new Response(
            JSON.stringify({ success: true, students: [] }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Prepare student data for batch upsert
        const now = new Date().toISOString();
        const studentsData = students.map(student => {
          // Determine enrollment status from various possible sources
          let enrollmentStatus = 'ativo';
          
          // Check direct status field (some Moodle versions return this)
          if ((student as any).status === 1) {
            enrollmentStatus = 'suspenso';
          }
          
          // Check if user is suspended at user level
          if (student.suspended === true) {
            enrollmentStatus = 'suspenso';
          }
          
          // Check enrolments array for this specific course
          if (student.enrolments && student.enrolments.length > 0) {
            const courseEnrolment = student.enrolments.find(e => e.courseid === courseId);
            if (courseEnrolment && courseEnrolment.status === 1) {
              enrollmentStatus = 'suspenso';
            }
          }
          
          // Check enrolledcourses for suspended flag
          if (student.enrolledcourses && student.enrolledcourses.length > 0) {
            const courseInfo = student.enrolledcourses.find(c => c.id === courseId);
            if (courseInfo && courseInfo.suspended) {
              enrollmentStatus = 'suspenso';
            }
          }
          
          // Get course-specific last access if available
          const lastCourseAccess = (student as any).lastcourseaccess 
            ? new Date((student as any).lastcourseaccess * 1000).toISOString() 
            : null;
          
          return {
            moodle_user_id: String(student.id),
            full_name: student.fullname || `${student.firstname} ${student.lastname}`,
            email: student.email || null,
            avatar_url: student.profileimageurl || null,
            last_access: student.lastaccess ? new Date(student.lastaccess * 1000).toISOString() : null,
            updated_at: now,
            _enrollment_status: enrollmentStatus, // Temporary field for linking
            _last_course_access: lastCourseAccess, // Temporary field for course link
          };
        });
        
        // Log suspension detection results
        const suspendedCount = studentsData.filter(s => s._enrollment_status === 'suspenso').length;
        console.log(`Enrollment status detection: ${suspendedCount} suspended out of ${studentsData.length} students`);

        // Batch upsert students
        const studentsForUpsert = studentsData.map(({ _enrollment_status, _last_course_access, ...rest }) => rest);
        const { data: syncedStudents, error: upsertError } = await supabase
          .from('students')
          .upsert(studentsForUpsert, { 
            onConflict: 'moodle_user_id',
            ignoreDuplicates: false 
          })
          .select();

        if (upsertError) {
          console.error('Error upserting students:', upsertError);
          return new Response(
            JSON.stringify({ error: 'Failed to sync students', details: upsertError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`Upserted ${syncedStudents?.length || 0} students`);

        // Batch upsert student-course links
        if (syncedStudents && syncedStudents.length > 0) {
          // Map synced students to their enrollment status and course access
          const studentDataMap = new Map(
            studentsData.map(s => [s.moodle_user_id, { 
              status: s._enrollment_status, 
              lastCourseAccess: s._last_course_access 
            }])
          );
          
          const studentCourseLinks = syncedStudents.map(student => {
            const data = studentDataMap.get(student.moodle_user_id);
            return {
              student_id: student.id,
              course_id: dbCourse.id,
              enrollment_status: data?.status || 'ativo',
              last_access: data?.lastCourseAccess || null,
              last_sync: now
            };
          });

          const { error: linkError } = await supabase
            .from('student_courses')
            .upsert(studentCourseLinks, { 
              onConflict: 'student_id,course_id',
              ignoreDuplicates: false 
            });
          
          if (linkError) {
            console.error('Error linking students to course:', linkError);
          }
        }

        // Update course's last_sync
        await supabase
          .from('courses')
          .update({ last_sync: now })
          .eq('id', dbCourse.id);

        return new Response(
          JSON.stringify({ success: true, students: syncedStudents || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'sync_activities': {
        if (!moodleUrl || !token || !courseId) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: moodleUrl, token, courseId' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get course from database
        const { data: dbCourse } = await supabase
          .from('courses')
          .select('id')
          .eq('moodle_course_id', String(courseId))
          .maybeSingle();

        if (!dbCourse) {
          return new Response(
            JSON.stringify({ error: 'Course not found in database', activitiesCount: 0 }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get course contents (activities) from Moodle
        let courseContents: any[] = [];
        try {
          courseContents = await callMoodleApi(moodleUrl, token, 'core_course_get_contents', { courseid: courseId });
          console.log(`Found ${courseContents?.length || 0} sections in course ${courseId}`);
        } catch (err) {
          console.error(`Error fetching course contents for ${courseId}:`, err);
          return new Response(
            JSON.stringify({ success: true, activitiesCount: 0 }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get all students enrolled in this course
        const { data: studentCourses } = await supabase
          .from('student_courses')
          .select('student_id')
          .eq('course_id', dbCourse.id);

        const studentIds = studentCourses?.map(sc => sc.student_id) || [];
        
        if (studentIds.length === 0) {
          return new Response(
            JSON.stringify({ success: true, activitiesCount: 0 }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Extract only quiz, assign, and forum activities from course contents
        const ALLOWED_ACTIVITY_TYPES = ['quiz', 'assign', 'forum'];
        const activities: any[] = [];
        for (const section of courseContents) {
          if (section.modules) {
            for (const module of section.modules) {
              // Only include quiz, assign, and forum activities
              if (ALLOWED_ACTIVITY_TYPES.includes(module.modname)) {
                activities.push({
                  id: module.id,
                  name: module.name,
                  modname: module.modname,
                  completion: module.completion,
                  completiondata: module.completiondata,
                });
              }
            }
          }
        }

        console.log(`Found ${activities.length} activities (quiz/assign/forum) in course ${courseId}`);

        if (activities.length === 0) {
          return new Response(
            JSON.stringify({ success: true, activitiesCount: 0 }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Prepare all activity records for batch upsert
        const now = new Date().toISOString();
        const activityRecords: any[] = [];
        
        for (const activity of activities) {
          for (const studentId of studentIds) {
            activityRecords.push({
              student_id: studentId,
              course_id: dbCourse.id,
              moodle_activity_id: String(activity.id),
              activity_name: activity.name,
              activity_type: activity.modname,
              status: activity.completiondata?.state === 1 ? 'completed' : 
                      activity.completiondata?.state === 2 ? 'completed' : 'pending',
              updated_at: now,
            });
          }
        }

        console.log(`Preparing to upsert ${activityRecords.length} activity records`);

        // Batch upsert in chunks of 500 to avoid payload limits
        const BATCH_SIZE = 500;
        let activitiesCount = 0;

        for (let i = 0; i < activityRecords.length; i += BATCH_SIZE) {
          const batch = activityRecords.slice(i, i + BATCH_SIZE);
          const { data, error } = await supabase
            .from('student_activities')
            .upsert(batch, {
              onConflict: 'student_id,course_id,moodle_activity_id',
              ignoreDuplicates: false
            });

          if (error) {
            console.error(`Error upserting activity batch ${i / BATCH_SIZE}:`, error);
          } else {
            activitiesCount += batch.length;
          }
        }

        console.log(`Upserted ${activitiesCount} activity records`);

        return new Response(
          JSON.stringify({ success: true, activitiesCount }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'sync_grades': {
        if (!moodleUrl || !token || !courseId) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: moodleUrl, token, courseId' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get course from database
        const { data: gradesCourse } = await supabase
          .from('courses')
          .select('id')
          .eq('moodle_course_id', String(courseId))
          .maybeSingle();

        if (!gradesCourse) {
          return new Response(
            JSON.stringify({ error: 'Course not found in database', gradesCount: 0 }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get all students enrolled in this course with their moodle_user_id
        const { data: enrolledStudents } = await supabase
          .from('student_courses')
          .select('student_id, students!inner(id, moodle_user_id)')
          .eq('course_id', gradesCourse.id);

        if (!enrolledStudents || enrolledStudents.length === 0) {
          return new Response(
            JSON.stringify({ success: true, gradesCount: 0 }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`Syncing grades for ${enrolledStudents.length} students in course ${courseId}`);

        // Fetch grade items for all students using gradereport_user_get_grade_items
        const activityGradeRecords: any[] = [];
        const now = new Date().toISOString();
        const enrolledStudentIds = enrolledStudents.map((enrollment: any) => enrollment.student_id);

        for (const enrollment of enrolledStudents) {
          const student = enrollment.students as any;
          const moodleUserId = parseInt(student.moodle_user_id, 10);

          try {
            const gradesData = await callMoodleApi(moodleUrl, token, 'gradereport_user_get_grade_items', {
              courseid: courseId,
              userid: moodleUserId
            });

            // Log raw response for debugging (first student only)
            if (activityGradeRecords.length === 0 && gradesData.usergrades?.length > 0) {
              console.log('Sample grade response:', JSON.stringify(gradesData.usergrades[0]?.gradeitems?.slice(0, 3)));
            }

            // Persist only activity-level grade items; course totals are recalculated
            // from non-hidden activities stored in student_activities.
            if (gradesData.usergrades && gradesData.usergrades.length > 0) {
              const userGrade = gradesData.usergrades[0];
              const gradeItems = userGrade.gradeitems || [];

              // Also persist per-activity grades when Moodle returns the course module id (cmid).
              // This updates student_activities so the UI can show activity grades separately.
              for (const item of gradeItems) {
                if (!item) continue;
                if (item.itemtype === 'course' || item.itemtype === 'category') continue;

                const cmid = item.cmid !== undefined && item.cmid !== null
                  ? String(item.cmid)
                  : null;
                if (!cmid) continue;

                const itemGradeRaw = parseNullableNumber(item.graderaw);
                const itemGradeMax = parseNullableNumber(item.grademax);

                let itemPercentage: number | null = null;
                if (itemGradeRaw !== null && itemGradeMax && itemGradeMax > 0) {
                  itemPercentage = (itemGradeRaw / itemGradeMax) * 100;
                } else {
                  itemPercentage = parseNullablePercentage(item.percentageformatted);
                }

                activityGradeRecords.push({
                  student_id: student.id,
                  course_id: gradesCourse.id,
                  moodle_activity_id: cmid,
                  activity_name: item.itemname || 'Atividade',
                  activity_type: item.itemmodule || null,
                  grade: itemGradeRaw,
                  grade_max: itemGradeMax,
                  percentage: itemPercentage,
                  updated_at: now,
                });
              }
            }
          } catch (gradeErr) {
            console.error(`Error fetching grades for student ${moodleUserId}:`, gradeErr);
            // Continue with other students
          }
        }

        console.log(`Prepared ${activityGradeRecords.length} activity grade records for upsert`);

        // Batch upsert activity grades into student_activities.
        // Uses the same unique key as sync_activities and preserves existing rows.
        let activityGradesCount = 0;
        if (activityGradeRecords.length > 0) {
          const BATCH_SIZE = 200;
          for (let i = 0; i < activityGradeRecords.length; i += BATCH_SIZE) {
            const batch = activityGradeRecords.slice(i, i + BATCH_SIZE);
            const { error } = await supabase
              .from('student_activities')
              .upsert(batch, {
                onConflict: 'student_id,course_id,moodle_activity_id',
                ignoreDuplicates: false
              });

            if (error) {
              console.error(`Error upserting activity grade batch ${i / BATCH_SIZE}:`, error);
            } else {
              activityGradesCount += batch.length;
            }
          }
        }

        console.log(`Upserted ${activityGradesCount} activity grade records`);

        // Recalculate course totals from visible activities only (hidden = false).
        // This keeps student_course_grades aligned with activity visibility rules.
        const { data: visibleActivities, error: visibleActivitiesError } = await supabase
          .from('student_activities')
          .select('student_id, grade, grade_max')
          .eq('course_id', gradesCourse.id)
          .eq('hidden', false)
          .in('student_id', enrolledStudentIds);

        if (visibleActivitiesError) {
          console.error('Error loading visible activities for grade aggregation:', visibleActivitiesError);
        }

        const totalsByStudent = new Map<string, { raw: number; max: number }>();
        for (const studentId of enrolledStudentIds) {
          totalsByStudent.set(studentId, { raw: 0, max: 0 });
        }

        for (const activity of visibleActivities || []) {
          if (activity.grade === null || activity.grade_max === null || activity.grade_max <= 0) {
            continue;
          }
          const current = totalsByStudent.get(activity.student_id) || { raw: 0, max: 0 };
          current.raw += activity.grade;
          current.max += activity.grade_max;
          totalsByStudent.set(activity.student_id, current);
        }

        const gradeRecords = enrolledStudentIds.map((studentId: string) => {
          const totals = totalsByStudent.get(studentId) || { raw: 0, max: 0 };
          const hasGrade = totals.max > 0;
          const normalizedGrade = hasGrade ? (totals.raw / totals.max) * 100 : null;
          const gradeRaw = hasGrade ? normalizedGrade : null;
          const gradeMax = hasGrade ? 100 : null;
          const gradePercentage = hasGrade ? normalizedGrade : null;

          return {
            student_id: studentId,
            course_id: gradesCourse.id,
            grade_raw: gradeRaw,
            grade_max: gradeMax,
            grade_percentage: gradePercentage,
            grade_formatted: hasGrade ? `${normalizedGrade!.toFixed(1)} / 100` : null,
            letter_grade: null,
            last_sync: now,
            updated_at: now
          };
        });

        console.log(`Prepared ${gradeRecords.length} recalculated grade records from visible activities`);

        // Batch upsert recalculated course grades
        let gradesCount = 0;
        if (gradeRecords.length > 0) {
          const BATCH_SIZE = 100;
          for (let i = 0; i < gradeRecords.length; i += BATCH_SIZE) {
            const batch = gradeRecords.slice(i, i + BATCH_SIZE);
            const { error } = await supabase
              .from('student_course_grades')
              .upsert(batch, {
                onConflict: 'student_id,course_id',
                ignoreDuplicates: false
              });

            if (error) {
              console.error(`Error upserting grade batch ${i / BATCH_SIZE}:`, error);
            } else {
              gradesCount += batch.length;
            }
          }
        }

        console.log(`Upserted ${gradesCount} recalculated grade records`);

        return new Response(
          JSON.stringify({ success: true, gradesCount, activityGradesCount }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'debug_grades': {
        if (!moodleUrl || !token || !courseId || !userId) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: moodleUrl, token, courseId, userId' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`Debug grades for user ${userId} in course ${courseId}`);

        try {
          const gradesData = await callMoodleApi(moodleUrl, token, 'gradereport_user_get_grade_items', {
            courseid: courseId,
            userid: userId
          });

          // Return the raw response for debugging
          return new Response(
            JSON.stringify({ 
              success: true, 
              raw_response: gradesData,
              course_grade_item: gradesData.usergrades?.[0]?.gradeitems?.find((item: any) => item.itemtype === 'course'),
              all_item_types: gradesData.usergrades?.[0]?.gradeitems?.map((item: any) => ({
                itemtype: item.itemtype,
                itemname: item.itemname,
                cmid: item.cmid,
                itemmodule: item.itemmodule,
                graderaw: item.graderaw,
                grademax: item.grademax,
                gradeformatted: item.gradeformatted,
                percentageformatted: item.percentageformatted
              }))
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (err) {
          console.error('Debug grades error:', err);
          return new Response(
            JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to fetch grades' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'link_selected_courses': {
        // Links only selected courses to user_courses, removing unselected ones
        if (!userId || !selectedCourseIds || !Array.isArray(selectedCourseIds)) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: userId, selectedCourseIds' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get user's Supabase ID
        const { data: linkUser } = await supabase
          .from('users')
          .select('id')
          .eq('moodle_user_id', String(userId))
          .maybeSingle();

        if (!linkUser) {
          return new Response(
            JSON.stringify({ error: 'User not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Remove existing user_courses that are NOT in the selected list
        const { data: existingLinks } = await supabase
          .from('user_courses')
          .select('course_id')
          .eq('user_id', linkUser.id);

        const existingCourseIds = new Set(existingLinks?.map(l => l.course_id) || []);
        const selectedSet = new Set(selectedCourseIds as string[]);

        // Delete courses no longer selected
        const toRemove = [...existingCourseIds].filter(id => !selectedSet.has(id));
        if (toRemove.length > 0) {
          await supabase
            .from('user_courses')
            .delete()
            .eq('user_id', linkUser.id)
            .in('course_id', toRemove);
        }

        // Add newly selected courses
        const toAdd = (selectedCourseIds as string[]).filter(id => !existingCourseIds.has(id));
        if (toAdd.length > 0) {
          const links = toAdd.map(course_id => ({
            user_id: linkUser.id,
            course_id,
            role: 'tutor'
          }));

          const BATCH = 100;
          for (let i = 0; i < links.length; i += BATCH) {
            await supabase
              .from('user_courses')
              .upsert(links.slice(i, i + BATCH), {
                onConflict: 'user_id,course_id',
                ignoreDuplicates: true
              });
          }
        }

        // Update last_sync
        await supabase
          .from('users')
          .update({ last_sync: new Date().toISOString() })
          .eq('id', linkUser.id);

        console.log(`Linked ${toAdd.length} courses, removed ${toRemove.length} for user ${linkUser.id}`);

        return new Response(
          JSON.stringify({ success: true, added: toAdd.length, removed: toRemove.length }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ============ MESSAGING ============

      case 'send_message': {
        const { moodle_user_id: targetMoodleUserId, message: messageText } = body;

        if (!targetMoodleUserId || !messageText) {
          return new Response(
            JSON.stringify({ error: 'moodle_user_id and message are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`Sending message to Moodle user ${targetMoodleUserId}`);

        try {
          const result = await callMoodleApi(moodleUrl, token, 'core_message_send_instant_messages', {
            'messages[0][touserid]': Number(targetMoodleUserId),
            'messages[0][text]': String(messageText),
            'messages[0][textformat]': 0,
          });

          console.log('Send message result:', JSON.stringify(result));

          // Moodle returns an array with the message result
          const msgResult = Array.isArray(result) ? result[0] : result;

          if (msgResult?.errormessage) {
            return new Response(
              JSON.stringify({ error: msgResult.errormessage }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          return new Response(
            JSON.stringify({ success: true, message_id: msgResult?.msgid }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (err) {
          console.error('Error sending message:', err);
          return new Response(
            JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to send message. The messaging functions may not be enabled in Moodle.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'get_conversations': {
        console.log('Fetching conversations from Moodle');

        try {
          // Get site info to know the current user id
          const siteInfo = await getSiteInfo(moodleUrl, token);

          const result = await callMoodleApi(moodleUrl, token, 'core_message_get_conversations', {
            userid: siteInfo.userid,
            type: 1, // individual conversations only
            limitnum: 50,
          });

          const conversations = (result?.conversations || []).map((conv: any) => ({
            id: conv.id,
            members: (conv.members || []).map((m: any) => ({
              id: m.id,
              fullname: m.fullname,
              profileimageurl: m.profileimageurl,
            })),
            messages: (conv.messages || []).map((msg: any) => ({
              id: msg.id,
              text: msg.text,
              timecreated: msg.timecreated,
              useridfrom: msg.useridfrom,
            })),
            unreadcount: conv.unreadcount || 0,
          }));

          return new Response(
            JSON.stringify({ conversations, current_user_id: siteInfo.userid }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (err) {
          console.error('Error fetching conversations:', err);
          return new Response(
            JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to fetch conversations. The messaging functions may not be enabled in Moodle.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'get_messages': {
        const { moodle_user_id: otherUserId, limit_num: limitNum } = body;

        if (!otherUserId) {
          return new Response(
            JSON.stringify({ error: 'moodle_user_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`Fetching messages with Moodle user ${otherUserId}`);

        try {
          const siteInfo = await getSiteInfo(moodleUrl, token);

          // Get conversation between the two users
          const convResult = await callMoodleApi(moodleUrl, token, 'core_message_get_conversation_between_users', {
            userid: siteInfo.userid,
            otheruserid: Number(otherUserId),
            includecontactrequests: 0,
            limitnum: Number(limitNum) || 50,
          });

          const messages = (convResult?.messages || []).map((msg: any) => ({
            id: msg.id,
            text: msg.text,
            timecreated: msg.timecreated,
            useridfrom: msg.useridfrom,
          }));

          return new Response(
            JSON.stringify({ 
              messages, 
              current_user_id: siteInfo.userid,
              conversation_id: convResult?.id,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (err) {
          console.error('Error fetching messages:', err);
          return new Response(
            JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to fetch messages.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: unknown) {
    console.error('Error in moodle-api function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
