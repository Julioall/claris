export interface MoodleTokenResponse {
  token?: string
  error?: string
  errorcode?: string
}

export interface MoodleCourse {
  id: number
  shortname: string
  fullname: string
  category?: number
  startdate?: number
  enddate?: number
}

export interface MoodleCategory {
  id: number
  name: string
  parent: number
  path: string
  description?: string
}

export interface MoodleUser {
  id: number
  username: string
  firstname: string
  lastname: string
  fullname: string
  email: string
  profileimageurl?: string
}

export interface MoodleEnrolledUser {
  id: number
  username: string
  firstname: string
  lastname: string
  fullname: string
  email?: string
  profileimageurl?: string
  lastaccess?: number
  lastcourseaccess?: number
  roles?: { roleid: number; name: string; shortname: string }[]
  enrolledcourses?: { id: number; shortname: string; fullname: string; suspended?: boolean }[]
  suspended?: boolean
  status?: number
  enrolments?: {
    id: number
    courseid: number
    type: string
    name: string
    status: number
  }[]
}

export interface MoodleSiteInfo extends MoodleUser {
  userid: number
}
