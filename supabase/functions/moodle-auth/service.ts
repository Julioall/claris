import { jsonResponse, errorResponse } from '../_shared/http/mod.ts'
import { createServiceClient, createAnonClient } from '../_shared/db/mod.ts'
import { getMoodleToken, getSiteInfo } from '../_shared/moodle/mod.ts'
import type { MoodleTokenResponse } from '../_shared/moodle/mod.ts'

interface LoginParams {
  moodleUrl: string
  username: string
  password: string
  service: string
  onMoodleUnavailable: (tokenResponse: MoodleTokenResponse) => Promise<Response>
}

export async function login(params: LoginParams): Promise<Response> {
  const { moodleUrl, username, password, service, onMoodleUnavailable } = params
  const supabase = createServiceClient()

  const tokenResponse = await getMoodleToken(moodleUrl, username, password, service)

  const moodleUnavailable =
    tokenResponse.error &&
    ['service_unavailable', 'network_error', 'parse_error'].includes(tokenResponse.errorcode || '')

  if (moodleUnavailable) {
    return await onMoodleUnavailable(tokenResponse)
  }

  if (tokenResponse.error || !tokenResponse.token) {
    return jsonResponse(
      { error: tokenResponse.error || 'Authentication failed', errorcode: tokenResponse.errorcode },
      401
    )
  }

  const siteInfo = await getSiteInfo(moodleUrl, tokenResponse.token)
  const authEmail = `moodle_${siteInfo.userid}@moodle.local`
  const anonClient = createAnonClient()

  const { data: existingUser } = await supabase
    .from('users')
    .select('*')
    .eq('moodle_user_id', String(siteInfo.userid))
    .single()

  const userData = {
    moodle_user_id: String(siteInfo.userid),
    moodle_username: siteInfo.username,
    full_name: siteInfo.fullname || `${siteInfo.firstname} ${siteInfo.lastname}`,
    email: siteInfo.email || null,
    avatar_url: siteInfo.profileimageurl || null,
    last_login: new Date().toISOString(),
    last_sync: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  let user
  let session

  if (existingUser) {
    let signInResult = await anonClient.auth.signInWithPassword({ email: authEmail, password })

    if (signInResult.error) {
      // Auth user might exist with different password, or not exist at all
      try {
        const createResult = await supabase.auth.admin.createUser({
          id: existingUser.id,
          email: authEmail,
          password,
          email_confirm: true,
          user_metadata: { moodle_user_id: String(siteInfo.userid) },
        })

        if (createResult.error) {
          // User exists in auth but password changed - update it
          await supabase.auth.admin.updateUserById(existingUser.id, { password })
        }
      } catch (_createErr) {
        // createUser threw (email_exists) - just update the password
        await supabase.auth.admin.updateUserById(existingUser.id, { password })
      }

      signInResult = await anonClient.auth.signInWithPassword({ email: authEmail, password })

      if (signInResult.error) {
        console.error('Failed to sign in after auth user setup:', signInResult.error)
        throw new Error('Failed to create authentication session')
      }
    }

    session = signInResult.data.session

    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update(userData)
      .eq('id', existingUser.id)
      .select()
      .single()

    if (updateError) throw updateError
    user = updatedUser
  } else {
    const { data: newAuthUser, error: createAuthError } = await supabase.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: { moodle_user_id: String(siteInfo.userid) },
    })

    if (createAuthError) throw createAuthError

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({ ...userData, id: newAuthUser.user.id })
      .select()
      .single()

    if (insertError) throw insertError
    user = newUser

    const signInResult = await anonClient.auth.signInWithPassword({ email: authEmail, password })
    if (signInResult.error) throw signInResult.error
    session = signInResult.data.session
  }

  return jsonResponse({
    success: true,
    user,
    moodleToken: tokenResponse.token,
    moodleUserId: siteInfo.userid,
    session: { access_token: session.access_token, refresh_token: session.refresh_token },
  })
}

export async function fallbackLogin(
  username: string,
  password: string,
  tokenResponse: MoodleTokenResponse
): Promise<Response> {
  console.log('Moodle unavailable, attempting fallback login...')

  const supabase = createServiceClient()
  const { data: fallbackUser } = await supabase
    .from('users')
    .select('*')
    .eq('moodle_username', username)
    .single()

  if (fallbackUser) {
    const fallbackEmail = `moodle_${fallbackUser.moodle_user_id}@moodle.local`
    const anonClient = createAnonClient()

    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email: fallbackEmail,
      password,
    })

    if (!signInError && signInData.session) {
      await supabase
        .from('users')
        .update({ last_login: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', fallbackUser.id)

      console.log('Fallback login successful for user:', fallbackUser.full_name)

      return jsonResponse({
        success: true,
        user: fallbackUser,
        moodleToken: null,
        moodleUserId: parseInt(fallbackUser.moodle_user_id, 10),
        offlineMode: true,
        session: {
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token,
        },
      })
    }

    console.log('Fallback sign-in failed:', signInError?.message)
  }

  return jsonResponse(
    { error: tokenResponse.error || 'Authentication failed', errorcode: tokenResponse.errorcode },
    401
  )
}
