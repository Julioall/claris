import { jsonResponse, errorResponse } from '../_shared/http/mod.ts'
import { createServiceClient, createAnonClient } from '../_shared/db/mod.ts'
import { getMoodleToken, getSiteInfo } from '../_shared/moodle/mod.ts'
import {
  createUserProfile,
  findUserByMoodleUserId,
  findUserByMoodleUsername,
  touchUserLastLogin,
  updateUserProfile,
} from '../_shared/domain/users/repository.ts'
import {
  disableMoodleReauthCredential,
  upsertMoodleReauthCredential,
} from '../_shared/domain/moodle-reauth/repository.ts'
import { encryptMoodleReauthPayload } from '../_shared/security/moodle-reauth-crypto.ts'
import type { MoodleTokenResponse } from '../_shared/moodle/mod.ts'

interface LoginParams {
  backgroundReauthEnabled?: boolean
  moodleUrl: string
  username: string
  password: string
  service: string
  onMoodleUnavailable: (tokenResponse: MoodleTokenResponse) => Promise<Response>
}

interface BackgroundReauthSyncResult {
  error?: string
  stored: boolean
}

async function syncBackgroundReauthCredential(params: {
  supabase: ReturnType<typeof createServiceClient>
  userId: string
  moodleUrl: string
  username: string
  password: string
  service: string
  enabled: boolean
}): Promise<BackgroundReauthSyncResult> {
  if (!params.enabled) {
    try {
      await disableMoodleReauthCredential(params.supabase, params.userId)
    } catch {
      // Ignore missing row when the user never opted in before.
    }

    return { stored: false }
  }

  try {
    const credentialCiphertext = await encryptMoodleReauthPayload({ password: params.password })
    await upsertMoodleReauthCredential(params.supabase, {
      userId: params.userId,
      moodleService: params.service,
      moodleUrl: params.moodleUrl,
      moodleUsername: params.username,
      credentialCiphertext,
      reauthEnabled: true,
      lastError: null,
    })

    return { stored: true }
  } catch (error) {
    console.error('Failed to persist Moodle reauthorization credential:', error)
    return {
      error: error instanceof Error ? error.message : 'Erro ao salvar credencial de reautorizacao',
      stored: false,
    }
  }
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
  const { backgroundReauthEnabled, moodleUrl, username, password, service, onMoodleUnavailable } = params
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

    let existingUser
    try {
      existingUser = await findUserByMoodleUserId(supabase, String(siteInfo.userid))
    } catch (existingUserError) {
      console.error('Failed to query local user profile:', existingUserError)
      return jsonResponse(
        {
          error: 'Nao foi possivel consultar o perfil local deste usuario.',
          errorcode: 'local_user_lookup_failed',
        },
        200
      )
    }

    const resolvedBackgroundReauthEnabled = backgroundReauthEnabled ?? existingUser?.background_reauth_enabled ?? true

    const userData = {
      background_reauth_enabled: resolvedBackgroundReauthEnabled,
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

      try {
        user = await updateUserProfile(supabase, existingUser.id, userData)
      } catch (updateError) {
        console.error('Failed to update local user profile:', updateError)
        return jsonResponse(
          {
            error: 'Nao foi possivel atualizar o perfil local deste usuario.',
            errorcode: 'local_user_update_failed',
          },
          200
        )
      }
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

      try {
        user = await createUserProfile(supabase, { ...userData, id: authUserId })
      } catch (insertError) {
        console.error('Failed to insert local user profile:', insertError)
        return jsonResponse(
          {
            error: 'Nao foi possivel criar o perfil local deste usuario.',
            errorcode: 'local_user_insert_failed',
          },
          200
        )
      }

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

    const backgroundReauth = await syncBackgroundReauthCredential({
      supabase,
      userId: user.id,
      moodleUrl,
      username,
      password,
      service,
      enabled: resolvedBackgroundReauthEnabled,
    })

    return jsonResponse({
      success: true,
      backgroundReauthError: backgroundReauth.error,
      backgroundReauthStored: backgroundReauth.stored,
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
  tokenResponse: MoodleTokenResponse,
  moodleUrl: string,
  service: string,
  backgroundReauthEnabled?: boolean,
): Promise<Response> {
  console.log('Moodle unavailable, attempting fallback login...')

  const supabase = createServiceClient()
  const fallbackUser = await findUserByMoodleUsername(supabase, username)

  if (fallbackUser) {
    const fallbackEmail = `moodle_${fallbackUser.moodle_user_id}@moodle.local`
    const anonClient = createAnonClient()

    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email: fallbackEmail,
      password,
    })

    if (!signInError && signInData.session) {
      await touchUserLastLogin(supabase, fallbackUser.id, new Date().toISOString())

      console.log('Fallback login successful for user:', fallbackUser.full_name)

      const resolvedBackgroundReauthEnabled = backgroundReauthEnabled ?? fallbackUser.background_reauth_enabled ?? true

      const backgroundReauth = await syncBackgroundReauthCredential({
        supabase,
        userId: fallbackUser.id,
        moodleUrl,
        username,
        password,
        service,
        enabled: resolvedBackgroundReauthEnabled,
      })

      return jsonResponse({
        success: true,
        backgroundReauthError: backgroundReauth.error,
        backgroundReauthStored: backgroundReauth.stored,
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
