package com.kingsgroup.kbiz360.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.content.res.Resources
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.text.format.DateFormat
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// Draws the Work Board as RemoteViews. The layout follows WorkBoardMedium / WorkBoardLarge in
// targets/widget/index.swift: the same tiles, words, colours and tap targets.

internal object Links {
  const val HOME = "kbiz360://"
  const val REMINDERS = "kbiz360://reminders"
  const val APPROVALS = "kbiz360://approvals"
  const val ATTENDANCE = "kbiz360://attendance"
  fun chat(id: String) = "kbiz360://chat/${Uri.encode(id)}"

  /** Opens the app at [url]; expo-router turns it into the screen. */
  fun open(ctx: Context, url: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
      .setPackage(ctx.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(ctx, url.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
}

internal class AndroidFormats(ctx: Context) : Formats {
  private val locale = Locale.getDefault()
  private val timeFormat = DateFormat.getTimeFormat(ctx)
  private fun skeleton(s: String) = SimpleDateFormat(DateFormat.getBestDateTimePattern(locale, s), locale)

  override fun time(ms: Long): String = timeFormat.format(Date(ms))
  override fun weekday(ms: Long): String = skeleton("EEE").format(Date(ms))
  override fun dayMonth(ms: Long): String = skeleton("dMMM").format(Date(ms))
  fun shortDate(ms: Long): String = skeleton("EEEdMMM").format(Date(ms))
  fun longDate(ms: Long): String = skeleton("EEEEdMMMM").format(Date(ms))
}

/**
 * Colours picked in code (a reminder's due tone, the punch state). On Android 12+ both the light
 * and the dark value travel with the view and the launcher picks; older versions get the colour
 * for the phone's current mode.
 */
internal class Palette(ctx: Context) {
  private val light = withNight(ctx, Configuration.UI_MODE_NIGHT_NO)
  private val dark = withNight(ctx, Configuration.UI_MODE_NIGHT_YES)
  private val nightNow =
    (Resources.getSystem().configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

  fun apply(views: RemoteViews, viewId: Int, method: String, color: Int) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      views.setColorInt(viewId, method, light.getColor(color), dark.getColor(color))
    } else {
      views.setInt(viewId, method, (if (nightNow) dark else light).getColor(color))
    }
  }

  fun text(views: RemoteViews, viewId: Int, color: Int) = apply(views, viewId, "setTextColor", color)
  fun tint(views: RemoteViews, viewId: Int, color: Int) = apply(views, viewId, "setColorFilter", color)

  private fun withNight(ctx: Context, night: Int): Context {
    val config = Configuration(ctx.resources.configuration)
    config.uiMode = (config.uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or night
    return ctx.createConfigurationContext(config)
  }
}

private val Tone.solid: Int
  get() = when (this) {
    Tone.DANGER -> R.color.kbiz_wb_danger
    Tone.WARN -> R.color.kbiz_wb_orange
    Tone.PURPLE -> R.color.kbiz_wb_purple
    Tone.PRIMARY -> R.color.kbiz_wb_primary
    Tone.GREEN -> R.color.kbiz_wb_green
    Tone.NEUTRAL -> R.color.kbiz_wb_neutral
  }

private val Tone.text: Int
  get() = when (this) {
    Tone.DANGER -> R.color.kbiz_wb_danger_text
    Tone.WARN -> R.color.kbiz_wb_warn_text
    Tone.PURPLE -> R.color.kbiz_wb_purple_text
    Tone.PRIMARY, Tone.GREEN -> R.color.kbiz_wb_primary_text
    Tone.NEUTRAL -> R.color.kbiz_wb_mute
  }

/** The icon's colour inside its badge: muted for neutral, the solid tone otherwise. */
private val Tone.icon: Int
  get() = if (this == Tone.NEUTRAL) R.color.kbiz_wb_mute else solid

private val Tone.box: Int
  get() = when (this) {
    Tone.DANGER -> R.drawable.kbiz_wb_box_danger
    Tone.WARN -> R.drawable.kbiz_wb_box_warn
    Tone.PURPLE -> R.drawable.kbiz_wb_box_purple
    Tone.PRIMARY, Tone.GREEN -> R.drawable.kbiz_wb_box_primary
    Tone.NEUTRAL -> R.drawable.kbiz_wb_box_neutral
  }

private val Tone.bar: Int
  get() = when (this) {
    Tone.DANGER -> R.drawable.kbiz_wb_bar_danger
    Tone.WARN -> R.drawable.kbiz_wb_bar_warn
    Tone.NEUTRAL -> R.drawable.kbiz_wb_bar_neutral
    else -> R.drawable.kbiz_wb_bar_primary
  }

internal class WorkBoardViews(private val ctx: Context, private val w: Work) {
  private val pkg = ctx.packageName
  private val palette = Palette(ctx)
  private val formats = AndroidFormats(ctx)
  private val fontScale = ctx.resources.configuration.fontScale

  // ---- Medium (4x2) -------------------------------------------------------------------------

  fun medium(): RemoteViews {
    val v = RemoteViews(pkg, R.layout.kbiz_wb_medium)
    v.setTextViewText(R.id.kbiz_wb_greeting, w.greetingLine)
    v.setTextViewText(R.id.kbiz_wb_date, formats.shortDate(w.now))
    v.setOnClickPendingIntent(android.R.id.background, Links.open(ctx, Links.HOME))

    v.removeAllViews(R.id.kbiz_wb_row1)
    v.addView(
      R.id.kbiz_wb_row1,
      boardTile(R.drawable.kbiz_wb_ic_bell, Tone.PURPLE, "${w.todo}", "Reminders", Links.REMINDERS, badge = if (w.late > 0) "${w.late} late" else null),
    )
    v.addView(R.id.kbiz_wb_row1, RemoteViews(pkg, R.layout.kbiz_wb_gap_h))
    v.addView(R.id.kbiz_wb_row1, boardTile(R.drawable.kbiz_wb_ic_seal, Tone.PRIMARY, "${w.s.approvals}", "Approvals", Links.APPROVALS))

    v.removeAllViews(R.id.kbiz_wb_row2)
    val chats = w.s.unreadChats
    v.addView(
      R.id.kbiz_wb_row2,
      boardTile(R.drawable.kbiz_wb_ic_forum, Tone.GREEN, "$chats", if (chats == 1) "Unread chat" else "Unread chats", Links.HOME),
    )
    v.addView(R.id.kbiz_wb_row2, RemoteViews(pkg, R.layout.kbiz_wb_gap_h))
    v.addView(R.id.kbiz_wb_row2, attendanceTile())
    return v
  }

  private fun boardTile(
    icon: Int,
    tone: Tone,
    value: String?,
    label: String,
    url: String,
    badge: String? = null,
    timerSince: Long? = null,
  ): RemoteViews {
    val t = RemoteViews(pkg, R.layout.kbiz_wb_board_tile)
    t.setInt(R.id.kbiz_wb_tile_box, "setBackgroundResource", tone.box)
    t.setImageViewResource(R.id.kbiz_wb_tile_icon, icon)
    palette.tint(t, R.id.kbiz_wb_tile_icon, tone.icon)
    if (timerSince != null) {
      t.setViewVisibility(R.id.kbiz_wb_tile_value, View.GONE)
      t.setViewVisibility(R.id.kbiz_wb_tile_timer, View.VISIBLE)
      t.setChronometer(R.id.kbiz_wb_tile_timer, chronometerBase(timerSince), null, true)
    } else {
      t.setTextViewText(R.id.kbiz_wb_tile_value, value.orEmpty())
    }
    t.setTextViewText(R.id.kbiz_wb_tile_label, label)
    if (badge != null) {
      t.setViewVisibility(R.id.kbiz_wb_tile_chip, View.VISIBLE)
      t.setTextViewText(R.id.kbiz_wb_tile_chip, badge)
    }
    t.setOnClickPendingIntent(R.id.kbiz_wb_tile, Links.open(ctx, url))
    return t
  }

  private fun attendanceTile(): RemoteViews = when (val p = w.punch) {
    is Punch.OnDuty -> boardTile(
      R.drawable.kbiz_wb_ic_clock, Tone.GREEN, null, "In since ${formats.time(p.since)}", Links.ATTENDANCE, timerSince = p.since,
    )
    is Punch.Done -> boardTile(R.drawable.kbiz_wb_ic_clock, Tone.WARN, duration(p.to - p.from), "Worked today", Links.ATTENDANCE)
    Punch.NotIn -> boardTile(R.drawable.kbiz_wb_ic_face, Tone.NEUTRAL, "Check in", "Not checked in", Links.ATTENDANCE)
  }

  // ---- Large --------------------------------------------------------------------------------

  fun large(heightDp: Float): RemoteViews {
    val v = RemoteViews(pkg, R.layout.kbiz_wb_large)
    v.setTextViewText(R.id.kbiz_wb_greeting, w.greetingLine)
    v.setTextViewText(R.id.kbiz_wb_date, formats.longDate(w.now))
    v.setOnClickPendingIntent(android.R.id.background, Links.open(ctx, Links.HOME))
    punchPill(v)

    v.removeAllViews(R.id.kbiz_wb_stats)
    val stats = listOf(
      statTile(R.drawable.kbiz_wb_ic_bell, Tone.PURPLE, w.todo, "Reminders", Links.REMINDERS),
      statTile(R.drawable.kbiz_wb_ic_error, Tone.DANGER, w.late, "Late", Links.REMINDERS, alert = true),
      statTile(R.drawable.kbiz_wb_ic_seal, Tone.PRIMARY, w.s.approvals, "Approvals", Links.APPROVALS),
      statTile(R.drawable.kbiz_wb_ic_chat, Tone.GREEN, w.s.unreadChats, "Chats", Links.HOME),
    )
    stats.forEachIndexed { i, tile ->
      if (i > 0) v.addView(R.id.kbiz_wb_stats, RemoteViews(pkg, R.layout.kbiz_wb_gap_h))
      v.addView(R.id.kbiz_wb_stats, tile)
    }

    val chats = w.s.chats.take(MAX_CHAT_ROWS)
    val plan = largePlan(heightDp, fontScale, w.items.size, chats.size)

    v.setTextViewText(R.id.kbiz_wb_next_count, if (w.todo > 0) "${w.todo} open" else "")
    v.removeAllViews(R.id.kbiz_wb_reminders)
    v.setViewVisibility(R.id.kbiz_wb_reminders_empty, if (w.items.isEmpty()) View.VISIBLE else View.GONE)
    if (w.items.isNotEmpty()) {
      w.items.take(plan.reminderRows).forEachIndexed { i, r ->
        if (i > 0) v.addView(R.id.kbiz_wb_reminders, RemoteViews(pkg, R.layout.kbiz_wb_gap_v))
        v.addView(R.id.kbiz_wb_reminders, reminderRow(r))
      }
    }

    v.setViewVisibility(R.id.kbiz_wb_chats_section, if (plan.showChats) View.VISIBLE else View.GONE)
    if (!plan.showChats) return v
    val messages = w.s.unreadMessages
    v.setTextViewText(R.id.kbiz_wb_chats_count, if (messages > 0) "$messages ${if (messages == 1) "message" else "messages"}" else "")
    v.removeAllViews(R.id.kbiz_wb_chats)
    v.setViewVisibility(R.id.kbiz_wb_chats_empty, if (chats.isEmpty()) View.VISIBLE else View.GONE)
    if (chats.isNotEmpty()) {
      chats.take(plan.chatRows).forEachIndexed { i, c ->
        if (i > 0) v.addView(R.id.kbiz_wb_chats, RemoteViews(pkg, R.layout.kbiz_wb_gap_v))
        v.addView(R.id.kbiz_wb_chats, chatRow(c))
      }
    }
    return v
  }

  /**
   * The launcher reapplies an update onto the views it already shows when the layout is the same,
   * so every state sets every part of the pill, not just what differs from the layout file.
   */
  private fun punchPill(v: RemoteViews) {
    v.setOnClickPendingIntent(R.id.kbiz_wb_punch, Links.open(ctx, Links.ATTENDANCE))
    val p = w.punch
    val onDuty = p is Punch.OnDuty
    v.setInt(
      R.id.kbiz_wb_punch,
      "setBackgroundResource",
      when (p) {
        is Punch.OnDuty -> R.drawable.kbiz_wb_pill_primary
        is Punch.Done -> R.drawable.kbiz_wb_pill_warn
        Punch.NotIn -> R.drawable.kbiz_wb_pill_neutral
      },
    )
    v.setViewVisibility(R.id.kbiz_wb_punch_dot, if (p is Punch.Done) View.GONE else View.VISIBLE)
    v.setImageViewResource(R.id.kbiz_wb_punch_dot, if (onDuty) R.drawable.kbiz_wb_dot else R.drawable.kbiz_wb_ring)
    v.setViewVisibility(R.id.kbiz_wb_punch_check, if (p is Punch.Done) View.VISIBLE else View.GONE)
    palette.tint(v, R.id.kbiz_wb_punch_check, R.color.kbiz_wb_warn_text)
    v.setViewVisibility(R.id.kbiz_wb_punch_timer, if (onDuty) View.VISIBLE else View.GONE)
    v.setChronometer(R.id.kbiz_wb_punch_timer, chronometerBase((p as? Punch.OnDuty)?.since ?: w.now), null, onDuty)
    v.setViewVisibility(R.id.kbiz_wb_punch_text, if (onDuty) View.GONE else View.VISIBLE)
    v.setTextViewText(R.id.kbiz_wb_punch_text, if (p is Punch.Done) duration(p.to - p.from) else "Not in")
    palette.text(v, R.id.kbiz_wb_punch_text, if (p is Punch.Done) R.color.kbiz_wb_warn_text else R.color.kbiz_wb_mute)
  }

  private fun statTile(icon: Int, tone: Tone, value: Int, label: String, url: String, alert: Boolean = false): RemoteViews {
    val t = RemoteViews(pkg, R.layout.kbiz_wb_stat_tile)
    t.setImageViewResource(R.id.kbiz_wb_stat_icon, icon)
    palette.tint(t, R.id.kbiz_wb_stat_icon, tone.solid)
    t.setTextViewText(R.id.kbiz_wb_stat_value, "$value")
    if (alert && value > 0) palette.text(t, R.id.kbiz_wb_stat_value, tone.solid)
    t.setTextViewText(R.id.kbiz_wb_stat_label, label)
    t.setOnClickPendingIntent(R.id.kbiz_wb_stat, Links.open(ctx, url))
    return t
  }

  private fun reminderRow(r: ReminderItem): RemoteViews {
    val due = dueLabel(r, w.now, w.zone, formats)
    val row = RemoteViews(pkg, R.layout.kbiz_wb_reminder_row)
    row.setInt(R.id.kbiz_wb_rem_bar, "setBackgroundResource", due.tone.bar)
    row.setTextViewText(R.id.kbiz_wb_rem_text, r.text.ifEmpty { "Reminder" })
    row.setTextViewText(R.id.kbiz_wb_rem_by, if (r.by.isEmpty()) "Myself" else "From ${r.by}")
    row.setTextViewText(R.id.kbiz_wb_rem_due, due.text)
    palette.text(row, R.id.kbiz_wb_rem_due, due.tone.text)
    row.setOnClickPendingIntent(R.id.kbiz_wb_rem, Links.open(ctx, Links.REMINDERS))
    return row
  }

  private fun chatRow(c: ChatItem): RemoteViews {
    val row = RemoteViews(pkg, R.layout.kbiz_wb_chat_row)
    val tone = if (c.group) Tone.PURPLE else Tone.PRIMARY
    row.setTextViewText(R.id.kbiz_wb_chat_avatar, initials(c.name))
    row.setInt(R.id.kbiz_wb_chat_avatar, "setBackgroundResource", if (c.group) R.drawable.kbiz_wb_avatar_purple else R.drawable.kbiz_wb_avatar_primary)
    palette.text(row, R.id.kbiz_wb_chat_avatar, tone.text)
    row.setTextViewText(R.id.kbiz_wb_chat_name, c.name)
    row.setTextViewText(R.id.kbiz_wb_chat_preview, c.preview.ifEmpty { "New message" })
    if (c.at != null) row.setTextViewText(R.id.kbiz_wb_chat_ago, ago(c.at, w.now, formats))
    else row.setViewVisibility(R.id.kbiz_wb_chat_ago, View.GONE)
    row.setTextViewText(R.id.kbiz_wb_chat_count, "${c.unread}")
    row.setOnClickPendingIntent(R.id.kbiz_wb_chat, Links.open(ctx, Links.chat(c.id)))
    return row
  }

  /** Chronometer counts from an elapsedRealtime base; turn the punch's wall-clock time into one. */
  private fun chronometerBase(since: Long): Long =
    SystemClock.elapsedRealtime() - (System.currentTimeMillis() - since).coerceAtLeast(0L)

  companion object {
    /** Below this height (dp) the board is the medium one. */
    const val LARGE_MIN_HEIGHT = 240f
    /** 16 layouts, Android's most: the medium board, then the large one every 20dp up to 520dp. */
    private val SIZE_STEPS = listOf(110f) + (240..520 step 20).map { it.toFloat() }

    fun signedOut(ctx: Context): RemoteViews = RemoteViews(ctx.packageName, R.layout.kbiz_wb_signed_out).apply {
      setOnClickPendingIntent(android.R.id.background, Links.open(ctx, Links.HOME))
    }

    /**
     * The board for one placed widget. Android 12+ gets one layout per height step and the launcher
     * shows the one that fits as the person resizes it; older versions get the layout for the size
     * the launcher last reported.
     */
    fun build(ctx: Context, w: Work, options: Bundle?): RemoteViews {
      val views = WorkBoardViews(ctx, w)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        return RemoteViews(SIZE_STEPS.associate { h -> SizeF(100f, h) to views.forHeight(h) })
      }
      val landscape = ctx.resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
      val h = options?.getInt(if (landscape) AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT else AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT) ?: 0
      return views.forHeight(h.toFloat())
    }
  }

  private fun forHeight(h: Float): RemoteViews = if (h >= LARGE_MIN_HEIGHT) large(h) else medium()
}
