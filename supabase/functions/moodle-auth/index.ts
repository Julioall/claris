import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createServiceClient, createAnonClient } from '../_shared/supabase.ts'
import { validateMoodleUrl, validateString } from '../_shared/validation.ts'
import { getMoodleToken, getSiteInfo } from '../_shared/moodle-client.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const body = await req.json()
    const { moodleUrl, username, password, service } = body

    // --- Input Validation ---
    if (!moodleUrl || !validateMoodleUrl(moodleUrl)) return errorResponse('Invalid Moodle URL format.')
    if (!username || !validateString(username, 255)) return errorResponse('Invalid username.')
    if (!password || !validateString(password, 1024)) return errorResponse('Invalid password.')
    if (service !== undefined && !validateString(service, 128)) return errorResponse('Invalid service name.')

    const supabase = createServiceClient()

    const tokenResponse = await getMoodleToken(moodleUrl, username, password, service || 'moodle_mobile_app')

    const moodleUnavailable =
      tokenResponse.error &&
      ['service_unavailable', 'network_error', 'parse_error'].includes(tokenResponse.errorcode || '')

    if (moodleUnavailable) {
      return await handleFallbackLogin(supabase, username, password, tokenResponse)
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
        const createResult = await supabase.auth.admin.createUser({
          id: existingUser.id,
          email: authEmail,
          password,
          email_confirm: true,
          user_metadata: { moodle_user_id: String(siteInfo.userid) },
        })

        if (createResult.error) {
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
  } catch (error: unknown) {
    console.error('Error in moodle-auth:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal server error', 500)
  }
})

async function handleFallbackLogin(
  supabase: any,
  username: string,
  password: string,
  tokenResponse: any
): Promise<Response> {
  console.log('Moodle unavailable, attempting fallback login...')

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
