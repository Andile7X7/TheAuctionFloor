import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import { getAuthenticatedUser, corsHeaders, createJsonResponse } from '../shared/auth.ts'
import { logAdminAction } from '../shared/logging.ts'

Deno.serve(async (req: Request) => {
  // 1. Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Auth & Role Check
    const user = await getAuthenticatedUser(req)
    
    // Initialize Admin Supabase Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    // Verify User Role (Must be Admin/Moderator)
    const { data: userData, error: uError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('userid', user.id)
      .single()

    if (uError || !['admin', 'moderator', 'super_admin'].includes(userData?.role)) {
      return createJsonResponse({ error: 'Permission denied. Admin role required.' }, 403)
    }

    const { action, payload } = await req.json()
    const adminId = user.id

    // 3. Action Dispatcher
    switch (action) {
      case 'verify-listing': {
        const { listingId, sellerId, note } = payload
        const { error } = await supabaseAdmin
          .from('listings')
          .update({ verified: true, status: 'active', admin_note: note || null })
          .eq('id', listingId)

        if (error) throw error

        await logAdminAction(supabaseAdmin, adminId, 'listing_verified', { listingId }, { verified: false }, note)
        
        // System Notification to Seller
        await supabaseAdmin.from('notifications').insert({
          recipient_id: sellerId,
          actor_id: adminId,
          listing_id: listingId,
          type: 'system',
          message: `Your listing has been verified and is now live!`
        })

        return createJsonResponse({ success: true, message: 'Listing verified' })
      }

      case 'reject-listing': {
        const { listingId, sellerId, reason, note } = payload
        const { error } = await supabaseAdmin
          .from('listings')
          .update({ verified: false, status: 'removed', admin_note: note || reason })
          .eq('id', listingId)

        if (error) throw error

        await logAdminAction(supabaseAdmin, adminId, 'listing_removed', { listingId }, { status: 'active' }, reason)

        await supabaseAdmin.from('notifications').insert({
          recipient_id: sellerId,
          actor_id: adminId,
          listing_id: listingId,
          type: 'system',
          message: `Your listing was rejected. Reason: ${reason}. You have 48h to appeal.`
        })

        return createJsonResponse({ success: true, message: 'Listing rejected' })
      }

      case 'ban-user': {
        const { targetUserId, reason, durationHours, shadowBan } = payload

        if (targetUserId === adminId) {
          return createJsonResponse({ error: 'You cannot ban your own account' }, 403)
        }

        const expiresAt = durationHours > 0 
          ? new Date(Date.now() + durationHours * 3600 * 1000).toISOString()
          : null

        const { error } = await supabaseAdmin.from('user_suspensions').insert({
          user_id: targetUserId,
          suspended_by: adminId,
          reason,
          duration_hours: durationHours,
          shadow_ban: shadowBan,
          expires_at: expiresAt,
          active: true
        })

        if (error) throw error

        await logAdminAction(supabaseAdmin, adminId, shadowBan ? 'user_shadow_banned' : 'user_banned', { targetUserId }, {}, reason)

        if (!shadowBan) {
          await supabaseAdmin.from('notifications').insert({
            recipient_id: targetUserId,
            actor_id: adminId,
            type: 'system',
            message: `Your account has been suspended. Reason: ${reason}`
          })
        }

        return createJsonResponse({ success: true, message: 'User banned' })
      }

      case 'verify-seller': {
        const { targetUserId } = payload
        const { error } = await supabaseAdmin
          .from('users')
          .update({ seller_verified: true })
          .eq('userid', targetUserId)

        if (error) throw error

        await logAdminAction(supabaseAdmin, adminId, 'seller_verified', { targetUserId }, { seller_verified: false })

        await supabaseAdmin.from('notifications').insert({
          recipient_id: targetUserId,
          actor_id: adminId,
          type: 'system',
          message: `You are now a Verified Seller! Your future listings will automatically bypass review.`
        })

        return createJsonResponse({ success: true, message: 'Seller verified' })
      }

      default:
        return createJsonResponse({ error: 'Invalid action' }, 400)
    }

  } catch (err) {
    console.error('Admin API Error:', err)
    return createJsonResponse({ error: 'Server error processing admin action' }, 500)
  }
})
