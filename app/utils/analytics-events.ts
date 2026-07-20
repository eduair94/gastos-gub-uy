// The event vocabulary. Every name the site can send to GA4 is declared here
// once, so `track()` is typo-proof and this file doubles as the documentation
// of what we measure (and, by omission, what we don't).
//
// Rules for adding one:
//  - snake_case, <= 40 chars, and never a GA4 reserved name.
//  - Reuse GA4's recommended names where one fits (search, login, sign_up,
//    view_item, share) — the standard reports only understand those.
//  - Parameters carry *shape*, never identity: counts, enums, booleans.
//    Nothing that identifies a person. useAnalytics strips the obvious cases,
//    but the real guard is not sending it.

export type AnalyticsEvent =
  // ── Navigation & chrome ────────────────────────────────────────────────
  | 'page_view' //          every route change (manual: SSR + i18n prefixes break auto)
  | 'locale_change' //      { locale }
  | 'theme_toggle' //       { theme: 'dark' | 'light' }
  | 'consent_granted'
  | 'consent_denied'
  | 'consent_reopen' //     reader reopened the choice from /cookies

  // ── Finding things ─────────────────────────────────────────────────────
  | 'search' //             { search_term, location }
  | 'filter_apply' //       { surface, active_count, facets }
  | 'filter_clear' //       { surface }
  | 'sort_change' //        { surface, sort }
  | 'autocomplete_select' // { source }
  | 'list_paginate' //      { surface, page, direction }
  | 'view_item' //          { item_type, item_id }
  | 'items_preview_open' // { source }
  | 'raw_json_view'

  // ── Account ────────────────────────────────────────────────────────────
  | 'login' //              { method }
  | 'login_failed' //       { method, reason }
  | 'sign_up' //            { method }
  | 'sign_up_failed' //     { method, reason }
  | 'logout'
  | 'password_reset_request'
  | 'magic_link_request'

  // ── Alerts: the product's core funnel ──────────────────────────────────
  | 'alert_builder_open' //  { source: 'button' | 'deeplink' | 'edit' }
  | 'alert_catalog_search'
  | 'alert_preview' //       { matches }
  | 'alert_create' //        { categories, keywords, keyword_mode, has_amount_filter }
  | 'alert_update'
  | 'alert_delete'
  | 'alert_precreated_from_campaign' // { rubro } — cold-email attribution

  // ── Open calls ─────────────────────────────────────────────────────────
  | 'call_save'
  | 'call_unsave'
  | 'call_reminder_set' //   { days }

  // ── Delivery channels ──────────────────────────────────────────────────
  | 'notification_prefs_save' // { channels, frequency, enabled }
  | 'notification_open'
  | 'notification_mark_all_read'
  | 'push_subscribe'
  | 'push_unsubscribe'
  | 'push_permission_denied'
  | 'push_error' //          { reason }
  | 'telegram_link_start'
  | 'telegram_unlink'
  | 'email_unsubscribe' //   { result }

  // ── Install ────────────────────────────────────────────────────────────
  | 'pwa_install_prompt' //  { outcome: 'accepted' | 'dismissed' }
  | 'pwa_installed'

  // ── Developer platform ─────────────────────────────────────────────────
  | 'api_key_create' //      { scopes }
  | 'api_key_create_error'
  | 'api_key_revoke'
  | 'api_key_copy'
  | 'webhook_create' //      { events }
  | 'webhook_test' //        { ok, status }
  | 'webhook_delete'
  | 'webhook_secret_copy'
  | 'docs_open' //           { source }

  // ── Engagement & trust ─────────────────────────────────────────────────
  | 'outbound_click' //      { link_domain, link_url, kind }
  | 'document_open' //       { kind }
  | 'anomaly_vote' //        { verdict }
  | 'report_error_open'
  | 'report_error_copy'
  | 'tour_start' //          { tour }
  | 'tour_step' //           { tour, step }
  | 'tour_complete' //       { tour }
  | 'tour_abandon' //        { tour, step }
  | 'donation_open'
  | 'support_click' //       { action }
  | 'audience_select' //     { audience }
  | 'money_convert_open'

/**
 * Events worth marking as key events (conversions) in the GA4 UI —
 * Admin → Events → mark as key event. Listed here so the choice is
 * reviewable in code rather than buried in a console someone else owns.
 */
export const KEY_EVENTS: readonly AnalyticsEvent[] = [
  'sign_up',
  'alert_create',
  'alert_precreated_from_campaign',
  'push_subscribe',
  'telegram_link_start',
  'call_save',
  'api_key_create',
  'pwa_installed',
] as const
