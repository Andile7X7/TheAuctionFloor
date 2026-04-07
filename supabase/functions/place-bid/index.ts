import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import { getAuthenticatedUser, corsHeaders, createJsonResponse } from '../shared/auth.ts'
import { validateBid } from '../shared/validation.ts'
import { logActivity } from '../shared/logging.ts'

Deno.serve(async (req: Request) => {
  // 1. Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Auth Check
    const user = await getAuthenticatedUser(req)
    const { p_listing_id, p_bid_amount } = await req.json()

    if (!p_listing_id || !p_bid_amount) {
      return createJsonResponse({ error: 'Missing listing ID or bid amount' }, 400)
    }

    // Initialize Supabase Client with Service Role (needs permission to bypass RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    // 3. Fetch Listing & Current Highest Bid info
    const { data: listing, error: lError } = await supabaseAdmin
      .from('listings')
      .select('id, Make, Model, userid, StartingPrice, CurrentPrice, ReservePrice, closes_at, status, verified')
      .eq('id', p_listing_id)
      .single()

    if (lError || !listing) {
      return createJsonResponse({ error: 'Listing not found' }, 404)
    }

    // 4. Rate Limiting (User-ID based)
    const oneMinAgo = new Date(Date.now() - 60000).toISOString()
    const { count } = await supabaseAdmin
      .from('bid_history')
      .select('*', { count: 'exact', head: true })
      .eq('userid', user.id)
      .gte('created_at', oneMinAgo)

    if (count !== null && count >= 10) {
      return createJsonResponse({ error: 'Rate limit exceeded. Max 10 bids per minute.' }, 429)
    }

    // 5. Business Logic Validations
    if (listing.userid === user.id) {
      return createJsonResponse({ error: 'You cannot bid on your own car' }, 403)
    }

    if (listing.status !== 'active' || !listing.verified) {
      return createJsonResponse({ error: 'This listing is not currently open for bidding' }, 403)
    }

    if (new Date(listing.closes_at) < new Date()) {
      return createJsonResponse({ error: 'Auction has already closed' }, 403)
    }

    const currentHighest = listing.CurrentPrice || listing.StartingPrice || 0
    const validation = validateBid(p_bid_amount, currentHighest)
    if (!validation.valid) {
      return createJsonResponse({ error: validation.error }, 400)
    }

    // 6. Find Previous Leader (to notify of outbid)
    const { data: prevBid } = await supabaseAdmin
      .from('bid_history')
      .select('userid')
      .eq('listing_id', listing.id)
      .order('amount', { ascending: false })
      .limit(1)
      .maybeSingle()

    const previousLeaderId = prevBid?.userid

    // 7. Atomic Execution via RPC
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('secure_place_bid', {
      p_listing_id: Number(listing.id),
      p_bid_amount: Number(p_bid_amount),
      p_user_id: user.id
    })

    if (rpcError || !rpcResult.success) {
      throw new Error(rpcError?.message || rpcResult?.error || 'Atomic transaction failed')
    }

    // 8. Notifications & Email (Non-blocking)
    const vehicleName = `${listing.Make} ${listing.Model}`
    const appUrl = Deno.env.get('APP_URL') || 'https://carbidplatform.com'

    // Notification for OWNER
    if (listing.userid !== user.id) {
       await supabaseAdmin.from('notifications').insert({
         recipient_id: listing.userid,
         actor_id: user.id,
         listing_id: listing.id,
         type: 'bid',
         message: `placed a bid of R${p_bid_amount.toLocaleString()} on your ${vehicleName}.`,
         is_read: false
       })
    }

    // Outbid Notification & Email
    if (previousLeaderId && previousLeaderId !== user.id) {
      // System Notification
      await supabaseAdmin.from('notifications').insert({
        recipient_id: previousLeaderId,
        actor_id: user.id,
        listing_id: listing.id,
        type: 'outbid',
        message: `You've been outbid on the ${vehicleName}! A new bid of R${p_bid_amount.toLocaleString()} has been placed.`,
        link_url: `/listing/${listing.id}`,
        is_read: false
      })

      // Try Email via Resend
      const resendKey = Deno.env.get('RESEND_API_KEY')
      if (resendKey) {
        const { data: outbidUser } = await supabaseAdmin.from('users').select('email').eq('userid', previousLeaderId).single()
        if (outbidUser?.email) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 
              Authorization: `Bearer ${resendKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: 'CarBidPlatform <no-reply@carbidplatform.com>',
              to: outbidUser.email,
              subject: `Outbid: New high bid for ${vehicleName}`,
              html: `<div style="font-family: sans-serif; background: #0a0d14; color: #fff; padding: 20px; border-radius: 8px;">
                      <h2>You were outbid!</h2>
                      <p>Someone placed a higher bid on the <strong>${vehicleName}</strong>.</p>
                      <p style="font-size: 24px; color: #6b82ff; font-weight: bold;">New High Bid: R${p_bid_amount.toLocaleString()}</p>
                      <a href="${appUrl}/listing/${listing.id}" style="display: inline-block; background: #6b82ff; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 10px;">View Auction</a>
                     </div>`
            })
          }).catch(e => console.error('Email Fail:', e))
        }
      }
    }

    // Activity Feed
    await logActivity(supabaseAdmin, user.id, 'bid', listing.id, { 
       carName: vehicleName, 
       amount: p_bid_amount 
    })

    return createJsonResponse({ 
      success: true, 
      message: 'Bid placed successfully',
      new_price: p_bid_amount
    })

  } catch (err) {
    console.error('Critical Bid Error:', err)
    return createJsonResponse({ error: 'Server error processing bid' }, 500)
  }
})
