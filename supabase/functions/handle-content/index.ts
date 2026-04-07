import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import { getAuthenticatedUser, corsHeaders, createJsonResponse } from '../shared/auth.ts'
import { sanitizeText } from '../shared/validation.ts'
import { logActivity } from '../shared/logging.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await getAuthenticatedUser(req)
    const { action, payload } = await req.json()
    
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    switch (action) {
      case 'post-comment': {
        const { listingId, content, parentId } = payload
        const sanitation = sanitizeText(content, 'comment')
        
        if (!sanitation.valid) {
          return createJsonResponse({ error: sanitation.error }, 400)
        }

        const { data: comment, error } = await supabaseAdmin
          .from('comments')
          .insert({
            listing_id: listingId,
            userid: user.id,
            content: sanitation.sanitized,
            parent_id: parentId || null
          })
          .select()
          .single()

        if (error) throw error

        // Notification for listing owner
        const { data: listing } = await supabaseAdmin.from('listings').select('userid, Make, Model').eq('id', listingId).single()
        if (listing && listing.userid !== user.id) {
          await supabaseAdmin.from('notifications').insert({
            recipient_id: listing.userid,
            actor_id: user.id,
            listing_id: listingId,
            type: 'comment',
            message: `commented on your ${listing.Make} ${listing.Model}.`
          })
        }

        // Notification for parent comment owner
        if (parentId) {
          const { data: parent } = await supabaseAdmin.from('comments').select('userid').eq('id', parentId).single()
          if (parent && parent.userid !== user.id) {
            await supabaseAdmin.from('notifications').insert({
              recipient_id: parent.userid,
              actor_id: user.id,
              listing_id: listingId,
              type: 'comment',
              message: `replied to your comment.`
            })
          }
        }

        await logActivity(supabaseAdmin, user.id, 'comment', listingId, { commentId: comment.id })
        return createJsonResponse({ success: true, comment })
      }

      case 'file-appeal': {
        const { listingId, reason } = payload
        const sanitation = sanitizeText(reason, 'default')

        if (!sanitation.valid) {
          return createJsonResponse({ error: sanitation.error }, 400)
        }

        // Check for existing active appeal
        const { data: existing } = await supabaseAdmin
          .from('listing_appeals')
          .select('id, status')
          .eq('listing_id', listingId)
          .eq('status', 'pending')
          .maybeSingle()

        if (existing) {
          return createJsonResponse({ error: 'You already have a pending appeal for this listing.' }, 400)
        }

        const { error } = await supabaseAdmin
          .from('listing_appeals')
          .insert({
            listing_id: listingId,
            userid: user.id,
            reason: sanitation.sanitized,
            status: 'pending'
          })

        if (error) throw error

        return createJsonResponse({ success: true, message: 'Appeal filed successfully' })
      }

      default:
        return createJsonResponse({ error: 'Invalid action' }, 400)
    }

  } catch (err) {
    console.error('Content API Error:', err)
    return createJsonResponse({ error: 'Server error processing content' }, 500)
  }
})
