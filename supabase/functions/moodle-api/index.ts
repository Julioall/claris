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
  roles?: { roleid: number; name: string; shortname: string }[];
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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, moodleUrl, username, password, token, userId, courseId, service } = await req.json();

    console.log(`Moodle API action: ${action}`);

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
        
        // Create or update user in Supabase
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
        if (existingUser) {
          const { data, error } = await supabase
            .from('users')
            .update(userData)
            .eq('id', existingUser.id)
            .select()
            .single();
          
          if (error) throw error;
          user = data;
        } else {
          const { data, error } = await supabase
            .from('users')
            .insert(userData)
            .select()
            .single();
          
          if (error) throw error;
          user = data;
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            user,
            moodleToken: tokenResponse.token,
            moodleUserId: siteInfo.userid
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'login_with_token': {
        if (!moodleUrl || !token) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: moodleUrl, token' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        try {
          // Validate token by getting site info
          const siteInfo = await getSiteInfo(moodleUrl, token);
          
          if (!siteInfo || !siteInfo.userid) {
            return new Response(
              JSON.stringify({ error: 'Token inválido ou expirado' }),
              { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Create or update user in Supabase
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
          if (existingUser) {
            const { data, error } = await supabase
              .from('users')
              .update(userData)
              .eq('id', existingUser.id)
              .select()
              .single();
            
            if (error) throw error;
            user = data;
          } else {
            const { data, error } = await supabase
              .from('users')
              .insert(userData)
              .select()
              .single();
            
            if (error) throw error;
            user = data;
          }

          return new Response(
            JSON.stringify({ 
              success: true, 
              user,
              moodleUserId: siteInfo.userid
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (err) {
          console.error('Token validation error:', err);
          return new Response(
            JSON.stringify({ error: err instanceof Error ? err.message : 'Token inválido ou expirado' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

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

        // Batch upsert user-course links
        if (syncedCourses && syncedCourses.length > 0) {
          const userCourseLinks = syncedCourses.map(course => ({
            user_id: dbUser.id,
            course_id: course.id,
            role: 'tutor'
          }));

          // Upsert in batches of 100 to avoid payload limits
          const LINK_BATCH_SIZE = 100;
          for (let i = 0; i < userCourseLinks.length; i += LINK_BATCH_SIZE) {
            const batch = userCourseLinks.slice(i, i + LINK_BATCH_SIZE);
            const { error: linkError } = await supabase
              .from('user_courses')
              .upsert(batch, { 
                onConflict: 'user_id,course_id',
                ignoreDuplicates: true 
              });
            
            if (linkError) {
              console.error('Error linking user to courses:', linkError);
            }
          }
        }

        // Update user's last_sync
        await supabase
          .from('users')
          .update({ last_sync: now })
          .eq('id', dbUser.id);

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

        if (students.length === 0) {
          return new Response(
            JSON.stringify({ success: true, students: [] }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Prepare student data for batch upsert
        const now = new Date().toISOString();
        const studentsData = students.map(student => ({
          moodle_user_id: String(student.id),
          full_name: student.fullname || `${student.firstname} ${student.lastname}`,
          email: student.email || null,
          avatar_url: student.profileimageurl || null,
          last_access: student.lastaccess ? new Date(student.lastaccess * 1000).toISOString() : null,
          updated_at: now,
        }));

        // Batch upsert students
        const { data: syncedStudents, error: upsertError } = await supabase
          .from('students')
          .upsert(studentsData, { 
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
          const studentCourseLinks = syncedStudents.map(student => ({
            student_id: student.id,
            course_id: dbCourse.id,
            enrollment_status: 'ativo',
            last_sync: now
          }));

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

        // Fetch grades for all students using gradereport_user_get_grade_items
        const gradeRecords: any[] = [];
        const now = new Date().toISOString();

        for (const enrollment of enrolledStudents) {
          const student = enrollment.students as any;
          const moodleUserId = parseInt(student.moodle_user_id, 10);

          try {
            const gradesData = await callMoodleApi(moodleUrl, token, 'gradereport_user_get_grade_items', {
              courseid: courseId,
              userid: moodleUserId
            });

            // Log raw response for debugging (first student only)
            if (gradeRecords.length === 0 && gradesData.usergrades?.length > 0) {
              console.log('Sample grade response:', JSON.stringify(gradesData.usergrades[0]?.gradeitems?.slice(0, 3)));
            }

            // Find the course total grade (itemtype = 'course')
            if (gradesData.usergrades && gradesData.usergrades.length > 0) {
              const userGrade = gradesData.usergrades[0];
              const courseGrade = userGrade.gradeitems?.find((item: any) => item.itemtype === 'course');

              if (courseGrade) {
                // Parse graderaw - it may be a number or a string depending on Moodle version
                let gradeRaw: number | null = null;
                if (courseGrade.graderaw !== undefined && courseGrade.graderaw !== null) {
                  const parsed = typeof courseGrade.graderaw === 'string' 
                    ? parseFloat(courseGrade.graderaw) 
                    : courseGrade.graderaw;
                }

                // Parse grademax
                let gradeMax: number = 100;
                if (courseGrade.grademax !== undefined && courseGrade.grademax !== null) {
                  gradeMax = typeof courseGrade.grademax === 'string'
                    ? parseFloat(courseGrade.grademax)
                    : courseGrade.grademax;
                  if (isNaN(gradeMax)) gradeMax = 100;
                }

                // Calculate percentage from graderaw if percentageformatted is not available
                let gradePercentage: number | null = null;
                if (courseGrade.percentageformatted) {
                  // Remove % sign, replace comma with dot, trim spaces
                  const cleanPercentage = courseGrade.percentageformatted
                    .replace(/[%\s]/g, '')
                    .replace(',', '.');
                  gradePercentage = parseFloat(cleanPercentage);
                  if (isNaN(gradePercentage)) gradePercentage = null;
                } else if (gradeRaw !== null && gradeMax > 0) {
                  // Calculate percentage from raw values
                  gradePercentage = (gradeRaw / gradeMax) * 100;
                }

                gradeRecords.push({
                  student_id: student.id,
                  course_id: gradesCourse.id,
                  grade_raw: gradeRaw,
                  grade_max: gradeMax,
                  grade_percentage: gradePercentage,
                  grade_formatted: courseGrade.gradeformatted ?? null,
                  letter_grade: courseGrade.lettergradeformatted ?? null,
                  last_sync: now,
                  updated_at: now
                });
              } else {
                // Log when no course grade is found
                console.log(`No course grade found for student ${moodleUserId}. Available itemtypes:`, 
                  userGrade.gradeitems?.map((item: any) => item.itemtype).filter((v: any, i: number, a: any[]) => a.indexOf(v) === i));
              }
            }
          } catch (gradeErr) {
            console.error(`Error fetching grades for student ${moodleUserId}:`, gradeErr);
            // Continue with other students
          }
        }

        console.log(`Prepared ${gradeRecords.length} grade records for upsert`);

        // Batch upsert grades
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

        console.log(`Upserted ${gradesCount} grade records`);

        return new Response(
          JSON.stringify({ success: true, gradesCount }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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
