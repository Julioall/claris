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

async function findAuthUserByEmail(supabase: ReturnType<typeof createServiceClient>, email: string) {
  let page = 1

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    })

    if (error) throw error

    const match = data.users.find((user) => user.email === email)
    if (match) return match
    if (data.users.length < 200) return null

    page += 1
  }
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

  try {
    const siteInfo = await getSiteInfo(moodleUrl, tokenResponse.token)
    const authEmail = `moodle_${siteInfo.userid}@moodle.local`
    const anonClient = createAnonClient()

    const { data: existingUser, error: existingUserError } = await supabase
      .from('users')
      .select('*')
      .eq('moodle_user_id', String(siteInfo.userid))
      .maybeSingle()

    if (existingUserError) {
      console.error('Failed to query local user profile:', existingUserError)
      return jsonResponse(
        {
          error: 'Nao foi possivel consultar o perfil local deste usuario.',
          errorcode: 'local_user_lookup_failed',
        },
        200
      )
    }

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
        try {
          const createResult = await supabase.auth.admin.createUser({
            id: existingUser.id,
            email: authEmail,
            password,
            email_confirm: true,
            user_metadata: { moodle_user_id: String(siteInfo.userid) },
          })

          if (createResult.error) {
            const updateResult = await supabase.auth.admin.updateUserById(existingUser.id, { password })
            if (updateResult.error) throw updateResult.error
          }
        } catch (createError) {
          console.warn('Auth user setup fallback failed, trying password update:', createError)
          const updateResult = await supabase.auth.admin.updateUserById(existingUser.id, { password })
          if (updateResult.error) {
            console.error('Failed to update auth user password:', updateResult.error)
            return jsonResponse(
              {
                error: 'Nao foi possivel sincronizar a conta de autenticacao local.',
                errorcode: 'auth_user_sync_failed',
              },
              200
            )
          }
        }

        signInResult = await anonClient.auth.signInWithPassword({ email: authEmail, password })

        if (signInResult.error) {
          console.error('Failed to sign in after auth user setup:', signInResult.error)
          return jsonResponse(
            {
              error: 'Nao foi possivel criar a sessao local deste usuario.',
              errorcode: 'session_setup_failed',
            },
            200
          )
        }
      }

      session = signInResult.data.session

      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update(userData)
        .eq('id', existingUser.id)
        .select()
        .single()

      if (updateError) {
        console.error('Failed to update local user profile:', updateError)
        return jsonResponse(
          {
            error: 'Nao foi possivel atualizar o perfil local deste usuario.',
            errorcode: 'local_user_update_failed',
          },
          200
        )
      }

      user = updatedUser
    } else {
      let authUserId: string | null = null

      const { data: newAuthUser, error: createAuthError } = await supabase.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: { moodle_user_id: String(siteInfo.userid) },
      })

      if (createAuthError) {
        console.warn('Failed to create auth user, trying to recover existing auth account:', createAuthError)
        const recoveredAuthUser = await findAuthUserByEmail(supabase, authEmail)

        if (!recoveredAuthUser) {
          return jsonResponse(
            {
              error: 'Ja existe uma conta de autenticacao local para este Moodle, mas ela nao pode ser reconciliada automaticamente.',
              errorcode: 'auth_user_recovery_failed',
            },
            200
          )
        }

        authUserId = recoveredAuthUser.id

        const updateRecoveredUser = await supabase.auth.admin.updateUserById(recoveredAuthUser.id, {
          password,
          user_metadata: { moodle_user_id: String(siteInfo.userid) },
        })

        if (updateRecoveredUser.error) {
          console.error('Failed to update recovered auth user:', updateRecoveredUser.error)
          return jsonResponse(
            {
              error: 'Nao foi possivel sincronizar a conta de autenticacao recuperada.',
              errorcode: 'auth_user_update_failed',
            },
            200
          )
        }
      } else {
        authUserId = newAuthUser.user.id
      }

      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({ ...userData, id: authUserId })
        .select()
        .single()

      if (insertError) {
        console.error('Failed to insert local user profile:', insertError)
        return jsonResponse(
          {
            error: 'Nao foi possivel criar o perfil local deste usuario.',
            errorcode: 'local_user_insert_failed',
          },
          200
        )
      }

      user = newUser

      const signInResult = await anonClient.auth.signInWithPassword({ email: authEmail, password })
      if (signInResult.error) {
        console.error('Failed to sign in after creating local user:', signInResult.error)
        return jsonResponse(
          {
            error: 'Nao foi possivel criar a sessao local deste usuario.',
            errorcode: 'session_setup_failed',
          },
          200
        )
      }
      session = signInResult.data.session
    }

    return jsonResponse({
      success: true,
      user,
      moodleToken: tokenResponse.token,
      moodleUserId: siteInfo.userid,
      session: { access_token: session.access_token, refresh_token: session.refresh_token },
    })
  } catch (error) {
    console.error('Unexpected moodle-auth login flow error:', error)
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Erro inesperado durante a autenticacao.',
        errorcode: 'login_flow_failed',
      },
      200
    )
  }
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
    .maybeSingle()

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
