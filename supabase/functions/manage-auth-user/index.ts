import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function errorResponse(message: string, status: number) {
  console.error(`[manage-auth-user] ERROR (${status}):`, message);
  return new Response(
    JSON.stringify({ error: message }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function successResponse(data: Record<string, unknown>) {
  return new Response(
    JSON.stringify(data),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing authorization header', 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user: callingUser }, error: authError } = await anonClient.auth.getUser(token);

    if (authError || !callingUser) {
      console.log('[manage-auth-user] Auth verification failed:', { authError: authError?.message, hasUser: !!callingUser });
      return errorResponse(`Unauthorized: ${authError?.message || 'Invalid token'}`, 401);
    }

    console.log('[manage-auth-user] Authenticated caller:', { id: callingUser.id, email: callingUser.email });

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { action, ...params } = await req.json();

    console.log('[manage-auth-user] Action:', action, 'Params:', JSON.stringify(params));

    if (action === 'change_own_password') {
      const { currentPassword, newPassword } = params;

      if (!currentPassword || !newPassword) {
        return errorResponse('Current password and new password are required', 400);
      }

      if (newPassword.length < 8) {
        return errorResponse('Password must be at least 8 characters', 400);
      }

      const { data: userProfile } = await serviceClient
        .from('users')
        .select('email')
        .eq('id', callingUser.id)
        .maybeSingle();

      if (!userProfile?.email) {
        return errorResponse('User profile not found', 400);
      }

      const verifyClient = createClient(supabaseUrl, supabaseAnonKey);
      const { error: signInError } = await verifyClient.auth.signInWithPassword({
        email: userProfile.email,
        password: currentPassword,
      });

      if (signInError) {
        return errorResponse('Current password is incorrect', 400);
      }

      const { error: updateError } = await serviceClient.auth.admin.updateUserById(callingUser.id, {
        password: newPassword,
      });

      if (updateError) {
        return errorResponse(updateError.message, 400);
      }

      return successResponse({ success: true });
    }

    const { data: callerProfile, error: profileLookupError } = await serviceClient
      .from('users')
      .select('is_admin, is_client_admin, client_id, role, is_active, permissions')
      .eq('id', callingUser.id)
      .maybeSingle();

    console.log('[manage-auth-user] Caller profile lookup:', { callerProfile, profileLookupError: profileLookupError?.message, callingUserId: callingUser.id });

    const isFullAdmin = callerProfile?.is_admin === true;
    const isClientAdmin = callerProfile?.is_client_admin === true && callerProfile?.role === 'client' && !!callerProfile?.client_id;

    let callerPermissions: Record<string, unknown> | null = null;
    if (callerProfile?.permissions) {
      if (typeof callerProfile.permissions === 'string') {
        try { callerPermissions = JSON.parse(callerProfile.permissions); } catch { callerPermissions = null; }
      } else if (typeof callerProfile.permissions === 'object') {
        callerPermissions = callerProfile.permissions as Record<string, unknown>;
      }
    }
    const hasUserManagementPermission =
      callerProfile?.is_active === true && callerPermissions?.userManagement === true;

    if (!isFullAdmin && !isClientAdmin && !hasUserManagementPermission) {
      console.log('[manage-auth-user] Authorization check failed. callerProfile:', callerProfile);
      return errorResponse('You do not have permission to manage users', 403);
    }

    switch (action) {
      case 'create': {
        const { email, password, username: rawUsername, isAdmin, role, name, clientId } = params;
        const username = typeof rawUsername === 'string' ? rawUsername.trim() : rawUsername;

        if (isClientAdmin && !isFullAdmin) {
          if (role !== 'client') {
            return errorResponse('Client admins can only create client users', 403);
          }
          if (isAdmin) {
            return errorResponse('Client admins cannot create system administrators', 403);
          }
        }

        if (!isFullAdmin && isAdmin) {
          return errorResponse('You do not have permission to create system administrators', 403);
        }

        // Client Admins always assign users to their own client
        const assignedClientId = (isClientAdmin && !isFullAdmin) ? callerProfile.client_id : (clientId || null);

        console.log('[manage-auth-user] Creating user:', { email, username, isAdmin, role, name, hasPassword: !!password, assignedClientId });

        if (!email || !username) {
          return errorResponse('Email and username are required', 400);
        }

        if (password && password.length < 8) {
          return errorResponse('Password must be at least 8 characters', 400);
        }

        const userPassword = password || crypto.randomUUID();

        console.log('[manage-auth-user] Calling auth.admin.createUser...');
        const { data: authUser, error: createError } = await serviceClient.auth.admin.createUser({
          email,
          password: userPassword,
          email_confirm: true,
        });

        if (createError) {
          console.error('[manage-auth-user] auth.admin.createUser failed:', createError.message);
          return errorResponse(createError.message, 400);
        }

        console.log('[manage-auth-user] Auth user created:', authUser.user.id);

        const defaultPermissions = isAdmin
          ? {
              extractionTypes: true, transformationTypes: true, sftp: true, api: true,
              emailMonitoring: true, emailRules: true, processedEmails: true,
              extractionLogs: true, userManagement: true, workflowManagement: true, executeSetup: true,
            }
          : {
              extractionTypes: false, transformationTypes: false, sftp: false, api: false,
              emailMonitoring: false, emailRules: false, processedEmails: false,
              extractionLogs: false, userManagement: false, workflowManagement: false, executeSetup: false,
            };

        const profileData: Record<string, unknown> = {
          id: authUser.user.id,
          username,
          email,
          is_admin: isAdmin || false,
          is_active: true,
          role: role || 'user',
          name: name || null,
          permissions: JSON.stringify(defaultPermissions),
        };
        if (assignedClientId) {
          profileData.client_id = assignedClientId;
        }

        console.log('[manage-auth-user] Inserting user profile...');
        const { error: profileError } = await serviceClient.from('users').insert(profileData);

        if (profileError) {
          console.error('[manage-auth-user] Profile insert failed:', profileError.message);
          await serviceClient.auth.admin.deleteUser(authUser.user.id);
          return errorResponse(profileError.message, 400);
        }

        console.log('[manage-auth-user] User created successfully:', authUser.user.id);
        return successResponse({ success: true, userId: authUser.user.id });
      }

      case 'delete': {
        const { userId } = params;

        if (!userId) {
          return errorResponse('User ID is required', 400);
        }

        if (userId === callingUser.id) {
          return errorResponse('Cannot delete your own account', 400);
        }

        if (isClientAdmin && !isFullAdmin) {
          const { data: targetUser } = await serviceClient
            .from('users')
            .select('client_id, role')
            .eq('id', userId)
            .maybeSingle();
          if (!targetUser || targetUser.client_id !== callerProfile.client_id || targetUser.role !== 'client') {
            return errorResponse('Client admins can only delete users in their own organization', 403);
          }
        }

        const { error: deleteProfileError } = await serviceClient
          .from('users')
          .delete()
          .eq('id', userId);

        if (deleteProfileError) {
          return errorResponse(deleteProfileError.message, 400);
        }

        const { error: deleteAuthError } = await serviceClient.auth.admin.deleteUser(userId);
        if (deleteAuthError) {
          console.error('Failed to delete auth user (profile already deleted):', deleteAuthError.message);
        }

        return successResponse({ success: true });
      }

      case 'update_password': {
        const { userId, password } = params;

        if (!userId || !password) {
          return errorResponse('User ID and password are required', 400);
        }

        if (password.length < 8) {
          return errorResponse('Password must be at least 8 characters', 400);
        }

        if (isClientAdmin && !isFullAdmin) {
          const { data: targetUser } = await serviceClient
            .from('users')
            .select('client_id, role')
            .eq('id', userId)
            .maybeSingle();
          if (!targetUser || targetUser.client_id !== callerProfile.client_id || targetUser.role !== 'client') {
            return errorResponse('Client admins can only update passwords for users in their own organization', 403);
          }
        }

        const { error: updateError } = await serviceClient.auth.admin.updateUserById(userId, {
          password,
        });

        if (updateError) {
          return errorResponse(updateError.message, 400);
        }

        return successResponse({ success: true });
      }

      default:
        return errorResponse(`Unknown action: ${action}`, 400);
    }
  } catch (error) {
    console.error('[manage-auth-user] Unhandled error:', error);
    return errorResponse('An internal error occurred', 500);
  }
});
