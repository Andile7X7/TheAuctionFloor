import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

/**
 * Log sensitive administrator actions to the audit table.
 */
export async function logAdminAction(
  supabase: any,
  adminId: string,
  action: string,
  target: any,
  previousState: any,
  note?: string
) {
  const { error } = await supabase.from('admin_action_log').insert({
    admin_id: adminId,
    action,
    target: JSON.stringify(target),
    previous_state: JSON.stringify(previousState),
    reason: note || null,
  })

  if (error) {
    console.error('Audit log failed:', error)
  }
}

/**
 * Log general activity (like new bids or comments) for the live feed.
 */
export async function logActivity(
  supabase: any,
  userId: string,
  type: string,
  listingId: number,
  metadata: any
) {
  const { error } = await supabase.from('activities').insert({
    userid: userId,
    type,
    listing_id: listingId,
    entitytype: 'car',
    metadata: JSON.stringify(metadata)
  })

  if (error) {
    console.error('Activity log failed:', error)
  }
}
