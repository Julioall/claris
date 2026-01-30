import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  categoryid?: number;
  startdate?: number;
  enddate?: number;
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
async function getMoodleToken(moodleUrl: string, username: string, password: string): Promise<MoodleTokenResponse> {
  const tokenUrl = `${moodleUrl}/login/token.php`;
  const params = new URLSearchParams({
    username,
    password,
    service: 'moodle_mobile_app'
  });

  console.log(`Requesting token from: ${tokenUrl}`);
  
  const response = await fetch(`${tokenUrl}?${params.toString()}`);
  const data = await response.json();
  
  console.log('Token response:', JSON.stringify(data));
  
  return data;
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
    const { action, moodleUrl, username, password, token, userId, courseId } = await req.json();

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
        const tokenResponse = await getMoodleToken(moodleUrl, username, password);
        
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
          .single();

        if (!dbUser) {
          return new Response(
            JSON.stringify({ error: 'User not found in database' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get courses from Moodle
        const moodleCourses = await getUserCourses(moodleUrl, token, userId);
        console.log(`Found ${moodleCourses.length} courses for user ${userId}`);

        const syncedCourses = [];

        for (const course of moodleCourses) {
          // Check if course exists
          const { data: existingCourse } = await supabase
            .from('courses')
            .select('id')
            .eq('moodle_course_id', String(course.id))
            .single();

          const courseData = {
            moodle_course_id: String(course.id),
            name: course.fullname,
            short_name: course.shortname,
            category: course.categoryid ? String(course.categoryid) : null,
            start_date: course.startdate ? new Date(course.startdate * 1000).toISOString() : null,
            end_date: course.enddate ? new Date(course.enddate * 1000).toISOString() : null,
            last_sync: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          let dbCourse;
          if (existingCourse) {
            const { data, error } = await supabase
              .from('courses')
              .update(courseData)
              .eq('id', existingCourse.id)
              .select()
              .single();
            
            if (error) {
              console.error(`Error updating course ${course.id}:`, error);
              continue;
            }
            dbCourse = data;
          } else {
            const { data, error } = await supabase
              .from('courses')
              .insert(courseData)
              .select()
              .single();
            
            if (error) {
              console.error(`Error inserting course ${course.id}:`, error);
              continue;
            }
            dbCourse = data;
          }

          // Link user to course
          const { data: existingLink } = await supabase
            .from('user_courses')
            .select('id')
            .eq('user_id', dbUser.id)
            .eq('course_id', dbCourse.id)
            .single();

          if (!existingLink) {
            await supabase
              .from('user_courses')
              .insert({
                user_id: dbUser.id,
                course_id: dbCourse.id,
                role: 'tutor'
              });
          }

          syncedCourses.push(dbCourse);
        }

        // Update user's last_sync
        await supabase
          .from('users')
          .update({ last_sync: new Date().toISOString() })
          .eq('id', dbUser.id);

        return new Response(
          JSON.stringify({ success: true, courses: syncedCourses }),
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
          .single();

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

        const syncedStudents = [];

        for (const student of students) {
          // Check if student exists
          const { data: existingStudent } = await supabase
            .from('students')
            .select('id')
            .eq('moodle_user_id', String(student.id))
            .single();

          const studentData = {
            moodle_user_id: String(student.id),
            full_name: student.fullname || `${student.firstname} ${student.lastname}`,
            email: student.email || null,
            avatar_url: student.profileimageurl || null,
            last_access: student.lastaccess ? new Date(student.lastaccess * 1000).toISOString() : null,
            updated_at: new Date().toISOString(),
          };

          let dbStudent;
          if (existingStudent) {
            const { data, error } = await supabase
              .from('students')
              .update(studentData)
              .eq('id', existingStudent.id)
              .select()
              .single();
            
            if (error) {
              console.error(`Error updating student ${student.id}:`, error);
              continue;
            }
            dbStudent = data;
          } else {
            const { data, error } = await supabase
              .from('students')
              .insert({ ...studentData, current_risk_level: 'normal' })
              .select()
              .single();
            
            if (error) {
              console.error(`Error inserting student ${student.id}:`, error);
              continue;
            }
            dbStudent = data;
          }

          // Link student to course
          const { data: existingLink } = await supabase
            .from('student_courses')
            .select('id')
            .eq('student_id', dbStudent.id)
            .eq('course_id', dbCourse.id)
            .single();

          if (!existingLink) {
            await supabase
              .from('student_courses')
              .insert({
                student_id: dbStudent.id,
                course_id: dbCourse.id,
                enrollment_status: 'ativo',
                last_sync: new Date().toISOString()
              });
          } else {
            await supabase
              .from('student_courses')
              .update({ last_sync: new Date().toISOString() })
              .eq('id', existingLink.id);
          }

          syncedStudents.push(dbStudent);
        }

        // Update course's last_sync
        await supabase
          .from('courses')
          .update({ last_sync: new Date().toISOString() })
          .eq('id', dbCourse.id);

        return new Response(
          JSON.stringify({ success: true, students: syncedStudents }),
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
